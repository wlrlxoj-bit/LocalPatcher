-- FLiNG 게시물 발견은 번역 재시도와 별도 큐로 관리한다. 이 큐는 공식 trainer URL만
-- 수용하며, service_role 워커만 발견·claim·상태 전이를 수행할 수 있다.
begin;

create table if not exists public.source_discovery_queue (
  source_url text primary key
    check (source_url ~ '^https://flingtrainer\\.com/trainer/[a-z0-9][a-z0-9-]*/$'),
  source_lastmod timestamptz,
  state text not null default 'ready'
    check (state in ('ready', 'deferred', 'blocked', 'completed')),
  next_attempt_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 20),
  last_failure_code text,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (state in ('ready', 'deferred') and next_attempt_at is not null and completed_at is null)
    or (state = 'blocked' and next_attempt_at is null and completed_at is null)
    or (state = 'completed' and next_attempt_at is null and completed_at is not null)
  ),
  check (last_failure_code is null or last_failure_code ~ '^[A-Z0-9_]{1,80}$')
);

create index if not exists source_discovery_queue_due_idx
  on public.source_discovery_queue (next_attempt_at)
  where state in ('ready', 'deferred');

create index if not exists source_discovery_queue_priority_idx
  on public.source_discovery_queue (source_lastmod desc nulls last, discovered_at, source_url)
  where state in ('ready', 'deferred');

alter table public.source_discovery_queue enable row level security;

-- 사이트맵 URL을 정규화해 저장한다. 쿼리·fragment·비공식 호스트는 수용하지 않는다.
create or replace function public.upsert_fling_discovery_candidate(
  p_source_url text,
  p_source_lastmod timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_source_url text;
begin
  if auth.role() <> 'service_role' or p_source_url is null then
    return false;
  end if;

  normalized_source_url := lower(btrim(p_source_url));
  normalized_source_url := regexp_replace(
    normalized_source_url,
    '^https://www\\.flingtrainer\\.com/',
    'https://flingtrainer.com/'
  );
  if normalized_source_url ~ '^https://flingtrainer\\.com/trainer/[a-z0-9][a-z0-9-]*$' then
    normalized_source_url := normalized_source_url || '/';
  end if;

  if normalized_source_url !~ '^https://flingtrainer\\.com/trainer/[a-z0-9][a-z0-9-]*/$'
     or length(normalized_source_url) > 2048
     or (p_source_lastmod is not null and p_source_lastmod > now() + interval '1 day') then
    return false;
  end if;

  insert into public.source_discovery_queue as queue (
    source_url, source_lastmod, state, next_attempt_at
  ) values (
    normalized_source_url, p_source_lastmod, 'ready', now()
  )
  on conflict (source_url) do update
    set source_lastmod = excluded.source_lastmod,
        state = case
          -- 명시적으로 차단한 항목은 새 sitemap 관측만으로 다시 열지 않는다.
          when queue.state = 'blocked' then 'blocked'
          -- 완료 후 upstream 수정이 감지되면 다시 한 번 처리한다.
          when queue.source_lastmod is distinct from excluded.source_lastmod then 'ready'
          else queue.state
        end,
        next_attempt_at = case
          when queue.state = 'blocked' then null
          when queue.source_lastmod is distinct from excluded.source_lastmod then now()
          else queue.next_attempt_at
        end,
        attempt_count = case
          when queue.state <> 'blocked'
           and queue.source_lastmod is distinct from excluded.source_lastmod then 0
          else queue.attempt_count
        end,
        last_failure_code = case
          when queue.state <> 'blocked'
           and queue.source_lastmod is distinct from excluded.source_lastmod then null
          else queue.last_failure_code
        end,
        completed_at = case
          when queue.state <> 'blocked'
           and queue.source_lastmod is distinct from excluded.source_lastmod then null
          else queue.completed_at
        end,
        updated_at = now()
    where excluded.source_lastmod is not null
      and (queue.source_lastmod is null or queue.source_lastmod < excluded.source_lastmod);
  return true;
end;
$$;

-- 사이트맵 발견 결과는 워커가 하나씩 RPC를 호출하지 않고 한 번에 검증·upsert한다.
-- 기존 URL은 더 새로운 lastmod만 다시 ready 상태로 전환한다.
create or replace function public.upsert_fling_discovery_candidates(p_candidates jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_candidate jsonb;
  normalized_candidates jsonb := '[]'::jsonb;
  normalized_source_url text;
  parsed_source_lastmod timestamptz;
  candidate_lastmod_text text;
begin
  if auth.role() <> 'service_role'
     or p_candidates is null
     or jsonb_typeof(p_candidates) <> 'array'
     or jsonb_array_length(p_candidates) not between 1 and 5000 then
    return false;
  end if;

  for raw_candidate in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(raw_candidate) <> 'object'
       or jsonb_typeof(raw_candidate->'source_url') <> 'string'
       or (raw_candidate ? 'source_lastmod'
           and jsonb_typeof(raw_candidate->'source_lastmod') not in ('string', 'null')) then
      return false;
    end if;

    normalized_source_url := lower(btrim(raw_candidate->>'source_url'));
    normalized_source_url := regexp_replace(
      normalized_source_url,
      '^https://www\\.flingtrainer\\.com/',
      'https://flingtrainer.com/'
    );
    if normalized_source_url ~ '^https://flingtrainer\\.com/trainer/[a-z0-9][a-z0-9-]*$' then
      normalized_source_url := normalized_source_url || '/';
    end if;
    if normalized_source_url !~ '^https://flingtrainer\\.com/trainer/[a-z0-9][a-z0-9-]*/$'
       or length(normalized_source_url) > 2048 then
      return false;
    end if;

    candidate_lastmod_text := raw_candidate->>'source_lastmod';
    parsed_source_lastmod := null;
    if candidate_lastmod_text is not null then
      begin
        parsed_source_lastmod := candidate_lastmod_text::timestamptz;
      exception when others then
        return false;
      end;
      if parsed_source_lastmod > now() + interval '1 day' then
        return false;
      end if;
    end if;
    normalized_candidates := normalized_candidates || jsonb_build_array(jsonb_build_object(
      'source_url', normalized_source_url,
      'source_lastmod', parsed_source_lastmod
    ));
  end loop;

  with candidates as (
    select distinct on (candidate.source_url)
           candidate.source_url, candidate.source_lastmod
      from jsonb_to_recordset(normalized_candidates) as candidate(
        source_url text,
        source_lastmod timestamptz
      )
     order by candidate.source_url, candidate.source_lastmod desc nulls last
  )
  insert into public.source_discovery_queue as queue (
    source_url, source_lastmod, state, next_attempt_at
  )
  select candidate.source_url, candidate.source_lastmod, 'ready', now()
    from candidates candidate
  on conflict (source_url) do update
    set source_lastmod = excluded.source_lastmod,
        state = case when queue.state = 'blocked' then 'blocked' else 'ready' end,
        next_attempt_at = case when queue.state = 'blocked' then null else now() end,
        attempt_count = case when queue.state = 'blocked' then queue.attempt_count else 0 end,
        last_failure_code = case when queue.state = 'blocked' then queue.last_failure_code else null end,
        completed_at = case when queue.state = 'blocked' then queue.completed_at else null end,
        updated_at = now()
    where excluded.source_lastmod is not null
      and (queue.source_lastmod is null or queue.source_lastmod < excluded.source_lastmod);
  return true;
end;
$$;

-- claim은 lease를 next_attempt_at에 기록한다. 워커가 중단돼도 lease 만료 뒤에만 재시도된다.
create or replace function public.claim_fling_discovery_candidates(p_limit integer)
returns table(source_url text, source_lastmod timestamptz, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' or p_limit not between 1 and 5 then
    return;
  end if;

  return query
  with due as (
    select queue.source_url
      from public.source_discovery_queue queue
     where queue.state in ('ready', 'deferred')
       and queue.next_attempt_at <= now()
     order by queue.source_lastmod desc nulls last, queue.discovered_at, queue.source_url
     for update skip locked
     limit p_limit
  ), claimed as (
    update public.source_discovery_queue queue
       set state = 'ready',
           next_attempt_at = now() + interval '30 minutes',
           attempt_count = queue.attempt_count + 1,
           updated_at = now()
      from due
     where queue.source_url = due.source_url
    returning queue.source_url, queue.source_lastmod, queue.attempt_count
  )
  select claimed.source_url, claimed.source_lastmod, claimed.attempt_count
    from claimed;
end;
$$;

create or replace function public.complete_fling_discovery_candidate(
  p_source_url text,
  p_outcome text default 'completed',
  p_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_source_url text;
begin
  if auth.role() <> 'service_role'
     or p_source_url is null
     or p_outcome <> 'completed'
     or p_failure_code is not null then
    return false;
  end if;
  normalized_source_url := lower(btrim(regexp_replace(
    p_source_url, '^https://www\\.flingtrainer\\.com/', 'https://flingtrainer.com/'
  )));
  if normalized_source_url ~ '^https://flingtrainer\\.com/trainer/[a-z0-9][a-z0-9-]*$' then
    normalized_source_url := normalized_source_url || '/';
  end if;

  update public.source_discovery_queue queue
     set state = 'completed',
         next_attempt_at = null,
         last_failure_code = null,
         completed_at = now(),
         updated_at = now()
   where queue.source_url = normalized_source_url
     and queue.state in ('ready', 'deferred');
  return found;
end;
$$;

-- 일시 오류는 backoff하되 최대 30일·최대 20회로 제한한다. 한도를 넘으면 운영 확인용 blocked로 전환한다.
create or replace function public.defer_fling_discovery_candidate(
  p_source_url text,
  p_failure_code text,
  p_delay_seconds integer default 10800
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_source_url text;
begin
  if auth.role() <> 'service_role'
     or p_source_url is null
     or p_failure_code is null
     or p_failure_code !~ '^[A-Z0-9_]{1,80}$'
     or p_delay_seconds not between 60 and 2678400 then
    return false;
  end if;
  normalized_source_url := lower(btrim(regexp_replace(
    p_source_url, '^https://www\\.flingtrainer\\.com/', 'https://flingtrainer.com/'
  )));
  if normalized_source_url ~ '^https://flingtrainer\\.com/trainer/[a-z0-9][a-z0-9-]*$' then
    normalized_source_url := normalized_source_url || '/';
  end if;

  update public.source_discovery_queue queue
     set state = case when queue.attempt_count >= 20 then 'blocked' else 'deferred' end,
         next_attempt_at = case when queue.attempt_count >= 20 then null else now() + make_interval(
           secs => least(2678400, p_delay_seconds * power(2, least(queue.attempt_count - 1, 5)))::integer
         ) end,
         last_failure_code = case when queue.attempt_count >= 20 then 'RETRY_LIMIT_EXCEEDED' else p_failure_code end,
         updated_at = now()
   where queue.source_url = normalized_source_url
     and queue.state in ('ready', 'deferred');
  return found;
end;
$$;

create or replace function public.block_fling_discovery_candidate(
  p_source_url text,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_source_url text;
begin
  if auth.role() <> 'service_role'
     or p_source_url is null
     or p_failure_code is null
     or p_failure_code !~ '^[A-Z0-9_]{1,80}$' then
    return false;
  end if;
  normalized_source_url := lower(btrim(regexp_replace(
    p_source_url, '^https://www\\.flingtrainer\\.com/', 'https://flingtrainer.com/'
  )));
  if normalized_source_url ~ '^https://flingtrainer\\.com/trainer/[a-z0-9][a-z0-9-]*$' then
    normalized_source_url := normalized_source_url || '/';
  end if;

  update public.source_discovery_queue queue
     set state = 'blocked',
         next_attempt_at = null,
         last_failure_code = p_failure_code,
         updated_at = now()
   where queue.source_url = normalized_source_url
     and queue.state in ('ready', 'deferred');
  return found;
end;
$$;

revoke all on table public.source_discovery_queue from public, anon, authenticated;
revoke all on function public.upsert_fling_discovery_candidate(text, timestamptz) from public, anon, authenticated;
revoke all on function public.upsert_fling_discovery_candidates(jsonb) from public, anon, authenticated;
revoke all on function public.claim_fling_discovery_candidates(integer) from public, anon, authenticated;
revoke all on function public.complete_fling_discovery_candidate(text, text, text) from public, anon, authenticated;
revoke all on function public.defer_fling_discovery_candidate(text, text, integer) from public, anon, authenticated;
revoke all on function public.block_fling_discovery_candidate(text, text) from public, anon, authenticated;
grant execute on function public.upsert_fling_discovery_candidate(text, timestamptz) to service_role;
grant execute on function public.upsert_fling_discovery_candidates(jsonb) to service_role;
grant execute on function public.claim_fling_discovery_candidates(integer) to service_role;
grant execute on function public.complete_fling_discovery_candidate(text, text, text) to service_role;
grant execute on function public.defer_fling_discovery_candidate(text, text, integer) to service_role;
grant execute on function public.block_fling_discovery_candidate(text, text) to service_role;

commit;
