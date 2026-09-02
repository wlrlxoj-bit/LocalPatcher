import Link from 'next/link';
import { getGameTitle, type Locale } from '@/lib/i18n';
import type { Game } from '@/lib/supabase';

interface PatcherLinkDirectoryProps {
  games: Game[];
  locale: Locale;
}

const LABELS: Record<Locale, { summary: string; count: string }> = {
  ko: { summary: '전체 지원 게임 링크', count: '개 게임' },
  en: { summary: 'All supported game links', count: 'games' },
  ja: { summary: '対応ゲームの全リンク', count: 'ゲーム' },
  de: { summary: 'Alle unterstützten Spiele', count: 'Spiele' },
  es: { summary: 'Todos los juegos compatibles', count: 'juegos' },
};

/**
 * 클라이언트 필터나 더보기 버튼과 무관하게 모든 패처 URL을 초기 HTML에 노출한다.
 * 카드와 이미지는 반복하지 않고 텍스트 링크만 사용해 문서 크기 증가를 제한한다.
 */
export default function PatcherLinkDirectory({ games, locale }: PatcherLinkDirectoryProps) {
  const labels = LABELS[locale];

  return (
    <details className="w-full max-w-5xl mt-12 rounded-xl border border-slate-800/70 bg-slate-900/30 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-300">
        {labels.summary} ({games.length.toLocaleString(locale)} {labels.count})
      </summary>
      <nav aria-label={labels.summary} className="mt-4 columns-1 sm:columns-2 lg:columns-3 gap-x-6">
        {games.map((game) => (
          <Link
            key={game.slug}
            href={`/${locale}/patcher/${game.slug}`}
            prefetch={false}
            className="block truncate py-1 text-xs text-slate-500 hover:text-cyan-400"
          >
            {getGameTitle(game, locale)}
          </Link>
        ))}
      </nav>
    </details>
  );
}
