-- 독립 Validator 전용: 비어 있는 폐기용 seo_test* DB에서만 실행한다.
-- __LEGACY_QUOTA_MIGRATION__ 표시는 migration의 BEGIN/COMMIT을 뺀 본문으로 치환한다.
begin;
do $$
begin
  if left(current_database(),8) <> 'seo_test' then
    raise exception '폐기용 seo_test DB만 허용합니다';
  end if;
  if exists (select 1 from pg_namespace where nspname='auth')
     or exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public') then
    raise exception '빈 폐기용 DB만 허용합니다';
  end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end; $$;
create schema auth;
create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
set local test.role='service_role';
create table public.games(id bigint primary key,fling_url text);
create table public.trainers(id bigint primary key,game_id bigint);
create table public.translation_mappings(trainer_id bigint,language_code text,is_approved boolean,translation_provider text);
create table public.translation_integrity_recovery_queue(trainer_id bigint,state text,lease_expires_at timestamptz);
create table public.source_discovery_queue(source_url text,state text);
create table public.translation_retry_queue(
  trainer_id bigint,language_code text,state text,next_retry_at timestamptz,
  attempt_count integer,last_failure_code text,updated_at timestamptz,
  primary key(trainer_id,language_code)
);
create function public.recovery_test_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '선별 복구 회귀: %',message; end if; end; $$;

-- __LEGACY_QUOTA_MIGRATION__

insert into public.games values(1,'https://flingtrainer.com/trainer/fixture-one/'),(2,'https://flingtrainer.com/trainer/fixture-two/'),(3,'https://flingtrainer.com/trainer/fixture-three/');
insert into public.trainers values(2730,1),(2731,2),(9999,3);
insert into public.translation_retry_queue
select t.id,l.code,'deferred',now()+interval '3 days',3,'TRANSLATION_QUOTA',timestamptz '2026-10-14 01:00+00'
from public.trainers t cross join (values('ko'),('ja'),('de'),('es')) l(code);
insert into public.translation_mappings values(2730,'ja',true,'openai_paid'),(2730,'de',false,'manual');
update public.translation_retry_queue set state='blocked',next_retry_at=null where trainer_id=2730 and language_code='es';
insert into public.translation_integrity_recovery_queue values(2731,'blocked',null);
create temporary table first_claim as select * from public.claim_legacy_internal_quota_recovery(array[2730,2731]::bigint[],4);
select public.recovery_test_assert((select count(*)=1 and min(trainer_id)=2730 and min(language_code)='ko' from first_claim),'승인/manual/blocked/integrity 보호');
select public.recovery_test_assert((select attempt_count=3 and state='ready' and next_retry_at>now()+interval '29 minutes' and last_failure_code='INTERNAL_QUOTA_RECOVERY_CLAIMED' from public.translation_retry_queue where trainer_id=2730 and language_code='ko'),'attempt 보존 및 30분 lease');
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2730,2731]::bigint[],4)),'반복 claim 멱등성');
delete from public.translation_integrity_recovery_queue;
insert into public.trainers values(2732,2);
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2731]::bigint[],4)),'최신 trainer가 아닌 대상 보존');
delete from public.trainers where id=2732;
insert into public.source_discovery_queue values('https://flingtrainer.com/trainer/fixture-two','blocked');
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2731]::bigint[],4)),'원본 발견 큐 차단 보존');
delete from public.source_discovery_queue;
update public.games set fling_url='https://untrusted.example/trainer/fixture/' where id=2;
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2731]::bigint[],4)),'비공식 원본 URL 차단');
update public.games set fling_url='https://flingtrainer.com/trainer/fixture-two/' where id=2;
insert into public.translation_integrity_recovery_queue values(2731,'ready',now()+interval '10 minutes');
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2731]::bigint[],4)),'무결성 활성 lease 보존');
delete from public.translation_integrity_recovery_queue;
update public.translation_retry_queue set updated_at=now() where trainer_id=2731 and language_code='ko';
update public.translation_retry_queue set state='blocked',next_retry_at=null where trainer_id=2731 and language_code='ja';
update public.translation_retry_queue set state='ready',next_retry_at=now()+interval '30 minutes' where trainer_id=2731 and language_code='de';
create temporary table second_claim as select * from public.claim_legacy_internal_quota_recovery(array[2731]::bigint[],4);
select public.recovery_test_assert((select count(*)=1 and min(language_code)='es' from second_claim),'새 공급자 quota/blocked/활성 retry lease 보존');
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[9999]::bigint[],4)),'입증되지 않은 trainer 보존');
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2730,null]::bigint[],4)),'null 원소 차단');
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2730]::bigint[],5)),'배치 상한 보존');
select public.recovery_test_assert((select bool_and(state='deferred' and attempt_count=3) from public.translation_retry_queue where trainer_id=9999),'allowlist 밖 불변');
-- 실패 후 다시 같은 quota가 기록되어도 신규 updated_at 때문에 운영 복구로 재진입하지 않는다.
update public.translation_retry_queue set state='deferred',last_failure_code='TRANSLATION_QUOTA',updated_at=now() where trainer_id=2730 and language_code='ko';
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2730]::bigint[],4)),'새 quota 재보류 반복 복구 차단');
set local test.role='anon';
select public.recovery_test_assert((select count(*)=0 from public.claim_legacy_internal_quota_recovery(array[2730]::bigint[],4)),'함수 내부 auth 가드');
select public.recovery_test_assert(not has_function_privilege('anon','public.claim_legacy_internal_quota_recovery(bigint[],integer)','execute'),'anon 권한 차단');
select public.recovery_test_assert(not has_function_privilege('authenticated','public.claim_legacy_internal_quota_recovery(bigint[],integer)','execute'),'authenticated 권한 차단');
select public.recovery_test_assert(has_function_privilege('service_role','public.claim_legacy_internal_quota_recovery(bigint[],integer)','execute'),'service_role 허용');
rollback;
