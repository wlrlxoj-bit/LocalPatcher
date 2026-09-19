import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { AUTO_LOCALIZATION_LOCALES, getEligiblePatcherSlugs } from '@/lib/content-eligibility';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = AUTO_LOCALIZATION_LOCALES;
  
  const eligibleSlugs = {} as Record<(typeof locales)[number], string[]>;
  for (const locale of locales) {
    try {
      eligibleSlugs[locale] = await getEligiblePatcherSlugs(locale);
    } catch (error) {
      // DB 장애 중에는 과거 snapshot을 재방출하지 않습니다. 미완성 페이지 유입을 막기 위한 fail-closed입니다.
      console.warn(`${locale} 동적 sitemap 조회에 실패하여 빈 목록으로 처리합니다:`, error);
      eligibleSlugs[locale] = [];
    }
  }

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
    for (const slug of eligibleSlugs[locale]) {
      sitemapEntries.push({
        url: `${SITE_URL}/${locale}/patcher/${slug}`,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  }

  return sitemapEntries;
}
