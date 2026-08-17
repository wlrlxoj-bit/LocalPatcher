const STATIC_GAME_SLUG_ALIASES: Readonly<Record<string, string>> = {
  'elden-ring-shadow-of-the-erdtree': 'elden-ring',
  'elden-ring-shadow-of-the-erdtree-1768067282': 'elden-ring',
  'elden-ring-shadow-of-the-erdtree-trainer-1768067282': 'elden-ring',
};

const NUMERIC_TRAINER_SUFFIX = /-trainer(?:-\d{6,})?$/;

/** DB 장애와 무관하게 반드시 유지해야 하는 정확한 과거 slug를 canonical slug로 변환합니다. */
export function resolveStaticGameSlugAlias(slug: string): string | null {
  return STATIC_GAME_SLUG_ALIASES[slug] ?? null;
}

/** FLiNG 게시물 번호가 붙은 과거 slug에서 가능한 기본 게임 slug를 추출합니다. */
export function getNumericTrainerBaseSlug(slug: string): string | null {
  if (!NUMERIC_TRAINER_SUFFIX.test(slug)) return null;
  return slug.replace(NUMERIC_TRAINER_SUFFIX, '');
}

/** 중복 수집된 게임 제목을 비교하기 위해 Trainer·버전·구두점을 제거합니다. */
export function normalizeLegacyGameTitle(title: string): string {
  return title
    .toLocaleLowerCase('en')
    .replace(/\btrainer\b/gi, ' ')
    .replace(/\bversion\s*v?\d+(?:\.\d+)*\b/gi, ' ')
    .replace(/\bv\d+(?:\.\d+)*\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** exact/base 게임이 동일한 중복 수집 항목인지 제목을 보수적으로 비교합니다. */
export function hasSameNormalizedGameTitle(
  requestedGame: { title_en: string },
  baseGame: { title_en: string }
): boolean {
  const requestedTitle = normalizeLegacyGameTitle(requestedGame.title_en);
  const baseTitle = normalizeLegacyGameTitle(baseGame.title_en);
  return requestedTitle.length > 0 && requestedTitle === baseTitle;
}

/**
 * sitemap 후보를 canonical slug로 정규화합니다.
 * 숫자형 과거 URL은 기본 게임이 실제 목록에 있을 때만 합칩니다.
 */
export function canonicalizeListedGameSlug(
  slug: string,
  existingSlugs: ReadonlySet<string>,
  titleBySlug?: ReadonlyMap<string, string>
): string {
  const staticAlias = resolveStaticGameSlugAlias(slug);
  if (staticAlias) return staticAlias;

  const numericBase = getNumericTrainerBaseSlug(slug);
  if (!numericBase || !existingSlugs.has(numericBase)) return slug;

  const requestedTitle = titleBySlug?.get(slug);
  const baseTitle = titleBySlug?.get(numericBase);
  return requestedTitle && baseTitle &&
    hasSameNormalizedGameTitle({ title_en: requestedTitle }, { title_en: baseTitle })
    ? numericBase
    : slug;
}
