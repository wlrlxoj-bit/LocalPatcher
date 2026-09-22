import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const revalidate = 86400;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Google이 페이지 렌더링에 필요한 Next.js 정적 리소스까지 가져올 수 있어야 합니다.
      // 내부 API만 크롤링 대상에서 제외합니다.
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
