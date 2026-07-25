begin;

do $$
declare
  canonical_id integer;
  restored_count bigint;
  backup_count bigint;
  restored_mapping_count bigint;
begin
  select id into canonical_id
  from public.games
  where slug = 'elden-ring'
  for update;

  if canonical_id is null or canonical_id <> 4 then
    raise exception '롤백 중단: canonical elden-ring 행이 preflight와 다릅니다: %', canonical_id;
  end if;

  if to_regclass('public.elden_ring_trainer_game_backup_20260725') is null
    or to_regclass('public.elden_ring_alias_backup_20260725') is null then
    raise exception '롤백 중단: 영구 백업 테이블이 없습니다';
  end if;

  select count(*) into backup_count
  from public.elden_ring_trainer_game_backup_20260725;

  if backup_count <> 5 then
    raise exception '롤백 중단: trainer 백업 수가 예상과 다릅니다: %', backup_count;
  end if;

  -- migration 당시 백업한 trainer만 원래 source 게임과 버전으로 복원한다.
  update public.trainers trainer
  set game_id = backup.old_game_id,
      version_str = backup.old_version_str
  from public.elden_ring_trainer_game_backup_20260725 backup
  where trainer.id = backup.trainer_id
    and trainer.game_id = canonical_id;

  select count(*) into restored_count
  from public.elden_ring_trainer_game_backup_20260725 backup
  join public.trainers trainer
    on trainer.id = backup.trainer_id
   and trainer.game_id = backup.old_game_id
   and trainer.version_str = backup.old_version_str;

  select count(mapping.id) into restored_mapping_count
  from public.elden_ring_trainer_game_backup_20260725 backup
  left join public.translation_mappings mapping on mapping.trainer_id = backup.trainer_id;

  if restored_count <> backup_count or restored_mapping_count <> 10 then
    raise exception
      '롤백 중단: trainer/mapping 복원 수 불일치(trainer %/%, mapping %/10)',
      restored_count, backup_count, restored_mapping_count;
  end if;

  -- 기존 별칭은 원래 대상을 복원하고 migration이 새로 만든 별칭만 제거한다.
  update public.game_slug_aliases alias
  set game_id = backup.prior_game_id
  from public.elden_ring_alias_backup_20260725 backup
  where alias.alias_slug = backup.alias_slug
    and backup.had_prior_row;

  delete from public.game_slug_aliases alias
  using public.elden_ring_alias_backup_20260725 backup
  where alias.alias_slug = backup.alias_slug
    and not backup.had_prior_row
    and alias.game_id = canonical_id;
end
$$;

-- 백업 테이블은 롤백 증거로 보존하며 source games 행은 삭제하지 않는다.
commit;
