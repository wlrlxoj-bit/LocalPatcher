'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ArrowRight, AlertTriangle, Share2 } from 'lucide-react';
import { Locale, getCommonDict, getPatcherDict, getGameTitle } from '@/lib/i18n';
import DropZone from '@/components/DropZone';
import GameCard from '@/components/GameCard';
import AdSenseUnit from '@/components/AdSenseUnit';
import { trackAnalyticsEvent } from '@/lib/analytics';
import type { UnapprovedTranslationStatus } from '@/lib/supabase';

interface Game {
  id: number;
  title_en: string;
  title_ko: string;
  title_ja?: string;
  slug: string;
  cover_image_url: string;
  description_en?: string;
  description_ko?: string;
  description_ja?: string;
  description_de?: string;
  description_es?: string;
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
  unapprovedStatusMap: Record<number, UnapprovedTranslationStatus | null>;
  locale: Locale;
  popularGames?: any[];
  relatedGames?: any[];
  steamNewsSlot?: React.ReactNode;
  playerCountSlot?: React.ReactNode;
  systemReqSlot?: React.ReactNode;
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
            {t.gameStorePricesTitle}
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
            {t.gameStoreNotice}
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
                  className={`inline-flex items-center justify-center px-4 py-2 rounded-lg border text-xs font-bold transition-all duration-200 flex-1 sm:flex-none sm:w-auto text-center ${btnStyle}`}
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

export default function PatcherClient({
  game,
  trainers,
  mappingsMap,
  unapprovedStatusMap,
  locale,
  popularGames = [],
  relatedGames = [],
  steamNewsSlot,
  playerCountSlot,
  systemReqSlot,
}: PatcherClientProps) {
  // 서버가 version_str 기준으로 정렬한 순서를 metadata/JSON-LD와 동일하게 유지합니다.
  const sortedTrainers = trainers;
  const t = getCommonDict(locale);
  const pt = getPatcherDict(locale as Locale);
  const displayTitle = getGameTitle(game, locale);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number>(
    sortedTrainers.length > 0 ? sortedTrainers[0].id : 0
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  
  const gameDescription = (game as any)[`description_${locale}`] || game.description_en || '';

  const patcherViewTrackedRef = useRef(false);
  const patcherSectionRef = useRef<HTMLDivElement>(null);

  const selectedTrainer = sortedTrainers.find(t => t.id === selectedTrainerId);
  const midAdSlot = process.env.NEXT_PUBLIC_ADSENSE_PATCHER_MID_SLOT;
  const bottomAdSlot = process.env.NEXT_PUBLIC_ADSENSE_PATCHER_BOTTOM_SLOT;

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
        eyebrow: '처음이십니까?', title: '3단계로 바로 시작하십시오',
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
      : locale === 'de'
        ? {
            eyebrow: 'Neu hier?', title: 'In 3 einfachen Schritten starten',
            description: 'Laden Sie den Original-Trainer herunter, laden Sie ihn in den Konverter hoch und führen Sie die gepatchte Datei aus.',
            steps: ['Original-Trainer (.exe) von FLiNG herunterladen', '.exe in den Konverter unten hochladen', 'Heruntergeladene ZIP entpacken und Trainer ausführen'],
            fling: 'Offizieller FLiNG Download', guide: 'Vollständigen Leitfaden anzeigen', missingFling: 'Der offizielle FLiNG-Link für dieses Spiel ist noch nicht registriert.',
            zipNotice: 'ZIP-Passwort: 11111111. Antivirensoftware kann Trainer falsch melden.',
          }
        : locale === 'es'
          ? {
              eyebrow: '¿Nuevo aquí?', title: 'Empiece en 3 sencillos pasos',
              description: 'Descargue el trainer original, cárguelo en el convertidor y ejecute el archivo parcheado.',
              steps: ['Descargar el trainer original (.exe) de FLiNG', 'Subir el .exe al convertidor de abajo', 'Extraer el ZIP descargado y ejecutar el trainer'],
              fling: 'Descarga oficial de FLiNG', guide: 'Ver guía completa', missingFling: 'El enlace oficial de FLiNG aún no está registrado.',
              zipNotice: 'Contraseña del ZIP: 11111111. Los antivirus pueden marcarlo falsamente.',
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

  const handleShare = async () => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    let promoText = '';
    
    if (locale === 'ko') {
      promoText = `🎮 [${game.title_ko || game.title_en}] PC 트레이너 한글 패치!\n다운로드나 설치 없이 웹에서 3초 만에 바로 변환하세요.\n🔗 ${currentUrl}`;
    } else if (locale === 'ja') {
      promoText = `🎮 [${game.title_ja || game.title_en}] PCトレーナー日本語化パッチ!\nダウンロードやインストール不要でウェブ上で即変換。\n🔗 ${currentUrl}`;
    } else {
      promoText = `🎮 [${game.title_en}] PC Trainer Localization!\nConvert instantly on the web without downloads or installations.\n🔗 ${currentUrl}`;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          text: promoText,
        });
        return;
      } catch (err) {
        // Fallback if user cancels or share fails
        console.warn('Share API failed or cancelled', err);
      }
    }
    
    navigator.clipboard.writeText(promoText)
      .then(() => {
        alert(pt.shareSuccess);
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
      });
  };

  if (locale === 'en') {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col gap-6 items-start w-full">
        {/* Back button */}
        <div className="mb-0 w-full">
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
              className="w-20 h-28 bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50 shadow-md shrink-0 relative"
            >
              <Image 
                src={game.cover_image_url} 
                alt={`${game.title_en} cover`}
                fill
                sizes="80px"
                priority
                className="object-cover"
              />
            </div>
            <div className="pt-1">
              <h1 className="text-xl md:text-2xl font-bold text-white font-outfit">{displayTitle}</h1>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-mono">Original Game: {game.title_en}</p>
              {playerCountSlot}
            </div>
          </div>

          {/* Action buttons */}
          <div className="z-10 flex flex-col items-center md:items-end justify-center gap-2 shrink-0">
            <button
              onClick={handleShare}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-all duration-200 shadow-sm cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{pt.shareBtn}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 w-full items-start">
          <div className="flex-1 w-full min-w-0 flex flex-col">
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
        <div className="hidden md:block p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
          
          <h5 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
            {pt.supportedBuilds}
          </h5>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider font-mono">
                  <th className="py-3 px-4 font-semibold">{pt.buildVersion}</th>
                  <th className="py-3 px-4 font-semibold">{pt.fileSize}</th>
                  <th className="py-3 px-4 font-semibold text-center">{pt.cheatCountLabel}</th>
                  <th className="py-3 px-4 font-semibold text-right">{pt.statusLabel}</th>
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
                      {t_option.option_count ? pt.cheatCountText.replace('{count}', String(t_option.option_count || 0)) : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                        {pt.autoDetectable}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <AdSenseUnit locale={locale} slot={midAdSlot} />
        <PartnerStoreWidget game={game} locale={locale} t={t} trainerId={selectedTrainerId} />
        
            <AdSenseUnit locale={locale} slot={bottomAdSlot} />

            {/* Popular Trainers Grid */}
            {popularGames.length > 0 && (
              <section className="mt-12" aria-labelledby="popular-trainers-heading">
                <div className="flex items-center gap-3 mb-6">
                  <h2 id="popular-trainers-heading" className="text-xl font-bold text-slate-100">
                    Popular Trainers
                  </h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {popularGames.slice(0, 6).map((pg: any) => {
                    const trainer = pg.trainers?.[0];
                    return (
                      <GameCard
                        key={pg.id}
                        game={pg}
                        trainerVersion={trainer?.version_str || '1.0'}
                        optionCount={trainer?.option_count || 0}
                        locale={locale}
                        optionsLabel="Options"
                        hideDetails={true}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {/* systemReqSlot was removed from here because it's now in the sidebar */}

          </div>
          
          {(steamNewsSlot || systemReqSlot) && (
            <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-6 order-first lg:order-last mb-6 lg:mb-0">
              {steamNewsSlot}
              {systemReqSlot}
            </aside>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col gap-6 items-start w-full">
      {/* Back button */}
      <div className="mb-0 w-full">
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
            className="w-20 h-28 bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50 shadow-md shrink-0 relative"
          >
            <Image 
              src={game.cover_image_url} 
              alt={`${game.title_en} cover`}
              fill
              sizes="80px"
              priority
              className="object-cover"
            />
          </div>
          <div className="pt-1 flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-white font-outfit">{displayTitle}</h1>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-mono mb-3">Original Game: {game.title_en}</p>
            
            {playerCountSlot}

            {gameDescription && (
              <div className="mb-3">
                <div 
                  className={`text-sm text-slate-300 leading-relaxed overflow-hidden transition-all duration-300 ${isDescExpanded ? '' : 'line-clamp-3'}`}
                  dangerouslySetInnerHTML={{ __html: gameDescription }}
                />
                <button 
                  onClick={() => setIsDescExpanded(!isDescExpanded)}
                  className="mt-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 focus:outline-none flex items-center gap-1"
                >
                  {isDescExpanded ? pt.showLess : pt.showMore}
                </button>
              </div>
            )}
            
          </div>
        </div>

        {/* Anti-cheat status, official download link, and purchase link */}
        <div className="z-10 flex flex-col items-center md:items-end justify-center gap-2 shrink-0">
          {game.anti_cheat && game.anti_cheat !== 'none' && (
            <Link
              href={`/${locale}/guides`}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-all duration-200"
            >
              <span>{pt.bypassGuide.replace('{antiCheat}', game.anti_cheat)}</span>
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
            <span>{pt.shareBtn}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full items-start">
        <div className="flex-1 w-full min-w-0 flex flex-col">
          {/* Main Patcher Area */}
          {selectedTrainer ? (() => {
        const isUnpatchable = selectedTrainer.option_count === 0;
        const isTranslationPending =
          (selectedTrainer.option_count ?? 0) > 0 &&
          (mappingsMap[selectedTrainer.id] || []).length === 0;
        const unapprovedStatus = unapprovedStatusMap[selectedTrainer.id];
        const isTranslationRejected = isTranslationPending && unapprovedStatus === 'rejected';
        return (
          <div className="space-y-6">
            {isUnpatchable ? (
              <div className="w-full p-6 rounded-xl border border-rose-500/25 bg-rose-950/15 text-rose-300 flex flex-col md:flex-row items-center md:items-start gap-4 shadow-[0_0_30px_rgba(244,63,94,0.05)]">
                <AlertTriangle className="w-8 h-8 shrink-0 text-rose-500 mt-0.5" />
                <div className="flex-1 text-center md:text-left">
                  <h3 className="font-bold text-lg text-white mb-2 font-outfit">
                    {locale === 'ko' ? '지원 옵션 없음' : locale === 'ja' ? '対応オプションなし' : 'No Supported Options'}
                  </h3>
                  <p className="text-sm leading-relaxed text-rose-200/80 mb-4">
                    {locale === 'ko' 
                      ? '이 트레이너 버전에는 현재 변환 가능한 옵션이 등록되어 있지 않습니다. 압축 또는 암호화 여부는 확인되지 않았으므로 공식 배포 페이지에서 다른 버전을 확인해 주세요.'
                      : locale === 'ja' 
                        ? 'このトレーナーバージョンには、現在変換可能なオプションが登録されていません。圧縮・暗号化の有無は未確認のため、公式配布ページで別のバージョンをご確認ください。'
                        : 'No convertible options are currently registered for this trainer version. Its compression or encryption status has not been verified; check the official source for another version.'}
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
            ) : isTranslationPending ? (
              <div className="w-full p-6 rounded-xl border border-amber-500/25 bg-amber-950/15 text-amber-200 flex items-start gap-4">
                <AlertTriangle className="w-8 h-8 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <h3 className="font-bold text-lg text-white mb-2 font-outfit">
                    {isTranslationRejected
                      ? locale === 'ko'
                        ? '자동 검증 실패'
                        : locale === 'ja'
                          ? '自動検証に失敗'
                          : 'Automated Validation Failed'
                      : locale === 'ko'
                        ? '자동 번역 검증 및 재시도 중'
                        : locale === 'ja'
                          ? '自動翻訳の検証・再試行中'
                          : 'Automated Translation Validation in Progress'}
                  </h3>
                  <p className="text-sm leading-relaxed text-amber-100/80">
                    {isTranslationRejected
                      ? locale === 'ko'
                        ? '자동 검증을 통과하지 못했습니다. 다음 파일 업데이트 또는 자동 재처리를 기다리고 있습니다.'
                        : locale === 'ja'
                          ? '自動検証を通過できませんでした。次のファイル更新または自動再処理を待っています。'
                          : 'Automated validation did not pass. This version is waiting for the next file update or automated reprocessing.'
                      : locale === 'ko'
                        ? '변환 가능한 옵션은 확인되었습니다. 자동 번역 검증과 실패 항목 재시도가 진행 중이며, 통과하면 패치 기능이 자동으로 활성화됩니다.'
                        : locale === 'ja'
                          ? '変換可能なオプションは確認済みです。自動翻訳の検証と失敗項目の再試行が進行中で、通過するとパッチ機能が自動的に有効になります。'
                          : 'Convertible options were found. Automated translation validation and retries are in progress; patching will activate automatically after they pass.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <section aria-labelledby="patcher-start-guide-title" className="hidden md:block rounded-2xl border border-cyan-500/35 bg-gradient-to-br from-cyan-950/35 via-slate-900/70 to-indigo-950/30 p-5 sm:p-6 shadow-[0_0_30px_rgba(6,182,212,0.12)]">
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
                <div className="hidden md:block">
                  <DropZone 
                    locale={locale} 
                    gameId={game.id}
                    gameSlug={game.slug}
                    trainer={selectedTrainer}
                    allTrainers={sortedTrainers}
                    mappingsMap={mappingsMap}
                    onTrainerDetected={handleTrainerDetected}
                  />
                </div>
                <div className="md:hidden p-6 md:p-8 rounded-2xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md mb-8 text-center flex flex-col items-center justify-center shadow-lg">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 mb-6">
                    <svg className="w-8 h-8 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-200 mb-3">
                    {locale === 'ko' ? '트레이너 패치는 PC에서만 가능합니다' :
                     locale === 'ja' ? 'パッチ適用はPC環境でのみ可能です' :
                     locale === 'de' ? 'Patching ist nur auf dem PC möglich' :
                     locale === 'es' ? 'El parcheo solo es posible en PC' :
                     'Patching is only possible on PC'}
                  </h2>
                  <p className="text-sm text-slate-400 max-w-md mx-auto mb-8 leading-relaxed">
                    {locale === 'ko' ? '로컬 인메모리 패치 특성상 모바일에서는 지원되지 않습니다. 링크를 저장하고 PC(Windows)에서 다시 접속해 주세요!' :
                     locale === 'ja' ? 'ローカルパッチの特性上、モバイルではサポートされていません。リンクを保存し、PC(Windows)から再度アクセスしてください。' :
                     locale === 'de' ? 'Aufgrund des lokalen Patchings wird Mobile nicht unterstützt. Link speichern & am PC öffnen.' :
                     locale === 'es' ? 'Debido al parcheo local, móvil no es compatible. Guarde el enlace y acceda desde un PC.' :
                     'Due to local patching, mobile is not supported. Save the link and access from a PC.'}
                  </p>
                  <button
                    onClick={handleShare}
                    className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-cyan-500 text-sm font-bold text-cyan-950 bg-cyan-500 hover:bg-cyan-400 transition-all duration-300 shadow-[0_0_15px_rgba(6,182,212,0.4)] w-full max-w-[280px]"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    {locale === 'ko' ? '지금 링크 저장하기' :
                     locale === 'ja' ? '今すぐリンクを保存' :
                     locale === 'de' ? 'Link jetzt speichern' :
                     locale === 'es' ? 'Guardar enlace ahora' :
                     'Save Link Now'}
                  </button>
                </div>
              </>
            )}

            {/* Supported Trainer Builds */}
            <div className="hidden md:block p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
              
              <h5 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                {pt.supportedBuilds}
              </h5>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider font-mono">
                      <th className="py-3 px-4 font-semibold">{pt.buildVersion}</th>
                      <th className="py-3 px-4 font-semibold">{pt.fileSize}</th>
                      <th className="py-3 px-4 font-semibold text-center">{pt.cheatCountLabel}</th>
                      <th className="py-3 px-4 font-semibold text-right">{pt.statusLabel}</th>
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
                          {t_option.option_count ? pt.cheatCountText.replace('{count}', String(t_option.option_count || 0)) : 'N/A'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                            {pt.autoDetectable}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <AdSenseUnit locale={locale} slot={midAdSlot} />

            <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-5" aria-labelledby="trainer-preview-heading">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="trainer-preview-heading" className="text-sm font-bold text-slate-200">
                    {pt.optionPreviewTitle}
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-cyan-300 bg-cyan-950/40 border border-cyan-800/50 px-3 py-2 rounded-lg inline-block">
                    {pt.optionPreviewSub} ({selectedTrainer.option_count || (mappingsMap[selectedTrainer.id] || []).length})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen((open) => !open)}
                  aria-expanded={isPreviewOpen}
                  aria-controls="trainer-ui-preview"
                  className="min-h-10 shrink-0 rounded-lg border border-slate-700 bg-slate-950/40 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  {isPreviewOpen ? pt.hidePreviewBtn : pt.showFullPreviewBtn}
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
            <SafetyAndUsageGuideSection game={game} locale={locale} />
            <AdSenseUnit locale={locale} slot={bottomAdSlot} />
            {/* Related Trainers Grid */}
            {relatedGames && relatedGames.length > 0 && (
              <section className="mt-12" aria-labelledby="related-trainers-heading">
                <div className="flex items-center gap-3 mb-6">
                  <h2 id="related-trainers-heading" className="text-xl font-bold text-slate-100">
                    {locale === 'ko' ? '연관 트레이너' : locale === 'ja' ? '関連トレーナー' : locale === 'de' ? 'Ähnliche Trainer' : locale === 'es' ? 'Entrenadores relacionados' : 'Related Trainers'}
                  </h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedGames.map((rg: any) => {
                    const trainer = rg.trainers?.[0] || { version_str: '1.0', option_count: 0 };
                    return (
                      <GameCard
                        key={rg.id}
                        game={rg}
                        trainerVersion={trainer.version_str}
                        optionCount={trainer.option_count}
                        locale={locale}
                        optionsLabel={locale === 'ko' ? '옵션' : locale === 'ja' ? 'オプション' : locale === 'de' ? 'Optionen' : locale === 'es' ? 'Opciones' : 'Options'}
                        hideDetails={true}
                      />
                    );
                  })}
                </div>
              </section>
            )}

          </div>
        );
      })() : (
        <div className="py-16 px-6 text-center rounded-2xl border border-rose-500/20 bg-rose-500/5 my-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-500/10 mb-6">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-200 mb-3">
            {locale === 'ko' ? '한글 패치 미지원 트레이너' :
             locale === 'ja' ? 'パッチ未対応のトレーナー' :
             'Unsupported Trainer for Patching'}
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            {locale === 'ko' ? '해당 게임의 트레이너 파일은 텍스트가 암호화되거나 압축(Packed)되어 있어 브라우저 환경에서 한글 패치를 진행할 수 없습니다. 번역은 지원되지 않지만, 아래 버튼을 통해 원본 영문 트레이너를 직접 다운로드하여 사용하실 수 있습니다.' :
             locale === 'ja' ? 'このゲームのトレーナーファイルはテキストが暗号化または圧縮されているため、ブラウザ環境でのパッチ適用ができません。翻訳はサポートされていませんが、下のボタンからオリジナルの英語版トレーナーを直接ダウンロードして使用できます。' :
             'The trainer file for this game has encrypted or packed text, making it impossible to patch in the browser environment. While translation is not supported, you can still download and use the original English trainer directly via the button below.'}
          </p>
          <a
            href={game.fling_url || 'https://flingtrainer.com/'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAnalyticsEvent('fling_download_clicked', { source: 'unsupported_game', game_id: game.id })}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-cyan-500 text-sm font-bold text-cyan-950 bg-cyan-500 hover:bg-cyan-400 transition-all duration-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
          >
            {locale === 'ko' ? 'FLiNG 공식 다운로드 페이지로 이동 ↗' :
             locale === 'ja' ? 'FLiNG公式ダウンロードページへ ↗' :
             'Go to FLiNG Official Download Page ↗'}
          </a>
        </div>
      )}

      {/* systemReqSlot was removed from here because it's now in the sidebar */}

        </div>
        
        {(steamNewsSlot || systemReqSlot) && (
          <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-6 order-first lg:order-last mb-6 lg:mb-0">
            {steamNewsSlot}
            {systemReqSlot}
          </aside>
        )}
      </div>
    </div>
  );
}

function SafetyAndUsageGuideSection({ game, locale }: { game: Game; locale: Locale }) {
  const isKo = locale === 'ko';
  const isJa = locale === 'ja';
  const isDe = locale === 'de';
  const isEs = locale === 'es';

  return (
    <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:p-8 backdrop-blur-md relative overflow-hidden shadow-xl" aria-labelledby="safety-guide-heading">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>
      
      <h3 id="safety-guide-heading" className="text-base md:text-lg font-bold text-white font-outfit mb-4 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
        {isKo ? `${game.title_ko || game.title_en} 트레이너 한글화 및 안전 사용 가이드` : isJa ? `${game.title_ja || game.title_en} トレーナー日本語化・ me安全使用ガイド` : isDe ? `${game.title_en} Trainer Lokalisierungs- & Sicherheitsleitfaden` : isEs ? `Guía de seguridad y localización de trainer para ${game.title_en}` : `${game.title_en} Trainer Localization & Safety Guide`}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300 leading-relaxed mb-6">
        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/40">
          <h4 className="font-bold text-cyan-300 text-sm mb-2">
            {isKo ? '🔒 로컬 인메모리 바이너리 패치 원리' : isJa ? '🔒 ローカルバイナリパッチの仕組み' : isDe ? '🔒 Lokales In-Memory-Binary-Patching' : isEs ? '🔒 Parche de binarios local en memoria' : '🔒 Local In-Memory Binary Patching'}
          </h4>
          <p className="text-slate-400">
            {isKo 
              ? 'LocalPatcher는 게임 실행 파일이나 시스템 DLL을 변조하지 않고, 업로드하신 트레이너 내부의 핫키 텍스트 오프셋(UTF-16LE/ASCII)만을 안전하게 한글로 국문화합니다. 사용자의 개인정보나 파일 데이터는 서버로 절대 전송되지 않습니다.'
              : isJa
                ? 'LocalPatcherはゲーム実行ファイルやシステムDLLを改変せず、トレーナー内部のホットキーテキスト（UTF-16LE/ASCII）のみをローカルで日本語に変換します。個人情報やファイルデータは meサーバーへ一切送信されません。'
                : isDe
                  ? 'LocalPatcher verändert keine Spiele-Dateien oder System-DLLs. Es übersetzt lediglich Hotkey-Texte lokal im Browser. Es werden keine Daten hochgeladen.'
                  : isEs
                    ? 'LocalPatcher no modifica ejecutables ni DLLs del sistema. Solo parchea textos de acceso rápido en su navegador. No se sube ningún archivo.'
                    : 'LocalPatcher does not modify game executables or system DLLs. It safely patches hotkey text offsets inside your trainer locally. No personal files or data are uploaded to servers.'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/40">
          <h4 className="font-bold text-amber-300 text-sm mb-2">
            {isKo ? '🛡️ 오프라인 싱글플레이 전용 권장' : isJa ? '🛡️ オフラインシングルプレイ専用推奨' : isDe ? '🛡️ Nur für Offline-Einzelspieler empfohlen' : isEs ? '🛡️ Recomendado solo para un jugador offline' : '🛡️ Offline Singleplayer Recommended'}
          </h4>
          <p className="text-slate-400">
            {isKo
              ? '본 트레이너 한글화 도구는 오프라인 싱글플레이 환경 전용으로 설계되었습니다. 온라인 멀티플레이어가 포함된 게임의 경우 안티치트(Easy Anti-Cheat, BattlEye 등)에 의해 계정 제재가 발생할 수 있으므로 오프라인 모드에서만 사용할 것을 강력히 권장합니다.'
              : isJa
                ? '本ツールはオフラインシングルプレイ専用に設計されています。オンラインマルチプレイが含まれるゲームの場合、アンチチートに検知される可能性があるため、必ずオフラインでご使用ください。'
                : isDe
                  ? 'Dieses Tool ist ausschließlich für Offline-Einzelspieler gedacht. Verwenden Sie Trainer niemals in Online- oder Anti-Cheat-Umgebungen.'
                  : isEs
                    ? 'Esta herramienta está diseñada exclusivamente para un jugador offline. No la utilice en modos online para evitar sanciones.'
                    : 'This localization tool is designed exclusively for offline singleplayer gameplay. For games with online multiplayer, use in offline mode to prevent anti-cheat detection.'}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-800/60 pt-6">
        <h4 className="font-bold text-slate-200 text-sm mb-4">
          {isKo ? '❓ 자주 묻는 질문 (FAQ)' : isJa ? '❓ よくある質問 (FAQ)' : isDe ? '❓ Häufig gestellte Fragen (FAQ)' : isEs ? '❓ Preguntas Frecuentes (FAQ)' : '❓ Frequently Asked Questions'}
        </h4>
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-950/30 border border-slate-800/50">
            <p className="font-semibold text-slate-200 mb-1">
              {isKo ? 'Q. 백신(Windows Defender 등)에서 바이러스로 오진되면 어떻게 하나요?' : isJa ? 'Q. セキュリティソフトでウイルスと誤検知された場合は？' : isDe ? 'Q. Was tun, wenn Antivirensoftware den Trainer blockiert?' : isEs ? 'Q. ¿Qué hacer si el antivirus marca el trainer como falso positivo?' : 'Q. What if antivirus flags the trainer as a false positive?'}
            </p>
            <p className="text-slate-400">
              {isKo
                ? '트레이너 바이너리의 특성상 메모리 주소 참조 기능으로 인해 백신에서 탐지(False Positive)할 수 있습니다. 이는 한글 패치 때문이 아닌 원본 트레이너의 특성이며, 백신 예외 처리 후 안전하게 사용 가능합니다.'
                : isJa
                  ? 'トレーナーの性質上、メモリ参照機能によりセキュリティソフトで誤検知される場合があります。例外設定を追加してご使用ください。'
                  : isDe
                    ? 'Trainer greifen auf Speicheradressen zu, was Fehlalarme auslösen kann. Fügung Sie eine Ausnahme in Ihrem Antivirenprogramm hinzu.'
                    : isEs
                      ? 'Los trainers acceden a direcciones de memoria, lo que puede causar falsos positivos. Añada una excepción en su antivirus.'
                      : 'Trainers naturally reference memory addresses, which may trigger false-positive warnings. Add an exception in your antivirus to run smoothly.'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/30 border border-slate-800/50">
            <p className="font-semibold text-slate-200 mb-1">
              {isKo ? 'Q. 게임 업데이트 후 트레이너 한글 패치가 작동하지 않을 때는?' : isJa ? 'Q. ゲームアップデート後にパッチが機能しない場合は？' : isDe ? 'Q. Was tun, wenn der Trainer nach einem Spiel-Update nicht mehr funktioniert?' : isEs ? 'Q. ¿Qué hacer si el trainer deja de funcionar tras una actualización?' : 'Q. What if the trainer stops working after a game update?'}
            </p>
            <p className="text-slate-400">
              {isKo
                ? '게임 패치 업데이트 시 FLiNG에서 새 버전의 트레이너가 배포됩니다. 최신 트레이너를 다운로드한 후 LocalPatcher에서 새로 선택하시면 해당 버전의 한글 패치가 자동 반영됩니다.'
                : isJa
                  ? 'ゲーム更新時はFLiNG公式から新バージョンが配布されます。最新版をダウンロード後、LocalPatcherで再パッチを行ってください。'
                  : isDe
                    ? 'Bei Spiel-Updates veröffentlicht FLiNG neue Trainer-Versionen. Laden Sie die neueste Version von FLiNG herunter und wenden Sie den Patch erneut an.'
                    : isEs
                      ? 'Cuando el juego se actualice, obtenga la versión más reciente de FLiNG y aplique el parche nuevamente.'
                      : 'When the game updates, get the latest trainer version from FLiNG and re-apply the patch via LocalPatcher.'}
            </p>
          </div>
        </div>
      </div>
    </section>
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
  popularGames?: any[];
}

function TrainerUIPreview({ game, trainer, mappings, locale }: TrainerUIPreviewProps) {
  const t = getCommonDict(locale);
  const pt = getPatcherDict(locale as Locale);

  if (!mappings || mappings.length === 0) {
    return (
      <div className="mt-6 p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden text-center text-xs text-slate-500">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>
        {pt.noSupportedOptions}
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
        {pt.cheatPreviewHeading}
      </h5>
      
      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
        {pt.cheatPreviewSub}
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
                {t.localizedEditionBadge}
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
