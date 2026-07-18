import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const revalidate = 86400;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/_next/', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
