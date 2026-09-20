-- 수동 편집본은 자동 재번역과 분리한다. pending 상태는 유지하되 provider=manual을
-- 명시해 retry queue 및 자동 초안 저장이 이를 선택하거나 덮어쓰지 못하게 한다.
begin;

alter table public.translation_mappings
  drop constraint if exists translation_mappings_translation_provider_check,
  add constraint translation_mappings_translation_provider_check
    check (translation_provider is null or translation_provider in ('azure', 'openai_paid', 'gemini', 'manual'));

create or replace function public.save_manual_translation_mapping(
  p_mapping_id bigint,
  p_expected_translated_text text,
  p_translated_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.translation_mappings%rowtype;
  encoded_length bigint;
begin
  -- API 검증만 신뢰하지 않는다. 공백·NUL을 포함한 본문은 DB RPC 경계에서 거절한다.
  -- PostgreSQL text에는 NUL을 저장할 수 없지만, bytea 검사도 유지해 호출 경로가 바뀌어도
  -- 이 함수의 입력 계약이 명시적으로 보존되도록 한다.
  if auth.role() <> 'service_role'
     or p_mapping_id is null
     or p_expected_translated_text is null
     or p_translated_text is null
     or nullif(btrim(p_translated_text), '') is null
     or position(decode('00', 'hex') in convert_to(p_translated_text, 'UTF8')) > 0 then
    return jsonb_build_object('outcome', 'invalid_input');
  end if;

  select * into target from public.translation_mappings where id = p_mapping_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if target.translated_text is distinct from p_expected_translated_text then
    return jsonb_build_object('outcome', 'concurrent_change');
  end if;

  -- 관리자 API가 아닌 RPC 직접 호출도 슬롯의 실제 인코딩과 바이트 길이를 넘지 못하게 한다.
  -- UTF-16 변환 결과의 선행 BOM 2바이트는 UTF-16LE 슬롯 길이에 포함하지 않는다.
  if target.max_char_len is null or target.max_char_len <= 0
     or target.encoding not in ('ASCII', 'UTF-8', 'UTF-16LE') then
    return jsonb_build_object('outcome', 'invalid_input');
  end if;
  if target.encoding = 'ASCII' then
    encoded_length := pg_catalog.octet_length(pg_catalog.convert_to(p_translated_text, 'UTF8'));
    if encoded_length <> pg_catalog.char_length(p_translated_text) then
      return jsonb_build_object('outcome', 'invalid_input');
    end if;
  elsif target.encoding = 'UTF-8' then
    encoded_length := pg_catalog.octet_length(pg_catalog.convert_to(p_translated_text, 'UTF8'));
  else
    encoded_length := pg_catalog.octet_length(pg_catalog.convert_to(p_translated_text, 'UTF16')) - 2;
  end if;
  if encoded_length > (
    target.max_char_len::bigint
    * (case when target.encoding = 'UTF-16LE' then 2 else 1 end)
  ) then
    return jsonb_build_object('outcome', 'invalid_input');
  end if;

  update public.translation_mappings
     set translated_text = p_translated_text,
         is_approved = false,
         translation_provider = 'manual',
         translation_status = 'pending'
   where id = target.id
   returning * into target;

  -- 기존 retry claim이 있더라도 수동 검수 중인 슬롯은 다음 자동 실행 대상에서 제거한다.
  delete from public.translation_retry_queue
   where trainer_id = target.trainer_id and language_code = target.language_code;

  return jsonb_build_object(
    'outcome', 'pending_manual_review',
    'mapping', jsonb_build_object(
      'id', target.id, 'offset_dec', target.offset_dec, 'encoding', target.encoding,
      'original_text', target.original_text, 'translated_text', target.translated_text,
      'max_char_len', target.max_char_len, 'is_approved', target.is_approved,
      'translation_status', target.translation_status, 'translation_provider', target.translation_provider
    )
  );
end;
$$;

create or replace function public.approve_manual_translation_mapping(p_mapping_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.translation_mappings%rowtype;
begin
  if auth.role() <> 'service_role' or p_mapping_id is null then
    return jsonb_build_object('outcome', 'invalid_input');
  end if;

  select * into target from public.translation_mappings where id = p_mapping_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if target.is_approved = true or target.translation_status = 'approved' then
    return jsonb_build_object('outcome', 'already_approved');
  end if;
  if target.translation_provider is distinct from 'manual' or target.translation_status <> 'pending' then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;

  update public.translation_mappings
     set is_approved = true, translation_status = 'approved'
   where id = target.id
     and is_approved = false
     and translation_provider = 'manual'
     and translation_status = 'pending'
   returning * into target;
  if not found then return jsonb_build_object('outcome', 'concurrent_change'); end if;

  delete from public.translation_retry_queue
   where trainer_id = target.trainer_id and language_code = target.language_code;

  return jsonb_build_object(
    'outcome', 'approved_manual_review',
    'mapping', jsonb_build_object(
      'id', target.id, 'offset_dec', target.offset_dec, 'encoding', target.encoding,
      'original_text', target.original_text, 'translated_text', target.translated_text,
      'max_char_len', target.max_char_len, 'is_approved', target.is_approved,
      'translation_status', target.translation_status, 'translation_provider', target.translation_provider
    )
  );
end;
$$;

-- 자동 초안은 수동 검수 대기 mapping을 덮어쓰지 않는다. 호출자는 saved=false를
-- 승인 보존과 동일하게 처리하므로 기존 자동 파이프라인 계약을 유지한다.
create or replace function public.upsert_translation_drafts(p_mappings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare mapping jsonb; affected_rows integer; results jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if pg_catalog.jsonb_typeof(p_mappings) <> 'array' or pg_catalog.jsonb_array_length(p_mappings) not between 1 and 500 then raise exception 'invalid mappings'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_mappings) input(value)
    where coalesce(value->>'trainer_id','') !~ '^[1-9][0-9]*$' or coalesce(value->>'language_code','') = ''
      or value->>'language_code' <> pg_catalog.btrim(value->>'language_code')
      or coalesce(value->>'offset_dec','') !~ '^(0|[1-9][0-9]*)$' or coalesce(value->>'original_text','') = ''
      or coalesce(value->>'encoding','') = '' or coalesce(value->>'max_char_len','') !~ '^[1-9][0-9]*$'
  ) then raise exception 'invalid mapping'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_mappings) input(value)
    where (value->>'trainer_id')::numeric > 9223372036854775807
      or (value->>'offset_dec')::numeric > 2147483647
      or (value->>'max_char_len')::numeric > 2147483647
  ) then raise exception 'mapping numeric value out of range'; end if;
  if (select pg_catalog.count(distinct ((value->>'trainer_id')::bigint, value->>'language_code', (value->>'offset_dec')::integer)) from pg_catalog.jsonb_array_elements(p_mappings)) <> pg_catalog.jsonb_array_length(p_mappings)
    then raise exception 'duplicate mapping slots'; end if;
  for mapping in
    select value from pg_catalog.jsonb_array_elements(p_mappings) with ordinality input(value, original_index)
    order by (value->>'trainer_id')::bigint, value->>'language_code', (value->>'offset_dec')::integer, original_index
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((mapping->>'trainer_id')::bigint::text || ':' || (mapping->>'language_code')::text || ':' || (mapping->>'offset_dec')::integer::text, 0));
    insert into public.translation_mappings(trainer_id, language_code, original_text, translated_text, offset_dec, encoding, max_char_len, is_approved, translation_provider, translation_status)
    values ((mapping->>'trainer_id')::bigint, mapping->>'language_code', mapping->>'original_text', mapping->>'translated_text', (mapping->>'offset_dec')::integer, mapping->>'encoding', (mapping->>'max_char_len')::integer, false, mapping->>'translation_provider', 'pending')
    on conflict (trainer_id, language_code, offset_dec) do update set
      original_text = excluded.original_text, translated_text = excluded.translated_text,
      encoding = excluded.encoding, max_char_len = excluded.max_char_len,
      translation_provider = excluded.translation_provider, translation_status = 'pending'
    where public.translation_mappings.is_approved = false
      and public.translation_mappings.translation_provider is distinct from 'manual';
    get diagnostics affected_rows = row_count;
    results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('offsetDec', (mapping->>'offset_dec')::integer, 'saved', affected_rows > 0, 'reason', case when affected_rows = 0 then 'manual_or_approved_preserved' else null end));
  end loop;
  return pg_catalog.jsonb_build_object('results', results, 'saved', (not exists(select 1 from pg_catalog.jsonb_array_elements(results) r where not (r->>'saved')::boolean)));
end; $$;

-- 이전 단건 호출도 현재 batch 함수 하나를 통해서만 처리한다. 따라서 과거 스크립트가
-- 이 호환 RPC를 호출해도 manual/pending 초안과 승인본을 덮어쓸 수 없다.
create or replace function public.upsert_translation_draft(p_mapping jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select case when (batch->'results'->0->>'saved')::boolean
    then pg_catalog.jsonb_build_object('saved', true, 'offsetDec', batch->'results'->0->'offsetDec')
    else pg_catalog.jsonb_build_object('saved', false, 'reason', batch->'results'->0->>'reason', 'offsetDec', batch->'results'->0->'offsetDec') end
  from (select public.upsert_translation_drafts(pg_catalog.jsonb_build_array(p_mapping)) batch) result;
$$;

-- 자동 worker의 최종 상태 전이도 manual pending 행은 보존한다. upsert 직후의
-- 동시 수동 저장이더라도 이 함수가 승인·거절로 바꾸지 못하도록 행을 잠근 뒤 검사한다.
create or replace function public.finalize_translation_draft(
  p_trainer_id bigint,
  p_language_code text,
  p_offset_dec integer,
  p_expected_translated_text text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.translation_mappings%rowtype;
begin
  if p_status is null
     or p_status not in ('approved', 'rejected')
     or p_trainer_id is null
     or nullif(btrim(p_language_code), '') is null
     or p_offset_dec is null
     or p_expected_translated_text is null then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'invalid_input');
  end if;
  if auth.role() <> 'service_role' then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'forbidden');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_trainer_id::text || ':' || p_language_code || ':' || p_offset_dec::text, 0)
  );
  select mapping.* into target
    from public.translation_mappings mapping
   where mapping.trainer_id = p_trainer_id
     and mapping.language_code = p_language_code
     and mapping.offset_dec = p_offset_dec
   for update;
  if not found then return jsonb_build_object('outcome', 'db_error', 'reason', 'not_found'); end if;
  if target.translation_provider = 'manual' and target.translation_status = 'pending' then
    return jsonb_build_object('outcome', 'preserved', 'reason', 'manual_review_preserved');
  end if;
  if target.is_approved = true and target.translation_status = 'approved' then
    return jsonb_build_object('outcome', 'preserved', 'reason', 'approved_preserved');
  end if;
  if target.is_approved = true
     or target.translation_status = 'approved'
     or target.translation_status is null
     or target.translation_status not in ('pending', 'rejected') then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'invalid_state');
  end if;
  if target.translated_text is distinct from p_expected_translated_text then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'translated_text_mismatch');
  end if;

  update public.translation_mappings mapping
     set is_approved = (p_status = 'approved'), translation_status = p_status
   where mapping.id = target.id
     and mapping.is_approved = false
     and mapping.translation_status in ('pending', 'rejected')
     and mapping.translation_provider is distinct from 'manual'
     and mapping.translated_text is not distinct from p_expected_translated_text;
  if not found then return jsonb_build_object('outcome', 'db_error', 'reason', 'concurrent_state_change'); end if;
  return jsonb_build_object('outcome', p_status);
end;
$$;

create or replace function public.list_pending_translation_sources(
  p_after_id bigint default 0,
  p_page_size integer default 1000,
  p_retry_rejected boolean default false
)
returns table(mapping_id bigint, trainer_id bigint, fling_url text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_after_id < 0 or p_page_size not between 1 and 1000 then raise exception 'invalid pagination'; end if;
  if auth.role() <> 'service_role' then return; end if;
  return query
    select mapping.id::bigint, mapping.trainer_id::bigint, game.fling_url
      from public.translation_mappings mapping
      join public.trainers trainer on trainer.id = mapping.trainer_id
      left join public.games game on game.id = trainer.game_id
     where mapping.id > p_after_id
       and mapping.is_approved = false
       and mapping.translation_provider is distinct from 'manual'
       and (mapping.translation_status = 'pending' or (p_retry_rejected and mapping.translation_status = 'rejected'))
     order by mapping.id
     limit p_page_size;
end;
$$;

-- 이전 approve_translation_job은 미리보기 이후 수동 편집이 같은 본문으로 저장된 경우
-- ON CONFLICT UPDATE가 manual/pending 행을 자동 승인으로 바꿀 수 있었다. 해당 승인 경로도
-- 행 잠금 후 명시적으로 충돌 처리하여 수동 검수를 보존한다.
create or replace function public.approve_translation_job(p_job_id uuid, p_edits jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.translation_jobs%rowtype;
  source_row public.translation_mappings%rowtype;
  target_row public.translation_mappings%rowtype;
  slot jsonb;
  edit_count integer;
  expected_count integer;
  translated_block text;
  edit jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select * into job from public.translation_jobs where id = p_job_id for update;
  if not found or job.status <> 'completed' or jsonb_typeof(p_edits) <> 'array' then raise exception 'invalid job state'; end if;
  if jsonb_typeof(job.source_snapshot) <> 'array' or jsonb_array_length(job.source_snapshot) = 0 then raise exception 'source snapshot missing'; end if;
  if (select count(distinct (value->>'offsetDec')) from jsonb_array_elements(job.source_snapshot)) <> jsonb_array_length(job.source_snapshot)
    then raise exception 'duplicate source slots'; end if;
  select count(*) into edit_count from jsonb_array_elements(p_edits) as edits(value);
  select jsonb_array_length(job.result) into expected_count;
  if edit_count <> expected_count
    or (select count(distinct e.value->>'key') from jsonb_array_elements(p_edits) as e(value)) <> edit_count
    or exists (
    select 1 from jsonb_array_elements(p_edits) as e(value)
    where not exists (select 1 from jsonb_array_elements(job.result) as r(value) where r.value->>'key' = e.value->>'key')
  ) then raise exception 'edited keys mismatch'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_edits) as e(value)
    join jsonb_array_elements(job.result) as r(value) on r.value->>'key' = e.value->>'key'
    where coalesce(r.value->>'text', '') <> '' and btrim(coalesce(e.value->>'translatedText', '')) = ''
  ) then raise exception 'nonblank source cannot approve empty translation'; end if;
  for slot in select value from jsonb_array_elements(job.source_snapshot) as snapshots(value) order by (value->>'offsetDec')::integer loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(job.trainer_id::bigint::text || ':' || job.target_language::text || ':' || (slot->>'offsetDec')::integer::text, 0));
    select * into source_row from public.translation_mappings
      where id = (slot->>'sourceMappingId')::bigint and trainer_id = job.trainer_id and is_approved = true for update;
    if not found or source_row.offset_dec <> (slot->>'offsetDec')::integer or source_row.original_text <> slot->>'originalText'
      or source_row.encoding <> slot->>'encoding' or source_row.max_char_len <> (slot->>'maxCharLen')::integer
      then raise exception 'source slot changed'; end if;

    if slot->>'targetMappingId' is null then
      if exists(select 1 from public.translation_mappings where trainer_id = job.trainer_id and language_code = job.target_language and offset_dec = (slot->>'offsetDec')::integer) then
        raise exception 'target slot appeared after preview';
      end if;
    else
      select * into target_row from public.translation_mappings where id = (slot->>'targetMappingId')::bigint
        and trainer_id = job.trainer_id and language_code = job.target_language and offset_dec = (slot->>'offsetDec')::integer for update;
      if not found or target_row.original_text is distinct from slot->>'targetOriginalText'
        or target_row.translated_text is distinct from slot->>'targetTranslatedText'
        or target_row.encoding is distinct from slot->>'targetEncoding'
        or target_row.max_char_len is distinct from (slot->>'targetMaxCharLen')::integer
        or target_row.is_approved is distinct from (slot->>'targetApproved')::boolean
        then raise exception 'target slot changed after preview'; end if;
      if target_row.translation_provider = 'manual' and target_row.translation_status = 'pending' then
        raise exception 'manual review conflict';
      end if;
    end if;

    select string_agg(e.value->>'translatedText', E'\n' order by (r.value->>'lineIndex')::integer)
      into translated_block from jsonb_array_elements(job.result) r(value)
      join jsonb_array_elements(p_edits) e(value) on e.value->>'key' = r.value->>'key'
      where (r.value->>'offsetDec')::integer = (slot->>'offsetDec')::integer;
    if translated_block is null then raise exception 'slot translation missing'; end if;
    insert into public.translation_mappings(trainer_id, language_code, original_text, translated_text, offset_dec, encoding, max_char_len, is_approved, translation_job_id, translation_provider, translation_status)
    values (job.trainer_id, job.target_language, slot->>'originalText', translated_block, (slot->>'offsetDec')::integer, slot->>'encoding', (slot->>'maxCharLen')::integer, true, job.id, job.provider, 'approved')
    on conflict (trainer_id, language_code, offset_dec) do update set translated_text = excluded.translated_text, original_text = excluded.original_text,
      encoding = excluded.encoding, max_char_len = excluded.max_char_len, is_approved = true, translation_job_id = excluded.translation_job_id,
      translation_provider = excluded.translation_provider, translation_status = 'approved';
  end loop;
  for edit in select value from jsonb_array_elements(p_edits) as edits(value) loop
    insert into public.translation_memory(source_language, target_language, source_text, source_hash, translated_text, approved_at)
    select 'en', job.target_language, r.value->>'text', pg_catalog.encode(public.digest(r.value->>'text', 'sha256'), 'hex'), edit->>'translatedText', now() from jsonb_array_elements(job.result) as r(value) where r.value->>'key' = edit->>'key'
    on conflict (source_language, target_language, source_text) do update set source_hash = excluded.source_hash, translated_text = excluded.translated_text, approved_at = now();
  end loop;
  update public.translation_jobs set status = 'approved', approved_at = now(), approved_edits = p_edits where id = job.id;
  return jsonb_build_object('jobId', job.id, 'approved', edit_count, 'trainerId', job.trainer_id, 'targetLanguage', job.target_language);
end;
$$;

revoke all on function public.approve_translation_job(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.approve_translation_job(uuid, jsonb) to service_role;

revoke all on function public.save_manual_translation_mapping(bigint, text, text) from public, anon, authenticated;
grant execute on function public.save_manual_translation_mapping(bigint, text, text) to service_role;
revoke all on function public.approve_manual_translation_mapping(bigint) from public, anon, authenticated;
grant execute on function public.approve_manual_translation_mapping(bigint) to service_role;
revoke all on function public.upsert_translation_drafts(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_translation_drafts(jsonb) to service_role;
revoke all on function public.upsert_translation_draft(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_translation_draft(jsonb) to service_role;
revoke all on function public.finalize_translation_draft(bigint, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.finalize_translation_draft(bigint, text, integer, text, text) to service_role;
revoke all on function public.list_pending_translation_sources(bigint, integer, boolean) from public, anon, authenticated;
grant execute on function public.list_pending_translation_sources(bigint, integer, boolean) to service_role;

commit;
