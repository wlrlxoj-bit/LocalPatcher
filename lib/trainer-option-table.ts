/** 전체 옵션 표는 현재 언어·최신 트레이너의 완전한 승인 매핑에서만 생성합니다. */
export interface TrainerOptionTableMapping {
  trainer_id: number;
  language_code: string;
  is_approved: boolean;
  offset_dec: number;
  original_text: string;
  translated_text: string;
}

export interface TrainerOptionTableItem {
  shortcut: string;
  label: string;
}

export interface TrainerOptionTable {
  items: TrainerOptionTableItem[];
}

interface TrainerOptionTableInput {
  latestTrainerId: number;
  locale: string;
  optionCount: number;
  indexEligible: boolean;
  mappings: TrainerOptionTableMapping[];
}

// 색인 자격·번역 검증기의 단축키와 구분자 문법을 사용하며, 라벨이 손상된 옵션도
// 검증 대상에서 누락되지 않도록 빈 라벨까지 먼저 포착합니다.
const KEY_TOKEN = String.raw`(?:Num(?:Pad)?[ \t]*(?:[0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F(?:[1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(?:Up|Down|Left|Right)|Bracket(?:Left|Right)|[\[\]]|[A-Z0-9+\-=.,/])`;
const OPTION_LINE = new RegExp(String.raw`^(${KEY_TOKEN}(?:[ \t]*\+[ \t]*${KEY_TOKEN})*)[ \t]*(?:->|—|–|→|-|:)[ \t]*(.*)$`, 'i');
const OPTION_CANDIDATE = /^(?:Num(?:Pad)?[ \t]*(?:[0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|(?:Ctrl|Alt|Shift)[ \t]*\+|F(?:[1-9]|1[0-9]|2[0-4])\b)/i;
const LOCALIZED_LOCALES = new Set(['ko', 'ja', 'de', 'es']);

function normalizeShortcut(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function normalizeLabel(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 안내 문장은 제외하되 손상된 옵션 행은 일부만 표시하지 않고 전체를 거부합니다. */
function parseOptions(value: string): TrainerOptionTableItem[] | null {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(value)) return null;
  const items: TrainerOptionTableItem[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(OPTION_LINE);
    if (!match) {
      if (OPTION_CANDIDATE.test(line)) return null;
      continue;
    }
    const label = match[2].split('**', 1)[0].trim();
    if (!label || label.length > 180) return null;
    items.push({ shortcut: match[1].trim(), label });
  }
  return items;
}

/**
 * 입력은 최신 ID·현재 언어·옵션 수와 승인 매핑입니다. 블록 및 개별 슬롯을 오프셋
 * 순서로 모으되 짝·범위·중복·수량이 모두 정확할 때만 전체 번역 표를 반환합니다.
 * 원문 대체 라벨이나 손상된 한 행이 있으면 부분 표 대신 null을 반환합니다.
 */
export function getTrainerOptionTable({ latestTrainerId, locale, optionCount, indexEligible, mappings }: TrainerOptionTableInput): TrainerOptionTable | null {
  if (!indexEligible || !LOCALIZED_LOCALES.has(locale) ||
    !Number.isSafeInteger(latestTrainerId) || latestTrainerId <= 0 ||
    !Number.isSafeInteger(optionCount) || optionCount <= 0 || mappings.length === 0) return null;

  const offsets = new Set<number>();
  for (const mapping of mappings) {
    if (mapping.trainer_id !== latestTrainerId || mapping.language_code !== locale || mapping.is_approved !== true ||
      !Number.isSafeInteger(mapping.offset_dec) || mapping.offset_dec < 0 || offsets.has(mapping.offset_dec)) return null;
    offsets.add(mapping.offset_dec);
  }

  const items: TrainerOptionTableItem[] = [];
  const shortcuts = new Set<string>();
  for (const mapping of [...mappings].sort((left, right) => left.offset_dec - right.offset_dec)) {
    const original = parseOptions(mapping.original_text);
    const translated = parseOptions(mapping.translated_text);
    if (!original || !translated || original.length !== translated.length) return null;
    for (const [index, item] of translated.entries()) {
      const source = original[index];
      const shortcut = normalizeShortcut(item.shortcut);
      if (!source || shortcut !== normalizeShortcut(source.shortcut) || shortcuts.has(shortcut) ||
        normalizeLabel(source.label) === normalizeLabel(item.label)) return null;
      shortcuts.add(shortcut);
      items.push(item);
    }
  }
  return items.length === optionCount ? { items } : null;
}
