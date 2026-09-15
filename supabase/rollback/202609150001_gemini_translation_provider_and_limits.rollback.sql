-- Gemini 사용 기록이 있으면 자동 rollback이 데이터를 잃을 수 있으므로 중단한다.
begin;

do $$
begin
  if exists (select 1 from public.translation_jobs where provider = 'gemini')
     or exists (select 1 from public.translation_usage_monthly where provider = 'gemini')
     or exists (select 1 from public.translation_usage_reservations where provider = 'gemini')
     or exists (select 1 from public.translation_mappings where translation_provider = 'gemini') then
    raise exception 'Gemini translation data exists; archive or migrate it before rollback';
  end if;
end;
$$;

drop function if exists public.configure_translation_usage_limit(text, bigint);

alter table public.translation_jobs
  drop constraint if exists translation_jobs_provider_check,
  add constraint translation_jobs_provider_check
    check (provider in ('azure', 'openai_paid'));

alter table public.translation_usage_monthly
  drop constraint if exists translation_usage_monthly_provider_check,
  add constraint translation_usage_monthly_provider_check
    check (provider in ('azure', 'openai_paid'));

alter table public.translation_usage_reservations
  drop constraint if exists translation_usage_reservations_provider_check,
  add constraint translation_usage_reservations_provider_check
    check (provider in ('azure', 'openai_paid'));

alter table public.translation_mappings
  drop constraint if exists translation_mappings_translation_provider_check,
  add constraint translation_mappings_translation_provider_check
    check (translation_provider is null or translation_provider in ('azure', 'openai_paid'));

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
  if auth.role() <> 'service_role' or p_characters <= 0 or p_provider not in ('azure', 'openai_paid') then
    return null;
  end if;
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
  insert into public.translation_usage_reservations(id, month_start, provider, characters)
  values (reservation_id, current_month, p_provider, p_characters);
  return reservation_id;
end;
$$;

revoke all on function public.reserve_translation_usage(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_translation_usage(text, integer) to service_role;

commit;
