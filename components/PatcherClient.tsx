'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ArrowRight, AlertTriangle, Share2 } from 'lucide-react';
import { Locale, getDictionary } from '@/lib/i18n';
import DropZone from '@/components/DropZone';
import { trackAnalyticsEvent } from '@/lib/analytics';

interface Game {
  id: number;
  title_en: string;
  title_ko: string;
  title_ja?: string;
  slug: string;
  cover_image_url: string;
  anti_cheat: string;
  fling_url?: string;
}

interface Trainer {
  id: number;
  version_str: string;
  original_file_hash: string;
  original_file_size: number;
  option_count?: number;
}

interface Mapping {
  offset_dec: number;
  encoding: 'UTF-16LE' | 'ASCII' | 'UTF-8';
  original_text: string;
  translated_text: string;
  max_char_len: number;
}

interface PatcherClientProps {
  game: Game;
  trainers: Trainer[];
  // Map of trainerId -> mapping data
  mappingsMap: Record<number, Mapping[]>;
  locale: Locale;
}

interface PartnerStoreWidgetProps {
  game: Game;
  locale: Locale;
  t: any;
  trainerId?: number;
}

interface PriceData {
  original: number;
  current: number;
  discountPercent: number;
  dealId?: string | null;
}

interface PricesResponse {
  success: boolean;
  rates: Record<string, number>;
  stores: {
    steam: PriceData;
    gmg: PriceData | null;
    humble: PriceData | null;
    gog: PriceData | null;
  };
}

function PartnerStoreWidget({ game, locale, t, trainerId }: PartnerStoreWidgetProps) {
  const [prices, setPrices] = useState<PricesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currency, setCurrency] = useState<string>('USD');
  const widgetRef = useRef<HTMLDivElement>(null);
  const viewTrackedRef = useRef(false);

  const steamUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(game.title_en)}`;
  const gmgUrl = `https://www.greenmangaming.com/search?query=${encodeURIComponent(game.title_en)}`;
  const partnerKey = process.env.NEXT_PUBLIC_HUMBLE_PARTNER_KEY;
  const humbleUrl = partnerKey
    ? `https://www.humblebundle.com/store/search?sort=bestselling&search=${encodeURIComponent(game.title_en)}&partner=${partnerKey}`
    : `https://www.humblebundle.com/store/search?sort=bestselling&search=${encodeURIComponent(game.title_en)}`;
  const gogUrl = `https://www.gog.com/games?query=${encodeURIComponent(game.title_en)}`;

  useEffect(() => {
    let active = true;
    const fetchPrices = async () => {
      try {
        setLoading(true);
        const match = game.cover_image_url.match(/\/apps\/(\d+)\//);
        const steamAppId = match ? match[1] : '';
        const url = `/api/prices?gameId=${game.id}&title=${encodeURIComponent(game.title_en)}${steamAppId ? `&appid=${steamAppId}` : ''}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (active && data.success) {
            setPrices(data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch prices:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPrices();
    return () => {
      active = false;
    };
  }, [game.title_en, game.cover_image_url]);

  const hasRenderableOffer = Boolean(partnerKey) || Boolean(prices && Object.values(prices.stores).some(
    (store) => store !== null && Number.isFinite(store.current)
  ));

  useEffect(() => {
    const element = widgetRef.current;
    if (loading || !hasRenderableOffer || !element || viewTrackedRef.current || typeof IntersectionObserver === 'undefined') return;

    let visibleTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (!visibleTimer) {
          visibleTimer = setTimeout(() => {
            if (!viewTrackedRef.current) {
              viewTrackedRef.current = true;
              trackAnalyticsEvent('price_compare_viewed', {
                game_id: game.id,
                game_slug: game.slug,
                locale,
                trainer_id: trainerId || 0,
                placement: 'below_supported_builds',
                source_page: 'patcher',
              });
              observer.disconnect();
            }
          }, 1000);
        }
      } else if (visibleTimer) {
        clearTimeout(visibleTimer);
        visibleTimer = null;
      }
    }, { threshold: [0.5] });

    observer.observe(element);
    return () => {
      if (visibleTimer) clearTimeout(visibleTimer);
      observer.disconnect();
    };
  }, [game.id, game.slug, hasRenderableOffer, loading, locale, trainerId]);

  const formatPrice = (valueInUSD: number, targetCurrency: string, rates: Record<string, number>) => {
    const rate = rates[targetCurrency] || 1.0;
    const converted = valueInUSD * rate;
    
    if (targetCurrency === 'KRW') {
      return `₩${Math.round(converted).toLocaleString()}`;
    }
    if (targetCurrency === 'JPY') {
      return `¥${Math.round(converted).toLocaleString()}`;
    }
    if (targetCurrency === 'EUR') {
      return `€${converted.toFixed(2)}`;
    }
    return `$${converted.toFixed(2)}`;
  };

  // Determine best deal store
  let bestDealStore: 'steam' | 'gmg' | 'humble' | 'gog' | null = null;
  if (prices) {
    const { steam, gmg, humble, gog } = prices.stores;
    const activePrices: { store: 'steam' | 'gmg' | 'humble' | 'gog'; current: number }[] = [];
    
    if (steam !== null) activePrices.push({ store: 'steam', current: steam.current });
    if (gmg !== null) activePrices.push({ store: 'gmg', current: gmg.current });
    if (humble !== null) activePrices.push({ store: 'humble', current: humble.current });
    if (gog !== null) activePrices.push({ store: 'gog', current: gog.current });
    
    if (activePrices.length > 0) {
      activePrices.sort((a, b) => {
        if (a.current !== b.current) {
          return a.current - b.current; // 1차 정렬: 가격이 저렴한 순
        }
        // 2차 정렬: 가격이 완벽히 동가일 때, 수수료가 없는 스팀(steam)을 맨 뒤로 밀어냄
        if (a.store === 'steam') return 1;
        if (b.store === 'steam') return -1;
        return 0;
      });
      bestDealStore = activePrices[0].store;
    }
  }

  const rates = prices?.rates || { USD: 1, KRW: 1380, JPY: 155, EUR: 0.92 };

  const getStoreDisplayDetails = (storeName: 'steam' | 'gmg' | 'humble' | 'gog', fallbackUrl: string) => {
    if (loading) {
      return {
        priceStr: '...',
        originalStr: null as string | null,
        discountBadge: null as React.ReactNode,
        isBestDeal: false,
        url: fallbackUrl,
      };
    }

    if (!prices) {
      return {
        priceStr: t.viewDeal || 'View Deal',
        originalStr: null as string | null,
        discountBadge: null as React.ReactNode,
        isBestDeal: false,
        url: fallbackUrl,
      };
    }

    const priceInfo = prices.stores[storeName];
    if (priceInfo === null) {
      return {
        priceStr: t.noPriceInfo || 'Check Price (Storefront)',
        originalStr: null as string | null,
        discountBadge: null as React.ReactNode,
        isBestDeal: false,
        url: fallbackUrl,
      };
    }
    const isBestDeal = bestDealStore === storeName;
    const priceStr = formatPrice(priceInfo.current, currency, rates);
    const originalStr = priceInfo.discountPercent > 0 ? formatPrice(priceInfo.original, currency, rates) : null;
    const discountBadge = priceInfo.discountPercent > 0 ? (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-450 border border-rose-500/30">
        -{priceInfo.discountPercent}%
      </span>
    ) : null;

    return {
      priceStr,
      originalStr,
      discountBadge,
      isBestDeal,
      url: fallbackUrl,
    };
  };

  const storesList = [
    {
      key: 'steam' as const,
      name: 'Steam Store',
      ...getStoreDisplayDetails('steam', steamUrl),
      badge: <span className="text-xs text-slate-500 mt-1 block">{t.steamBadge}</span>,
      normalBorder: 'border-slate-800/80 bg-slate-900/25 hover:bg-slate-900/40 hover:border-slate-700',
      normalBtn: 'text-slate-300 hover:text-white border-slate-700 hover:border-slate-600 bg-slate-950/20 hover:bg-slate-950/40',
      neonBorder: 'border-slate-700 bg-slate-900/35',
      neonBtn: 'text-cyan-300 border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-950/35',
    },
    {
      key: 'gmg' as const,
      name: 'Green Man Gaming',
      ...getStoreDisplayDetails('gmg', gmgUrl),
      badge: <span className="text-xs text-cyan-400 font-medium mt-1 block">{t.gmgBadge}</span>,
      normalBorder: 'border-slate-800/80 bg-slate-900/25 hover:bg-slate-900/40 hover:border-slate-700',
      normalBtn: 'text-emerald-400 hover:text-emerald-300 border-emerald-500/20 hover:border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/40',
      neonBorder: 'border-slate-700 bg-slate-900/35',
      neonBtn: 'text-emerald-300 border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/35',
    },
    {
      key: 'humble' as const,
      name: 'Humble Store',
      ...getStoreDisplayDetails('humble', humbleUrl),
      badge: <span className="text-xs text-emerald-400 font-medium mt-1 block">{t.humbleBadge}</span>,
      normalBorder: 'border-slate-800/80 bg-slate-900/25 hover:bg-slate-900/40 hover:border-slate-700',
      normalBtn: 'text-cyan-400 hover:text-cyan-300 border-cyan-500/20 hover:border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/40',
      neonBorder: 'border-slate-700 bg-slate-900/35',
      neonBtn: 'text-cyan-300 border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-950/35',
    },
    {
      key: 'gog' as const,
      name: 'GOG.com',
      ...getStoreDisplayDetails('gog', gogUrl),
      badge: <span className="text-xs text-purple-400 font-medium mt-1 block">{t.gogBadge}</span>,
      normalBorder: 'border-slate-800/80 bg-slate-900/25 hover:bg-slate-900/40 hover:border-slate-700',
      normalBtn: 'text-purple-400 hover:text-purple-300 border-purple-500/20 hover:border-purple-500/40 bg-purple-950/20 hover:bg-purple-950/40',
      neonBorder: 'border-slate-700 bg-slate-900/35',
      neonBtn: 'text-purple-300 border-purple-500/30 bg-purple-950/20 hover:bg-purple-950/35',
    }
  ];

  const filteredStoresList = storesList;

  if (loading || !hasRenderableOffer) return null;

  const trackMerchantClick = (merchant: 'steam' | 'gmg' | 'humble' | 'gog') => {
    const affiliate = merchant === 'humble' && Boolean(partnerKey);
    const parameters = {
      game_id: game.id,
      game_slug: game.slug,
      locale,
      trainer_id: trainerId || 0,
      merchant,
      affiliate,
      placement: 'below_supported_builds',
      source_page: 'patcher',
    };
    trackAnalyticsEvent('merchant_clicked', parameters);
    if (affiliate) trackAnalyticsEvent('affiliate_merchant_clicked', parameters);
  };

  return (
    <div ref={widgetRef} className="relative mt-8 rounded-2xl border border-slate-800 bg-slate-950/40 p-5 sm:p-6 overflow-hidden flex flex-col gap-4">
      
      <div className="z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left">
        <div>
          <h3 className="text-base font-bold text-slate-200 font-outfit">
            {locale === 'ko' ? '게임 판매처 가격 확인' : locale === 'ja' ? 'ゲーム販売ストアの価格を確認' : 'Check game store prices'}
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
            {locale === 'ko' ? '패치 작업과 별개인 외부 판매처 정보입니다. 일부 링크는 사이트 운영에 도움이 되는 제휴 링크일 수 있습니다.' : locale === 'ja' ? 'パッチ機能とは別の外部ストア情報です。一部のリンクはサイト運営を支援するアフィリエイトリンクの場合があります。' : 'These external store links are separate from the patcher. Some may be affiliate links that help support the site.'}
          </p>
        </div>
        
        {/* Currency Selector */}
        <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
          {['USD', 'KRW', 'JPY', 'EUR'].map((cur) => (
            <button
              key={cur}
              onClick={() => setCurrency(cur)}
              className={`px-2 py-1 rounded-md transition-all ${
                currency === cur 
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {cur}
            </button>
          ))}
        </div>
      </div>
      
      <div className="z-10 grid grid-cols-1 gap-3">
        {filteredStoresList.map((store) => {
          const cardStyle = store.isBestDeal ? store.neonBorder : store.normalBorder;
          const btnStyle = store.isBestDeal ? store.neonBtn : store.normalBtn;
          
          return (
            <div
              key={store.name}
              className={`relative flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border transition-all duration-300 gap-3 ${cardStyle}`}
            >
              {/* Best Deal neon badge */}
              {store.isBestDeal && (
                <div className="absolute -top-2.5 right-4 px-2 py-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded text-[9px] font-black tracking-wider uppercase shadow-[0_0_10px_rgba(16,185,129,0.5)] flex items-center gap-1">
                  <span>🔥 BEST PRICE</span>
                </div>
              )}
              
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white font-outfit">{store.name}</span>
                  {store.discountBadge}
                </div>
                {store.badge}
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex flex-col text-right font-mono pr-2">
                  {store.originalStr && (
                    <span className="text-[10px] text-slate-500 line-through">
                      {store.originalStr}
                    </span>
                  )}
                  <span className={`text-sm font-bold ${store.isBestDeal ? 'text-emerald-300' : 'text-slate-300'}`}>
                    {store.priceStr}
                  </span>
                </div>
                <a
                  href={store.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackMerchantClick(store.key)}
                  aria-label={`${store.name} - ${store.priceStr}`}
                  className={`inline-flex items-center justify-center px-4 py-2 rounded-lg border text-xs font-bold transition-all duration-200 shrink-0 w-full sm:w-auto ${btnStyle}`}
                >
                  {store.key === 'steam' ? (t.goToSteam || 'Go to Steam ↗') : (t.viewDeal || 'View Deal')}
                </a>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="z-10 text-[10px] text-slate-500 leading-relaxed text-left border-t border-slate-900/60 pt-3 font-sans">
        {t.priceDisclaimer}
      </div>
    </div>
  );
}

export default function PatcherClient({ game, trainers, mappingsMap, locale }: PatcherClientProps) {
  const sortedTrainers = [...trainers].sort((a, b) => b.id - a.id);
  const t = getDictionary(locale);
  const displayTitle = locale === 'ko' ? game.title_ko : locale === 'ja' ? (game.title_ja || game.title_en) : game.title_en;
  // Set default selected trainer version
  const [selectedTrainerId, setSelectedTrainerId] = useState<number>(
    sortedTrainers.length > 0 ? sortedTrainers[0].id : 0
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const patcherViewTrackedRef = useRef(false);
  const patcherSectionRef = useRef<HTMLDivElement>(null);

  const selectedTrainer = sortedTrainers.find(t => t.id === selectedTrainerId);

  useEffect(() => {
    const element = patcherSectionRef.current;
    if (!element || patcherViewTrackedRef.current || typeof IntersectionObserver === 'undefined') return;

    let visibleTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 1) {
        if (!visibleTimer) {
          visibleTimer = setTimeout(() => {
            if (!patcherViewTrackedRef.current) {
              patcherViewTrackedRef.current = true;
              trackAnalyticsEvent('patcher_viewed', {
                game_id: game.id,
                game_slug: game.slug,
                locale,
                trainer_id: selectedTrainerId,
                source_page: 'patcher',
              });
              observer.disconnect();
            }
          }, 1000);
        }
      } else if (visibleTimer) {
        clearTimeout(visibleTimer);
        visibleTimer = null;
      }
    }, { threshold: [1] });

    observer.observe(element);
    return () => {
      if (visibleTimer) clearTimeout(visibleTimer);
      observer.disconnect();
    };
  }, [game.id, game.slug, locale, selectedTrainerId]);

  const startGuide = locale === 'ko'
    ? {
        eyebrow: '처음이신가요?', title: '3단계로 바로 시작하세요',
        description: '원본 트레이너를 준비한 뒤 변환기에 넣으면 한국어 패치 파일을 받을 수 있습니다.',
        steps: ['FLiNG에서 원본 트레이너(.exe) 받기', '아래 파일 변환기에 .exe 올리기', '받은 ZIP을 압축 해제해 실행하기'],
        fling: 'FLiNG 공식 원본 다운로드', guide: '전체 작동 가이드 보기', missingFling: '이 게임의 FLiNG 공식 링크가 아직 등록되지 않았습니다.',
        zipNotice: 'ZIP 압축 비밀번호는 11111111입니다. 트레이너 특성상 백신이 오진할 수 있습니다.',
      }
    : locale === 'ja'
      ? {
          eyebrow: '初めてですか？', title: '3ステップですぐに始められます',
          description: '元のトレーナーを用意して変換ツールに入れると、日本語パッチ済みファイルを受け取れます。',
          steps: ['FLiNGから元のトレーナー（.exe）を入手', '下のファイル変換ツールに.exeをアップロード', 'ダウンロードしたZIPを展開して実行'],
          fling: 'FLiNG公式から元ファイルを入手', guide: '詳しい操作ガイドを見る', missingFling: 'このゲームのFLiNG公式リンクはまだ登録されていません。',
          zipNotice: 'ZIPのパスワードは11111111です。トレーナーの特性上、ウイルス対策ソフトが誤検知する場合があります。',
        }
      : {
          eyebrow: 'New here?', title: 'Get started in 3 simple steps',
          description: 'Download the original trainer, upload it to the converter, then extract and run the converted file.',
          steps: ['Download the original trainer (.exe) from FLiNG', 'Upload the .exe to the converter below', 'Extract the downloaded ZIP and run the trainer'],
          fling: 'Download from FLiNG Official', guide: 'View the full guide', missingFling: 'The official FLiNG link for this game has not been registered yet.',
          zipNotice: 'ZIP password: 11111111. Antivirus software may flag trainer files incorrectly.',
        };

  const partnerKey = process.env.NEXT_PUBLIC_HUMBLE_PARTNER_KEY;
  const purchaseUrl = partnerKey
    ? `https://www.humblebundle.com/store/search?search=${encodeURIComponent(game.title_en)}&partner=${partnerKey}`
    : `https://store.steampowered.com/search/?term=${encodeURIComponent(game.title_en)}`;

  const handleTrainerDetected = (id: number) => {
    setSelectedTrainerId(id);
  };

  /** FLiNG 원본 링크의 위치별 클릭만 집계하며, 사용자 파일이나 개인 정보는 보내지 않습니다. */
  const handleFlingDownloadClick = (placement: 'header' | 'start_guide' | 'unsupported_trainer') => {
    trackAnalyticsEvent('fling_download_clicked', {
      game_id: game.id,
      game_slug: game.slug,
      locale,
      trainer_id: selectedTrainerId,
      placement,
      source_page: 'patcher',
    });
  };

  const handleShare = () => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    let promoText = '';
    
    if (locale === 'ko') {
      promoText = `🎮 [${game.title_ko}] LocalPatcher 로컬 한글 변환 완료!\n선택한 파일을 서버에 업로드하지 않고 브라우저에서 번역 패치를 적용했습니다.\n🔗 ${currentUrl}`;
    } else if (locale === 'ja') {
      promoText = `🎮 [${game.title_ja || game.title_en}] LocalPatcherでローカル日本語変換が完了!\n選択したファイルをサーバーへアップロードせず、ブラウザ内で翻訳パッチを適用しました。\n🔗 ${currentUrl}`;
    } else {
      promoText = `🎮 [${game.title_en}] LocalPatcher local language conversion complete!\nThe selected file was patched locally in the browser without being uploaded to the server.\n🔗 ${currentUrl}`;
    }
    
    navigator.clipboard.writeText(promoText)
      .then(() => {
        alert(t.shareSuccess);
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
      });
  };

  if (locale === 'en') {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col">
        {/* Back button */}
        <div className="mb-6">
          <Link 
            href={`/${locale}`}
            className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{t.backToList}</span>
          </Link>
        </div>

        {/* Game Details Banner */}
        <div className="relative rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start justify-between gap-6 mb-6">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-indigo-500/5 pointer-events-none"></div>
          
          {/* Game Specs */}
          <div className="flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-4 z-10">
            <div 
              className="w-20 h-28 bg-slate-800 rounded-xl bg-cover bg-center border border-slate-700/50 shadow-md shrink-0"
              style={{ backgroundImage: `url(${game.cover_image_url})` }}
            />
            <div className="pt-1">
              <h1 className="text-xl md:text-2xl font-bold text-white font-outfit">{displayTitle}</h1>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-mono">Original Game: {game.title_en}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="z-10 flex flex-col items-center md:items-end justify-center gap-2 shrink-0">
            <button
              onClick={handleShare}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-all duration-200 shadow-sm cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{t.shareBtn}</span>
            </button>
          </div>
        </div>

        {/* Secondary Clean Card for original FLiNG download */}
        <div className="relative rounded-xl border border-slate-800 bg-slate-900/30 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 mb-8 shadow-md">
          <div className="flex flex-col text-center md:text-left gap-1">
            <h3 className="text-lg font-bold text-white font-outfit">
              Official English Trainer Download
            </h3>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              You do not need to patch the trainer into English since it is already in English. Download the official, original trainer directly from FLiNG&apos;s webpage.
            </p>
          </div>

          <a
            href={game.fling_url || 'https://flingtrainer.com/'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => handleFlingDownloadClick('header')}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-cyan-500/30 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all duration-200 shrink-0"
          >
            Go to FLiNG Official Download Page ↗
          </a>
        </div>

        {/* Supported Trainer Builds */}
        <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
          
          <h5 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
            {t.supportedBuilds}
          </h5>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider font-mono">
                  <th className="py-3 px-4 font-semibold">{t.buildVersion}</th>
                  <th className="py-3 px-4 font-semibold">{t.fileSize}</th>
                  <th className="py-3 px-4 font-semibold text-center">{t.cheatCountLabel}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t.statusLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-xs">
                {sortedTrainers.map((t_option) => (
                  <tr key={t_option.id} className="hover:bg-slate-800/10 transition-colors group">
                    <td className="py-3.5 px-4 font-semibold text-slate-300 group-hover:text-cyan-400 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 font-mono text-[10px] bg-slate-800/40 px-1.5 py-0.5 rounded">ID: {t_option.id}</span>
                        <span>{t_option.version_str}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">
                      {t_option.original_file_size ? `${(t_option.original_file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                      {t_option.option_count ? t.cheatCountText.replace('{count}', String(t_option.option_count || 0)) : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                        {t.autoDetectable}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <PartnerStoreWidget game={game} locale={locale} t={t} trainerId={selectedTrainerId} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col">
      
      {/* Back button */}
      <div className="mb-6">
        <Link 
          href={`/${locale}`}
          className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t.backToList}</span>
        </Link>
      </div>

      {/* Game Details Banner */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start justify-between gap-6 mb-6">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-indigo-500/5 pointer-events-none"></div>
        
        {/* Game Specs */}
        <div className="flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-4 z-10">
          <div 
            className="w-20 h-28 bg-slate-800 rounded-xl bg-cover bg-center border border-slate-700/50 shadow-md shrink-0"
            style={{ backgroundImage: `url(${game.cover_image_url})` }}
          />
          <div className="pt-1">
            <h1 className="text-xl md:text-2xl font-bold text-white font-outfit">{displayTitle}</h1>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-mono">Original Game: {game.title_en}</p>
          </div>
        </div>

        {/* Anti-cheat status, official download link, and purchase link */}
        <div className="z-10 flex flex-col items-center md:items-end justify-center gap-2 shrink-0">
          {game.anti_cheat && game.anti_cheat !== 'none' && (
            <Link
              href={`/${locale}/guides`}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-all duration-200"
            >
              <span>{t.bypassGuide.replace('{antiCheat}', game.anti_cheat)}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}

          {game.fling_url && (
            <a
              href={game.fling_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleFlingDownloadClick('header')}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-all duration-200"
            >
              <span>{
                locale === 'ko' 
                  ? 'FLiNG 공식 다운로드 ↗' 
                  : locale === 'ja' 
                    ? 'FLiNG公式ダウンロード ↗' 
                    : 'FLiNG Official Download ↗'
              }</span>
            </a>
          )}

          <button
            onClick={handleShare}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-all duration-200 shadow-sm cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{t.shareBtn}</span>
          </button>
        </div>
      </div>

      {/* Main Patcher Area */}
      {selectedTrainer ? (() => {
        const isUnpatchable = selectedTrainer.option_count === 0 || (mappingsMap[selectedTrainer.id] || []).length === 0;
        return (
          <div className="space-y-6">
            {isUnpatchable ? (
              <div className="w-full p-6 rounded-xl border border-rose-500/25 bg-rose-950/15 text-rose-300 flex flex-col md:flex-row items-center md:items-start gap-4 shadow-[0_0_30px_rgba(244,63,94,0.05)]">
                <AlertTriangle className="w-8 h-8 shrink-0 text-rose-500 mt-0.5" />
                <div className="flex-1 text-center md:text-left">
                  <h3 className="font-bold text-lg text-white mb-2 font-outfit">
                    {locale === 'ko' ? '한글 패치 미지원 안내' : locale === 'ja' ? 'パッチ非対応のお知らせ' : 'Patch Unavailable Notice'}
                  </h3>
                  <p className="text-sm leading-relaxed text-rose-200/80 mb-4">
                    {locale === 'ko' 
                      ? '본 게임의 트레이너는 내부 리소스가 압축 및 암호화(난독화)되어 있어 현재 웹상에서 한글 패치를 적용할 수 없습니다. 대신 공식 영문판 트레이너를 이용해 주시기 바랍니다.' 
                      : locale === 'ja' 
                        ? '本ゲームのトレーナーはリソースが暗号化されているため、日本語パッチを適用できません。公式の英語版をご利用ください。' 
                        : 'This trainer is encrypted/compressed and currently cannot be patched into Local Language. Please download and use the official English version.'}
                  </p>
                  <a
                    href={game.fling_url || 'https://flingtrainer.com/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleFlingDownloadClick('unsupported_trainer')}
                    className="inline-flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white font-bold px-4 py-2 rounded-xl shadow-lg shadow-rose-500/20 transition-all duration-200"
                  >
                    {locale === 'ko' 
                      ? 'FLiNG 공식 다운로드 페이지 이동 ↗' 
                      : locale === 'ja' 
                        ? 'FLiNG公式ダウンロードへ ↗' 
                        : 'Go to FLiNG Official Download ↗'}
                  </a>
                </div>
              </div>
            ) : (
              <>
                {locale !== 'ko' && locale !== 'ja' && (
                  <div className="w-full p-4 rounded-xl border border-amber-500/20 bg-amber-950/20 text-amber-400 text-xs sm:text-sm flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      {locale === 'ja' ? (
                        "【翻訳対応言語に関するお知らせ】現在、パッチによる翻訳は「韓国語(ko)」のみサポートされています。本ページでパッチを適用すると、トレーナーのテキストが韓国語に翻訳されます。日本語は今後対応予定です。"
                      ) : (
                        "【Translation Support Notice】Currently, the translation patch only supports Korean (ko) and Japanese (ja). Applying the patch on this trainer will localize the option descriptions. English and other languages are planned for future updates."
                      )}
                    </div>
                  </div>
                )}

                <section aria-labelledby="patcher-start-guide-title" className="rounded-2xl border border-cyan-500/35 bg-gradient-to-br from-cyan-950/35 via-slate-900/70 to-indigo-950/30 p-5 sm:p-6 shadow-[0_0_30px_rgba(6,182,212,0.12)]">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-[3fr_2fr] md:items-center">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-400">{startGuide.eyebrow}</p>
                      <h2 id="patcher-start-guide-title" className="mt-2 text-xl font-bold text-white font-outfit sm:text-2xl">{startGuide.title}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">{startGuide.description}</p>
                      <ol className="mt-5 grid gap-3">
                        {startGuide.steps.map((step, index) => (
                          <li key={step} className="flex items-center gap-3 text-sm text-slate-200">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/15 font-bold text-cyan-300">{index + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-300/90">{startGuide.zipNotice}</p>
                    </div>
                    <div className="flex w-full flex-col gap-3">
                      {game.fling_url ? (
                        <a href={game.fling_url} target="_blank" rel="noopener noreferrer" onClick={() => handleFlingDownloadClick('start_guide')} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-center text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
                          {startGuide.fling}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </a>
                      ) : (
                        <p className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-center text-xs leading-relaxed text-slate-400">{startGuide.missingFling}</p>
                      )}
                      <Link href={`/${locale}/guides`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-950/40 px-5 py-3 text-center text-sm font-semibold text-slate-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
                        {startGuide.guide}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </section>

                <div ref={patcherSectionRef} className="h-px w-full" aria-hidden="true" />
                <DropZone 
                  locale={locale} 
                  gameId={game.id}
                  gameSlug={game.slug}
                  trainer={selectedTrainer}
                  allTrainers={sortedTrainers}
                  mappingsMap={mappingsMap}
                  onTrainerDetected={handleTrainerDetected}
                />
              </>
            )}

            {/* Supported Trainer Builds */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
              
              <h5 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                {t.supportedBuilds}
              </h5>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider font-mono">
                      <th className="py-3 px-4 font-semibold">{t.buildVersion}</th>
                      <th className="py-3 px-4 font-semibold">{t.fileSize}</th>
                      <th className="py-3 px-4 font-semibold text-center">{t.cheatCountLabel}</th>
                      <th className="py-3 px-4 font-semibold text-right">{t.statusLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-xs">
                    {sortedTrainers.map((t_option) => (
                      <tr key={t_option.id} className="hover:bg-slate-800/10 transition-colors group">
                        <td className="py-3.5 px-4 font-semibold text-slate-300 group-hover:text-cyan-400 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-600 font-mono text-[10px] bg-slate-800/40 px-1.5 py-0.5 rounded">ID: {t_option.id}</span>
                            <span>{t_option.version_str}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono">
                          {t_option.original_file_size ? `${(t_option.original_file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                          {t_option.option_count ? t.cheatCountText.replace('{count}', String(t_option.option_count || 0)) : 'N/A'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                            {t.autoDetectable}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-5" aria-labelledby="trainer-preview-heading">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="trainer-preview-heading" className="text-sm font-bold text-slate-200">
                    {locale === 'ko' ? '번역 옵션 미리보기' : locale === 'ja' ? '翻訳オプションのプレビュー' : 'Translation option preview'}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {locale === 'ko'
                      ? `지원 옵션 ${selectedTrainer.option_count || (mappingsMap[selectedTrainer.id] || []).length}개를 변환 전에 확인할 수 있습니다.`
                      : locale === 'ja'
                        ? `対応する${selectedTrainer.option_count || (mappingsMap[selectedTrainer.id] || []).length}個のオプションを変換前に確認できます。`
                        : `Review ${selectedTrainer.option_count || (mappingsMap[selectedTrainer.id] || []).length} supported options before converting.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen((open) => !open)}
                  aria-expanded={isPreviewOpen}
                  aria-controls="trainer-ui-preview"
                  className="min-h-10 shrink-0 rounded-lg border border-slate-700 bg-slate-950/40 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  {isPreviewOpen
                    ? (locale === 'ko' ? '미리보기 접기' : locale === 'ja' ? 'プレビューを閉じる' : 'Hide preview')
                    : (locale === 'ko' ? '전체 미리보기 펼치기' : locale === 'ja' ? '全体プレビューを開く' : 'Show full preview')}
                </button>
              </div>
              {isPreviewOpen && (
                <div id="trainer-ui-preview">
                  <TrainerUIPreview
                    game={game}
                    trainer={selectedTrainer}
                    mappings={mappingsMap[selectedTrainer.id] || []}
                    locale={locale}
                  />
                </div>
              )}
            </section>

            <PartnerStoreWidget game={game} locale={locale} t={t} trainerId={selectedTrainerId} />

          </div>
        );
      })() : (
        <div className="py-12 text-center text-slate-500">
          {t.noTrainerVersion}
        </div>
      )}

    </div>
  );
}

interface CheatOption {
  id: string;
  hotkey: string;
  label: string;
  notes: string[];
  isHeader: boolean;
  type: 'toggle' | 'slider' | 'input';
}

function parseMappings(translatedText: string): CheatOption[] {
  const lines = translatedText.split('\n');
  const result: CheatOption[] = [];
  let lastCheat: CheatOption | null = null;

  const hotkeyRegex = /^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*(.*)$/;

  const checkHeader = (line: string): boolean => {
    const headers = [
      '스탯 에디터', 'edit player stats', 'hotkey guide', '단축키 안내', '게임 감지', '게임 실행 중', '경고', '주의'
    ];
    const lower = line.toLowerCase();
    if (headers.some(h => lower.includes(h))) return true;
    if (line.length < 15 && !line.startsWith('*') && !line.startsWith('-')) return true;
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const match = line.match(hotkeyRegex);
    if (match) {
      const hotkey = match[1].trim();
      let label = match[2].trim();
      const notes: string[] = [];

      if (label.includes('**')) {
        const parts = label.split('**');
        label = parts[0].trim();
        const noteText = parts.slice(1).join('**').trim();
        if (noteText) notes.push(noteText);
      }

      // Determine control type
      let type: 'toggle' | 'slider' | 'input' = 'toggle';
      if (/배율|속도|Multiplier|Speed/i.test(label)) {
        type = 'slider';
      } else if (/편집|에디트|수치|Edit|Points|Level/i.test(label)) {
        type = 'input';
      }

      lastCheat = {
        id: `cheat-${i}`,
        hotkey,
        label,
        notes,
        isHeader: false,
        type
      };
      result.push(lastCheat);
    } else {
      if (checkHeader(line)) {
        lastCheat = null;
        result.push({
          id: `header-${i}`,
          hotkey: '',
          label: line,
          notes: [],
          isHeader: true,
          type: 'toggle'
        });
      } else if (lastCheat) {
        // Treat as note for last cheat
        const noteText = line.replace(/^\*\*|^\*|^-/, '').trim();
        if (noteText) lastCheat.notes.push(noteText);
      } else {
        // Fallback to header if no last cheat
        result.push({
          id: `header-${i}`,
          hotkey: '',
          label: line,
          notes: [],
          isHeader: true,
          type: 'toggle'
        });
      }
    }
  }

  return result;
}

interface TrainerUIPreviewProps {
  game: Game;
  trainer: Trainer;
  mappings: Mapping[];
  locale: Locale;
}

function TrainerUIPreview({ game, trainer, mappings, locale }: TrainerUIPreviewProps) {
  if (!mappings || mappings.length === 0) {
    return (
      <div className="mt-6 p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden text-center text-xs text-slate-500">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>
        한글 번역 매핑 정보가 등록되지 않아 트레이너 미리보기를 표시할 수 없습니다.
      </div>
    );
  }

  // Find the cheat list mapping
  const cheatMapping = mappings.find(m => 
    m.translated_text.includes('Num 1') || 
    m.translated_text.includes('Ctrl+Num') ||
    m.translated_text.includes('Alt+Num')
  ) || mappings[0];

  const cheats = cheatMapping ? parseMappings(cheatMapping.translated_text) : [];

  return (
    <div className="mt-6 p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden shadow-[0_0_25px_rgba(6,182,212,0.05)]">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
      
      <h5 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
        {locale === 'ko' ? '한글 번역 치트 옵션 목록 미리보기' : locale === 'ja' ? '翻訳チートオプション一覧プレビュー' : 'Translated Cheat Options Preview'}
      </h5>
      
      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
        {locale === 'ko'
          ? '아래는 한글화 패치 적용 시 트레이너에 표시되는 번역된 치트 옵션 명칭과 단축키 목록입니다. 실제 게임에는 영향을 주지 않으며, 패치 전에 어떤 한글 번역 항목들이 포함되어 있는지 미리 확인하는 용도입니다.'
          : locale === 'ja'
            ? '以下は韓国語パッチ適用時にトレーナーに表示される翻訳されたチートオプション名とホットキーの一覧です。実際のゲームには影響を与えません。'
            : 'Below is a list of translated cheat option names and hotkeys that will appear in the trainer after applying the localization patch. This does not affect the actual game.'
        }
      </p>

      {/* Static Trainer Preview Container */}
      <div className="max-w-2xl mx-auto rounded-xl border border-slate-700/50 bg-[#16181d] shadow-2xl overflow-hidden font-sans text-slate-300 text-sm select-none">
        
        {/* Title Bar */}
        <div className="bg-[#0f1115] px-4 py-2 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="bg-red-600 text-white font-black px-1.5 py-0.5 rounded text-[10px] tracking-tighter select-none font-mono">FLiNG</span>
            <span className="text-xs font-semibold text-slate-400 font-mono truncate max-w-[320px] sm:max-w-[450px]">
              {game.title_en} {trainer.version_str} Trainer - FLiNG
            </span>
          </div>
          <div className="flex items-center space-x-3 text-slate-600 text-xs">
            <span>_</span>
            <span>▢</span>
            <span className="font-bold">✕</span>
          </div>
        </div>

        {/* Header Banner */}
        <div className="relative h-28 bg-[#181a20] overflow-hidden flex items-center px-6 border-b border-slate-800">
          <div className="absolute inset-0 bg-gradient-to-r from-[#16181d] via-[#16181d]/85 to-transparent z-10"></div>
          {/* Game cover background blurred */}
          <div 
            className="absolute right-0 top-0 bottom-0 w-1/2 bg-cover bg-center opacity-30 blur-[1px]"
            style={{ backgroundImage: `url(${game.cover_image_url})` }}
          />
          
          <div className="z-10 py-3">
            <h4 className="text-base sm:text-lg font-bold text-white font-outfit drop-shadow-md">
              {locale === 'ko' ? game.title_ko : locale === 'ja' ? (game.title_ja || game.title_en) : game.title_en}
            </h4>
            <p className="text-slate-400 text-xs mt-1 font-mono">{trainer.version_str}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded font-semibold">
                KOREAN EDITION
              </span>
            </div>
          </div>
        </div>

        {/* Cheat Options List (Static, Read-Only) */}
        <div className="p-4 bg-[#14161a] max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full space-y-1">
          {cheats.map((cheat) => {
            if (cheat.isHeader) {
              return (
                <div 
                  key={cheat.id} 
                  className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-3 pb-1 border-b border-slate-800/40 mb-1.5 font-mono first:pt-0"
                >
                  {cheat.label}
                </div>
              );
            }

            return (
              <div 
                key={cheat.id}
                className="flex items-center p-2 rounded border border-transparent bg-[#181a1f]/60 space-x-3"
              >
                {/* Hotkey Badge */}
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border text-slate-400 bg-[#1f232d] border-slate-700 select-none shrink-0 w-[95px] text-center">
                  {cheat.hotkey}
                </span>
                {/* Option Name */}
                <div className="min-w-0">
                  <span className="text-xs block truncate text-slate-300">
                    {cheat.label}
                  </span>
                  {cheat.notes && cheat.notes.length > 0 && (
                    <span className="text-[10px] text-slate-500 block truncate mt-0.5 max-w-[280px] sm:max-w-md">
                      {cheat.notes.join(' ')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bg-[#0f1115] px-4 py-2 border-t border-slate-800 text-center">
          <span className="text-[10px] text-slate-600 font-mono">
            {locale === 'ko' ? `총 ${cheats.filter(c => !c.isHeader).length}개 치트 옵션` : locale === 'ja' ? `合計 ${cheats.filter(c => !c.isHeader).length} チートオプション` : `${cheats.filter(c => !c.isHeader).length} cheat options total`}
          </span>
        </div>

      </div>

      {/* Disclaimer Notice */}
      <p className="mt-4 text-[10px] text-amber-500/70 leading-relaxed text-center">
        {locale === 'ko'
          ? '※ 본 미리보기는 웹상에서 트레이너를 직접 구동시키는 프로그램이 아니며, 패치 후의 번역된 치트 명칭을 확인하기 위한 읽기 전용 목록입니다. 업로드한 원본 파일 버전에 따라 실제 제공되는 치트 옵션의 종류와 단축키 정보는 다를 수 있습니다.'
          : locale === 'ja'
            ? '※ 本プレビューはウェブ上でトレーナーを直接駆動させるプログラムではなく、パッチ後の翻訳されたチート名を確認するための読み取り専用リストです。アップロードした元のファイルのバージョンによって実際のチートオプションが異なる場合があります。'
            : '* This preview is not a functioning web trainer. It is a read-only list to verify translated cheat option names after patching. Actual cheat options and hotkeys vary depending on the original file version uploaded.'
        }
      </p>
    </div>
  );
}
