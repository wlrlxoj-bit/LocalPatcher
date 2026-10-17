import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveStaticGameSlugAlias } from './lib/game-slug-aliases';

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

  // 정확히 등록된 과거 주소만 즉시 이동한다. 일반 별칭은 페이지에서 DB·제목 확인 후 처리한다.
  const patcherMatch = pathname.match(/^\/([a-z]{2})\/patcher\/([^\/]+)$/);
  if (patcherMatch) {
    const [, locale, slug] = patcherMatch;
    const canonicalSlug = resolveStaticGameSlugAlias(slug);

    if (canonicalSlug && canonicalSlug !== slug) {
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
