begin;

drop function if exists public.list_pending_translation_sources(bigint, integer, boolean);
drop function if exists public.finalize_translation_draft(bigint, text, integer, text, text);

commit;
