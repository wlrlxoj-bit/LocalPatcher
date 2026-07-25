begin;

-- 과거 Elden Ring URL을 canonical 게임으로 해석하고, 중복 게임의 trainer만 안전하게 병합한다.
-- source games 행은 URL 이력과 롤백 가능성을 위해 삭제하거나 slug를 변경하지 않는다.
create table if not exists public.game_slug_aliases (
  alias_slug text primary key,
  game_id integer not null references public.games(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.game_slug_aliases enable row level security;
revoke all on table public.game_slug_aliases from public, anon, authenticated;
grant select, insert, update on table public.game_slug_aliases to service_role;

create table if not exists public.elden_ring_trainer_game_backup_20260725 (
  trainer_id integer primary key references public.trainers(id) on delete restrict,
  old_game_id integer not null references public.games(id) on delete restrict,
  old_game_slug text not null,
  old_version_str text not null,
  backed_up_at timestamptz not null default now()
);

create table if not exists public.elden_ring_alias_backup_20260725 (
  alias_slug text primary key,
  prior_game_id integer references public.games(id) on delete restrict,
  had_prior_row boolean not null,
  backed_up_at timestamptz not null default now()
);

alter table public.elden_ring_trainer_game_backup_20260725 enable row level security;
alter table public.elden_ring_alias_backup_20260725 enable row level security;
revoke all on table public.elden_ring_trainer_game_backup_20260725 from public, anon, authenticated;
revoke all on table public.elden_ring_alias_backup_20260725 from public, anon, authenticated;
grant select on table public.elden_ring_trainer_game_backup_20260725 to service_role;
grant select on table public.elden_ring_alias_backup_20260725 to service_role;

create or replace function public.resolve_game_slug(requested_slug text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select game.slug
  from public.games game
  where game.id = (
    select alias.game_id
    from public.game_slug_aliases alias
    where alias.alias_slug = requested_slug
  )
  union all
  select game.slug
  from public.games game
  where game.slug = requested_slug
    and not exists (
      select 1
      from public.game_slug_aliases alias
      where alias.alias_slug = requested_slug
    )
  limit 1
$$;

revoke all on function public.resolve_game_slug(text) from public;
grant execute on function public.resolve_game_slug(text) to anon, authenticated, service_role;

do $$
declare
  canonical_id integer;
  actual_source_id integer;
  orphan_source_id integer;
  source_ids integer[];
  canonical_count integer;
  source_count integer;
  latest_count integer;
  latest_trainer_id integer;
  latest_hash text;
  latest_option_count integer;
  source_trainer_count bigint;
  before_trainer_count bigint;
  before_mapping_count bigint;
  before_approved_locale_count bigint;
  after_trainer_count bigint;
  after_mapping_count bigint;
  after_approved_locale_count bigint;
begin
  select count(*), min(id)
  into canonical_count, canonical_id
  from public.games
  where slug = 'elden-ring';

  if canonical_count <> 1 or canonical_id <> 4 then
    raise exception
      '적용 중단: canonical elden-ring 행이 preflight와 다릅니다(count %, id %)',
      canonical_count, canonical_id;
  end if;

  -- canonical과 실제 데이터 source 및 trainer가 없는 orphan source를 같은 트랜잭션에서 고정한다.
  perform id
  from public.games
  where slug in (
    'elden-ring',
    'elden-ring-shadow-of-the-erdtree-trainer-1768067282',
    'elden-ring-shadow-of-the-erdtree-1768067282'
  )
  for update;

  select
    count(*),
    min(id) filter (
      where slug = 'elden-ring-shadow-of-the-erdtree-trainer-1768067282'
    ),
    min(id) filter (
      where slug = 'elden-ring-shadow-of-the-erdtree-1768067282'
    )
  into source_count, actual_source_id, orphan_source_id
  from public.games
  where slug in (
    'elden-ring-shadow-of-the-erdtree-trainer-1768067282',
    'elden-ring-shadow-of-the-erdtree-1768067282'
  );

  if source_count <> 2 or actual_source_id <> 638 or orphan_source_id <> 789 then
    raise exception
      '적용 중단: source 게임 행이 preflight와 다릅니다(count %, actual %, orphan %)',
      source_count, actual_source_id, orphan_source_id;
  end if;

  source_ids := array[actual_source_id, orphan_source_id];

  select count(*)
  into source_trainer_count
  from public.trainers trainer
  where trainer.game_id = any(source_ids);

  -- 재실행 시 source trainer는 이미 canonical로 이동했으므로 백업 5건으로 완료 상태를 판별한다.
  if source_trainer_count not in (0, 5)
    or (
      source_trainer_count = 5
      and (
        (select count(*) from public.trainers where game_id = actual_source_id) <> 5
        or exists (
          select 1 from public.trainers where game_id = orphan_source_id
        )
      )
    )
    or (
      source_trainer_count = 0
      and (
        select count(*)
        from public.elden_ring_trainer_game_backup_20260725
      ) <> 5
    ) then
    raise exception
      '적용 중단: 이동 대상 trainer 수가 예상과 다릅니다(source %, backup %)',
      source_trainer_count,
      (select count(*) from public.elden_ring_trainer_game_backup_20260725);
  end if;

  -- hash 검증 범위는 source에서 이동할 행으로 한정한다. canonical의 legacy hash(63자)는 건드리지 않는다.
  if exists (
    select 1
    from public.trainers trainer
    where trainer.game_id = any(source_ids)
      and (
        trainer.original_file_hash is null
        or trainer.original_file_hash !~ '^[0-9a-fA-F]{64}$'
      )
  ) then
    raise exception '적용 중단: source trainer에 64자 SHA-256이 아닌 hash가 있습니다';
  end if;

  select
    count(*),
    min(trainer.id),
    min(trainer.original_file_hash),
    min(trainer.option_count)
  into latest_count, latest_trainer_id, latest_hash, latest_option_count
  from public.trainers trainer
  where trainer.id = 2049
    and trainer.game_id in (actual_source_id, canonical_id)
    and replace(trainer.version_str, 'v1.16.1. Plus', 'v1.16.1 Plus')
      = 'v1.02-v1.16.1 Plus 35'
    and (
      trainer.game_id = actual_source_id
      or exists (
        select 1
        from public.elden_ring_trainer_game_backup_20260725 backup
        where backup.trainer_id = trainer.id
          and backup.old_game_id = actual_source_id
      )
    );

  if latest_count <> 1
    or latest_trainer_id <> 2049
    or latest_hash is null
    or latest_hash !~ '^[0-9a-fA-F]{64}$'
    or latest_option_count <> 35 then
    raise exception
      '적용 중단: 최신 trainer 검증 실패(count %, id %, hash %, option %)',
      latest_count, latest_trainer_id, latest_hash, latest_option_count;
  end if;

  if exists (
    select 1
    from public.game_slug_aliases
    where alias_slug in (
      'elden-ring-shadow-of-the-erdtree',
      'elden-ring-shadow-of-the-erdtree-1768067282',
      'elden-ring-shadow-of-the-erdtree-trainer-1768067282'
    )
      and game_id <> canonical_id
  ) then
    raise exception '적용 중단: Elden Ring 별칭이 다른 게임을 가리킵니다';
  end if;

  insert into public.elden_ring_alias_backup_20260725(
    alias_slug, prior_game_id, had_prior_row
  )
  select requested.alias_slug, existing.game_id, existing.alias_slug is not null
  from (
    values
      ('elden-ring-shadow-of-the-erdtree'),
      ('elden-ring-shadow-of-the-erdtree-1768067282'),
      ('elden-ring-shadow-of-the-erdtree-trainer-1768067282')
  ) requested(alias_slug)
  left join public.game_slug_aliases existing using (alias_slug)
  on conflict (alias_slug) do nothing;

  -- canonical의 기존 trainer는 백업·수정 대상에 포함하지 않는다.
  insert into public.elden_ring_trainer_game_backup_20260725(
    trainer_id, old_game_id, old_game_slug, old_version_str
  )
  select trainer.id, game.id, game.slug, trainer.version_str
  from public.trainers trainer
  join public.games game on game.id = trainer.game_id
  where trainer.game_id = any(source_ids)
  on conflict (trainer_id) do nothing;

  select
    count(distinct backup.trainer_id),
    count(mapping.id),
    count(distinct (mapping.trainer_id, mapping.language_code))
      filter (where mapping.is_approved)
  into before_trainer_count, before_mapping_count, before_approved_locale_count
  from public.elden_ring_trainer_game_backup_20260725 backup
  left join public.translation_mappings mapping on mapping.trainer_id = backup.trainer_id;

  if before_trainer_count <> 5 or before_mapping_count <> 10 then
    raise exception
      '적용 중단: 백업 trainer/mapping 수가 preflight와 다릅니다(trainer %, mapping %)',
      before_trainer_count, before_mapping_count;
  end if;

  update public.trainers trainer
  set game_id = canonical_id
  from public.elden_ring_trainer_game_backup_20260725 backup
  where trainer.id = backup.trainer_id
    and trainer.game_id = backup.old_game_id;

  -- 최신 source 행 하나만 legacy 점 표기를 정규화한다.
  update public.trainers
  set version_str = 'v1.02-v1.16.1 Plus 35'
  where id = latest_trainer_id
    and game_id = canonical_id
    and version_str = 'v1.02-v1.16.1. Plus 35';

  select
    count(distinct backup.trainer_id),
    count(mapping.id),
    count(distinct (mapping.trainer_id, mapping.language_code))
      filter (where mapping.is_approved)
  into after_trainer_count, after_mapping_count, after_approved_locale_count
  from public.elden_ring_trainer_game_backup_20260725 backup
  join public.trainers trainer
    on trainer.id = backup.trainer_id and trainer.game_id = canonical_id
  left join public.translation_mappings mapping on mapping.trainer_id = backup.trainer_id;

  if (before_trainer_count, before_mapping_count, before_approved_locale_count)
    is distinct from
    (after_trainer_count, after_mapping_count, after_approved_locale_count) then
    raise exception
      '적용 중단: 이동 전후 보존 수치 불일치 trainer %/%, mapping %/%, approved locale %/%',
      before_trainer_count, after_trainer_count,
      before_mapping_count, after_mapping_count,
      before_approved_locale_count, after_approved_locale_count;
  end if;

  insert into public.game_slug_aliases(alias_slug, game_id)
  values
    ('elden-ring-shadow-of-the-erdtree', canonical_id),
    ('elden-ring-shadow-of-the-erdtree-1768067282', canonical_id),
    ('elden-ring-shadow-of-the-erdtree-trainer-1768067282', canonical_id)
  on conflict (alias_slug) do nothing;
end
$$;

commit;
