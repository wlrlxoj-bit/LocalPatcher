import { MetadataRoute } from 'next';
import { SITE_URL, SUPPORTED_LOCALES } from '@/lib/site';
import { getEligiblePatcherSlugs } from '@/lib/content-eligibility';
import patchableSnapshot from '@/data/patchable-game-slugs.json';
import { canonicalizeListedGameSlug } from '@/lib/game-slug-aliases';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = SUPPORTED_LOCALES;
  
  const eligibleSlugs = {} as Record<(typeof locales)[number], string[]>;
  for (const locale of locales) {
    try {
      eligibleSlugs[locale] = await getEligiblePatcherSlugs(locale);
    } catch (error) {
      console.warn(`${locale} 동적 sitemap 조회에 실패하여 운영 last-known-good snapshot을 사용합니다:`, error);
      const snapshotSlugs = patchableSnapshot.locales[locale];
      const existingSlugs = new Set(snapshotSlugs);
      eligibleSlugs[locale] = [...new Set(
        snapshotSlugs.map((slug) => canonicalizeListedGameSlug(slug, existingSlugs))
      )];
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
