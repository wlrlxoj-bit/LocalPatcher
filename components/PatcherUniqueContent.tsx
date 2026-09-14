import React from 'react';
import { Languages, ListChecks } from 'lucide-react';
import type { Locale } from '@/lib/i18n/types';

interface PatcherUniqueContentProps {
  locale: Locale;
  gameTitle: string;
  gameTitleEn: string;
  description?: string;
  versions: string[];
  optionCount: number;
  genres: string[];
  tags: string[];
  translatedOptionCount: number;
  sourceUrl?: string;
}

const GAME_FACT_LABELS: Record<Locale, {
  title: string;
  description: string;
  versions: string;
  options: string;
  categories: string;
  translation: string;
  translated: string;
  original: string;
  unavailable: string;
}> = {
  ko: { title: '게임별 지원 정보', description: '게임 소개', versions: '지원 버전', options: '등록된 최신 트레이너 옵션 수', categories: '장르 및 태그', translation: '등록된 최신 트레이너 번역 상태', translated: '승인 번역', original: '영문 원문 제공', unavailable: '정보 없음' },
  en: { title: 'Game-specific support details', description: 'Game overview', versions: 'Supported versions', options: 'Latest listed trainer options', categories: 'Genres and tags', translation: 'Latest listed trainer translation', translated: 'Approved translations', original: 'English source available', unavailable: 'Not available' },
  ja: { title: 'ゲーム別サポート情報', description: 'ゲーム概要', versions: '対応バージョン', options: '登録済み最新トレーナーのオプション数', categories: 'ジャンルとタグ', translation: '登録済み最新トレーナーの翻訳状況', translated: '承認済み翻訳', original: '英語原文を提供', unavailable: '情報なし' },
  de: { title: 'Spielspezifische Unterstützung', description: 'Spielübersicht', versions: 'Unterstützte Versionen', options: 'Optionen des neuesten gelisteten Trainers', categories: 'Genres und Tags', translation: 'Übersetzung des neuesten gelisteten Trainers', translated: 'Bestätigte Übersetzungen', original: 'Englischer Originaltext verfügbar', unavailable: 'Keine Angaben' },
  es: { title: 'Compatibilidad específica del juego', description: 'Descripción del juego', versions: 'Versiones compatibles', options: 'Opciones del último trainer registrado', categories: 'Géneros y etiquetas', translation: 'Traducción del último trainer registrado', translated: 'Traducciones aprobadas', original: 'Texto original en inglés disponible', unavailable: 'Sin información' },
};

export default function PatcherUniqueContent({
  locale,
  gameTitle,
  gameTitleEn,
  description,
  versions,
  optionCount,
  genres,
  tags,
  translatedOptionCount,
  sourceUrl,
}: PatcherUniqueContentProps) {
  const labels = GAME_FACT_LABELS[locale] || GAME_FACT_LABELS.en;
  let officialSource: string | undefined;
  try {
    const url = new URL(sourceUrl || '');
    if (url.protocol === 'https:' && ['flingtrainer.com', 'www.flingtrainer.com'].includes(url.hostname) && !url.username && !url.password) {
      officialSource = url.href;
    }
  } catch { /* 유효한 공식 출처가 없으면 링크를 표시하지 않습니다. */ }
  const links = {
    ko: { source: 'FLiNG 원본 배포 페이지', guides: '사용 가이드', privacy: '개인정보처리방침' },
    en: { source: 'Original FLiNG release page', guides: 'Usage guides', privacy: 'Privacy policy' },
    ja: { source: 'FLiNG公式配布ページ', guides: '利用ガイド', privacy: 'プライバシーポリシー' },
    de: { source: 'Originale FLiNG-Veröffentlichung', guides: 'Anleitungen', privacy: 'Datenschutz' },
    es: { source: 'Página original de FLiNG', guides: 'Guías de uso', privacy: 'Privacidad' },
  }[locale];
  const categories = [...new Set([...genres, ...tags])].slice(0, 12);
  // 게임 설명은 등록 원문에 HTML이 포함될 수 있으므로, 서버 렌더링 정보 영역에는 텍스트만 노출합니다.
  const plainDescription = description?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  return (
    <div className="w-full max-w-5xl mx-auto mb-6 text-slate-300">
      <section className="bg-slate-900/60 border border-cyan-500/20 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <ListChecks className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 font-outfit">{gameTitle} — {labels.title}</h2>
            {gameTitle !== gameTitleEn && <p className="text-xs text-slate-500 mt-1">English title: {gameTitleEn}</p>}
          </div>
        </div>

        {plainDescription && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{labels.description}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{plainDescription}</p>
          </div>
        )}

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <dt className="text-xs text-slate-500 mb-1">{labels.versions}</dt>
            <dd className="text-sm text-slate-200">{versions.length > 0 ? versions.join(', ') : labels.unavailable}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <dt className="text-xs text-slate-500 mb-1">{labels.options}</dt>
            <dd className="text-sm text-slate-200">{optionCount > 0 ? optionCount.toLocaleString(locale) : labels.unavailable}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <dt className="text-xs text-slate-500 mb-1">{labels.categories}</dt>
            <dd className="text-sm text-slate-200">{categories.length > 0 ? categories.join(' · ') : labels.unavailable}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <dt className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Languages className="w-3.5 h-3.5" />{labels.translation}</dt>
            <dd className="text-sm text-slate-200">
              {translatedOptionCount > 0 ? `${labels.translated}: ${translatedOptionCount.toLocaleString(locale)}` : labels.original}
            </dd>
          </div>
        </dl>
      </section>

      <nav aria-label={labels.title} className="mt-3 flex flex-wrap gap-4 text-xs text-cyan-400">
        {officialSource && <a href={officialSource} target="_blank" rel="noopener noreferrer">{links.source}</a>}
        <a href={`/${locale}/guides`}>{links.guides}</a>
        <a href={`/${locale}/privacy`}>{links.privacy}</a>
      </nav>
    </div>
  );
}
