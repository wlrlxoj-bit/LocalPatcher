import React from 'react';
import Link from 'next/link';
import { Heart, Database, Server, Cpu, ExternalLink, ArrowLeft } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';

export default async function SupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';
  const t = getDictionary(currentLocale);

  const content = {
    ko: {
      title: 'Patreon 후원',
      subtitle: 'LocalPatcher의 지속 가능한 운영과 서비스 개선을 지원해 주세요.',
      cardTitle: 'LocalPatcher 후원자(Sponsor) 되기',
      cardIntro: 'LocalPatcher는 광고가 없고 쾌적한 100% 무료 웹 패칭 서비스를 제공하고 있습니다. 하지만 서비스가 지연 없이 원활하게 구동되기 위해 다음과 같은 정기적인 인프라 유지 비용이 매달 발생하고 있습니다.',
      costs: [
        {
          icon: Database,
          label: '실시간 데이터베이스 유지',
          desc: '전 세계 최신 게임 트레이너의 고유 해시값(SHA-256) 및 한글 문자열 오프셋 매핑 테이블의 실시간 스캔 쿼리를 처리합니다.',
        },
        {
          icon: Cpu,
          label: '자동화 스크래퍼 운영',
          desc: '스팀 및 글로벌 트레이너 제작사들의 신규 릴리스와 업데이트 데이터를 실시간 탐색 및 동기화하는 백서버 크론 잡을 가동합니다.',
        },
        {
          icon: Server,
          label: '고성능 서버리스 CDN 호스팅',
          desc: '글로벌 유저들이 대기 시간 없이 즉석에서 15MB 이하의 실행 파일을 로컬 브라우저 단에서 즉시 가공해갈 수 있도록 서버리스 에지 네트워크망을 확보합니다.',
        },
      ],
      pledgeText: '매달 커피 한 잔 가격의 후원만으로도 당사의 DB 용량 증설과 안정적인 서버 환경 유지, 그리고 신작 게임 리스트 번역 속도를 극대화하는 데 막대한 도움이 됩니다.',
      cta: 'Patreon에서 정기 후원하기',
      footerNote: '후원금은 오직 서버 인프라 유지 보수 및 스크래핑 엔진 고도화 목적에만 전액 투명하게 활용됩니다.',
    },
    en: {
      title: 'Sponsor on Patreon',
      subtitle: 'Help keep LocalPatcher ad-free, fast, and sustainable for players worldwide.',
      cardTitle: 'Become a Sponsor',
      cardIntro: 'LocalPatcher is committed to remaining 100% free and clean. However, ensuring sub-second local file matching and maintaining a clean, fast experience incurs monthly infrastructure costs:',
      costs: [
        {
          icon: Database,
          label: 'Real-time Database Queries',
          desc: 'Maintaining the database of clean trainer SHA-256 hashes and localized offset translation parameters.',
        },
        {
          icon: Cpu,
          label: 'Automated Scraping & Sync',
          desc: 'Running cloud scrapers to dynamically fetch and register official trainer updates as soon as they launch.',
        },
        {
          icon: Server,
          label: 'Serverless CDN & Bandwidth',
          desc: 'Providing high-speed edge distribution to handle FileReader requests and UI loading across the globe instantly.',
        },
      ],
      pledgeText: 'Sponsoring just a cup of coffee a month helps offset database, scraper, and serverless hosting costs, allowing us to keep this service alive and up-to-date!',
      cta: 'Support on Patreon',
      footerNote: 'All proceeds go directly toward hosting bills, database resources, and scraping pipeline development.',
    },
    ja: {
      title: 'Patreonで支援する',
      subtitle: 'LocalPatcher の広告なし・無償サービスの持続的な運営を支えてください。',
      cardTitle: 'パトロン（支援者）になる',
      cardIntro: 'LocalPatcherは広告を一切掲載せず、100%無料でローカライズ機能を提供しています。しかし、ユーザーの皆様が安定して高速に処理を行える環境を維持するために、毎月以下のインフラインフラ費用が発生しています。',
      costs: [
        {
          icon: Database,
          label: 'リアルタイムデータベースの維持',
          desc: 'ゲームトレーナーの固有ハッシュ値(SHA-256)およびローカライズ用テキストのオフセット配置情報の管理とクエリ処理。',
        },
        {
          icon: Cpu,
          label: '自動スクレイパーの稼働',
          desc: '最新ゲームのリリースとトレーナーのバージョンアップデート情報を常時監視し、システムに登録するエンジンの稼働費。',
        },
        {
          icon: Server,
          label: 'グローバルCDNホスティング',
          desc: '世界中のユーザーがアップロード待ち時間なしで、ブラウザ上で一瞬で変換処理を終えられる高速なエッジネットワークインフラの構築。',
        },
      ],
      pledgeText: '毎月コーヒー1杯分の小さなご支援が、サーバーインフラの維持、最新ゲームの対応リストの高速なアップデート活動を支える大きな原動力になります。',
      cta: 'Patreonで定期支援する',
      footerNote: 'すべての支援金は、サーバーの維持費、データベース容量増設、およびスクレイピング効率化の開発に透明性を持って充てられます。',
    },
  };

  const localizedContent = content[currentLocale as Locale] || content.ko;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Back link */}
      <div className="mb-6">
        <Link 
          href={`/${currentLocale}`} 
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t.backToHome}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-slate-700 bg-slate-900 text-[11px] font-bold text-slate-400 mb-4 tracking-wide shadow-sm">
          <Heart className="w-3.5 h-3.5" />
          <span>Patreon Support</span>
        </div>
        <h1 className="font-bold text-3xl md:text-4xl tracking-tight mb-3 text-white font-outfit">
          {localizedContent.title}
        </h1>
        <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
          {localizedContent.subtitle}
        </p>
      </div>

      {/* Patreon Premium Card (Disabled / Under Preparation) */}
      <div className="relative">
        {/* Background outline glow (subtle grey) */}
        <div className="absolute -inset-0.5 bg-slate-800 rounded-2xl blur opacity-25 pointer-events-none"></div>
        
        {/* Core Card */}
        <div className="relative p-6 md:p-10 rounded-2xl border border-slate-800 bg-slate-950 flex flex-col items-center">
          
          <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6">
            <Heart className="w-7 h-7 text-slate-500 stroke-[2]" />
          </div>

          <h2 className="text-xl md:text-2xl font-bold text-white text-center mb-4">
            {localizedContent.cardTitle}
          </h2>

          <p className="text-xs md:text-sm text-slate-400 text-center max-w-2xl leading-relaxed mb-8">
            {localizedContent.cardIntro}
          </p>

          {/* Cost Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-8">
            {localizedContent.costs.map((cost, idx) => {
              const Icon = cost.icon;
              return (
                <div key={idx} className="p-5 rounded-xl border border-slate-900 bg-slate-900/30 flex flex-col items-center text-center">
                  <div className="p-2.5 rounded-lg bg-slate-950 text-slate-500 border border-slate-900 mb-3 shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-xs md:text-sm text-slate-200 mb-2">
                    {cost.label}
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {cost.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Heartwarming Pledge Text */}
          <div className="p-5 rounded-xl border border-slate-900 bg-slate-900/20 text-center max-w-xl mb-8">
            <p className="text-xs md:text-sm text-slate-400 font-medium leading-relaxed">
              &ldquo;{localizedContent.pledgeText}&rdquo;
            </p>
          </div>

          {/* Call-to-action button (Coming Soon) */}
          <div
            className="inline-flex items-center space-x-2 px-8 py-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 font-bold text-sm md:text-base cursor-not-allowed select-none shadow-inner"
          >
            <span>
              {currentLocale === 'ko' 
                ? '후원 서비스 준비 중 (Coming Soon)' 
                : currentLocale === 'ja' 
                  ? '支援サービス準備中 (Coming Soon)' 
                  : 'Sponsorship Under Preparation (Coming Soon)'}
            </span>
          </div>

          <p className="text-[10px] text-slate-600 mt-6 font-mono text-center">
            {localizedContent.footerNote}
          </p>
        </div>
      </div>
    </div>
  );
}
