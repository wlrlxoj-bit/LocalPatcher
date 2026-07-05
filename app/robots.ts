import { MetadataRoute } from 'next';

export const revalidate = 86400;

export default function robots(): MetadataRoute.Robots {
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://local-patcher.vercel.app';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/_next/', '/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
