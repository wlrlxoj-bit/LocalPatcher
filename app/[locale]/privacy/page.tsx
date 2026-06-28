import React from 'react';
import Link from 'next/link';
import { EyeOff, Cpu, Cookie, Shield, ArrowLeft } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';
  const t = getDictionary(currentLocale);

  const content = {
    ko: {
      title: '개인정보 처리방침',
      subtitle: '100% 로컬 클라이언트 웹 브라우저 기반 처리 및 데이터 수집 배제 고지',
      lastUpdated: '최종 수정일: 2026년 6월 29일',
      sections: [
        {
          icon: EyeOff,
          title: '1. 0% 데이터 수집 (Zero Data Collection)',
          text: 'LocalPatcher는 회원 가입 및 일반 로그인 과정을 완벽히 생략하여 운영됩니다. 사용자의 이메일, 이름, 소셜 계정 정보뿐만 아니라 접속 IP 로그 등 어떠한 형태의 개인 식별 정보도 사이트 DB에 영구 수집하거나 저장하지 않습니다.',
        },
        {
          icon: Cpu,
          title: '2. 로컬 브라우저 기반 파일 연산 (Client-Side Only)',
          text: '사용자가 드래그 앤 드롭한 오리지널 게임 트레이너 실행 파일(.exe)은 외부 데이터 서버로 절대 업로드되지 않습니다. 모든 패치 프로세스는 HTML5 FileReader 및 ArrayBuffer Web API를 적용하여 사용자의 PC 내 브라우저 샌드박스 내부 메모리에서만 로컬 가공 및 텍스트 매칭 치환이 처리됩니다.',
        },
        {
          icon: Cookie,
          title: '3. 쿠키 및 마케팅 트래커 배제 (No Cookies & Analytics)',
          text: '본 서비스는 사용자 식별을 위한 쿠키를 생성하거나 브라우저에 저장하지 않습니다. 아울러 상용 웹 분석 스크립트(Google Analytics 등) 및 마케팅 추적용 서드파티 스크립트를 심지 않아, 사용자의 웹 서핑 행태 추적 위협으로부터 완전히 자유롭습니다.',
        },
      ],
      noticeTitle: '철저한 보안 및 투명성 보장',
      noticeText: '로컬패쳐는 웹 브라우저가 제공하는 표준 보안 환경 속에서 구동되므로, 사용자의 PC 환경을 침해하거나 외부로 시스템 데이터를 유출할 우려가 전혀 없는 무해한 정적 웹 연산 도구입니다.',
    },
    en: {
      title: 'Privacy Policy',
      subtitle: '100% local client-side processing with zero data collection',
      lastUpdated: 'Last Updated: June 29, 2026',
      sections: [
        {
          icon: EyeOff,
          title: '1. 0% Data Collection',
          text: 'LocalPatcher does not require user registration or logins. We collect, store, or process absolutely zero personal data (names, email addresses, social media accounts, IP logs, etc.) in our database.',
        },
        {
          icon: Cpu,
          title: '2. Local Browser-Based Processing',
          text: 'Your uploaded game trainer executables (.exe) are never sent to any server. File analysis and options overwriting are executed 100% within your local browser memory using standardized Web APIs (FileReader, ArrayBuffer).',
        },
        {
          icon: Cookie,
          title: '3. Zero Tracking & Cookies',
          text: 'We do not generate or store cookies on your machine. We do not integrate any advertising pixels or analytical scripts (such as Google Analytics) that could trace your online footprints.',
        },
      ],
      noticeTitle: 'Security & Transparency Guaranteed',
      noticeText: 'LocalPatcher runs in a secure sandbox provided by your browser. Because no files are uploaded and no tracking occurs, your files and identity remain completely private.',
    },
    ja: {
      title: 'プライバシーポリシー',
      subtitle: '100%ローカルクライアント処理およびデータ収集の完全排除に関する告知',
      lastUpdated: '最終更新日: 2026年6月29日',
      sections: [
        {
          icon: EyeOff,
          title: '1. 0% データ収集 (Zero Data Collection)',
          text: 'LocalPatcherは、会員登録やログインを必要としないサービスです。メールアドレス、名前、SNSアカウント、接続IPログなど、いかなる個人情報も当サイトのデータベースに収集・保存することはありません。',
        },
        {
          icon: Cpu,
          title: '2. ローカルブラウザによる処理 (Client-Side Only)',
          text: 'アップロードされたゲームトレーナー実行ファイル（.exe）が外部サーバーに送信されることはありません。すべての翻訳パッチ処理は、HTML5のFileReaderやArrayBufferなどのWeb APIを使用して、ユーザーのPCのブラウザメモリ内だけで実行されます。',
        },
        {
          icon: Cookie,
          title: '3. クッキーおよび追跡の排除 (No Cookies & Analytics)',
          text: '当サイトは、ユーザーを識別するためのクッキーを生成・使用しません。また、マーケティング用のクッキーや解析ツール（Google Analyticsなど）も一切組み込んでおらず、ウェブ上の行動追跡の脅威から完全に保護されています。',
        },
      ],
      noticeTitle: '厳格なセキュリティと透明性',
      noticeText: 'LocalPatcherはブラウザの標準的なサンドボックス環境下で動作するため、PC環境を侵害したり、システムデータを外部に送信したりすることは一切ありません。',
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
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-950/20 text-[11px] font-bold text-cyan-400 mb-4 tracking-wide glow-cyan">
          <Shield className="w-3.5 h-3.5" />
          <span>{localizedContent.title}</span>
        </div>
        <h1 className="font-bold text-3xl md:text-4xl tracking-tight mb-3 text-white font-outfit">
          {localizedContent.title}
        </h1>
        <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
          {localizedContent.subtitle}
        </p>
        <span className="inline-block mt-3 text-xs text-slate-500 font-mono">
          {localizedContent.lastUpdated}
        </span>
      </div>

      {/* Info card */}
      <div className="p-6 rounded-2xl border border-cyan-500/20 bg-cyan-950/10 mb-10 flex items-start space-x-4">
        <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg shrink-0">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wide">
            {localizedContent.noticeTitle}
          </h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {localizedContent.noticeText}
          </p>
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-8">
        {localizedContent.sections.map((section, idx) => {
          const Icon = section.icon;
          return (
            <div key={idx} className="p-6 md:p-8 rounded-2xl border border-slate-800/80 bg-slate-900/20 hover:border-slate-800 transition-all">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base md:text-lg font-bold text-white">
                  {section.title}
                </h3>
              </div>
              <p className="text-xs md:text-sm text-slate-400 leading-relaxed pl-1">
                {section.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
