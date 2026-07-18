-- 자동 번역 작업, 월간 원자적 사용량 예약, 승인 번역 메모리를 추가한다.
begin;

-- 검증된 운영 JA old/winner 쌍만 영구 백업 후 제거한다.
lock table public.translation_mappings in access exclusive mode;
create temp table expected_translation_mapping_dedupe(old_id bigint primary key, winner_id bigint unique) on commit drop;
insert into expected_translation_mapping_dedupe(old_id, winner_id) values
  (2657,2658),(2659,2660),(2661,2662),(2663,2664),(2665,2666),(2667,2668),
  (2669,2670),(2649,2650),(2651,2652),(2653,2654),(2655,2656),(2634,2635),
  (2636,2637),(2638,2639),(2640,2641),(2642,2644),(2645,2646),(2647,2648);

create table if not exists public.translation_mappings_slot_dedupe_backup_20260719 (
  encoding text,
  id bigint not null,
  is_approved boolean,
  language_code text,
  max_char_len integer,
  offset_dec integer,
  original_text text,
  trainer_id bigint,
  translated_text text,
  updated_at timestamptz
);
create unique index if not exists translation_mappings_slot_dedupe_backup_20260719_id_uidx
  on public.translation_mappings_slot_dedupe_backup_20260719(id);
alter table public.translation_mappings_slot_dedupe_backup_20260719 enable row level security;
revoke all on table public.translation_mappings_slot_dedupe_backup_20260719 from public, anon, authenticated;
grant select on table public.translation_mappings_slot_dedupe_backup_20260719 to service_role;

do $$
declare already_applied boolean;
begin
  if exists (select 1 from public.translation_mappings where offset_dec is null) then
    raise exception 'offset_dec null 행은 자동 정리하지 않습니다';
  end if;
  if (select count(*) from public.translation_mappings where trainer_id = 2583 and language_code = 'ko') <> 9
    or (select count(distinct offset_dec) from public.translation_mappings where trainer_id = 2583 and language_code = 'ko') <> 9 then
    raise exception 'trainer 2583 KO 9슬롯 검증에 실패했습니다';
  end if;
  select not exists (
    select 1 from public.translation_mappings mapping join expected_translation_mapping_dedupe expected on expected.old_id = mapping.id
  ) and (select count(*) from public.translation_mappings_slot_dedupe_backup_20260719 backup join expected_translation_mapping_dedupe expected on expected.old_id = backup.id) = 18
  into already_applied;
  if exists (
    select 1 from expected_translation_mapping_dedupe expected left join public.translation_mappings winner on winner.id = expected.winner_id where winner.id is null
  ) then raise exception '고정 JA winner 행이 없습니다'; end if;
  if not already_applied and exists (
    select 1 from expected_translation_mapping_dedupe expected
    left join public.translation_mappings old on old.id = expected.old_id
    left join public.translation_mappings winner on winner.id = expected.winner_id
    where old.id is null or winner.id is null or old.language_code <> 'ja' or winner.language_code <> 'ja'
      or old.trainer_id <> winner.trainer_id or old.language_code <> winner.language_code or old.offset_dec <> winner.offset_dec
      or old.original_text is distinct from winner.original_text or old.encoding is distinct from winner.encoding
      or old.max_char_len is distinct from winner.max_char_len or old.updated_at is null or winner.updated_at is null
      or old.updated_at >= winner.updated_at or old.is_approved is not true or winner.is_approved is not true
  ) then raise exception '고정 JA old/winner 쌍이 안전 기준과 다릅니다'; end if;
  if not already_applied and exists (
    with ranked as (
      select id, trainer_id, language_code, offset_dec,
        row_number() over (partition by trainer_id, language_code, offset_dec order by updated_at desc, id desc) rank,
        first_value(id) over (partition by trainer_id, language_code, offset_dec order by updated_at desc, id desc) winner_id,
        count(*) over (partition by trainer_id, language_code, offset_dec) slot_count
      from public.translation_mappings
    ), actual as (select id old_id, winner_id from ranked where slot_count > 1 and rank > 1),
    mismatch as (
      (select old_id, winner_id from actual except select old_id, winner_id from expected_translation_mapping_dedupe)
      union all
      (select old_id, winner_id from expected_translation_mapping_dedupe except select old_id, winner_id from actual)
    ) select 1 from mismatch
  ) then raise exception '전체 triple collision 집합이 고정 18쌍과 일치하지 않습니다'; end if;
  if already_applied and exists (
    select 1 from public.translation_mappings group by trainer_id, language_code, offset_dec having count(*) > 1
  ) then raise exception '재실행 시 예상하지 않은 triple collision이 있습니다'; end if;
end $$;

insert into public.translation_mappings_slot_dedupe_backup_20260719
  (encoding, id, is_approved, language_code, max_char_len, offset_dec, original_text, trainer_id, translated_text, updated_at)
select mapping.encoding, mapping.id, mapping.is_approved, mapping.language_code, mapping.max_char_len,
       mapping.offset_dec, mapping.original_text, mapping.trainer_id, mapping.translated_text, mapping.updated_at
from public.translation_mappings mapping join expected_translation_mapping_dedupe expected on expected.old_id = mapping.id
on conflict (id) do nothing;

delete from public.translation_mappings mapping using expected_translation_mapping_dedupe expected where mapping.id = expected.old_id;
alter table public.translation_mappings alter column offset_dec set not null;

create extension if not exists pgcrypto;

create table if not exists public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('azure', 'openai_paid')),
  target_language text not null check (target_language in ('ko', 'ja', 'de', 'fr', 'es', 'pt', 'zh-Hans', 'zh-Hant')),
  trainer_id bigint not null references public.trainers(id) on delete cascade,
  source_mapping_id bigint not null references public.translation_mappings(id) on delete restrict,
  source_snapshot jsonb not null,
  source_version text not null,
  preview_hash text not null,
  idempotency_key text not null unique,
  status text not null check (status in ('running', 'completed', 'failed', 'approved')),
  item_count integer not null check (item_count between 1 and 500),
  character_count integer not null check (character_count between 1 and 50000),
  billable_character_count integer not null default 0 check (billable_character_count >= 0),
  result jsonb,
  approved_edits jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  approved_at timestamptz
);

alter table public.translation_jobs add column if not exists source_snapshot jsonb;
update public.translation_jobs set status = 'failed', source_snapshot = '{}'::jsonb,
  error_message = coalesce(error_message, 'legacy job without multi-slot source snapshot')
where source_snapshot is null;
alter table public.translation_jobs alter column source_snapshot set not null;

create table if not exists public.translation_usage_monthly (
  month_start date not null,
  provider text not null check (provider in ('azure', 'openai_paid')),
  used_characters bigint not null default 0 check (used_characters >= 0),
  reserved_characters bigint not null default 0,
  hard_limit_characters bigint not null check (hard_limit_characters >= 0),
  updated_at timestamptz not null default now(),
  primary key (month_start, provider)
);

alter table public.translation_usage_monthly
  add column if not exists reserved_characters bigint not null default 0;

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.translation_usage_monthly'::regclass
      and conname = 'translation_usage_monthly_reserved_characters_nonnegative_check'
  ) then
    alter table public.translation_usage_monthly
      add constraint translation_usage_monthly_reserved_characters_nonnegative_check
      check (reserved_characters >= 0);
  end if;
end $$;

create table if not exists public.translation_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  provider text not null check (provider in ('azure', 'openai_paid')),
  characters integer not null check (characters > 0),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists public.translation_memory (
  id bigint generated by default as identity primary key,
  source_language text not null default 'en',
  target_language text not null check (target_language in ('ko', 'ja', 'de', 'fr', 'es', 'pt', 'zh-Hans', 'zh-Hant')),
  source_text text not null,
  source_hash text not null,
  translated_text text not null,
  approved_at timestamptz not null default now(),
  unique (source_language, target_language, source_text)
);
create index if not exists translation_memory_hash_lookup_idx on public.translation_memory(target_language, source_hash);

alter table public.translation_mappings add column if not exists translation_job_id uuid references public.translation_jobs(id) on delete set null;
alter table public.translation_mappings add column if not exists translation_provider text check (translation_provider in ('azure', 'openai_paid'));
alter table public.translation_mappings add column if not exists translation_status text default 'legacy' check (translation_status in ('legacy', 'pending', 'approved', 'rejected'));

drop index if exists public.translation_mappings_trainer_language_uidx;
create unique index if not exists translation_mappings_trainer_language_offset_uidx on public.translation_mappings(trainer_id, language_code, offset_dec);

alter table public.translation_jobs enable row level security;
alter table public.translation_usage_monthly enable row level security;
alter table public.translation_usage_reservations enable row level security;
alter table public.translation_memory enable row level security;

drop policy if exists "approved translation memory public read" on public.translation_memory;

create or replace function public.reserve_translation_usage(p_provider text, p_characters integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month date := date_trunc('month', now())::date;
  default_limit bigint;
  reservation_id uuid;
begin
  if auth.role() <> 'service_role' or p_characters <= 0 or p_provider not in ('azure', 'openai_paid') then return null; end if;
  default_limit := case when p_provider = 'azure' then 2000000 else 0 end;
  insert into public.translation_usage_monthly(month_start, provider, used_characters, reserved_characters, hard_limit_characters)
  values (current_month, p_provider, 0, 0, default_limit)
  on conflict (month_start, provider) do nothing;
  update public.translation_usage_monthly
     set reserved_characters = reserved_characters + p_characters, updated_at = now()
   where month_start = current_month and provider = p_provider
     and used_characters + reserved_characters + p_characters <= hard_limit_characters
  returning gen_random_uuid() into reservation_id;
  if reservation_id is null then return null; end if;
  insert into public.translation_usage_reservations(id, month_start, provider, characters) values (reservation_id, current_month, p_provider, p_characters);
  return reservation_id;
end;
$$;

revoke all on function public.reserve_translation_usage(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_translation_usage(text, integer) to service_role;

create or replace function public.finalize_translation_usage(p_reservation_id uuid, p_consumed boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare reservation public.translation_usage_reservations%rowtype;
begin
  if auth.role() <> 'service_role' then return false; end if;
  select * into reservation from public.translation_usage_reservations where id = p_reservation_id and status = 'reserved' for update;
  if not found then return false; end if;
  update public.translation_usage_monthly set
    reserved_characters = greatest(0, reserved_characters - reservation.characters),
    used_characters = used_characters + case when p_consumed then reservation.characters else 0 end,
    updated_at = now()
  where month_start = reservation.month_start and provider = reservation.provider;
  update public.translation_usage_reservations set status = case when p_consumed then 'consumed' else 'released' end, finalized_at = now() where id = reservation.id;
  return true;
end; $$;
revoke all on function public.finalize_translation_usage(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finalize_translation_usage(uuid, boolean) to service_role;

create or replace function public.upsert_translation_drafts(p_mappings jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare mapping jsonb; affected_rows integer; results jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_mappings) <> 'array' or jsonb_array_length(p_mappings) not between 1 and 500 then raise exception 'invalid mappings'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_mappings) input(value)
    where coalesce(value->>'trainer_id','') !~ '^[1-9][0-9]*$' or coalesce(value->>'language_code','') = ''
      or value->>'language_code' <> btrim(value->>'language_code')
      or coalesce(value->>'offset_dec','') !~ '^(0|[1-9][0-9]*)$' or coalesce(value->>'original_text','') = ''
      or coalesce(value->>'encoding','') = '' or coalesce(value->>'max_char_len','') !~ '^[1-9][0-9]*$'
  ) then raise exception 'invalid mapping'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_mappings) input(value)
    where (value->>'trainer_id')::numeric > 9223372036854775807
      or (value->>'offset_dec')::numeric > 2147483647
      or (value->>'max_char_len')::numeric > 2147483647
  ) then raise exception 'mapping numeric value out of range'; end if;
  if (select count(distinct ((value->>'trainer_id')::bigint, value->>'language_code', (value->>'offset_dec')::integer)) from jsonb_array_elements(p_mappings)) <> jsonb_array_length(p_mappings)
    then raise exception 'duplicate mapping slots'; end if;
  -- 모든 호출이 동일한 typed 자연키 순서로 lock을 잡아 batch 간 교착을 방지한다.
  for mapping in
    select value from jsonb_array_elements(p_mappings) with ordinality input(value, original_index)
    order by (value->>'trainer_id')::bigint, value->>'language_code', (value->>'offset_dec')::integer, original_index
  loop
    perform pg_advisory_xact_lock(hashtextextended((mapping->>'trainer_id')::bigint::text || ':' || (mapping->>'language_code')::text || ':' || (mapping->>'offset_dec')::integer::text, 0));
    insert into public.translation_mappings(trainer_id, language_code, original_text, translated_text, offset_dec, encoding, max_char_len, is_approved, translation_provider, translation_status)
    values ((mapping->>'trainer_id')::bigint, mapping->>'language_code', mapping->>'original_text', mapping->>'translated_text', (mapping->>'offset_dec')::integer, mapping->>'encoding', (mapping->>'max_char_len')::integer, false, mapping->>'translation_provider', 'pending')
    on conflict (trainer_id, language_code, offset_dec) do update set
      original_text = excluded.original_text, translated_text = excluded.translated_text,
      encoding = excluded.encoding, max_char_len = excluded.max_char_len,
      translation_provider = excluded.translation_provider, translation_status = 'pending'
    where public.translation_mappings.is_approved = false;
    get diagnostics affected_rows = row_count;
    results := results || jsonb_build_array(jsonb_build_object('offsetDec', (mapping->>'offset_dec')::integer, 'saved', affected_rows > 0, 'reason', case when affected_rows = 0 then 'approved_preserved' else null end));
  end loop;
  return jsonb_build_object('results', results, 'saved', (not exists(select 1 from jsonb_array_elements(results) r where not (r->>'saved')::boolean)));
end; $$;
revoke all on function public.upsert_translation_drafts(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_translation_drafts(jsonb) to service_role;

create or replace function public.upsert_translation_draft(p_mapping jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select case when (batch->'results'->0->>'saved')::boolean
    then jsonb_build_object('saved', true, 'offsetDec', batch->'results'->0->'offsetDec')
    else jsonb_build_object('saved', false, 'reason', batch->'results'->0->>'reason', 'offsetDec', batch->'results'->0->'offsetDec') end
  from (select public.upsert_translation_drafts(jsonb_build_array(p_mapping)) batch) result;
$$;
revoke all on function public.upsert_translation_draft(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_translation_draft(jsonb) to service_role;

create or replace function public.approve_translation_job(p_job_id uuid, p_edits jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
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
    perform pg_advisory_xact_lock(hashtextextended(job.trainer_id::bigint::text || ':' || job.target_language::text || ':' || (slot->>'offsetDec')::integer::text, 0));
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
    select 'en', job.target_language, r.value->>'text', encode(digest(r.value->>'text', 'sha256'), 'hex'), edit->>'translatedText', now() from jsonb_array_elements(job.result) as r(value) where r.value->>'key' = edit->>'key'
    on conflict (source_language, target_language, source_text) do update set source_hash = excluded.source_hash, translated_text = excluded.translated_text, approved_at = now();
  end loop;
  update public.translation_jobs set status = 'approved', approved_at = now(), approved_edits = p_edits where id = job.id;
  return jsonb_build_object('jobId', job.id, 'approved', edit_count, 'trainerId', job.trainer_id, 'targetLanguage', job.target_language);
end;
$$;
revoke all on function public.approve_translation_job(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.approve_translation_job(uuid, jsonb) to service_role;

-- 롤백 시에는 신규 열의 참조를 먼저 제거한 뒤 함수와 세 테이블을 역순으로 삭제한다.
-- 기존 translation_mappings 데이터는 is_approved 및 legacy 기본값으로 계속 호환된다.
commit;
