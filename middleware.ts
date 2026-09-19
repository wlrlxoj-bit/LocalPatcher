import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const locales = ['en', 'ko', 'ja', 'de', 'es'];
// LocalPatcher는 한국어를 기본 진입점으로 사용한다. 영어 원문은 FLiNG가 기준이며
// LocalPatcher의 대량 영어 URL을 기본 경로로 다시 만들지 않는다.
const defaultLocale = 'ko';

function getLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get('accept-language');
  if (!acceptLanguage) return defaultLocale;

  const languages = acceptLanguage.split(',').map((lang) => {
    const [locale, qValue] = lang.split(';');
    const weight = qValue ? parseFloat(qValue.split('=')[1]) : 1.0;
    return { locale: locale.trim().split('-')[0].toLowerCase(), weight };
  });

  languages.sort((a, b) => b.weight - a.weight);

  for (const { locale } of languages) {
    if (locales.includes(locale)) {
      return locale;
    }
  }

  return defaultLocale;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Do not intercept static files, Next.js internals, or API routes
  const publicPaths = ['/favicon.ico', '/icon.png', '/sitemap.xml', '/robots.txt'];
  if (
    publicPaths.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if the pathname is missing a supported locale
  const pathnameIsMissingLocale = locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);
    
    // 308 Permanent Redirect to the localized path
    const url = new URL(`/${locale}${pathname === '/' ? '' : pathname}`, request.url);
    if (request.nextUrl.search) {
      url.search = request.nextUrl.search;
    }
    
    return NextResponse.redirect(url, 308);
  }

  // Intercept legacy -trainer slugs and static aliases in /patcher/ routes
  const patcherMatch = pathname.match(/^\/([a-z]{2})\/patcher\/([^\/]+)$/);
  if (patcherMatch) {
    const [, locale, slug] = patcherMatch;
    let canonicalSlug = slug;

    // Static Aliases
    if (slug === 'elden-ring-shadow-of-the-erdtree' || slug.startsWith('elden-ring-shadow-of-the-erdtree-')) {
      canonicalSlug = 'elden-ring';
    } else if (/-trainer(-\d{6,})?$/.test(slug)) {
      canonicalSlug = slug.replace(/-trainer(-\d{6,})?$/, '');
    }

    if (canonicalSlug !== slug) {
      const cleanUrl = new URL(`/${locale}/patcher/${canonicalSlug}`, request.url);
      if (request.nextUrl.search) {
        cleanUrl.search = request.nextUrl.search;
      }
      return NextResponse.redirect(cleanUrl, 308);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except those starting with `_next`
    '/((?!_next).*)',
  ],
};
