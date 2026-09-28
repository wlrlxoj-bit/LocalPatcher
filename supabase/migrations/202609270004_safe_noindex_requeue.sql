-- 미완성 자동 번역만 명시적인 복구 실행에서 다시 큐에 넣는다.
-- 승인본, 수동 검수본, 실행 중 lease와 비용 한도 대기는 절대로 덮어쓰지 않는다.
begin;

create or replace function public.requeue_safe_noindex_translation_candidates(
  p_limit integer default 100
)
returns table(queued_count integer, preserved_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer := 0;
  changed_count integer := 0;
begin
  if auth.role() <> 'service_role' or p_limit not between 1 and 500 then
    raise exception 'SAFE_NOINDEX_REQUEUE_UNAUTHORIZED_OR_INVALID_LIMIT'
      using errcode = 'P0001';
  end if;

  -- 화면·사이트맵과 동일하게, 각 게임의 마지막 v 버전과 id를 기준으로 최신 trainer를
  -- 선택한다. 엘든 링은 canonical/source 게임을 하나의 후보 집합으로 병합한다.
  with game_groups as (
    select game.id as requested_game_id,
           case when game.slug = 'elden-ring' then array[game.id, source_game.id]
                else array[game.id] end as trainer_game_ids
      from public.games game
      left join public.games source_game
        on game.slug = 'elden-ring'
       and source_game.slug = 'elden-ring-shadow-of-the-erdtree-trainer-1768067282'
  ), trainer_versions as (
    select groups.requested_game_id,
           trainer.id as trainer_id,
           trainer.option_count,
           coalesce((regexp_match(
             trainer.version_str,
             '.*v([0-9]+(?:[.][0-9]+)*)',
             'i'
           ))[1], '0') as version_end
      from game_groups groups
      join public.trainers trainer on trainer.game_id = any(groups.trainer_game_ids)
  ), ranked_trainers as (
    select versioned.requested_game_id,
           versioned.trainer_id,
           versioned.option_count,
           row_number() over (
             partition by versioned.requested_game_id
             -- TypeScript의 parseVersion/compareVersionParts와 같이 누락된 뒤 숫자는
             -- 0으로 비교한다. FLiNG 버전은 8단계보다 훨씬 짧으며, 12자리 padding은
             -- 문자열 정렬이 숫자 정렬과 동일하도록 한다.
             order by array_to_string(array(
               select lpad(coalesce(nullif(split_part(versioned.version_end, '.', part), ''), '0'), 12, '0')
                 from generate_series(1, 8) as part
             ), '') desc,
             versioned.trainer_id desc
           ) as latest_rank
      from trainer_versions versioned
  ), latest_trainers as (
    select requested_game_id, trainer_id
      from ranked_trainers
     where latest_rank = 1
       and option_count > 0
  ), safe_candidates as (
    -- canonical 엘든 링과 legacy source 행이 같은 최신 trainer를 가리킬 수 있다.
    -- retry queue PK마다 정확히 한 행만 upsert하도록 여기서 먼저 중복을 없앤다.
    select distinct latest.trainer_id, locale.language_code
      from latest_trainers latest
      cross join (values ('ko'::text), ('ja'::text), ('de'::text), ('es'::text)) locale(language_code)
     where not exists (
       -- 승인된 완전/불완전 매핑 모두 보호한다. 불완전 승인본을 자동 초안으로
       -- 바꾸면 사람이 검수한 원문과 복구 이력을 훼손할 수 있다.
       select 1 from public.translation_mappings mapping
        where mapping.trainer_id = latest.trainer_id
          and mapping.language_code = locale.language_code
          and (mapping.is_approved = true or mapping.translation_provider = 'manual')
     )
       and not exists (
       -- 빈 행 또는 자동 pending/rejected만 안전 후보이다. legacy/알 수 없는 상태는
       -- 자동으로 덮어쓰지 않고 운영 검토 대상으로 남긴다.
       select 1 from public.translation_mappings mapping
        where mapping.trainer_id = latest.trainer_id
          and mapping.language_code = locale.language_code
          and not (
            mapping.translation_provider is distinct from 'manual'
            and (
              mapping.translation_status in ('pending', 'rejected')
              or coalesce(btrim(mapping.original_text), '') = ''
              or coalesce(btrim(mapping.translated_text), '') = ''
            )
          )
        )
       and not exists (
       -- 이미 작업자가 claim한 lease, 미래 재시도, quota 대기, 차단 항목은 후보
       -- 단계에서 제외한다. 여러 청크 실행 중 같은 PK를 계속 세지 않게 한다.
       select 1 from public.translation_retry_queue queue
        where queue.trainer_id = latest.trainer_id
          and queue.language_code = locale.language_code
          and (
            queue.state = 'blocked'
            or (queue.state = 'ready' and queue.next_retry_at > now())
            or (queue.state = 'deferred' and queue.next_retry_at > now())
            or (queue.state = 'deferred' and queue.last_failure_code = 'TRANSLATION_QUOTA')
            -- 이 명시 복구가 이미 준비한 항목도 다음 청크에서 반복하지 않는다.
            or (queue.state = 'ready' and queue.last_failure_code = 'NOINDEX_SAFE_RECOVERY')
          )
       )
     order by latest.trainer_id desc, locale.language_code
     limit p_limit
  ), upserted as (
    insert into public.translation_retry_queue as queue (
      trainer_id, language_code, state, next_retry_at, last_failure_code
    )
    select candidate.trainer_id, candidate.language_code, 'ready', now(), 'NOINDEX_SAFE_RECOVERY'
      from safe_candidates candidate
    on conflict (trainer_id, language_code) do update
      set state = 'ready',
          next_retry_at = now(),
          last_failure_code = 'NOINDEX_SAFE_RECOVERY',
          updated_at = now()
      where not (
        -- 방어적 이중 보호: 후보 조회와 충돌 갱신 사이에 상태가 바뀌어도 보존한다.
        (queue.state = 'ready' and queue.next_retry_at > now())
        or (queue.state = 'deferred' and queue.next_retry_at > now())
        or queue.state = 'blocked'
        or (queue.state = 'deferred' and queue.last_failure_code = 'TRANSLATION_QUOTA')
      )
    returning 1
  )
  select (select count(*)::integer from safe_candidates), (select count(*)::integer from upserted)
    into selected_count, changed_count;

  return query select changed_count, greatest(selected_count - changed_count, 0);
end;
$$;

revoke all on function public.requeue_safe_noindex_translation_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.requeue_safe_noindex_translation_candidates(integer)
  to service_role;

commit;
