-- 반환 계약을 명시 캐스트로 고정한다. 함수 서명·권한·기존 큐 데이터는 보존한다.
-- 기존 int4/varchar 열도 RETURNS TABLE의 bigint/text와 정확히 일치해야 한다.
begin;

create or replace function public.claim_translation_integrity_recovery_v2(p_limit integer default 1)
returns table(trainer_id bigint,fling_url text,original_file_hash text,original_file_size bigint,option_count integer,lease_token uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' or p_limit is null or p_limit not between 1 and 1 then return; end if;
  return query with due as (
    select q.trainer_id from public.translation_integrity_recovery_queue q
    join public.trainers trainer on trainer.id=q.trainer_id
    where q.state in ('ready','deferred') and q.next_retry_at<=pg_catalog.clock_timestamp()
      -- 화면·사이트맵의 content eligibility와 동일하게 마지막 v 버전 끝점과 id를
      -- 비교한다. canonical Elden Ring은 legacy source 게임을 같은 집합에 병합한다.
      and trainer.id = (
        select candidate.id
          from public.trainers candidate
          join public.games candidate_game on candidate_game.id=candidate.game_id
         where candidate.game_id in (
           select grouped_game.id
             from public.games grouped_game
            where grouped_game.id=trainer.game_id
               or (
                 (candidate_game.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree-trainer-1768067282'))
                 and grouped_game.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree-trainer-1768067282')
               )
         )
         order by coalesce(string_to_array(nullif(regexp_replace(coalesce((regexp_match(candidate.version_str, '.*v([0-9]+(?:[.][0-9]+)*)', 'i'))[1], '0'), '(?:[.]0)+$', ''), '0'), '.')::numeric[], '{}'::numeric[]) desc,
           candidate.id desc
         limit 1
      )
    order by q.next_retry_at,q.trainer_id for update skip locked limit p_limit
  ), claimed as (
    update public.translation_integrity_recovery_queue q
      set state='ready',next_retry_at=pg_catalog.clock_timestamp()+interval '30 minutes',lease_token=(pg_catalog.md5(pg_catalog.random()::text||pg_catalog.clock_timestamp()::text))::uuid,
          lease_expires_at=pg_catalog.clock_timestamp()+interval '30 minutes',attempt_count=q.attempt_count+1,updated_at=now()
    from due where q.trainer_id=due.trainer_id
    returning q.trainer_id,q.lease_token
  ) select c.trainer_id::bigint,g.fling_url::text,t.original_file_hash::text,t.original_file_size::bigint,t.option_count::integer,c.lease_token::uuid
    from claimed c join public.trainers t on t.id=c.trainer_id join public.games g on g.id=t.game_id;
end; $$;

notify pgrst, 'reload schema';
commit;
