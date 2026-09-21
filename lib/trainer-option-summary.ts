/**
 * 승인된 번역 매핑에서만 실제 단축키와 번역된 옵션 이름을 추출한다.
 * 원문과 번역문의 단축키 순서가 정확히 일치하지 않으면 표시하지 않아,
 * 다른 빌드나 안내 문구를 옵션으로 잘못 노출하지 않는다.
 */
export interface TrainerOptionSummaryMapping {
  original_text: string;
  translated_text: string;
}

export interface TrainerOptionSummaryItem {
  shortcut: string;
  label: string;
}

export interface TrainerOptionSummary {
  items: TrainerOptionSummaryItem[];
}

const MINIMUM_SUMMARY_OPTIONS = 6;
const MAXIMUM_SUMMARY_OPTIONS = 10;

const KEY_TOKEN = String.raw`(?:Num\s*(?:[0-9]|[.+*/-])|F(?:[1-9]|1[0-2])|Page\s*(?:Up|Down)|Home|End|Insert|Delete|[A-Z])`;
const SHORTCUT_PATTERN = new RegExp(
  String.raw`^(?:(?:Ctrl|Alt|Shift)\s*\+\s*)*${KEY_TOKEN}(?:\s*\+\s*${KEY_TOKEN})*$`,
  'i',
);

function normalizeShortcut(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function parseOptionLines(value: string): TrainerOptionSummaryItem[] {
  const options: TrainerOptionSummaryItem[] = [];

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    // 단축키의 '-'와 옵션 구분자 '-'를 구별하기 위해 양쪽 공백이 있는 구분자만 허용한다.
    const match = line.match(/^(.+?)\s+-\s+(.+)$/);
    if (!match) continue;

    const shortcut = match[1].trim();
    const label = match[2].split('**', 1)[0].trim();
    if (!SHORTCUT_PATTERN.test(shortcut) || !label || label.length > 180) continue;

    options.push({ shortcut, label });
  }

  return options;
}

function getVerifiedOptions(mapping: TrainerOptionSummaryMapping): TrainerOptionSummaryItem[] | null {
  if (
    typeof mapping.original_text !== 'string' ||
    typeof mapping.translated_text !== 'string' ||
    !mapping.original_text.trim() ||
    !mapping.translated_text.trim()
  ) {
    return null;
  }

  const sourceOptions = parseOptionLines(mapping.original_text);
  const translatedOptions = parseOptionLines(mapping.translated_text);
  if (sourceOptions.length < MINIMUM_SUMMARY_OPTIONS || sourceOptions.length !== translatedOptions.length) {
    return null;
  }

  const verified = translatedOptions.filter((translated, index) => {
    const source = sourceOptions[index];
    return (
      source !== undefined &&
      normalizeShortcut(source.shortcut) === normalizeShortcut(translated.shortcut) &&
      source.label.localeCompare(translated.label, undefined, { sensitivity: 'accent' }) !== 0
    );
  });

  return verified.length >= MINIMUM_SUMMARY_OPTIONS ? verified.slice(0, MAXIMUM_SUMMARY_OPTIONS) : null;
}

/**
 * 최신 트레이너의 승인 매핑 중 가장 많은 검증 옵션을 가진 한 건만 사용한다.
 * 여러 매핑을 합치지 않아 서로 다른 문자열 블록을 잘못 조합하지 않는다.
 */
export function getTrainerOptionSummary(
  mappings: TrainerOptionSummaryMapping[],
): TrainerOptionSummary | null {
  let best: TrainerOptionSummaryItem[] | null = null;

  for (const mapping of mappings) {
    const candidate = getVerifiedOptions(mapping);
    if (candidate && (!best || candidate.length > best.length)) {
      best = candidate;
    }
  }

  return best ? { items: best } : null;
}
