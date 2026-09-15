-- Gemini를 번역 공급자로 추가한다. Gemini/OpenAI는 명시적으로 월 한도를 설정하기 전까지 예약을 거부한다.
begin;

alter table public.translation_jobs
  drop constraint if exists translation_jobs_provider_check,
  add constraint translation_jobs_provider_check
    check (provider in ('azure', 'openai_paid', 'gemini'));

alter table public.translation_usage_monthly
  drop constraint if exists translation_usage_monthly_provider_check,
  add constraint translation_usage_monthly_provider_check
    check (provider in ('azure', 'openai_paid', 'gemini'));

alter table public.translation_usage_reservations
  drop constraint if exists translation_usage_reservations_provider_check,
  add constraint translation_usage_reservations_provider_check
    check (provider in ('azure', 'openai_paid', 'gemini'));

alter table public.translation_mappings
  drop constraint if exists translation_mappings_translation_provider_check,
  add constraint translation_mappings_translation_provider_check
    check (translation_provider is null or translation_provider in ('azure', 'openai_paid', 'gemini'));

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
  if auth.role() <> 'service_role'
     or p_characters <= 0
     or p_provider not in ('azure', 'openai_paid', 'gemini') then
    return null;
  end if;

  -- 기존 Azure 무료 할당량은 유지한다. Gemini와 OpenAI는 운영자가 월 한도를 설정하기 전까지 0으로 시작한다.
  default_limit := case when p_provider = 'azure' then 2000000 else 0 end;
  insert into public.translation_usage_monthly(month_start, provider, used_characters, reserved_characters, hard_limit_characters)
  values (current_month, p_provider, 0, 0, default_limit)
  on conflict (month_start, provider) do nothing;

  update public.translation_usage_monthly
     set reserved_characters = reserved_characters + p_characters,
         updated_at = now()
   where month_start = current_month
     and provider = p_provider
     and used_characters + reserved_characters + p_characters <= hard_limit_characters
  returning gen_random_uuid() into reservation_id;

  if reservation_id is null then
    return null;
  end if;
  insert into public.translation_usage_reservations(id, month_start, provider, characters)
  values (reservation_id, current_month, p_provider, p_characters);
  return reservation_id;
end;
$$;

-- service_role만 현재 달의 한도를 설정할 수 있다. 이미 확정·예약된 사용량보다 낮게 변경하지 않는다.
create or replace function public.configure_translation_usage_limit(
  p_provider text,
  p_hard_limit_characters bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month date := date_trunc('month', now())::date;
  configured boolean := false;
begin
  if auth.role() <> 'service_role'
     or p_provider not in ('azure', 'openai_paid', 'gemini')
     or p_hard_limit_characters < 0 then
    return false;
  end if;

  insert into public.translation_usage_monthly(
    month_start, provider, used_characters, reserved_characters, hard_limit_characters
  )
  values (current_month, p_provider, 0, 0, p_hard_limit_characters)
  on conflict (month_start, provider) do update
    set hard_limit_characters = excluded.hard_limit_characters,
        updated_at = now()
    where public.translation_usage_monthly.used_characters
            + public.translation_usage_monthly.reserved_characters
          <= excluded.hard_limit_characters
  returning true into configured;

  return coalesce(configured, false);
end;
$$;

revoke all on function public.reserve_translation_usage(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_translation_usage(text, integer) to service_role;
revoke all on function public.configure_translation_usage_limit(text, bigint) from public, anon, authenticated;
grant execute on function public.configure_translation_usage_limit(text, bigint) to service_role;

commit;
