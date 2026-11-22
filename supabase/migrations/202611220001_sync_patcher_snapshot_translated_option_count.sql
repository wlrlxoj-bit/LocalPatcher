-- Wave 4: patcher_index_eligibility_snapshot 갱신 함수에 번역문(translated_text) 옵션 수 검증을 동기화합니다.
-- lib/content-eligibility.ts의 hasCompleteApprovedMappings()와 동일하게 원문과 번역문 모두에서
-- 실제 옵션 수가 option_count 이상일 때만 is_indexable = true로 판정합니다.
begin;

create or replace function public.refresh_patcher_index_eligibility_snapshot(p_trainer_id bigint default null::bigint)
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
      coalesce(sum(translated_label.option_count), 0) as approved_translated_option_count,
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
    left join lateral (
      select count(*)::integer as option_count
        from pg_catalog.regexp_matches(
          mapping.translated_text,
          '^[ \t]*(Num(Pad)?[ \t]*([0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F([1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(Up|Down|Left|Right)|Bracket(Left|Right)|[\[\]]|[A-Z0-9+\-=.,/])([ \t]*[+][ \t]*(Num(Pad)?[ \t]*([0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F([1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(Up|Down|Left|Right)|Bracket(Left|Right)|[\[\]]|[A-Z0-9+\-=.,/]))*[ \t]*(->|—|–|→|-|:)[ \t]*[^[:space:]]',
          'gim'
        )
    ) translated_label on mapping.is_approved is true
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
      option_count > 0
        and mapping_count > 0
        and invalid_mapping_count = 0
        and approved_option_count >= option_count
        and approved_translated_option_count >= option_count,
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

commit;
