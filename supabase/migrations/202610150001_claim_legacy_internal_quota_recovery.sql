-- 운영 로그로 내부 월 한도 보류가 입증된 두 trainer만 일회성 선별 복구한다.
-- 정상 due claim 함수·예약 우선순위·기존 attempt_count는 변경하지 않는다.
begin;

create or replace function public.claim_legacy_internal_quota_recovery(
  p_trainer_ids bigint[], p_limit integer default 4
)
returns table(trainer_id bigint, language_code text, fling_url text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role'
     or p_limit is null or p_limit not between 1 and 4
     or p_trainer_ids is null
     or pg_catalog.cardinality(p_trainer_ids) not between 1 and 2
     or pg_catalog.array_position(p_trainer_ids, null) is not null
     or not p_trainer_ids <@ array[2730, 2731]::bigint[] then
    return;
  end if;

  return query
  with eligible as (
    select q.trainer_id, q.language_code
      from public.translation_retry_queue q
      join public.trainers t on t.id=q.trainer_id
      join public.games g on g.id=t.game_id
     where q.trainer_id = any(p_trainer_ids)
       and q.language_code in ('ko', 'ja', 'de', 'es')
       and q.state = 'deferred'
       and q.last_failure_code = 'TRANSLATION_QUOTA'
       -- 상한 제거 코드 배포 이후의 공급자 quota 실패는 이 경로로 풀지 않는다.
       and q.updated_at < timestamptz '2026-10-15 01:53:34+00'
       and g.fling_url ~ '^https://flingtrainer[.]com/trainer/[a-z0-9][a-z0-9-]*/?$'
       and not exists (
         select 1 from public.trainers newer where newer.game_id=t.game_id and newer.id>t.id
       )
       and not exists (
         select 1 from public.source_discovery_queue s
          where pg_catalog.rtrim(s.source_url,'/')=pg_catalog.rtrim(g.fling_url,'/') and s.state='blocked'
       )
       and not exists (
         select 1 from public.translation_mappings m
          where m.trainer_id=q.trainer_id and m.language_code=q.language_code
            and (m.is_approved=true or m.translation_provider='manual')
       )
       and not exists (
         select 1 from public.translation_integrity_recovery_queue i
          where i.trainer_id=q.trainer_id
            and (i.state='blocked' or i.lease_expires_at > pg_catalog.clock_timestamp())
       )
     order by q.trainer_id desc, q.language_code
     for update of q skip locked
     limit p_limit
  ), claimed as (
    update public.translation_retry_queue q
       set state='ready',
           next_retry_at=pg_catalog.clock_timestamp()+interval '30 minutes',
           last_failure_code='INTERNAL_QUOTA_RECOVERY_CLAIMED',
           updated_at=pg_catalog.clock_timestamp()
      from eligible e
     where q.trainer_id=e.trainer_id and q.language_code=e.language_code
    returning q.trainer_id,q.language_code
  )
  select c.trainer_id,c.language_code,g.fling_url
    from claimed c
    join public.trainers t on t.id=c.trainer_id
    left join public.games g on g.id=t.game_id;
end;
$$;

revoke all on function public.claim_legacy_internal_quota_recovery(bigint[],integer)
  from public,anon,authenticated;
grant execute on function public.claim_legacy_internal_quota_recovery(bigint[],integer)
  to service_role;

-- 커밋 후 새 RPC가 PostgREST에서 보이도록 스키마 캐시 재적재를 요청한다.
notify pgrst, 'reload schema';

commit;
