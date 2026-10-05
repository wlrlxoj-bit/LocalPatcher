-- 001에서 만든 큐에 lease token과 옵션 커버리지 후보 판정을 추가한다.
begin;

alter table public.translation_integrity_recovery_queue
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

create or replace function public.enqueue_translation_integrity_recovery_candidates(p_limit integer default 20)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed_count integer := 0;
begin
  if auth.role() <> 'service_role' or p_limit is null or p_limit not between 1 and 200 then return 0; end if;
  -- content-eligibility.ts와 동일한 원칙: locale의 승인 원문 옵션 라벨 합계가
  -- trainer.option_count보다 작으면 후보이다. 여기서는 mapping을 절대 바꾸지 않는다.
  with game_groups as (
    select game.id as requested_game_id,
      case when game.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree-trainer-1768067282')
        then array_remove(array[game.id, source_game.id], null)
        else array[game.id] end as trainer_game_ids
    from public.games game
    left join public.games source_game
      on game.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree-trainer-1768067282')
     and source_game.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree-trainer-1768067282')
     and source_game.id <> game.id
  ), trainer_versions as (
    select groups.requested_game_id, trainer.id, trainer.option_count,
      coalesce((regexp_match(trainer.version_str, '.*v([0-9]+(?:[.][0-9]+)*)', 'i'))[1], '0') as version_end
    from game_groups groups join public.trainers trainer on trainer.game_id=any(groups.trainer_game_ids)
    where trainer.option_count > 0
  ), ranked as (
    select versioned.id, versioned.option_count,
      -- lib/supabase.ts의 compareVersionParts와 같은 의미다. 마지막 v 토큰의
      -- 모든 숫자 컴포넌트를 비교하고, 끝의 .0들은 제거해 누락 컴포넌트와 동등하게
      -- 취급한다. 길이를 8개로 고정하면 v1.2.3.4.5.6.7.8.9 이후가 잘못 정렬된다.
      row_number() over (partition by versioned.requested_game_id order by
        coalesce(string_to_array(nullif(regexp_replace(versioned.version_end, '(?:[.]0)+$', ''), '0'), '.')::numeric[], '{}'::numeric[]) desc,
        versioned.id desc) as position
    from trainer_versions versioned
  ), latest_trainers as (
    select distinct id, option_count from ranked where position=1
  ), candidates as (
    select r.id as trainer_id
    from latest_trainers r
    where exists (select 1 from public.translation_mappings m where m.trainer_id=r.id and m.is_approved=true)
      and exists (
        select 1 from (values ('ko'::text), ('ja'::text), ('de'::text), ('es'::text)) locale(language_code)
        where coalesce((
          select count(*)
          from public.translation_mappings m
          cross join lateral pg_catalog.regexp_matches(
            m.original_text,
            -- content-eligibility.ts OPTION_KEY_PATTERN과 같은 허용 키다. []와 =,
            -- Num 특수키 기호를 빼면 실제 noindex 페이지가 후보에서 누락된다.
            '^[[:space:]]*(Num(Pad)?[[:space:]]*([0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F([1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(Up|Down|Left|Right)|Bracket(Left|Right)|[\[\]]|[A-Z0-9+\-=.,/])([[:space:]]*[+][[:space:]]*(Num(Pad)?[[:space:]]*([0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F([1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(Up|Down|Left|Right)|Bracket(Left|Right)|[\[\]]|[A-Z0-9+\-=.,/]))*[[:space:]]*(->|—|–|→|-|:)[[:space:]]*[^[:space:]]',
            'gim'
          ) as option_label(match)
          where m.trainer_id=r.id and m.language_code=locale.language_code
            and m.is_approved=true and btrim(coalesce(m.original_text,''))<>'' and btrim(coalesce(m.translated_text,''))<>''
        ), 0) < r.option_count
      )
    order by r.id desc limit p_limit
  ), written as (
    insert into public.translation_integrity_recovery_queue as q(trainer_id,state,next_retry_at,last_failure_code,lease_token,lease_expires_at)
    select c.trainer_id,'ready',now(),'OPTION_COVERAGE_INCOMPLETE',null,null from candidates c
    on conflict (trainer_id) do update set state='ready',next_retry_at=now(),last_failure_code='OPTION_COVERAGE_INCOMPLETE',lease_token=null,lease_expires_at=null,updated_at=now()
      where q.state='completed' or (q.state in ('ready','deferred') and q.next_retry_at<=now())
    returning 1
  ) select count(*) into changed_count from written;
  return changed_count;
end; $$;

create function public.claim_translation_integrity_recovery_v2(p_limit integer default 1)
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
  ) select c.trainer_id,g.fling_url,t.original_file_hash,t.original_file_size,t.option_count,c.lease_token
    from claimed c join public.trainers t on t.id=c.trainer_id join public.games g on g.id=t.game_id;
end; $$;

-- worker가 바이너리에서 완전히 검증한 mapping batch를 전달한다. 이 함수는 lease,
-- 최신 trainer, source/target snapshot을 먼저 모두 확인한 뒤에만 pending→approved를
-- 하나의 DB 트랜잭션으로 수행한다. 예외가 나면 PostgreSQL이 전체 변경을 rollback한다.
create function public.apply_translation_integrity_recovery_v2(
  p_trainer_id bigint,
  p_lease_token uuid,
  p_batch jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  queue_row public.translation_integrity_recovery_queue%rowtype;
  current_trainer public.trainers%rowtype;
  latest_trainer_id bigint;
  item jsonb;
  mapping jsonb;
  source jsonb;
  lease_checked_at timestamptz;
  applied_count integer := 0;
begin
  if auth.role() <> 'service_role'
     or p_trainer_id is null
     or p_lease_token is null
     or p_batch is null
     or jsonb_typeof(p_batch) is distinct from 'array' then
    raise exception 'invalid integrity recovery input';
  end if;
  -- jsonb NULL은 IF에서 false처럼 취급될 수 있다. 타입을 먼저 확정한 뒤에도
  -- 길이를 null-safe하게 검사해 NULL/빈 배치가 applied=0 완료로 흐르지 못하게 한다.
  if coalesce(jsonb_array_length(p_batch), 0) not between 1 and 64 then
    raise exception 'invalid integrity recovery input';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_batch) input(value)
     where jsonb_typeof(value->'mapping') <> 'object'
        or jsonb_typeof(value->'source') <> 'object'
        or coalesce(value->'mapping'->>'trainer_id','') <> p_trainer_id::text
        or coalesce(value->'mapping'->>'language_code','') not in ('ko','ja','de','es')
        or coalesce(value->'mapping'->>'offset_dec','') !~ '^(0|[1-9][0-9]*)$'
        or coalesce(value->'mapping'->>'max_char_len','') !~ '^[1-9][0-9]*$'
        or coalesce(value->'mapping'->>'encoding','') not in ('ASCII','UTF-8','UTF-16LE')
        or nullif(value->'mapping'->>'original_text','') is null
        or nullif(value->'mapping'->>'translated_text','') is null
        or coalesce(value->'mapping'->>'translation_provider','') not in ('azure','gemini','openai_paid')
        or value->'source'->>'offset_dec' is distinct from value->'mapping'->>'offset_dec'
        or value->'source'->>'encoding' is distinct from value->'mapping'->>'encoding'
        or value->'source'->>'max_char_len' is distinct from value->'mapping'->>'max_char_len'
        or value->'source'->>'original_text' is distinct from value->'mapping'->>'original_text'
  ) then raise exception 'invalid integrity recovery batch'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_batch) input(value)
     where (value->'mapping'->>'offset_dec')::numeric > 2147483647
        or (value->'mapping'->>'max_char_len')::numeric > 2147483647
  ) then raise exception 'integrity recovery numeric range'; end if;
  if (select count(distinct ((value->'mapping'->>'language_code'), (value->'mapping'->>'offset_dec')::integer)) from jsonb_array_elements(p_batch) input(value)) <> jsonb_array_length(p_batch) then
    raise exception 'duplicate integrity recovery target slot';
  end if;

  select * into queue_row from public.translation_integrity_recovery_queue
   where trainer_id=p_trainer_id and lease_token=p_lease_token and state='ready'
   for update;
  -- now()는 트랜잭션 시작 시각으로 고정된다. 잠금 대기 뒤에는 실제 벽시계로
  -- 만료를 다시 판단해 이미 끝난 lease가 batch를 승인하지 못하게 한다.
  lease_checked_at := pg_catalog.clock_timestamp();
  if not found
     or queue_row.lease_expires_at is null
     or queue_row.lease_expires_at <= lease_checked_at then
    raise exception 'integrity recovery lease invalid';
  end if;
  select * into current_trainer from public.trainers where id=p_trainer_id for share;
  if not found then raise exception 'integrity recovery trainer missing'; end if;
  select candidate.id into latest_trainer_id
    from public.trainers candidate
    join public.games candidate_game on candidate_game.id=candidate.game_id
   where candidate.game_id in (
     select grouped_game.id from public.games grouped_game
      join public.games current_game on current_game.id=current_trainer.game_id
      where grouped_game.id=current_trainer.game_id
         or (current_game.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree-trainer-1768067282')
             and grouped_game.slug in ('elden-ring','elden-ring-shadow-of-the-erdtree-trainer-1768067282'))
   )
   order by coalesce(string_to_array(nullif(regexp_replace(coalesce((regexp_match(candidate.version_str, '.*v([0-9]+(?:[.][0-9]+)*)', 'i'))[1], '0'), '(?:[.]0)+$', ''), '0'), '.')::numeric[], '{}'::numeric[]) desc,
     candidate.id desc limit 1;
  if latest_trainer_id is distinct from p_trainer_id then raise exception 'integrity recovery trainer stale'; end if;

  -- 1단계: 모든 target 부재 슬롯의 advisory lock을 결정적 순서로 먼저 잡는다.
  -- 기존 수동 승인 경로도 같은 키를 사용하므로, 아직 없는 target에는 이 lock이
  -- 유일한 fencing 경계다. source/target 행 잠금보다 먼저 획득해 교차 대기를 막는다.
  for item in select value from jsonb_array_elements(p_batch) input(value)
      order by value->'mapping'->>'language_code', (value->'mapping'->>'offset_dec')::integer loop
    mapping := item->'mapping'; source := item->'source';
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_trainer_id::text || ':' || (mapping->>'language_code') || ':' || (mapping->>'offset_dec'), 0));
  end loop;

  -- 2단계: source 승인 tuple의 실제 행을 offset/encoding/길이/text/id 순서로 잠근다.
  -- 일치하는 행이 하나도 없으면 이 트랜잭션의 insert/approve는 전부 rollback된다.
  for item in select value from jsonb_array_elements(p_batch) input(value)
      order by (value->'source'->>'offset_dec')::integer, value->'source'->>'encoding',
        (value->'source'->>'max_char_len')::integer, value->'source'->>'original_text',
        value->'mapping'->>'language_code' loop
    source := item->'source';
    perform 1 from public.translation_mappings source_row
      where source_row.trainer_id=p_trainer_id and source_row.is_approved=true
        and source_row.offset_dec=(source->>'offset_dec')::integer
        and source_row.encoding=source->>'encoding'
        and source_row.max_char_len=(source->>'max_char_len')::integer
        and source_row.original_text=source->>'original_text'
      order by source_row.id for update;
    if not found then raise exception 'integrity recovery source snapshot changed'; end if;
  end loop;

  -- 3단계: 이미 생긴 target이 있다면 실제 행도 결정적 순서로 잠근 뒤 전체 batch를
  -- 중단한다. target이 없을 때는 1단계 advisory lock을 트랜잭션 끝까지 유지한다.
  for item in select value from jsonb_array_elements(p_batch) input(value)
      order by value->'mapping'->>'language_code', (value->'mapping'->>'offset_dec')::integer loop
    mapping := item->'mapping';
    perform 1 from public.translation_mappings target_row
      where target_row.trainer_id=p_trainer_id
        and target_row.language_code=mapping->>'language_code'
        and target_row.offset_dec=(mapping->>'offset_dec')::integer
      order by target_row.id for update;
    if found then raise exception 'integrity recovery target appeared'; end if;
  end loop;

  -- 4단계: 잠금 이후 source와 target snapshot을 다시 읽어 worker가 본 원본과 현재
  -- DB가 같은지 확인한다. 하나라도 달라지면 예외로 전체 batch가 원자적으로 취소된다.
  for item in select value from jsonb_array_elements(p_batch) input(value)
      order by value->'mapping'->>'language_code', (value->'mapping'->>'offset_dec')::integer loop
    mapping := item->'mapping'; source := item->'source';
    if not exists (
      select 1 from public.translation_mappings source_row
       where source_row.trainer_id=p_trainer_id and source_row.is_approved=true
         and source_row.offset_dec=(source->>'offset_dec')::integer
         and source_row.encoding=source->>'encoding'
         and source_row.max_char_len=(source->>'max_char_len')::integer
         and source_row.original_text=source->>'original_text'
    ) then raise exception 'integrity recovery source snapshot changed'; end if;
    if exists (
      select 1 from public.translation_mappings target_row
       where target_row.trainer_id=p_trainer_id
         and target_row.language_code=mapping->>'language_code'
         and target_row.offset_dec=(mapping->>'offset_dec')::integer
    ) then raise exception 'integrity recovery target appeared'; end if;
  end loop;

  -- source/target 행 잠금 대기 중 lease가 끝날 수 있다. 실제 쓰기 직전에 lease를
  -- 원자적으로 다시 확보한다. WHERE의 벽시각 만료 조건 때문에 이미 끝난 claim은
  -- 연장하거나 되살릴 수 없고, UPDATE가 0행이면 아래 INSERT까지 절대 진행하지 않는다.
  lease_checked_at := pg_catalog.clock_timestamp();
  update public.translation_integrity_recovery_queue
     set lease_expires_at=pg_catalog.clock_timestamp()+interval '30 minutes',
         next_retry_at=pg_catalog.clock_timestamp()+interval '30 minutes',
         updated_at=now()
   where trainer_id=p_trainer_id
     and lease_token=p_lease_token
     and state='ready'
     and lease_expires_at>pg_catalog.clock_timestamp();
  if not found then
    raise exception 'integrity recovery lease invalid';
  end if;

  -- 5단계: target이 모두 없음을 보장한 동일 트랜잭션 안에서만 pending 생성 후 승인한다.
  for item in select value from jsonb_array_elements(p_batch) input(value)
      order by value->'mapping'->>'language_code', (value->'mapping'->>'offset_dec')::integer loop
    mapping := item->'mapping';
    insert into public.translation_mappings(trainer_id,language_code,original_text,translated_text,offset_dec,encoding,max_char_len,is_approved,translation_provider,translation_status)
    values (p_trainer_id,mapping->>'language_code',mapping->>'original_text',mapping->>'translated_text',(mapping->>'offset_dec')::integer,mapping->>'encoding',(mapping->>'max_char_len')::integer,false,mapping->>'translation_provider','pending');
  end loop;
  for item in select value from jsonb_array_elements(p_batch) input(value) loop
    mapping := item->'mapping';
    update public.translation_mappings
       set is_approved=true, translation_status='approved'
     where trainer_id=p_trainer_id and language_code=mapping->>'language_code'
       and offset_dec=(mapping->>'offset_dec')::integer and is_approved=false and translation_status='pending'
       and translated_text=mapping->>'translated_text';
    if not found then raise exception 'integrity recovery finalize changed'; end if;
    applied_count := applied_count + 1;
  end loop;
  update public.translation_integrity_recovery_queue
     set state='completed',next_retry_at=null,last_failure_code=null,lease_token=null,lease_expires_at=null,updated_at=now()
   where trainer_id=p_trainer_id and lease_token=p_lease_token and state='ready';
  if not found then raise exception 'integrity recovery queue completion failed'; end if;
  return jsonb_build_object('applied', applied_count);
end; $$;

create function public.finish_translation_integrity_recovery_v2(p_trainer_id bigint,p_lease_token uuid,p_state text,p_failure_code text default null,p_delay_seconds integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  queue_row public.translation_integrity_recovery_queue%rowtype;
  lease_checked_at timestamptz;
  next_time timestamptz;
begin
  if auth.role()<>'service_role' or p_trainer_id is null or p_lease_token is null or p_state is null
    or p_delay_seconds is null or p_state not in ('deferred','blocked','completed')
    or (p_failure_code is not null and p_failure_code !~ '^[A-Z0-9_]{1,80}$') or p_delay_seconds not between 0 and 2678400 then return false; end if;
  select * into queue_row from public.translation_integrity_recovery_queue
    where trainer_id=p_trainer_id and lease_token=p_lease_token and state='ready'
    for update;
  lease_checked_at := pg_catalog.clock_timestamp();
  if not found
     or queue_row.lease_expires_at is null
     or queue_row.lease_expires_at <= lease_checked_at then return false; end if;
  next_time := case when p_state='deferred' then lease_checked_at+make_interval(secs=>greatest(60,p_delay_seconds)) else null end;
  update public.translation_integrity_recovery_queue
    set state=p_state,next_retry_at=next_time,last_failure_code=p_failure_code,lease_token=null,lease_expires_at=null,updated_at=now()
    where trainer_id=p_trainer_id and lease_token=p_lease_token and state='ready'
      and lease_expires_at>pg_catalog.clock_timestamp();
  return found;
end; $$;

-- 다운로드·번역처럼 30분을 넘길 수 있는 외부 작업 직전에 worker가 lease를 연장한다.
-- 만료되었거나 다른 worker가 완료/회수한 claim은 절대 되살리지 않는다.
create function public.renew_translation_integrity_recovery_lease_v2(p_trainer_id bigint,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  queue_row public.translation_integrity_recovery_queue%rowtype;
  lease_checked_at timestamptz;
begin
  if auth.role() <> 'service_role' or p_trainer_id is null or p_lease_token is null then return false; end if;
  select * into queue_row from public.translation_integrity_recovery_queue
   where trainer_id=p_trainer_id and lease_token=p_lease_token and state='ready'
   for update;
  lease_checked_at := pg_catalog.clock_timestamp();
  if not found
     or queue_row.lease_expires_at is null
     or queue_row.lease_expires_at <= lease_checked_at then return false; end if;
  update public.translation_integrity_recovery_queue
     set lease_expires_at=pg_catalog.clock_timestamp()+interval '30 minutes',next_retry_at=pg_catalog.clock_timestamp()+interval '30 minutes',updated_at=now()
   where trainer_id=p_trainer_id and lease_token=p_lease_token and state='ready'
     and lease_expires_at>pg_catalog.clock_timestamp();
  return found;
end; $$;

-- 001의 lease 없는 호출은 오래 실행 중인 워커가 상태를 덮어쓸 수 있으므로 완전히 차단한다.
revoke all on function public.claim_translation_integrity_recovery(integer) from public,anon,authenticated,service_role;
revoke all on function public.finish_translation_integrity_recovery(bigint,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.claim_translation_integrity_recovery_v2(integer) from public,anon,authenticated;
revoke all on function public.finish_translation_integrity_recovery_v2(bigint,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.apply_translation_integrity_recovery_v2(bigint,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.renew_translation_integrity_recovery_lease_v2(bigint,uuid) from public,anon,authenticated;
grant execute on function public.claim_translation_integrity_recovery_v2(integer) to service_role;
grant execute on function public.finish_translation_integrity_recovery_v2(bigint,uuid,text,text,integer) to service_role;
grant execute on function public.apply_translation_integrity_recovery_v2(bigint,uuid,jsonb) to service_role;
grant execute on function public.renew_translation_integrity_recovery_lease_v2(bigint,uuid) to service_role;
commit;
