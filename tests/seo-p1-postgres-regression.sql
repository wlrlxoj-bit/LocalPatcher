-- Validator 전용: seo_test로 시작하는 빈 폐기용 DB에서만 사용한다.
-- 전체 fixture와 migration을 한 transaction으로 묶고 마지막에 모두 rollback한다.
begin;
set local standard_conforming_strings = on;
do $$
begin
  if left(current_database(), 8) <> 'seo_test' then
    raise exception '폐기용 seo_test DB만 허용합니다';
  end if;
  if exists (
    select 1 from pg_namespace n
    where n.nspname not in ('pg_catalog', 'information_schema', 'public')
      and n.nspname !~ '^pg_'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_namespace'::regclass and d.objid = n.oid
          and d.refclassid = 'pg_extension'::regclass and d.deptype = 'e'
      )
  ) or exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
      and n.nspname !~ '^pg_'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid
          and d.refclassid = 'pg_extension'::regclass and d.deptype = 'e'
      )
  ) then
    raise exception '비어 있는 폐기용 DB만 허용합니다';
  end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end; $$;
create schema auth;
create function auth.role() returns text language sql as $$select 'service_role'::text$$;
create table public.games(id bigint primary key, slug text not null unique, title_en text not null);
create table public.trainers(id bigint primary key, game_id bigint references public.games(id), option_count integer, version_str text);
create table public.translation_mappings(
  id bigint generated always as identity primary key, trainer_id bigint references public.trainers(id),
  language_code text, original_text text, translated_text text, is_approved boolean, updated_at timestamptz
);
create function public.seo_test_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'SEO 회귀: %', message; end if;
end; $$;

-- __SEO_MIGRATION__

insert into public.games(id,slug,title_en) values
  (1,'elden-ring','Elden Ring'),
  (2,'elden-ring-shadow-of-the-erdtree','Elden Ring Shadow of the Erdtree'),
  (3,'elden-ring-shadow-of-the-erdtree-1768067282','Elden Ring Shadow of the Erdtree'),
  (4,'elden-ring-shadow-of-the-erdtree-trainer-1768067282','Elden Ring Shadow of the Erdtree Trainer'),
  (20,'same-game','Same Game'),
  (21,'same-game-trainer-123456','Same Game Trainer Version v1.2 v3.4'),
  (22,'same-game-trainer-234567','Same Game Trainer Versionv1.2'),
  (30,'different-game','Different Game'),
  (31,'different-game-trainer-123456','Another Game Trainer Version v1.2');
insert into public.trainers(id,game_id,option_count,version_str) values
  (101,1,7,'v1.1'),(102,2,7,'v9.1'),(103,3,7,'v9.2'),(104,4,7,'v1.2'),
  (200,20,7,'v2.0'),(201,21,7,'v1.0'),(202,22,7,'v1.0'),(300,30,1,'v1.0'),(301,31,1,'v1.0');
insert into public.translation_mappings(trainer_id,language_code,original_text,translated_text,is_approved,updated_at)
select trainer_id,locale,
  E'Ctrl + Num 1 - Health\nNum + : Speed\nNum - : Slower\nF24 - Freeze\n[ - Lower\n] - Higher\nCtrl + [ - Toggle',
  '검증된 번역',true,clock_timestamp()
from (values(104),(200)) trainers(trainer_id) cross join (values('ko'),('ja'),('de'),('es')) locales(locale);

select public.refresh_patcher_index_eligibility_snapshot(null);
select public.seo_test_assert((select count(*)=4 from public.patcher_index_eligibility_snapshot where canonical_slug='elden-ring'), '정적 alias snapshot 중복');
select public.seo_test_assert((select bool_and(latest_trainer_id=104 and is_indexable) from public.patcher_index_eligibility_snapshot where game_id=1), '화면과 같은 Elden source 최신 선택 및 hotkey 전체 coverage');
select public.seo_test_assert((select count(*)=0 from public.patcher_index_eligibility_snapshot where game_id in (2,3,4,21,22)), 'canonicalized alias snapshot 공개 금지/Versionv 공백 0개');
select public.seo_test_assert((select bool_and(is_indexable) from public.patcher_index_eligibility_snapshot where game_id=20), 'SQL hotkey regex 실제 일치');
select public.seo_test_assert((select count(*)=4 from public.patcher_index_eligibility_snapshot where game_id=31 and canonical_slug='different-game-trainer-123456'), '다른 제목은 병합 금지');

-- JS OPTION_LABEL_PATTERN과 같은 실제 snapshot 자격을 검사한다. 공백/탭은 허용하되
-- Num 특수키와 설명이 다음 줄에 있으면 한 옵션으로 이어 붙이지 않는다.
create temporary table seo_original_option_blocks as
  select id, original_text from public.translation_mappings where trainer_id=200;
update public.trainers set option_count=1 where id=200;
do $$
declare broken text;
begin
  foreach broken in array array[E'Num 1 -\nHealth', E'Num\nMultiply - Damage'] loop
    update public.translation_mappings set original_text=broken where trainer_id=200;
    perform public.refresh_patcher_index_eligibility_snapshot(200);
    perform public.seo_test_assert((select count(*)=4 and bool_and(not is_indexable) from public.patcher_index_eligibility_snapshot where game_id=20), '줄바꿈 단축키/설명은 색인 불가');
  end loop;
  update public.translation_mappings set original_text=E'Num\t1 - Health' where trainer_id=200;
  perform public.refresh_patcher_index_eligibility_snapshot(200);
  perform public.seo_test_assert((select count(*)=4 and bool_and(is_indexable) from public.patcher_index_eligibility_snapshot where game_id=20), '탭 단축키는 색인 가능');
end; $$;
update public.translation_mappings mapping set original_text=original.original_text
  from seo_original_option_blocks original where mapping.id=original.id;
update public.trainers set option_count=7 where id=200;
select public.refresh_patcher_index_eligibility_snapshot(200);

-- 정규화 규칙은 실제 PostgreSQL regex와 JS runtime의 같은 기대 결과를 사용한다.
select public.seo_test_assert(
  btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower('Same Game Trainer Version v1.2 v3.4'), '\mtrainer\M', ' ', 'gi'), '\mversion[[:space:]]*v?[0-9]+([.][0-9]+)*\M|\mv[0-9]+([.][0-9]+)*\M', ' ', 'gi'), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))='same game',
  '단일 backslash 단어 경계/버전 제거');
select public.seo_test_assert(
  btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower('Trainerverse v12beta'), '\mtrainer\M', ' ', 'gi'), '\mversion[[:space:]]*v?[0-9]+([.][0-9]+)*\M|\mv[0-9]+([.][0-9]+)*\M', ' ', 'gi'), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))='trainerverse v12beta',
  '단어 내부 trainer/version은 보존');

do $$
declare trainer bigint;
begin
  foreach trainer in array array[102,103,104]::bigint[] loop
    perform public.refresh_patcher_index_and_enqueue(trainer);
    perform public.seo_test_assert((select count(*)=1 and min(canonical_slug)='elden-ring' from public.get_patcher_revalidation_target(trainer)), '세 정적 alias canonical target');
  end loop;
  perform public.refresh_patcher_index_and_enqueue(201);
  perform public.seo_test_assert((select count(*)=1 and min(canonical_slug)='same-game' from public.get_patcher_revalidation_target(201)), '버전이 포함된 숫자형 alias canonical target');
  perform public.refresh_patcher_index_and_enqueue(202);
  perform public.seo_test_assert((select count(*)=1 and min(canonical_slug)='same-game' from public.get_patcher_revalidation_target(202)), 'Versionv 공백 0개 숫자형 alias enqueue target');
end; $$;

delete from public.patcher_revalidation_outbox;
insert into public.patcher_revalidation_outbox(dedupe_key,locale_codes,reason) values('sitemap:indexability',array['ko'],'sitemap_debounce');
do $$
declare first_claim record; recovered record;
begin
  select * into first_claim from public.claim_patcher_revalidation_outbox(10);
  perform public.seo_test_assert(first_claim.lease_token is not null, '첫 lease');
  perform public.seo_test_assert((select count(*)=0 from public.claim_patcher_revalidation_outbox(10)), '활성 lease는 재claim 금지');
  update public.patcher_revalidation_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=first_claim.id;
  select * into recovered from public.claim_patcher_revalidation_outbox(10);
  perform public.seo_test_assert(recovered.id=first_claim.id and recovered.lease_token<>first_claim.lease_token and recovered.attempt_count=2, '만료 claimed 회수/새 token');
  perform public.seo_test_assert(not public.finish_patcher_revalidation_outbox(first_claim.id,first_claim.lease_token,'completed'), '이전 token은 finish 거절');
  perform public.seo_test_assert(public.finish_patcher_revalidation_outbox(recovered.id,recovered.lease_token,'completed'), '새 token 완료');
end; $$;

-- content와 sitemap 모두: claim 후 enqueue가 발생하면 이전 세대는 완료할 수 없다.
delete from public.patcher_revalidation_outbox;
select public.refresh_patcher_index_and_enqueue(104);
create temporary table seo_claimed as select * from public.claim_patcher_revalidation_outbox(10);
select public.refresh_patcher_index_and_enqueue(104);
do $$
declare previous record; repeated record;
begin
  for previous in select * from seo_claimed loop
    perform public.seo_test_assert(not public.finish_patcher_revalidation_outbox(previous.id,previous.lease_token,'completed'), '이전 세대 완료 거절');
    perform public.seo_test_assert((select state='ready' and finished_at is null and lease_token is null from public.patcher_revalidation_outbox where id=previous.id), '새 세대 ready 복원');
  end loop;
  perform public.seo_test_assert((select count(*)=2 from public.patcher_revalidation_outbox where state='ready'), 'content와 sitemap 모두 후속 작업 유지');
  for repeated in select * from public.claim_patcher_revalidation_outbox(10) loop
    perform public.seo_test_assert(public.finish_patcher_revalidation_outbox(repeated.id,repeated.lease_token,'completed'), '새 세대 완료');
  end loop;
  perform public.seo_test_assert((select count(*)=2 from public.patcher_revalidation_outbox where state='completed'), '새 세대만 완료 상태 기록');
end; $$;

-- 실패 retry 지연과 별개로 새 enqueue는 old worker의 backoff에 묻히지 않는다.
select public.refresh_patcher_index_and_enqueue(104);
truncate seo_claimed;
insert into seo_claimed select * from public.claim_patcher_revalidation_outbox(10);
select public.refresh_patcher_index_and_enqueue(104);
do $$
declare previous record;
begin
  for previous in select * from seo_claimed loop
    perform public.seo_test_assert(not public.finish_patcher_revalidation_outbox(previous.id,previous.lease_token,'deferred','PATCHER_REVALIDATE_FAILED',3600), '이전 세대 실패도 새 세대를 지연시키지 않음');
    perform public.seo_test_assert((select state='ready' and due_at<=clock_timestamp() from public.patcher_revalidation_outbox where id=previous.id), '새 세대 즉시 재시도');
  end loop;
end; $$;
rollback;
