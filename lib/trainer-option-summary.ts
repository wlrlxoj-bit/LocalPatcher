/**
 * 승인된 번역 매핑에서만 실제 단축키와 번역된 옵션 이름을 추출한다.
 * 원문과 번역문의 단축키 순서가 정확히 일치하지 않으면 표시하지 않아,
 * 다른 빌드나 안내 문구를 옵션으로 잘못 노출하지 않는다.
 */
export interface TrainerOptionSummaryMapping {
  original_text: string;
  translated_text: string;
  /** 같은 최신 trainer·locale 안에서 옵션 슬롯을 안정적으로 정렬하는 원본 파일 오프셋입니다. */
  offset_dec?: number;
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

/**
 * 라벨이 비어 있거나 번역이 깨진 행도 단축키 중복 여부는 식별해야 한다.
 * 따라서 일반 파서보다 느슨하게 단축키 후보만 추출하며, 실제 표시 전에는 엄격 파서를 다시 통과해야 한다.
 */
function getPotentialShortcutKeys(value: string): string[] {
  const shortcuts: string[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^(.+?)\s+-\s*(.*)$/);
    const shortcut = match?.[1]?.trim();
    if (shortcut && SHORTCUT_PATTERN.test(shortcut)) {
      shortcuts.push(normalizeShortcut(shortcut));
    }
  }
  return shortcuts;
}

function hasSameShortcutSequence(options: TrainerOptionSummaryItem[], shortcuts: string[]): boolean {
  return options.length === shortcuts.length && options.every(
    (option, index) => normalizeShortcut(option.shortcut) === shortcuts[index],
  );
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
  const sourceKeys = getPotentialShortcutKeys(mapping.original_text);
  const translatedKeys = getPotentialShortcutKeys(mapping.translated_text);
  if (sourceOptions.length < MINIMUM_SUMMARY_OPTIONS || sourceOptions.length !== translatedOptions.length) {
    return null;
  }
  // 빈·과도하게 긴 라벨처럼 엄격 파서가 제외한 단축키 후보가 하나라도 있으면
  // 완전 블록의 일부만 골라 표시하지 않는다.
  if (
    !hasSameShortcutSequence(sourceOptions, sourceKeys) ||
    !hasSameShortcutSequence(translatedOptions, translatedKeys)
  ) {
    return null;
  }

  for (const [index, translated] of translatedOptions.entries()) {
    const source = sourceOptions[index];
    if (
      source === undefined ||
      normalizeShortcut(source.shortcut) !== normalizeShortcut(translated.shortcut) ||
      source.label.localeCompare(translated.label, undefined, { sensitivity: 'accent' }) === 0
    ) {
      return null;
    }
  }

  return translatedOptions.slice(0, MAXIMUM_SUMMARY_OPTIONS);
}

/** 단일 슬롯 행은 원문·번역 각각 정확히 한 개의 같은 단축키여야 한다. */
function getVerifiedSingleOption(mapping: TrainerOptionSummaryMapping): TrainerOptionSummaryItem | null {
  if (typeof mapping.original_text !== 'string' || typeof mapping.translated_text !== 'string') {
    return null;
  }

  const sourceOptions = parseOptionLines(mapping.original_text);
  const translatedOptions = parseOptionLines(mapping.translated_text);
  if (sourceOptions.length !== 1 || translatedOptions.length !== 1) return null;

  const source = sourceOptions[0];
  const translated = translatedOptions[0];
  if (
    normalizeShortcut(source.shortcut) !== normalizeShortcut(translated.shortcut) ||
    source.label.localeCompare(translated.label, undefined, { sensitivity: 'accent' }) === 0
  ) {
    return null;
  }

  return translated;
}

/**
 * 현재 수집기는 옵션 문자열을 개별 슬롯 행으로 저장할 수 있다.
 * 같은 최신 trainer·locale에서 조회된 승인 행만 offset_dec 오름차순으로 묶고,
 * 오프셋 또는 단축키 중복은 서로 다른 문자열을 합친 것일 수 있으므로 전체를 숨긴다.
 */
interface SlotOptionResult {
  items: TrainerOptionSummaryItem[] | null;
  unsafe: boolean;
}

function getVerifiedSlotOptions(mappings: TrainerOptionSummaryMapping[]): SlotOptionResult {
  const withIndex = mappings.map((mapping, index) => ({ mapping, index }));
  // getMappingsForTrainers는 최신 trainer·현재 locale의 승인 행만 전달한다. 그 행 중 하나라도
  // 오프셋이 없거나 중복되면 어느 슬롯이 최신인지 확정할 수 없으므로 요약 전체를 숨긴다.
  const offsets = new Set<number>();
  for (const { mapping } of withIndex) {
    if (!Number.isSafeInteger(mapping.offset_dec) || (mapping.offset_dec as number) < 0) return { items: null, unsafe: true };
    const offset = mapping.offset_dec as number;
    if (offsets.has(offset)) return { items: null, unsafe: true };
    offsets.add(offset);
  }

  const ordered = [...withIndex].sort((left, right) =>
    (left.mapping.offset_dec as number) - (right.mapping.offset_dec as number) || left.index - right.index,
  );

  const shortcuts = new Set<string>();
  const verified: TrainerOptionSummaryItem[] = [];
  for (const { mapping } of ordered) {
    if (typeof mapping.original_text !== 'string' || typeof mapping.translated_text !== 'string') return { items: null, unsafe: true };
    const sourceKeys = getPotentialShortcutKeys(mapping.original_text);
    const translatedKeys = getPotentialShortcutKeys(mapping.translated_text);

    // 안내·상태 문자열처럼 양쪽 모두 단축키가 없는 행은 요약과 무관하다.
    if (sourceKeys.length === 0 && translatedKeys.length === 0) continue;
    // 여러 옵션을 담은 완전 블록은 위의 getVerifiedOptions가 독립 처리한다.
    if (sourceKeys.length > 1 && translatedKeys.length > 1) {
      // 완전 블록도 원문·번역 짝이 검증되어야 다른 손상 슬롯을 가리지 않는다.
      if (!getVerifiedOptions(mapping)) return { items: null, unsafe: true };
      if (sourceKeys.length !== translatedKeys.length) return { items: null, unsafe: true };
      // 블록의 원문·번역 양쪽 키와 개별 슬롯 키를 모두 한 집합에 넣어 중복을 막는다.
      for (const [index, sourceShortcut] of sourceKeys.entries()) {
        const translatedShortcut = translatedKeys[index];
        if (translatedShortcut === undefined || sourceShortcut !== translatedShortcut) return { items: null, unsafe: true };
        if (shortcuts.has(sourceShortcut)) return { items: null, unsafe: true };
        shortcuts.add(sourceShortcut);
      }
      continue;
    }
    // 한쪽만 파싱되거나 다른 단축키라면 손상·불일치 슬롯이므로 표시하지 않는다.
    if (sourceKeys.length !== 1 || translatedKeys.length !== 1 || sourceKeys[0] !== translatedKeys[0]) return { items: null, unsafe: true };

    const shortcut = sourceKeys[0];
    // 라벨이 손상되어 getVerifiedSingleOption이 실패해도 중복을 먼저 거부한다.
    if (shortcuts.has(shortcut)) return { items: null, unsafe: true };
    shortcuts.add(shortcut);

    const option = getVerifiedSingleOption(mapping);
    if (!option) return { items: null, unsafe: true };
    verified.push(option);
  }

  return {
    items: verified.length >= MINIMUM_SUMMARY_OPTIONS ? verified.slice(0, MAXIMUM_SUMMARY_OPTIONS) : null,
    unsafe: false,
  };
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

  const slotResult = getVerifiedSlotOptions(mappings);
  if (slotResult.unsafe) return null;
  if (slotResult.items && (!best || slotResult.items.length > best.length)) {
    best = slotResult.items;
  }

  return best ? { items: best } : null;
}
