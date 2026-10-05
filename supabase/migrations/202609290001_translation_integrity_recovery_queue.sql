-- 승인·수동 매핑을 변경하지 않고, 동일 원본의 누락 언어 슬롯만 복구하기 위한 큐다.
begin;

create table if not exists public.translation_integrity_recovery_queue (
  trainer_id bigint primary key references public.trainers(id) on delete cascade,
  state text not null check (state in ('ready', 'deferred', 'blocked', 'completed')),
  next_retry_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state in ('ready', 'deferred') and next_retry_at is not null) or (state in ('blocked', 'completed') and next_retry_at is null)),
  check (last_failure_code is null or last_failure_code ~ '^[A-Z0-9_]{1,80}$')
);

create index if not exists translation_integrity_recovery_due_idx
  on public.translation_integrity_recovery_queue(next_retry_at, trainer_id)
  where state in ('ready', 'deferred');
alter table public.translation_integrity_recovery_queue enable row level security;

create or replace function public.enqueue_translation_integrity_recovery_candidates(p_limit integer default 20)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed_count integer := 0;
begin
  if auth.role() <> 'service_role' or p_limit is null or p_limit not between 1 and 200 then return 0; end if;
  -- 최신 trainer 중 승인본이 존재하지만 일부 locale 자체가 비어 있는 경우만 대상으로 한다.
  -- 기존 미승인/수동 행은 worker가 충돌로 차단하며 이 함수는 어떠한 mapping도 바꾸지 않는다.
  with ranked as (
    select t.id, row_number() over (partition by t.game_id order by t.id desc) as position
      from public.trainers t where t.option_count > 0
  ), candidates as (
    select r.id as trainer_id
      from ranked r
     where r.position = 1
       and exists (select 1 from public.translation_mappings m where m.trainer_id = r.id and m.is_approved = true)
       and exists (
         select 1 from (values ('ko'::text), ('ja'::text), ('de'::text), ('es'::text)) locale(language_code)
          where not exists (select 1 from public.translation_mappings m where m.trainer_id = r.id and m.language_code = locale.language_code)
       )
     order by r.id desc limit p_limit
  ), written as (
    insert into public.translation_integrity_recovery_queue as q(trainer_id, state, next_retry_at, last_failure_code)
    select c.trainer_id, 'ready', now(), 'MISSING_LANGUAGE_SLOT' from candidates c
    on conflict (trainer_id) do update set state = 'ready', next_retry_at = now(), last_failure_code = 'MISSING_LANGUAGE_SLOT', updated_at = now()
      where q.state = 'completed' or (q.state in ('ready', 'deferred') and q.next_retry_at <= now())
    returning 1
  ) select count(*) into changed_count from written;
  return changed_count;
end; $$;

create or replace function public.claim_translation_integrity_recovery(p_limit integer default 1)
returns table(trainer_id bigint, fling_url text, original_file_hash text, original_file_size bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' or p_limit is null or p_limit not between 1 and 2 then return; end if;
  return query with due as (
    select q.trainer_id from public.translation_integrity_recovery_queue q
     where q.state in ('ready', 'deferred') and q.next_retry_at <= now()
     order by q.next_retry_at, q.trainer_id for update skip locked limit p_limit
  ), claimed as (
    update public.translation_integrity_recovery_queue q set state='ready', next_retry_at=now()+interval '30 minutes', attempt_count=q.attempt_count+1, updated_at=now()
      from due where q.trainer_id=due.trainer_id returning q.trainer_id
  ) select c.trainer_id, g.fling_url, t.original_file_hash, t.original_file_size
      from claimed c join public.trainers t on t.id=c.trainer_id join public.games g on g.id=t.game_id;
end; $$;

create or replace function public.finish_translation_integrity_recovery(p_trainer_id bigint, p_state text, p_failure_code text default null, p_delay_seconds integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
declare next_time timestamptz;
begin
  if auth.role() <> 'service_role' or p_trainer_id is null or p_state not in ('deferred', 'blocked', 'completed')
     or (p_failure_code is not null and p_failure_code !~ '^[A-Z0-9_]{1,80}$') or p_delay_seconds not between 0 and 2678400 then return false; end if;
  next_time := case when p_state = 'deferred' then now() + make_interval(secs => greatest(60, p_delay_seconds)) else null end;
  update public.translation_integrity_recovery_queue set state=p_state, next_retry_at=next_time, last_failure_code=p_failure_code, updated_at=now()
   where trainer_id=p_trainer_id;
  return found;
end; $$;

revoke all on table public.translation_integrity_recovery_queue from public, anon, authenticated;
revoke all on function public.enqueue_translation_integrity_recovery_candidates(integer) from public, anon, authenticated;
revoke all on function public.claim_translation_integrity_recovery(integer) from public, anon, authenticated;
revoke all on function public.finish_translation_integrity_recovery(bigint, text, text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_translation_integrity_recovery_candidates(integer) to service_role;
grant execute on function public.claim_translation_integrity_recovery(integer) to service_role;
grant execute on function public.finish_translation_integrity_recovery(bigint, text, text, integer) to service_role;
commit;
