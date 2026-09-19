const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const SITE_URL = (configuredSiteUrl || 'https://localpatcher.com').replace(/\/+$/, '');

export const SUPPORTED_LOCALES = ['ko', 'en', 'ja', 'de', 'es'] as const;
/** LocalPatcher가 자체 현지화 콘텐츠로 공개하는 언어입니다. 영어 원문은 FLiNG를 사용합니다. */
export const PUBLIC_LOCALIZATION_LOCALES = ['ko', 'ja', 'de', 'es'] as const;

export function localizedAlternates(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return {
    ko: `${SITE_URL}/ko${normalizedPath}`,
    ja: `${SITE_URL}/ja${normalizedPath}`,
    de: `${SITE_URL}/de${normalizedPath}`,
    es: `${SITE_URL}/es${normalizedPath}`,
    'x-default': `${SITE_URL}/ko${normalizedPath}`,
  };
}
