-- 운영에 적용된 초기 큐 마이그레이션의 URL 정규식 이스케이프를 바로잡는다.
-- PostgreSQL 정규식 문자열에서는 점 앞에 역슬래시 하나만 필요하다.
begin;

alter table public.source_discovery_queue
  drop constraint if exists source_discovery_queue_source_url_check;

alter table public.source_discovery_queue
  add constraint source_discovery_queue_source_url_check
  check (source_url ~ '^https://flingtrainer\.com/trainer/[a-z0-9][a-z0-9-]*/$');

create or replace function public.upsert_fling_discovery_candidate(
  p_source_url text,
  p_source_lastmod timestamptz default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare normalized_source_url text;
begin
  if auth.role() <> 'service_role' or p_source_url is null then return false; end if;
  normalized_source_url := lower(btrim(p_source_url));
  normalized_source_url := regexp_replace(normalized_source_url, '^https://www\.flingtrainer\.com/', 'https://flingtrainer.com/');
  if normalized_source_url ~ '^https://flingtrainer\.com/trainer/[a-z0-9][a-z0-9-]*$' then normalized_source_url := normalized_source_url || '/'; end if;
  if normalized_source_url !~ '^https://flingtrainer\.com/trainer/[a-z0-9][a-z0-9-]*/$'
     or length(normalized_source_url) > 2048
     or (p_source_lastmod is not null and p_source_lastmod > now() + interval '1 day') then return false; end if;
  insert into public.source_discovery_queue as queue (source_url, source_lastmod, state, next_attempt_at)
  values (normalized_source_url, p_source_lastmod, 'ready', now())
  on conflict (source_url) do update set
    source_lastmod = excluded.source_lastmod,
    state = case when queue.state = 'blocked' then 'blocked' when queue.source_lastmod is distinct from excluded.source_lastmod then 'ready' else queue.state end,
    next_attempt_at = case when queue.state = 'blocked' then null when queue.source_lastmod is distinct from excluded.source_lastmod then now() else queue.next_attempt_at end,
    attempt_count = case when queue.state <> 'blocked' and queue.source_lastmod is distinct from excluded.source_lastmod then 0 else queue.attempt_count end,
    last_failure_code = case when queue.state <> 'blocked' and queue.source_lastmod is distinct from excluded.source_lastmod then null else queue.last_failure_code end,
    completed_at = case when queue.state <> 'blocked' and queue.source_lastmod is distinct from excluded.source_lastmod then null else queue.completed_at end,
    updated_at = now()
  where excluded.source_lastmod is not null and (queue.source_lastmod is null or queue.source_lastmod < excluded.source_lastmod);
  return true;
end;
$$;

-- 002의 안전한 원인 분류 계약은 유지하면서 URL 정규식만 바로잡는다.
create or replace function public.upsert_fling_discovery_candidates(p_candidates jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  raw_candidate jsonb;
  normalized_candidates jsonb := '[]'::jsonb;
  normalized_source_url text;
  parsed_source_lastmod timestamptz;
  candidate_lastmod_text text;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = 'P0001', message = 'SOURCE_DISCOVERY_UNAUTHORIZED'; end if;
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) not between 1 and 5000 then
    raise exception using errcode = 'P0001', message = 'SOURCE_DISCOVERY_INVALID_BATCH';
  end if;
  for raw_candidate in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(raw_candidate) <> 'object' or jsonb_typeof(raw_candidate->'source_url') <> 'string'
       or (raw_candidate ? 'source_lastmod' and jsonb_typeof(raw_candidate->'source_lastmod') not in ('string', 'null')) then
      raise exception using errcode = 'P0001', message = 'SOURCE_DISCOVERY_INVALID_CANDIDATE';
    end if;
    normalized_source_url := lower(btrim(raw_candidate->>'source_url'));
    normalized_source_url := regexp_replace(normalized_source_url, '^https://www\.flingtrainer\.com/', 'https://flingtrainer.com/');
    if normalized_source_url ~ '^https://flingtrainer\.com/trainer/[a-z0-9][a-z0-9-]*$' then normalized_source_url := normalized_source_url || '/'; end if;
    if normalized_source_url !~ '^https://flingtrainer\.com/trainer/[a-z0-9][a-z0-9-]*/$' or length(normalized_source_url) > 2048 then
      raise exception using errcode = 'P0001', message = 'SOURCE_DISCOVERY_INVALID_CANDIDATE';
    end if;
    candidate_lastmod_text := raw_candidate->>'source_lastmod'; parsed_source_lastmod := null;
    if candidate_lastmod_text is not null then
      begin parsed_source_lastmod := candidate_lastmod_text::timestamptz;
      exception when others then raise exception using errcode = 'P0001', message = 'SOURCE_DISCOVERY_INVALID_LASTMOD'; end;
      if parsed_source_lastmod > now() + interval '1 day' then raise exception using errcode = 'P0001', message = 'SOURCE_DISCOVERY_INVALID_LASTMOD'; end if;
    end if;
    normalized_candidates := normalized_candidates || jsonb_build_array(jsonb_build_object('source_url', normalized_source_url, 'source_lastmod', parsed_source_lastmod));
  end loop;
  with candidates as (
    select distinct on (candidate.source_url) candidate.source_url, candidate.source_lastmod
    from jsonb_to_recordset(normalized_candidates) as candidate(source_url text, source_lastmod timestamptz)
    order by candidate.source_url, candidate.source_lastmod desc nulls last
  )
  insert into public.source_discovery_queue as queue (source_url, source_lastmod, state, next_attempt_at)
  select candidate.source_url, candidate.source_lastmod, 'ready', now() from candidates candidate
  on conflict (source_url) do update set
    source_lastmod = excluded.source_lastmod,
    state = case when queue.state = 'blocked' then 'blocked' else 'ready' end,
    next_attempt_at = case when queue.state = 'blocked' then null else now() end,
    attempt_count = case when queue.state = 'blocked' then queue.attempt_count else 0 end,
    last_failure_code = case when queue.state = 'blocked' then queue.last_failure_code else null end,
    completed_at = case when queue.state = 'blocked' then queue.completed_at else null end,
    updated_at = now()
  where excluded.source_lastmod is not null and (queue.source_lastmod is null or queue.source_lastmod < excluded.source_lastmod);
  return true;
end;
$$;

create or replace function public.complete_fling_discovery_candidate(p_source_url text, p_outcome text default 'completed', p_failure_code text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare normalized_source_url text;
begin
  if auth.role() <> 'service_role' or p_source_url is null or p_outcome <> 'completed' or p_failure_code is not null then return false; end if;
  normalized_source_url := lower(btrim(regexp_replace(p_source_url, '^https://www\.flingtrainer\.com/', 'https://flingtrainer.com/')));
  if normalized_source_url ~ '^https://flingtrainer\.com/trainer/[a-z0-9][a-z0-9-]*$' then normalized_source_url := normalized_source_url || '/'; end if;
  update public.source_discovery_queue queue set state = 'completed', next_attempt_at = null, last_failure_code = null, completed_at = now(), updated_at = now()
  where queue.source_url = normalized_source_url and queue.state in ('ready', 'deferred');
  return found;
end;
$$;

create or replace function public.defer_fling_discovery_candidate(p_source_url text, p_failure_code text, p_delay_seconds integer default 10800)
returns boolean language plpgsql security definer set search_path = '' as $$
declare normalized_source_url text;
begin
  if auth.role() <> 'service_role' or p_source_url is null or p_failure_code is null or p_failure_code !~ '^[A-Z0-9_]{1,80}$' or p_delay_seconds not between 60 and 2678400 then return false; end if;
  normalized_source_url := lower(btrim(regexp_replace(p_source_url, '^https://www\.flingtrainer\.com/', 'https://flingtrainer.com/')));
  if normalized_source_url ~ '^https://flingtrainer\.com/trainer/[a-z0-9][a-z0-9-]*$' then normalized_source_url := normalized_source_url || '/'; end if;
  update public.source_discovery_queue queue set
    state = case when queue.attempt_count >= 20 then 'blocked' else 'deferred' end,
    next_attempt_at = case when queue.attempt_count >= 20 then null else now() + make_interval(secs => least(2678400, p_delay_seconds * power(2, least(queue.attempt_count - 1, 5)))::integer) end,
    last_failure_code = case when queue.attempt_count >= 20 then 'RETRY_LIMIT_EXCEEDED' else p_failure_code end,
    updated_at = now()
  where queue.source_url = normalized_source_url and queue.state in ('ready', 'deferred');
  return found;
end;
$$;

create or replace function public.block_fling_discovery_candidate(p_source_url text, p_failure_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare normalized_source_url text;
begin
  if auth.role() <> 'service_role' or p_source_url is null or p_failure_code is null or p_failure_code !~ '^[A-Z0-9_]{1,80}$' then return false; end if;
  normalized_source_url := lower(btrim(regexp_replace(p_source_url, '^https://www\.flingtrainer\.com/', 'https://flingtrainer.com/')));
  if normalized_source_url ~ '^https://flingtrainer\.com/trainer/[a-z0-9][a-z0-9-]*$' then normalized_source_url := normalized_source_url || '/'; end if;
  update public.source_discovery_queue queue set state = 'blocked', next_attempt_at = null, last_failure_code = p_failure_code, updated_at = now()
  where queue.source_url = normalized_source_url and queue.state in ('ready', 'deferred');
  return found;
end;
$$;

commit;
