import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const revalidate = 86400;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Google이 페이지 렌더링에 필요한 Next.js 정적 리소스와 ko/ja/de/es 경로는 허용하고,
        // 내부 API·관리자·쿼리 파라미터 URL만 크롤링 대상에서 제외합니다.
        // (/en/* 페이지는 페이지 메타데이터에서 noindex, follow를 반환하므로 크롤링을 허용해야 색인 풀에서 정상 제거됩니다.)
        disallow: ['/api/', '/*/admin', '/*?*'],
      },
      {
        // AI 학습·SEO 스크래핑 봇의 대량 크롤링으로 인한 ISR/FOT 과다 소모를 차단합니다.
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'CCBot',
          'Bytespider',
          'ClaudeBot',
          'anthropic-ai',
          'PerplexityBot',
          'AhrefsBot',
          'SemrushBot',
          'MJ12bot',
          'DotBot',
        ],
        disallow: '/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
