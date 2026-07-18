const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const SITE_URL = (configuredSiteUrl || 'https://localpatcher.com').replace(/\/+$/, '');

export const SUPPORTED_LOCALES = ['ko', 'en', 'ja'] as const;

export function localizedAlternates(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return {
    ko: `${SITE_URL}/ko${normalizedPath}`,
    en: `${SITE_URL}/en${normalizedPath}`,
    ja: `${SITE_URL}/ja${normalizedPath}`,
    'x-default': `${SITE_URL}/en${normalizedPath}`,
  };
}
