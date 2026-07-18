-- 신규 번역 시스템만 되돌린다. 실행 전 translation_jobs와 translation_memory를 별도 백업한다.
begin;
drop function if exists public.approve_translation_job(uuid, jsonb);
drop function if exists public.reserve_translation_usage(text, integer);
drop function if exists public.finalize_translation_usage(uuid, boolean);
drop function if exists public.upsert_translation_draft(jsonb);
drop function if exists public.upsert_translation_drafts(jsonb);
drop policy if exists "approved translation memory public read" on public.translation_memory;
alter table if exists public.translation_usage_monthly
  drop constraint if exists translation_usage_monthly_reserved_characters_nonnegative_check;
drop index if exists public.translation_mappings_trainer_language_offset_uidx;
alter table public.translation_mappings alter column offset_dec drop not null;
alter table public.translation_mappings drop column if exists translation_status;
alter table public.translation_mappings drop column if exists translation_provider;
alter table public.translation_mappings drop column if exists translation_job_id;
drop table if exists public.translation_memory;
drop table if exists public.translation_usage_reservations;
drop table if exists public.translation_usage_monthly;
drop table if exists public.translation_jobs;
-- translation_mappings_slot_dedupe_backup_20260719는 운영 원본 증거이므로 보존한다.
-- 자동 복원은 이후 쓰기를 덮을 수 있어 수행하지 않는다. 복원 절차는 CONTRACT.md를 따른다.
commit;
