begin;

create or replace function public.finalize_translation_draft(
  p_trainer_id bigint,
  p_language_code text,
  p_offset_dec integer,
  p_expected_translated_text text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.translation_mappings%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;
  if p_status is null
     or p_status not in ('approved', 'rejected')
     or p_trainer_id is null
     or nullif(btrim(p_language_code), '') is null
     or p_offset_dec is null
     or p_expected_translated_text is null then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'invalid_input');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_trainer_id::text || ':' || p_language_code || ':' || p_offset_dec::text,
      0
    )
  );
  select mapping.*
    into target
    from public.translation_mappings mapping
   where mapping.trainer_id = p_trainer_id
     and mapping.language_code = p_language_code
     and mapping.offset_dec = p_offset_dec
   for update;

  if not found then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'not_found');
  end if;
  if target.is_approved = true and target.translation_status = 'approved' then
    return jsonb_build_object('outcome', 'preserved', 'reason', 'approved_preserved');
  end if;
  if target.is_approved = true
     or target.translation_status = 'approved'
     or target.translation_status is null
     or target.translation_status not in ('pending', 'rejected') then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'invalid_state');
  end if;
  if target.translated_text is distinct from p_expected_translated_text then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'translated_text_mismatch');
  end if;

  update public.translation_mappings mapping
     set is_approved = (p_status = 'approved'),
         translation_status = p_status
   where mapping.id = target.id
     and mapping.is_approved = false
     and mapping.translation_status in ('pending', 'rejected')
     and mapping.translated_text is not distinct from p_expected_translated_text;
  if not found then
    return jsonb_build_object('outcome', 'db_error', 'reason', 'concurrent_state_change');
  end if;
  return jsonb_build_object('outcome', p_status);
end;
$$;

create or replace function public.list_pending_translation_sources(
  p_after_id bigint default 0,
  p_page_size integer default 1000,
  p_retry_rejected boolean default false
)
returns table(mapping_id bigint, trainer_id bigint, fling_url text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;
  if p_after_id < 0 or p_page_size not between 1 and 1000 then
    raise exception 'invalid pagination';
  end if;
  return query
    select mapping.id::bigint, mapping.trainer_id::bigint, game.fling_url
      from public.translation_mappings mapping
      join public.trainers trainer on trainer.id = mapping.trainer_id
      left join public.games game on game.id = trainer.game_id
     where mapping.id > p_after_id
       and mapping.is_approved = false
       and (
         mapping.translation_status = 'pending'
         or (p_retry_rejected and mapping.translation_status = 'rejected')
       )
     order by mapping.id
     limit p_page_size;
end;
$$;

revoke all on function public.finalize_translation_draft(bigint, text, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.list_pending_translation_sources(bigint, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_translation_draft(bigint, text, integer, text, text)
  to service_role;
grant execute on function public.list_pending_translation_sources(bigint, integer, boolean)
  to service_role;

commit;
