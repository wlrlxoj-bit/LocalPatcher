import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { AUTO_LOCALIZATION_LOCALES, getEligiblePatcherSlugsByLocale } from '@/lib/content-eligibility';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = AUTO_LOCALIZATION_LOCALES;
  
  // 게임·트레이너 전체 조회는 언어마다 반복하지 않습니다. 언어별 승인 매핑만 병렬로
  // 확인하며, 조회 오류는 빈 목록으로 처리합니다. 미완성 URL은 재방출하지 않습니다.
  const eligibleSlugs = await getEligiblePatcherSlugsByLocale(locales);

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
  for (const locale of locales) {
    for (const slug of eligibleSlugs.get(locale) || []) {
      sitemapEntries.push({
        url: `${SITE_URL}/${locale}/patcher/${slug}`,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  }

  return sitemapEntries;
}
