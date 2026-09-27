-- 사이트맵 발견 bulk upsert의 거부 사유를 워커가 안전하게 분류할 수 있도록 한다.
-- 기존 성공 계약(boolean true)과 큐 상태 전이 규칙은 그대로 유지한다.
begin;

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
  if auth.role() <> 'service_role' then
    raise exception using
      errcode = 'P0001',
      message = 'SOURCE_DISCOVERY_UNAUTHORIZED';
  end if;

  if p_candidates is null
     or jsonb_typeof(p_candidates) <> 'array'
     or jsonb_array_length(p_candidates) not between 1 and 5000 then
    raise exception using
      errcode = 'P0001',
      message = 'SOURCE_DISCOVERY_INVALID_BATCH';
  end if;

  for raw_candidate in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(raw_candidate) <> 'object'
       or jsonb_typeof(raw_candidate->'source_url') <> 'string'
       or (raw_candidate ? 'source_lastmod'
           and jsonb_typeof(raw_candidate->'source_lastmod') not in ('string', 'null')) then
      raise exception using
        errcode = 'P0001',
        message = 'SOURCE_DISCOVERY_INVALID_CANDIDATE';
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
      raise exception using
        errcode = 'P0001',
        message = 'SOURCE_DISCOVERY_INVALID_CANDIDATE';
    end if;

    candidate_lastmod_text := raw_candidate->>'source_lastmod';
    parsed_source_lastmod := null;
    if candidate_lastmod_text is not null then
      begin
        parsed_source_lastmod := candidate_lastmod_text::timestamptz;
      exception when others then
        raise exception using
          errcode = 'P0001',
          message = 'SOURCE_DISCOVERY_INVALID_LASTMOD';
      end;
      if parsed_source_lastmod > now() + interval '1 day' then
        raise exception using
          errcode = 'P0001',
          message = 'SOURCE_DISCOVERY_INVALID_LASTMOD';
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

commit;
