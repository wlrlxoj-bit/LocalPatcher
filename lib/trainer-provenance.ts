const ALLOWED_SOURCE_HOSTS = new Set(['flingtrainer.com', 'www.flingtrainer.com']);
const MAX_VERSION_HISTORY = 6;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .,+()_\-]{0,119}$/;
const TRAINER_PATH_PATTERN = /^\/trainer\/[a-z0-9][a-z0-9-]{0,199}\/?$/;
const OPTION_LINE_PATTERN = /^[ \t]*([A-Za-z0-9[\]+\-.,/ ]+?)\s*(?:-|:|—|–|→)\s+\S/gim;

export interface ProvenanceTrainerInput {
  id: unknown;
  version_str: unknown;
  original_file_hash: unknown;
  original_file_size: unknown;
  option_count: unknown;
}

export interface ProvenanceMappingInput {
  original_text: unknown;
  translated_text: unknown;
  is_approved: unknown;
}

export interface TrainerProvenance {
  sourceUrl?: string;
  latestVersion?: string;
  versionHistory?: string[];
  file?: {
    fingerprint: string;
    fileSize: string;
  };
  approvedOptionCount?: number;
}

function sanitizeVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return VERSION_PATTERN.test(normalized) && /\d/.test(normalized) ? normalized : null;
}

/** 표시용 버전 문자열과 별개로, 대소문자·공백 차이는 같은 이력으로 판정합니다. */
function getVersionKey(version: string): string {
  return version.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sanitizeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port ||
      !TRAINER_PATH_PATTERN.test(url.pathname) ||
      url.search ||
      url.hash
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getApprovedCoverage(mappings: ProvenanceMappingInput[], optionCount: number): boolean {
  if (!Number.isSafeInteger(optionCount) || optionCount <= 0 || optionCount > 1_000) return false;
  if (mappings.length === 0 || mappings.length > 1_000) return false;

  if (!mappings.every((mapping) =>
    mapping.is_approved === true &&
    typeof mapping.original_text === 'string' && mapping.original_text.length > 0 && mapping.original_text.length <= 50_000 &&
    typeof mapping.translated_text === 'string' && mapping.translated_text.length > 0 && mapping.translated_text.length <= 50_000,
  )) return false;

  const originalShortcuts: string[] = [];
  const translatedShortcuts: string[] = [];
  for (const mapping of mappings) {
    const collect = (value: string, target: string[]) => {
      OPTION_LINE_PATTERN.lastIndex = 0;
      for (const match of value.matchAll(OPTION_LINE_PATTERN)) {
        const shortcut = match[1]?.replace(/\s+/g, '').toLowerCase();
        if (shortcut) target.push(shortcut);
      }
    };
    collect(mapping.original_text as string, originalShortcuts);
    collect(mapping.translated_text as string, translatedShortcuts);
  }
  return originalShortcuts.length >= optionCount &&
    originalShortcuts.length === translatedShortcuts.length &&
    originalShortcuts.every((shortcut, index) => shortcut === translatedShortcuts[index]);
}

/**
 * 공개 가능한 수집 사실만 조합합니다. 출처, 버전 이력, 승인 매핑 범위, 파일 식별값은
 * 각각 독립적으로 검증하며, 확인된 사실이 둘 미만이면 어떤 정보도 렌더링하지 않습니다.
 */
export function getTrainerProvenance(input: {
  sourceUrl: unknown;
  trainers: ProvenanceTrainerInput[];
  latestMappings: ProvenanceMappingInput[];
}): TrainerProvenance | null {
  const sourceUrl = sanitizeSourceUrl(input.sourceUrl);
  const latestTrainer = input.trainers[0];
  if (!latestTrainer || !Number.isSafeInteger(latestTrainer.id) || (latestTrainer.id as number) <= 0) return null;

  const latestVersion = sanitizeVersion(latestTrainer.version_str);
  const hash = typeof latestTrainer.original_file_hash === 'string' ? latestTrainer.original_file_hash.trim() : '';
  const fileSize = latestTrainer.original_file_size;
  const optionCount = latestTrainer.option_count;
  const versionHistory: string[] = [];
  const versionKeys = new Set<string>();
  for (const trainer of input.trainers) {
    // 버전 이력도 공개 가능한 수집 사실이므로, 식별자가 검증된 레코드만 사용합니다.
    if (!Number.isSafeInteger(trainer.id) || (trainer.id as number) <= 0) continue;
    const version = sanitizeVersion(trainer.version_str);
    const versionKey = version ? getVersionKey(version) : null;
    if (version && versionKey && !versionKeys.has(versionKey)) {
      versionKeys.add(versionKey);
      versionHistory.push(version);
    }
    if (versionHistory.length === MAX_VERSION_HISTORY) break;
  }
  const validVersionHistory = latestVersion && versionHistory.length >= 2 &&
    getVersionKey(versionHistory[0]) === getVersionKey(latestVersion)
    ? versionHistory
    : undefined;
  const approvedOptionCount = getApprovedCoverage(input.latestMappings, optionCount as number)
    ? optionCount as number
    : undefined;
  const file = SHA256_PATTERN.test(hash) && Number.isSafeInteger(fileSize) &&
    (fileSize as number) > 0 && (fileSize as number) <= MAX_FILE_SIZE_BYTES
    ? {
      // 전체 SHA-256은 공개하지 않고 식별에 필요한 짧은 접두부만 보여 줍니다.
      fingerprint: `${hash.slice(0, 12).toLowerCase()}…`,
      fileSize: formatFileSize(fileSize as number),
    }
    : undefined;

  const factCount = Number(Boolean(sourceUrl)) + Number(Boolean(validVersionHistory)) +
    Number(approvedOptionCount !== undefined) + Number(Boolean(file));
  if (factCount < 2) return null;

  return {
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(validVersionHistory ? { latestVersion: validVersionHistory[0], versionHistory: validVersionHistory } : {}),
    ...(file ? { file } : {}),
    ...(approvedOptionCount !== undefined ? { approvedOptionCount } : {}),
  };
}
