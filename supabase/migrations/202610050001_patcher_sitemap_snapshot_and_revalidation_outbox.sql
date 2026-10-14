-- P1 SEO: 공개 sitemap은 매 요청마다 전체 번역 테이블을 다시 계산하지 않고, 마지막으로
-- 원자적으로 검증된 snapshot만 읽는다. 승인/수동 mapping 본문은 이 migration에서 절대 수정하지 않는다.
begin;

create table if not exists public.patcher_index_eligibility_snapshot (
  game_id bigint not null references public.games(id) on delete cascade,
  language_code text not null check (language_code in ('ko','ja','de','es')),
  canonical_slug text not null,
  latest_trainer_id bigint not null references public.trainers(id) on delete cascade,
  latest_version text not null,
  coverage_fingerprint text not null,
  is_indexable boolean not null,
  content_updated_at timestamptz not null,
  verified_at timestamptz not null default now(),
  primary key (game_id, language_code)
);

-- snapshot 행이 0개인 정상 상태(아직 색인 가능한 게임이 없음)와 최초 배포의 미초기화
-- 상태를 구분한다. 공개 reader는 이 완료 표식이 없으면 sitemap을 발행하지 않는다.
create table if not exists public.patcher_index_eligibility_snapshot_state (
  singleton boolean primary key default true check (singleton),
  last_full_refresh_at timestamptz not null,
  refreshed_entry_count integer not null check (refreshed_entry_count >= 0)
);

create index if not exists patcher_index_eligibility_snapshot_sitemap_idx
  on public.patcher_index_eligibility_snapshot(language_code, canonical_slug)
  where is_indexable;

create unique index if not exists patcher_index_eligibility_snapshot_canonical_idx
  on public.patcher_index_eligibility_snapshot(language_code, canonical_slug);

create table if not exists public.patcher_revalidation_outbox (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  trainer_id bigint references public.trainers(id) on delete set null,
  game_id bigint references public.games(id) on delete cascade,
  locale_codes text[] not null check (cardinality(locale_codes) between 1 and 4),
  reason text not null check (reason in ('content_changed','sitemap_debounce')),
  state text not null default 'ready' check (state in ('ready','claimed','deferred','completed')),
  due_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  generation bigint not null default 1 check (generation > 0),
  claimed_generation bigint,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_failure_code text,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((reason = 'sitemap_debounce') = (game_id is null and trainer_id is null)),
  check ((state = 'claimed') = (lease_token is not null and lease_expires_at is not null and claimed_generation is not null))
);

create index if not exists patcher_revalidation_outbox_due_idx
  on public.patcher_revalidation_outbox(state, due_at, id);

alter table public.patcher_index_eligibility_snapshot enable row level security;
alter table public.patcher_index_eligibility_snapshot_state enable row level security;
alter table public.patcher_revalidation_outbox enable row level security;

-- 전체 계산은 이 RPC 하나에서 수행한다. 예외가 나면 PostgreSQL transaction이 이전
-- snapshot을 그대로 보존한다. 최신 trainer 선택과 Elden Ring 병합 규칙은 화면의
-- content-eligibility.ts와 같은 마지막 v 버전 끝점 + id 정렬을 사용한다.
create or replace function public.refresh_patcher_index_eligibility_snapshot(p_trainer_id bigint default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare refreshed_count integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;

  with game_catalog as (
    select g.id, g.slug,
      btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(g.title_en), '\mtrainer\M', ' ', 'gi'), '\mversion[[:space:]]*v?[0-9]+([.][0-9]+)*\M|\mv[0-9]+([.][0-9]+)*\M', ' ', 'gi'), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')) as normalized_title
      from public.games g
  ), canonical_candidates as (
    select source.id as source_game_id,
      case
        when source.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree','elden-ring-shadow-of-the-erdtree-1768067282','elden-ring-shadow-of-the-erdtree-trainer-1768067282') then 'elden-ring'
        when source.slug ~ '-trainer(-[0-9]{6,})?$'
          and base.id is not null and source.normalized_title <> '' and source.normalized_title = base.normalized_title
          then regexp_replace(source.slug, '-trainer(-[0-9]{6,})?$', '')
        else source.slug
      end as canonical_slug
      from game_catalog source
      left join game_catalog base
        on base.slug = regexp_replace(source.slug, '-trainer(-[0-9]{6,})?$', '')
  ), requested_games as (
    select distinct on (canonical.id) canonical.id, canonical.slug
      from canonical_candidates candidate
      join game_catalog canonical on canonical.slug = candidate.canonical_slug
     where p_trainer_id is null
        or candidate.source_game_id in (
          select trainer.game_id from public.trainers trainer where trainer.id = p_trainer_id
        )
     order by canonical.id, candidate.source_game_id
  ), candidate_trainers as (
    select requested.id as requested_game_id, t.id as trainer_id, t.option_count, t.version_str
      from requested_games requested
      join public.games trainer_game on trainer_game.id = requested.id
      join public.trainers t on t.game_id = trainer_game.id
    union all
    select requested.id as requested_game_id, t.id as trainer_id, t.option_count, t.version_str
      from requested_games requested
      join public.games source_game
        on requested.slug = 'elden-ring'
       and source_game.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree-trainer-1768067282')
      join public.trainers t on t.game_id = source_game.id
  ), ranked_trainers as (
    select distinct on (requested_game_id) requested_game_id, trainer_id, option_count, version_str
      from candidate_trainers
     order by requested_game_id,
       coalesce(string_to_array(nullif(regexp_replace(coalesce((regexp_match(version_str, '.*v([0-9]+(?:[.][0-9]+)*)', 'i'))[1], '0'), '(?:[.]0)+$', ''), '0'), '.')::numeric[], '{}'::numeric[]) desc,
       trainer_id desc
  ), locales(language_code) as (
    values ('ko'::text), ('ja'::text), ('de'::text), ('es'::text)
  ), coverage as (
    select requested.id as game_id, requested.slug as canonical_slug, locale.language_code,
      latest.trainer_id as latest_trainer_id, latest.version_str as latest_version,
      latest.option_count,
      count(mapping.id) as mapping_count,
      count(*) filter (where mapping.id is not null and (
        mapping.is_approved is distinct from true
        or nullif(btrim(mapping.original_text), '') is null
        or nullif(btrim(mapping.translated_text), '') is null
      )) as invalid_mapping_count,
      coalesce(sum(label.option_count), 0) as approved_option_count,
      max(mapping.updated_at) as content_updated_at,
      md5(string_agg(coalesce(mapping.id::text, '') || ':' || coalesce(mapping.updated_at::text, '') || ':' || coalesce(mapping.is_approved::text, ''), ',' order by mapping.id)) as coverage_fingerprint
    from requested_games requested
    join ranked_trainers latest on latest.requested_game_id = requested.id
    cross join locales locale
    left join public.translation_mappings mapping
      on mapping.trainer_id = latest.trainer_id and mapping.language_code = locale.language_code
    left join lateral (
      select count(*)::integer as option_count
        from pg_catalog.regexp_matches(
          mapping.original_text,
          '^[ \t]*(Num(Pad)?[ \t]*([0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F([1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(Up|Down|Left|Right)|Bracket(Left|Right)|[\[\]]|[A-Z0-9+\-=.,/])([ \t]*[+][ \t]*(Num(Pad)?[ \t]*([0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F([1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(Up|Down|Left|Right)|Bracket(Left|Right)|[\[\]]|[A-Z0-9+\-=.,/]))*[ \t]*(->|—|–|→|-|:)[ \t]*[^[:space:]]',
          'gim'
        )
    ) label on mapping.is_approved is true
      and nullif(btrim(mapping.original_text), '') is not null
      and nullif(btrim(mapping.translated_text), '') is not null
    group by requested.id, requested.slug, locale.language_code, latest.trainer_id, latest.version_str, latest.option_count
  ), published as (
    insert into public.patcher_index_eligibility_snapshot as snapshot(
      game_id, language_code, canonical_slug, latest_trainer_id, latest_version,
      coverage_fingerprint, is_indexable, content_updated_at, verified_at
    )
    select game_id, language_code, canonical_slug, latest_trainer_id, latest_version,
      coalesce(coverage_fingerprint, md5(game_id::text || ':' || language_code || ':' || latest_trainer_id::text)),
      option_count > 0 and mapping_count > 0 and invalid_mapping_count = 0 and approved_option_count >= option_count,
      coalesce(content_updated_at, clock_timestamp()), clock_timestamp()
      from coverage
    on conflict (game_id, language_code) do update set
      canonical_slug = excluded.canonical_slug,
      latest_trainer_id = excluded.latest_trainer_id,
      latest_version = excluded.latest_version,
      coverage_fingerprint = excluded.coverage_fingerprint,
      is_indexable = excluded.is_indexable,
      content_updated_at = excluded.content_updated_at,
      verified_at = excluded.verified_at
    returning 1
  ), removed as (
    delete from public.patcher_index_eligibility_snapshot snapshot
     where p_trainer_id is null
       and not exists (select 1 from coverage where coverage.game_id = snapshot.game_id)
    returning 1
  )
  select count(*) into refreshed_count from published;
  if p_trainer_id is null then
    insert into public.patcher_index_eligibility_snapshot_state as state(
      singleton, last_full_refresh_at, refreshed_entry_count
    ) values (true, clock_timestamp(), refreshed_count)
    on conflict (singleton) do update set
      last_full_refresh_at = excluded.last_full_refresh_at,
      refreshed_entry_count = excluded.refreshed_entry_count;
  end if;
  return refreshed_count;
end; $$;

-- 새 테이블을 가진 첫 배포에서는 주기 worker가 한 번 full refresh를 수행한다. 이후에는
-- snapshot이 비어도(색인 가능한 게임이 0개여도) state 행이 남아 재계산하지 않는다.
create or replace function public.bootstrap_patcher_index_eligibility_snapshot()
returns integer language plpgsql security definer set search_path = '' as $$
declare refreshed_count integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.patcher_index_eligibility_snapshot_state where singleton) then
    refreshed_count := public.refresh_patcher_index_eligibility_snapshot(null);
    insert into public.patcher_revalidation_outbox as outbox(
      dedupe_key, trainer_id, game_id, locale_codes, reason, state, due_at, updated_at
    ) values ('sitemap:indexability', null, null, array['ko','ja','de','es']::text[], 'sitemap_debounce', 'ready', clock_timestamp(), clock_timestamp())
    on conflict (dedupe_key) do update set
      generation = outbox.generation + 1,
      due_at = case when outbox.state in ('completed','deferred') then clock_timestamp() else outbox.due_at end,
      state = case when outbox.state in ('completed','deferred') then 'ready' else outbox.state end,
      updated_at = clock_timestamp();
  end if;
  return refreshed_count;
end; $$;

-- snapshot을 성공적으로 갱신한 같은 DB transaction에서, 상세 페이지와 sitemap 갱신
-- 요구를 durable outbox에 남긴다. 여기서 mapping을 만들거나 승인하지 않는다.
create or replace function public.refresh_patcher_index_and_enqueue(p_trainer_id bigint)
returns integer language plpgsql security definer set search_path = '' as $$
declare refreshed_count integer := 0;
begin
  if auth.role() <> 'service_role' or p_trainer_id is null or p_trainer_id <= 0 then
    raise exception 'invalid patcher revalidation input';
  end if;
  perform 1 from public.trainers where id = p_trainer_id;
  if not found then raise exception 'patcher trainer missing'; end if;

  refreshed_count := public.refresh_patcher_index_eligibility_snapshot(p_trainer_id);
  insert into public.patcher_revalidation_outbox as outbox(
    dedupe_key, trainer_id, game_id, locale_codes, reason, state, due_at,
    lease_token, lease_expires_at, last_failure_code, finished_at, updated_at
  )
  select 'patcher:' || snapshot.game_id::text, p_trainer_id, snapshot.game_id,
    array['ko','ja','de','es']::text[], 'content_changed', 'ready', clock_timestamp(),
    null, null, null, null, clock_timestamp()
    from (select distinct game_id from public.patcher_index_eligibility_snapshot) snapshot
   where snapshot.game_id in (
     select canonical.id
       from public.trainers trainer
       join public.games source on source.id = trainer.game_id
       left join public.games base
         on base.slug = regexp_replace(source.slug, '-trainer(-[0-9]{6,})?$', '')
        and btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(source.title_en), '\mtrainer\M', ' ', 'gi'), '\mversion[[:space:]]*v?[0-9]+([.][0-9]+)*\M|\mv[0-9]+([.][0-9]+)*\M', ' ', 'gi'), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')) <> ''
        and btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(source.title_en), '\mtrainer\M', ' ', 'gi'), '\mversion[[:space:]]*v?[0-9]+([.][0-9]+)*\M|\mv[0-9]+([.][0-9]+)*\M', ' ', 'gi'), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))
          = btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(base.title_en), '\mtrainer\M', ' ', 'gi'), '\mversion[[:space:]]*v?[0-9]+([.][0-9]+)*\M|\mv[0-9]+([.][0-9]+)*\M', ' ', 'gi'), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))
       join public.games canonical on canonical.slug = case
         when source.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree','elden-ring-shadow-of-the-erdtree-1768067282','elden-ring-shadow-of-the-erdtree-trainer-1768067282') then 'elden-ring'
         when source.slug ~ '-trainer(-[0-9]{6,})?$' and base.id is not null then regexp_replace(source.slug, '-trainer(-[0-9]{6,})?$', '')
         else source.slug
       end
      where trainer.id = p_trainer_id
   )
  on conflict (dedupe_key) do update set
    generation = outbox.generation + 1,
    trainer_id = excluded.trainer_id,
    locale_codes = excluded.locale_codes,
    state = case when outbox.state = 'claimed' then outbox.state else 'ready' end,
    due_at = case when outbox.state = 'claimed' then outbox.due_at else excluded.due_at end,
    lease_token = case when outbox.state = 'claimed' then outbox.lease_token else null end,
    lease_expires_at = case when outbox.state = 'claimed' then outbox.lease_expires_at else null end,
    last_failure_code = case when outbox.state = 'claimed' then outbox.last_failure_code else null end,
    finished_at = case when outbox.state = 'claimed' then outbox.finished_at else null end,
    updated_at = clock_timestamp();

  insert into public.patcher_revalidation_outbox as outbox(
    dedupe_key, trainer_id, game_id, locale_codes, reason, state, due_at, updated_at
  ) values ('sitemap:indexability', null, null, array['ko','ja','de','es']::text[], 'sitemap_debounce', 'ready', clock_timestamp(), clock_timestamp())
  on conflict (dedupe_key) do update set
    generation = outbox.generation + 1,
    due_at = case when outbox.state in ('completed','deferred') then clock_timestamp() else outbox.due_at end,
    state = case when outbox.state in ('completed','deferred') then 'ready' else outbox.state end,
    updated_at = clock_timestamp();
  return refreshed_count;
end; $$;

-- 즉시 ISR 호출은 raw alias 대신 이미 확정된 snapshot 경로만 읽는다. 이 조회는
-- lease를 소유하지 않으므로 완료 상태를 쓰지 않는다.
create or replace function public.get_patcher_revalidation_target(p_trainer_id bigint)
returns table(canonical_slug text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' or p_trainer_id is null or p_trainer_id <= 0 then return; end if;
  return query
    select distinct snapshot.canonical_slug
      from public.patcher_revalidation_outbox outbox
      join public.patcher_index_eligibility_snapshot snapshot on snapshot.game_id = outbox.game_id
     where outbox.trainer_id = p_trainer_id and outbox.reason = 'content_changed';
end; $$;

create or replace function public.list_patcher_indexable_sitemap_entries(p_locales text[])
returns table(language_code text, canonical_slug text, content_updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.patcher_index_eligibility_snapshot_state where singleton) then
    raise exception 'patcher index eligibility snapshot is not initialized';
  end if;
  if p_locales is null or cardinality(p_locales) is null or cardinality(p_locales) not between 1 and 4
     or exists (select 1 from unnest(p_locales) locale where locale not in ('ko','ja','de','es')) then
    raise exception 'invalid sitemap locales';
  end if;
  return query
    select snapshot.language_code, snapshot.canonical_slug, snapshot.content_updated_at
      from public.patcher_index_eligibility_snapshot snapshot
     where snapshot.is_indexable is true and snapshot.language_code = any(p_locales)
     order by snapshot.language_code, snapshot.canonical_slug;
end; $$;

create or replace function public.claim_patcher_revalidation_outbox(p_limit integer default 10)
returns table(id bigint, dedupe_key text, trainer_id bigint, game_id bigint, locale_codes text[], reason text, lease_token uuid, canonical_slug text, attempt_count integer)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' or p_limit is null or p_limit not between 1 and 20 then return; end if;
  return query with due as (
    select outbox.id from public.patcher_revalidation_outbox outbox
     where (outbox.state in ('ready','deferred') and outbox.due_at <= clock_timestamp())
        or (outbox.state = 'claimed' and outbox.lease_expires_at <= clock_timestamp())
     order by outbox.due_at, outbox.id for update skip locked limit p_limit
  ), claimed as (
    update public.patcher_revalidation_outbox outbox
       set state='claimed', attempt_count=outbox.attempt_count+1,
           claimed_generation=outbox.generation,
           lease_token=(md5(random()::text || clock_timestamp()::text))::uuid,
           lease_expires_at=clock_timestamp()+interval '15 minutes', updated_at=clock_timestamp()
      from due where outbox.id=due.id
      returning outbox.*
  ) select claimed.id, claimed.dedupe_key, claimed.trainer_id, claimed.game_id,
      claimed.locale_codes, claimed.reason, claimed.lease_token,
      snapshot.canonical_slug, claimed.attempt_count
      from claimed
      left join lateral (
        select entry.canonical_slug
          from public.patcher_index_eligibility_snapshot entry
         where entry.game_id = claimed.game_id
         order by entry.language_code
         limit 1
      ) snapshot on claimed.reason = 'content_changed';
end; $$;

create or replace function public.finish_patcher_revalidation_outbox(
  p_id bigint, p_lease_token uuid, p_state text, p_failure_code text default null, p_delay_seconds integer default 0
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare acknowledged boolean := false;
begin
  if auth.role() <> 'service_role' or p_id is null or p_lease_token is null
     or p_state not in ('completed','deferred') or p_delay_seconds is null or p_delay_seconds not between 0 and 2678400
     or (p_failure_code is not null and p_failure_code !~ '^[A-Z0-9_]{1,80}$') then return false; end if;
  -- claim 뒤 새 enqueue가 있으면 이전 worker는 그 세대를 검증하지 않았다. 완료/실패
  -- 모두 새 세대를 ready로 되돌려 후속 worker가 반드시 다시 처리하도록 한다.
  update public.patcher_revalidation_outbox as outbox
     set state=case when outbox.generation <> outbox.claimed_generation then 'ready' else p_state end,
         due_at=case when outbox.generation <> outbox.claimed_generation then clock_timestamp()
           when p_state='deferred' then clock_timestamp()+make_interval(secs=>greatest(60,p_delay_seconds)) else outbox.due_at end,
         lease_token=null, lease_expires_at=null, claimed_generation=null,
         last_failure_code=case when outbox.generation <> outbox.claimed_generation then null else p_failure_code end,
         finished_at=case when p_state='completed' and outbox.generation = outbox.claimed_generation then clock_timestamp() else null end,
         updated_at=clock_timestamp()
   where outbox.id=p_id and outbox.state='claimed' and outbox.lease_token=p_lease_token and outbox.lease_expires_at>clock_timestamp()
   returning outbox.state = p_state into acknowledged;
  return coalesce(acknowledged, false);
end; $$;

revoke all on table public.patcher_index_eligibility_snapshot, public.patcher_revalidation_outbox from public, anon, authenticated;
revoke all on table public.patcher_index_eligibility_snapshot_state from public, anon, authenticated;
revoke all on function public.refresh_patcher_index_eligibility_snapshot(bigint) from public, anon, authenticated;
revoke all on function public.bootstrap_patcher_index_eligibility_snapshot() from public, anon, authenticated;
revoke all on function public.refresh_patcher_index_and_enqueue(bigint) from public, anon, authenticated;
revoke all on function public.claim_patcher_revalidation_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_patcher_revalidation_outbox(bigint,uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.get_patcher_revalidation_target(bigint) from public, anon, authenticated;
revoke all on function public.list_patcher_indexable_sitemap_entries(text[]) from public;
grant execute on function public.refresh_patcher_index_eligibility_snapshot(bigint) to service_role;
grant execute on function public.bootstrap_patcher_index_eligibility_snapshot() to service_role;
grant execute on function public.refresh_patcher_index_and_enqueue(bigint) to service_role;
grant execute on function public.claim_patcher_revalidation_outbox(integer) to service_role;
grant execute on function public.finish_patcher_revalidation_outbox(bigint,uuid,text,text,integer) to service_role;
grant execute on function public.get_patcher_revalidation_target(bigint) to service_role;
grant execute on function public.list_patcher_indexable_sitemap_entries(text[]) to anon, authenticated, service_role;

-- 최초 배포의 backfill은 service_role 관리자/CI가 명시적으로 RPC를 호출한다.
commit;
