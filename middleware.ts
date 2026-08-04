import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const locales = ['en', 'ko', 'ja', 'de', 'es'];
const defaultLocale = 'en'; // Global default for unsupported languages

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
    
    // 307 Temporary Redirect to the localized path
    const url = new URL(`/${locale}${pathname === '/' ? '' : pathname}`, request.url);
    if (request.nextUrl.search) {
      url.search = request.nextUrl.search;
    }
    
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except those starting with `_next`
    '/((?!_next).*)',
  ],
};
