import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { AUTO_LOCALIZATION_LOCALES, getPatcherSitemapSnapshotEntries } from '@/lib/content-eligibility';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = AUTO_LOCALIZATION_LOCALES;
  
  // snapshot 오류는 의도적으로 전파한다. 빈 sitemap을 발행하면 마지막 정상 ISR 결과를
  // 지워 대규모 색인 손실을 만들 수 있다. snapshot은 자동화가 완전 검증 뒤에만 갱신한다.
  const snapshotEntries = await getPatcherSitemapSnapshotEntries(locales);

  const sitemapEntries: MetadataRoute.Sitemap = [];

  // 2. Static pages for each locale
  const staticPaths = ['', '/terms', '/privacy', '/faq', '/guides', '/about', '/editorial-policy', '/contact'];
  
  for (const locale of locales) {
    for (const path of staticPaths) {
      sitemapEntries.push({
        url: `${SITE_URL}/${locale}${path}`,
        changeFrequency: 'daily',
        priority: path === '' ? 1.0 : 0.5,
      });
    }
  }

  // 3. Dynamic game detail pages for each locale
  for (const entry of snapshotEntries) {
    sitemapEntries.push({
      url: `${SITE_URL}/${entry.locale}/patcher/${entry.slug}`,
      lastModified: entry.contentUpdatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  return sitemapEntries;
}
