import { MetadataRoute } from 'next';
import { SITE_URL, SUPPORTED_LOCALES } from '@/lib/site';
import { getEligiblePatcherSlugs } from '@/lib/content-eligibility';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = SUPPORTED_LOCALES;
  
  const eligibleSlugs = {
    ko: await getEligiblePatcherSlugs('ko'),
    ja: await getEligiblePatcherSlugs('ja'),
  };

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
  for (const locale of ['ko', 'ja'] as const) {
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
