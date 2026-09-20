-- 2026-09-20 감사에서 확인한 실제 baseline을 복원한다.
-- RLS=true, FORCE=false, public SELECT 정책 2개·INSERT 정책 1개·UPDATE 정책 1개가 기준이다.
begin;

alter table public.common_dictionary enable row level security;
alter table public.common_dictionary no force row level security;

drop policy if exists "Allow public read" on public.common_dictionary;
drop policy if exists "Allow public insert" on public.common_dictionary;
drop policy if exists "Allow public update" on public.common_dictionary;
drop policy if exists "Allow public read access on common_dictionary" on public.common_dictionary;

create policy "Allow public insert"
  on public.common_dictionary
  for insert
  to public
  with check (true);

create policy "Allow public read"
  on public.common_dictionary
  for select
  to public
  using (true);

create policy "Allow public read access on common_dictionary"
  on public.common_dictionary
  for select
  to public
  using (true);

create policy "Allow public update"
  on public.common_dictionary
  for update
  to public
  using (true)
  with check (true);

grant select, insert, update on table public.common_dictionary to public, anon, authenticated;
revoke delete on table public.common_dictionary from public, anon, authenticated;
grant select, insert, update, delete on table public.common_dictionary to service_role;

commit;
