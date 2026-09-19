-- 자동 수집과 재번역을 분리한다. service_role 워커만 재시도 상태를 읽고 변경할 수 있다.
begin;

create table if not exists public.translation_retry_queue (
  trainer_id bigint not null references public.trainers(id) on delete cascade,
  language_code text not null check (language_code in ('ko', 'ja', 'de', 'es')),
  state text not null check (state in ('ready', 'deferred', 'blocked')),
  next_retry_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trainer_id, language_code),
  check (
    (state = 'blocked' and next_retry_at is null)
    or (state in ('ready', 'deferred') and next_retry_at is not null)
  ),
  check (last_failure_code is null or last_failure_code ~ '^[A-Z0-9_]{1,80}$')
);

create index if not exists translation_retry_queue_due_idx
  on public.translation_retry_queue (next_retry_at, trainer_id)
  where state in ('ready', 'deferred');

alter table public.translation_retry_queue enable row level security;

-- 기존 pending 초안은 낮은 우선순위로 한 번만 큐에 넣는다. rejected는 사람의
-- 판단이 필요한 blocked로 보존하고, 승인/legacy 매핑은 넣지 않는다.
insert into public.translation_retry_queue (
  trainer_id, language_code, state, next_retry_at, last_failure_code
)
select distinct mapping.trainer_id, mapping.language_code, 'ready', now(), 'LEGACY_PENDING'
  from public.translation_mappings mapping
 where mapping.is_approved = false
   and mapping.translation_status = 'pending'
   and mapping.language_code in ('ko', 'ja', 'de', 'es')
on conflict (trainer_id, language_code) do nothing;

insert into public.translation_retry_queue (
  trainer_id, language_code, state, next_retry_at, last_failure_code
)
select distinct mapping.trainer_id, mapping.language_code, 'blocked', null, 'LEGACY_REJECTED'
  from public.translation_mappings mapping
 where mapping.is_approved = false
   and mapping.translation_status = 'rejected'
   and mapping.language_code in ('ko', 'ja', 'de', 'es')
on conflict (trainer_id, language_code) do nothing;

create or replace function public.claim_due_translation_retries(p_limit integer default 4)
returns table(trainer_id bigint, language_code text, fling_url text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' or p_limit not between 1 and 20 then
    return;
  end if;

  return query
  with due as (
    select queue.trainer_id, queue.language_code
      from public.translation_retry_queue queue
     where queue.state in ('ready', 'deferred')
       and queue.next_retry_at <= now()
     order by queue.next_retry_at, queue.trainer_id, queue.language_code
     for update skip locked
     limit p_limit
  ), claimed as (
    update public.translation_retry_queue queue
       set state = 'ready',
           -- 작업 중 워커가 종료돼도 즉시 중복 실행하지 않도록 짧은 lease를 둔다.
           next_retry_at = now() + interval '30 minutes',
           attempt_count = queue.attempt_count + 1,
           updated_at = now()
      from due
     where queue.trainer_id = due.trainer_id
       and queue.language_code = due.language_code
    returning queue.trainer_id, queue.language_code
  )
  select claimed.trainer_id, claimed.language_code, game.fling_url
    from claimed
    join public.trainers trainer on trainer.id = claimed.trainer_id
    left join public.games game on game.id = trainer.game_id;
end;
$$;

create or replace function public.schedule_translation_retry(
  p_trainer_id bigint,
  p_language_code text,
  p_state text,
  p_failure_code text,
  p_delay_seconds integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_time timestamptz;
  current_attempt integer := 0;
  effective_state text := p_state;
  effective_failure_code text := p_failure_code;
begin
  if auth.role() <> 'service_role'
     or p_trainer_id is null
     or p_language_code not in ('ko', 'ja', 'de', 'es')
     or p_state not in ('ready', 'deferred', 'blocked')
     or p_failure_code is null
     or p_failure_code !~ '^[A-Z0-9_]{1,80}$'
     or p_delay_seconds not between 0 and 2678400 then
    return false;
  end if;

  select queue.attempt_count into current_attempt
    from public.translation_retry_queue queue
   where queue.trainer_id = p_trainer_id
     and queue.language_code = p_language_code;
  -- 같은 일시 오류가 반복되면 무한 비용 재시도 대신 운영 확인이 필요한 blocked로 전환한다.
  if p_state = 'deferred' and coalesce(current_attempt, 0) >= 5 then
    effective_state := 'blocked';
    effective_failure_code := 'RETRY_LIMIT_EXCEEDED';
  end if;
  target_time := case when effective_state = 'blocked' then null
                      when effective_state = 'deferred' then now() + make_interval(
                        secs => least(2678400, p_delay_seconds * power(2, least(coalesce(current_attempt, 0), 5)))::integer
                      )
                      else now() + make_interval(secs => p_delay_seconds) end;
  insert into public.translation_retry_queue (
    trainer_id, language_code, state, next_retry_at, last_failure_code
  )
  values (p_trainer_id, p_language_code, effective_state, target_time, effective_failure_code)
  on conflict (trainer_id, language_code) do update
    set state = excluded.state,
        next_retry_at = excluded.next_retry_at,
        last_failure_code = excluded.last_failure_code,
        updated_at = now();
  return true;
end;
$$;

create or replace function public.complete_translation_retry(
  p_trainer_id bigint,
  p_language_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role'
     or p_trainer_id is null
     or p_language_code not in ('ko', 'ja', 'de', 'es') then
    return false;
  end if;
  delete from public.translation_retry_queue queue
   where queue.trainer_id = p_trainer_id
     and queue.language_code = p_language_code;
  return true;
end;
$$;

revoke all on table public.translation_retry_queue from public, anon, authenticated;
revoke all on function public.claim_due_translation_retries(integer) from public, anon, authenticated;
revoke all on function public.schedule_translation_retry(bigint, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_translation_retry(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_due_translation_retries(integer) to service_role;
grant execute on function public.schedule_translation_retry(bigint, text, text, text, integer) to service_role;
grant execute on function public.complete_translation_retry(bigint, text) to service_role;

commit;
