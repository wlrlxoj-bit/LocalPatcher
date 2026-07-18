# 관리자 번역 API 계약

모든 경로는 서버가 검증한 `localpatcher_admin_session` 쿠키가 필요하다. API는 service-role 키를 응답에 포함하지 않는다.

## 원문 조회

`GET /api/admin/translations/source?trainerId=123&targetLanguage=ja`

- 승인된 모든 옵션 슬롯을 `offset_dec`, `id` 순으로 정렬해 항목과 전체 snapshot `sourceVersion`을 생성한다.
- `sourceMappingId`는 기존 클라이언트 호환용 첫 슬롯 ID다. 신규 클라이언트는 `sourceMappingIds`와 `sourceSlots`를 사용한다.
- `sourceSlots`에는 source/target mapping ID, offset, 인코딩, 최대 길이와 낙관적 동시성 snapshot이 포함된다.
- 기존 `pending`은 첫 대상 슬롯 객체 또는 `null`로 유지한다. 전체 대상 mapping은 배열 `pendingSlots`로 반환한다.

## 미리보기와 실행

`POST /api/admin/translations/preview`

```json
{ "provider": "azure", "trainerId": 123, "targetLanguage": "ja" }
```

공급자를 호출하지 않고 `previewHash`, 전체 슬롯의 `items`, `batchCount`, `quota`, `sourceSlots`를 반환한다.

`POST /api/admin/translations/run`

```json
{
  "provider": "azure",
  "trainerId": 123,
  "targetLanguage": "ja",
  "previewHash": "...",
  "idempotencyKey": "관리자-생성-고유값",
  "paidConsent": false
}
```

`openai_paid`는 `paidConsent: true`가 필수다. 성공 응답은 `{id,status,result,idempotent}` 형태를 유지한다.

## 승인

`POST /api/admin/translations/approve`

```json
{ "jobId": "uuid", "edits": [{ "key": "slot-100-line-0", "translatedText": "번역문" }] }
```

슬롯 자연키는 `(trainer_id, language_code, offset_dec)`이다. 승인 RPC는 job의 전체 source snapshot과 모든 대상 슬롯을 잠가 preview 이후 변경 여부를 검사한다. 한 슬롯이라도 추가·삭제·변경되면 전체 승인을 중단한다. 검증 성공 시 슬롯별 mapping upsert, translation memory upsert, job 승인 상태 변경을 한 transaction에서 처리한다.

빈 `translatedText`는 대응하는 원문이 빈 줄일 때만 허용한다. 승인 편집본은 `approved_edits`에 별도 보관하고 원래 run 결과는 변경하지 않는다.

## 초안 저장

`upsert_translation_drafts(jsonb[])`는 여러 슬롯을 한 transaction에서 저장한다. 각 슬롯의 기존 승인 행은 보존하며, 승인되지 않은 동일 자연키 행만 갱신한다. 단일 슬롯 호환 함수 `upsert_translation_draft(jsonb)`도 유지한다.

## 운영 중복 백업과 롤백

마이그레이션은 검증 가능한 JA 슬롯 중복 원본을 `translation_mappings_slot_dedupe_backup_20260719`에 영구 보존한다. 일반 rollback은 이 테이블을 삭제하거나 자동 복원하지 않는다.

자동 복원은 migration 이후 쓰기를 덮을 수 있다. 별도 유지보수 창에서 현재 보존 행의 ID와 내용이 migration 직후 상태인지 확인한 경우에만 triple unique index 제거, 대상 자연키의 현재 행 별도 백업, 백업 행의 `OVERRIDING SYSTEM VALUE` 복원을 순서대로 수행한다. 현재 값이 다르면 중단하고 수동 병합한다.
