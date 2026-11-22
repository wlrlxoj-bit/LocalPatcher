import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { AUTO_LOCALIZATION_LOCALES, getPatcherSitemapSnapshotEntries } from '@/lib/content-eligibility';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = AUTO_LOCALIZATION_LOCALES;
  
  // snapshot 오류는 의도적으로 전파한다. 빈 sitemap을 발행하면 마지막 정상 ISR 결과를
  // 지워 대규모 색인 손실을 만들 수 있다. snapshot은 자동화가 완전 검증 뒤에만 갱신한다.
  const snapshotEntries = await getPatcherSitemapSnapshotEntries(locales);

  // 최근 검증·갱신된 게임이 사이트맵 상단에 노출되도록 최신 시각 내림차순으로 정렬한다.
  snapshotEntries.sort((left, right) => right.contentUpdatedAt.getTime() - left.contentUpdatedAt.getTime());

  // slug별 승인 언어 URL을 모아 각 패처 엔트리에 hreflang alternates를 부여한다.
  const patcherAlternatesBySlug = new Map<string, Record<string, string>>();
  for (const entry of snapshotEntries) {
    const languages = patcherAlternatesBySlug.get(entry.slug) ?? {};
    languages[entry.locale] = `${SITE_URL}/${entry.locale}/patcher/${entry.slug}`;
    patcherAlternatesBySlug.set(entry.slug, languages);
  }
  for (const languages of patcherAlternatesBySlug.values()) {
    const defaultUrl = languages.ko ?? Object.values(languages)[0];
    if (defaultUrl) {
      languages['x-default'] = defaultUrl;
    }
  }

  const sitemapEntries: MetadataRoute.Sitemap = [];

  // 2. Static pages for each locale
  const staticPaths = ['', '/terms', '/privacy', '/faq', '/guides', '/about', '/editorial-policy', '/contact'];
  
  for (const locale of locales) {
    for (const path of staticPaths) {
      const staticLanguages: Record<string, string> = Object.fromEntries(
        locales.map((candidate) => [candidate, `${SITE_URL}/${candidate}${path}`]),
      );
      staticLanguages['x-default'] = staticLanguages.ko ?? `${SITE_URL}/${locales[0]}${path}`;
      sitemapEntries.push({
        url: `${SITE_URL}/${locale}${path}`,
        changeFrequency: path === '' ? 'daily' : 'monthly',
        priority: path === '' ? 1.0 : (path === '/guides' || path === '/faq') ? 0.6 : 0.3,
        alternates: { languages: staticLanguages },
      });
    }
  }

  // 3. Dynamic game detail pages for each locale
  for (const entry of snapshotEntries) {
    const languages = patcherAlternatesBySlug.get(entry.slug);
    sitemapEntries.push({
      url: `${SITE_URL}/${entry.locale}/patcher/${entry.slug}`,
      lastModified: entry.contentUpdatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
      ...(languages ? { alternates: { languages } } : {}),
    });
  }

  return sitemapEntries;
}
