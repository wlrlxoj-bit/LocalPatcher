import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Database, Heart, Server, Cpu } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale : 'ko';
  const t = getDictionary(currentLocale);

  const content = {
    ko: {
      title: 'LocalPatcher 운영 후원 안내',
      subtitle: '서버 업로드 없는 로컬 패치 플랫폼의 지속 가능한 가동을 응원해 주세요.',
      cardTitle: 'Patreon 정기 후원 (준비 중)',
      cardIntro: 'LocalPatcher는 회원가입이나 유료 결제 없이 무료로 이용할 수 있는 유틸리티 서비스입니다. 안정적인 서버 운영과 지속적인 신규 트레이너 데이터 업데이트를 지원하고자 하신다면 후원에 참여하실 수 있습니다.',
      costs: [
        {
          icon: Database,
          label: '실시간 데이터베이스 유지',
          desc: '게임 트레이너의 고유 해시값(SHA-256) 및 번역용 텍스트의 오프셋 위치 정보의 관리와 쿼리 처리.',
        },
        {
          icon: Cpu,
          label: '자동 스크래퍼 가동',
          desc: '최신 게임 출시 및 트레이너 버전 업데이트 정보를 상시 감지하고 시스템에 등록하는 엔진의 가동 비용.',
        },
        {
          icon: Server,
          label: '글로벌 CDN 호스팅',
          desc: '전 세계 이용자가 업로드 대기시간 없이 브라우저에서 즉시 변환 처리를 마칠 수 있는 초고속 에지 네트워크 인프라 구축.',
        },
      ],
      pledgeText: '매월 커피 한 잔 분량의 작은 후원이 서버 인프라 유지와 최신 게임 대응 데이터베이스의 신속한 업데이트를 지속하는 가장 큰 원동력이 됩니다.',
      cta: 'Patreon 정기 후원하기',
      footerNote: '모든 후원금은 서버 유지비, 데이터베이스 용량 증설 및 스크래핑 효율화 개발에 투명하게 사용됩니다.',
    },
    en: {
      title: 'Support LocalPatcher',
      subtitle: 'Help keep our client-side trainer patch utility free and continuously updated.',
      cardTitle: 'Patreon Monthly Sponsorship (Coming Soon)',
      cardIntro: 'LocalPatcher is a free tool available without accounts or paid paywalls. If you would like to support server operations and continuous database updates for new games, you can contribute on Patreon.',
      costs: [
        {
          icon: Database,
          label: 'Database Infrastructure',
          desc: 'Managing SHA-256 binary signatures and text translation offset mappings for fast client query processing.',
        },
        {
          icon: Cpu,
          label: 'Automated Scraping Pipeline',
          desc: 'Operational costs for automated background engines detecting new game trainer build releases daily.',
        },
        {
          icon: Server,
          label: 'Global Edge CDN Hosting',
          desc: 'Fast edge infrastructure ensuring instant browser-based processing without queues or uploads.',
        },
      ],
      pledgeText: 'A monthly pledge equal to a cup of coffee helps cover server infrastructure costs and enables rapid updates for new game titles.',
      cta: 'Sponsor on Patreon',
      footerNote: 'All contributions directly fund server costs, database capacity expansion, and scraping efficiency improvements.',
    },
    ja: {
      title: 'LocalPatcher 運営支援のご案内',
      subtitle: 'ファイルをアップロードしないローカルパッチツールの継続的な運営を応援してください。',
      cardTitle: 'Patreon 定期支援 (準備中)',
      cardIntro: 'LocalPatcherは会員登録や有料決済を必要とせず、無料で利用できるツールです。安定したサーバー運営と継続的な最新データ更新を支援していただける場合は、Patreonからご支援いただけます。',
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

  const localizedContent = (content as Record<string, any>)[currentLocale] || content.ko;

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
        <div className="absolute -inset-0.5 bg-slate-800 rounded-2xl blur opacity-25 pointer-events-none"></div>
        
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
            {localizedContent.costs.map((cost: { icon: React.ElementType; label: string; desc: string }, idx: number) => {
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
                  : currentLocale === 'de'
                    ? 'Unterstützungsdienst wird vorbereitet (Demnächst)'
                    : currentLocale === 'es'
                      ? 'Servicio de patrocinio en preparación (Próximamente)'
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
