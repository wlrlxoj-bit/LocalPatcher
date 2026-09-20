-- 작업 승인도 수동 편집 RPC와 동일한 슬롯 인코딩·바이트 한도를 DB 경계에서 검증한다.
-- 모든 슬롯을 먼저 잠그고 검증한 뒤에만 쓰므로 하나라도 실패하면 승인/메모리 변경이 없다.
begin;

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
  encoded_length bigint;
  prepared_slots jsonb := '{}'::jsonb;
  edit jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select * into job from public.translation_jobs where id = p_job_id for update;
  if not found or job.status <> 'completed' or jsonb_typeof(p_edits) <> 'array' then raise exception 'invalid job state'; end if;
  if jsonb_typeof(job.source_snapshot) <> 'array' or jsonb_array_length(job.source_snapshot) = 0 then raise exception 'source snapshot missing'; end if;
  if (select count(distinct (value->>'offsetDec')) from jsonb_array_elements(job.source_snapshot)) <> jsonb_array_length(job.source_snapshot) then
    raise exception 'duplicate source slots';
  end if;
  if jsonb_typeof(job.result) <> 'array'
     or (select count(distinct (value->>'offsetDec')) from jsonb_array_elements(job.result)) <> jsonb_array_length(job.source_snapshot)
     or exists (
       select 1 from jsonb_array_elements(job.result) result(value)
       where not exists (
         select 1 from jsonb_array_elements(job.source_snapshot) snapshot(value)
         where snapshot.value->>'offsetDec' = result.value->>'offsetDec'
       )
     ) then raise exception 'result source slots mismatch'; end if;
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

  -- 1단계: 모든 슬롯을 잠그고 결과와 실제 바이너리 슬롯 한도를 검증한다.
  for slot in select value from jsonb_array_elements(job.source_snapshot) snapshots(value) order by (value->>'offsetDec')::integer loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(job.trainer_id::bigint::text || ':' || job.target_language::text || ':' || (slot->>'offsetDec')::integer::text, 0));
    select * into source_row from public.translation_mappings
      where id = (slot->>'sourceMappingId')::bigint and trainer_id = job.trainer_id and is_approved = true for update;
    if not found or source_row.offset_dec <> (slot->>'offsetDec')::integer or source_row.original_text <> slot->>'originalText'
      or source_row.encoding <> slot->>'encoding' or source_row.max_char_len <> (slot->>'maxCharLen')::integer then raise exception 'source slot changed'; end if;
    if source_row.max_char_len is null or source_row.max_char_len <= 0 or source_row.encoding not in ('ASCII', 'UTF-8', 'UTF-16LE') then
      raise exception 'unsupported source slot encoding';
    end if;
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
        or target_row.is_approved is distinct from (slot->>'targetApproved')::boolean then raise exception 'target slot changed after preview'; end if;
      if target_row.translation_provider = 'manual' and target_row.translation_status = 'pending' then raise exception 'manual review conflict'; end if;
    end if;
    select string_agg(e.value->>'translatedText', E'\n' order by (r.value->>'lineIndex')::integer)
      into translated_block from jsonb_array_elements(job.result) r(value)
      join jsonb_array_elements(p_edits) e(value) on e.value->>'key' = r.value->>'key'
      where (r.value->>'offsetDec')::integer = (slot->>'offsetDec')::integer;
    if translated_block is null then raise exception 'slot translation missing'; end if;
    if source_row.encoding = 'ASCII' then
      encoded_length := pg_catalog.octet_length(pg_catalog.convert_to(translated_block, 'UTF8'));
      if encoded_length <> pg_catalog.char_length(translated_block) then raise exception 'slot translation encoding invalid'; end if;
    elsif source_row.encoding = 'UTF-8' then
      encoded_length := pg_catalog.octet_length(pg_catalog.convert_to(translated_block, 'UTF8'));
    else
      encoded_length := pg_catalog.octet_length(pg_catalog.convert_to(translated_block, 'UTF16')) - 2;
    end if;
    if encoded_length > source_row.max_char_len::bigint * (case when source_row.encoding = 'UTF-16LE' then 2 else 1 end) then
      raise exception 'slot translation exceeds capacity';
    end if;
    prepared_slots := pg_catalog.jsonb_set(prepared_slots, array[slot->>'offsetDec'], pg_catalog.to_jsonb(translated_block), true);
  end loop;

  -- 2단계: 위 검증을 통과한 전체 슬롯만 한 트랜잭션으로 승인한다.
  for slot in select value from jsonb_array_elements(job.source_snapshot) snapshots(value) order by (value->>'offsetDec')::integer loop
    translated_block := prepared_slots->>(slot->>'offsetDec');
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

commit;
