-- 감사 기준: RLS 활성/강제 해제, public SELECT 정책 2개와 INSERT·UPDATE 정책이 존재한다.
-- 브라우저 쓰기는 서버 API(service_role)로만 수렴시키되 공개 사전 읽기는 한 정책으로 유지한다.
begin;

alter table public.common_dictionary enable row level security;
alter table public.common_dictionary no force row level security;

drop policy if exists "Allow public insert" on public.common_dictionary;
drop policy if exists "Allow public update" on public.common_dictionary;
drop policy if exists "Allow public read" on public.common_dictionary;
drop policy if exists "Allow public read access on common_dictionary" on public.common_dictionary;

create policy "Allow public read"
  on public.common_dictionary
  for select
  to public
  using (true);
revoke insert, update, delete on table public.common_dictionary from public, anon, authenticated;
grant select on table public.common_dictionary to public, anon, authenticated;
grant select, insert, update, delete on table public.common_dictionary to service_role;

commit;
