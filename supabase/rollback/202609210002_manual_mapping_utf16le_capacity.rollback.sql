-- 이 마이그레이션은 실행되지 않는 UTF16 convert_to 호출을 지원되는 계산으로 고친 호환성 복구다.
-- 이전 정의를 복원하면 UTF-16LE 수동 저장이 다시 실행 불가해지므로, rollback도 동일한 안전한
-- 함수 정의와 service_role 경계를 유지한다.
begin;

create or replace function public.save_manual_translation_mapping(
  p_mapping_id bigint,
  p_expected_translated_text text,
  p_translated_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.translation_mappings%rowtype;
  encoded_length bigint;
begin
  if auth.role() <> 'service_role'
     or p_mapping_id is null
     or p_expected_translated_text is null
     or p_translated_text is null
     or nullif(btrim(p_translated_text), '') is null
     or position(decode('00', 'hex') in convert_to(p_translated_text, 'UTF8')) > 0 then
    return jsonb_build_object('outcome', 'invalid_input');
  end if;

  select * into target from public.translation_mappings where id = p_mapping_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if target.translated_text is distinct from p_expected_translated_text then
    return jsonb_build_object('outcome', 'concurrent_change');
  end if;
  if target.max_char_len is null or target.max_char_len <= 0
     or target.encoding not in ('ASCII', 'UTF-8', 'UTF-16LE') then
    return jsonb_build_object('outcome', 'invalid_input');
  end if;
  if target.encoding = 'ASCII' then
    encoded_length := pg_catalog.octet_length(pg_catalog.convert_to(p_translated_text, 'UTF8'));
    if encoded_length <> pg_catalog.char_length(p_translated_text) then
      return jsonb_build_object('outcome', 'invalid_input');
    end if;
  elsif target.encoding = 'UTF-8' then
    encoded_length := pg_catalog.octet_length(pg_catalog.convert_to(p_translated_text, 'UTF8'));
  else
    encoded_length := 2 * (
      pg_catalog.char_length(p_translated_text)::bigint
      + (
        select count(*)::bigint
        from pg_catalog.generate_series(1, pg_catalog.char_length(p_translated_text)) as characters(position)
        where pg_catalog.ascii(pg_catalog.substr(p_translated_text, characters.position, 1)) > 65535
      )
    );
  end if;
  if encoded_length > (
    target.max_char_len::bigint
    * (case when target.encoding = 'UTF-16LE' then 2 else 1 end)
  ) then
    return jsonb_build_object('outcome', 'invalid_input');
  end if;
  update public.translation_mappings
     set translated_text = p_translated_text,
         is_approved = false,
         translation_provider = 'manual',
         translation_status = 'pending'
   where id = target.id
   returning * into target;
  delete from public.translation_retry_queue
   where trainer_id = target.trainer_id and language_code = target.language_code;
  return jsonb_build_object(
    'outcome', 'pending_manual_review',
    'mapping', jsonb_build_object(
      'id', target.id, 'offset_dec', target.offset_dec, 'encoding', target.encoding,
      'original_text', target.original_text, 'translated_text', target.translated_text,
      'max_char_len', target.max_char_len, 'is_approved', target.is_approved,
      'translation_status', target.translation_status, 'translation_provider', target.translation_provider
    )
  );
end;
$$;

revoke all on function public.save_manual_translation_mapping(bigint, text, text) from public, anon, authenticated;
grant execute on function public.save_manual_translation_mapping(bigint, text, text) to service_role;

commit;
