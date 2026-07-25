import Link from 'next/link';
import { ArrowLeft, Cookie, Cpu, EyeOff, Shield, UserRoundX } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { SITE_URL, localizedAlternates } from '@/lib/site';

type Content = {
  title: string;
  subtitle: string;
  updated: string;
  notice: string;
  sections: Array<{ title: string; text: string; icon: typeof EyeOff }>;
};

const content: Record<Locale, Content> = {
  ko: {
    title: '개인정보처리방침',
    subtitle: '로컬 파일 처리와 서비스 운영을 위한 데이터 사용 안내',
    updated: '최종 수정일: 2026년 7월 25일',
    notice: '이 문서는 현재 서비스의 운영 방식을 설명하며, 특정 국가나 지역에 대한 법률 자문이 아닙니다.',
    sections: [
      { icon: UserRoundX, title: '1. 계정 및 직접 식별정보', text: 'LocalPatcher는 일반 사용자에게 회원가입이나 로그인을 요구하지 않으며, 이름·이메일·소셜 계정 정보 같은 직접 식별정보를 자체 데이터베이스에 저장하지 않습니다. 다만 Google Analytics 4 및 Google AdSense가 쿠키, 기기 정보와 접속 정보를 처리할 수 있습니다.' },
      { icon: EyeOff, title: '2. 로컬 파일 처리', text: '도구에서 선택한 트레이너 실행 파일은 사용자의 브라우저 안에서 처리됩니다. LocalPatcher는 해당 파일을 자체 서버에 업로드하거나 저장하도록 설계하지 않았습니다.' },
      { icon: Cookie, title: '3. 분석, 광고 및 쿠키', text: '서비스 이용 현황을 이해하기 위해 Google Analytics 4를 사용할 수 있으며, 서비스 운영을 위해 Google AdSense 광고를 표시할 수 있습니다. Google과 그 광고 파트너는 쿠키 또는 유사 기술을 이용해 광고 제공, 빈도 제한, 측정 및 부정행위 방지를 수행할 수 있습니다. 적용되는 법률과 사용자의 선택에 따라 광고가 개인화되거나 개인화되지 않을 수 있습니다. 동의 관리 화면이 제공되는 경우 사용자는 그 화면에서 선택을 변경할 수 있습니다. 현재 모든 지역에서 별도의 동의 관리 플랫폼이 항상 표시된다고 보장하지 않습니다.' },
      { icon: Cpu, title: '4. 다운로드와 외부 링크', text: '파일 다운로드는 외부 광고 페이지, 광고 관문 또는 광고 차단 감지를 요구하지 않습니다. 게임 상점이나 원본 배포처로 이동하는 외부 또는 제휴 링크가 제공될 수 있으며, 사이트를 벗어난 뒤에는 해당 운영자의 개인정보처리방침과 쿠키 정책이 적용됩니다.' },
    ],
  },
  en: {
    title: 'Privacy Policy',
    subtitle: 'How local file processing and service data are handled',
    updated: 'Last updated: July 25, 2026',
    notice: 'This page describes the current operation of the service and is not legal advice for any particular jurisdiction.',
    sections: [
      { icon: UserRoundX, title: '1. Accounts and direct identifiers', text: 'LocalPatcher does not require general users to create an account or sign in, and does not store direct identifiers such as names, email addresses, or social account details in its own database. Google Analytics 4 and Google AdSense may still process cookies, device information, and connection data.' },
      { icon: EyeOff, title: '2. Local file processing', text: 'Trainer executables selected in the tool are processed in your browser. LocalPatcher is not designed to upload or store those files on its own servers.' },
      { icon: Cookie, title: '3. Analytics, advertising, and cookies', text: 'We may use Google Analytics 4 to understand service usage and Google AdSense to display advertising. Google and its advertising partners may use cookies or similar technologies for ad delivery, frequency capping, measurement, and fraud prevention. Ads may be personalized or non-personalized depending on applicable law and your choices. Where a consent control is provided, you may use it to manage your choices. We do not claim that a separate consent management platform is currently displayed in every region.' },
      { icon: Cpu, title: '4. Downloads and external links', text: 'File downloads do not require an external ad page, an advertising gate, or ad-block detection. User-selected external or affiliate links to game stores and original distribution sources may be provided; the destination operator’s privacy and cookie policies apply after you leave this site.' },
    ],
  },
  ja: {
    title: 'プライバシーポリシー',
    subtitle: 'ローカルファイル処理およびサービスデータの取扱い',
    updated: '最終更新日：2026年7月25日',
    notice: '本ページは現在のサービス運用を説明するものであり、特定の国または地域に対する法的助言ではありません。',
    sections: [
      { icon: UserRoundX, title: '1. アカウントおよび直接識別情報', text: 'LocalPatcherは一般利用者にアカウント作成やログインを求めず、氏名、メールアドレス、ソーシャルアカウント情報などの直接識別情報を独自のデータベースに保存しません。ただし、Google Analytics 4およびGoogle AdSenseがCookie、端末情報、接続情報を処理する場合があります。' },
      { icon: EyeOff, title: '2. ローカルファイル処理', text: 'ツールで選択したトレーナー実行ファイルは、利用者のブラウザ内で処理されます。LocalPatcherは、そのファイルを独自サーバーへアップロードまたは保存する設計ではありません。' },
      { icon: Cookie, title: '3. アクセス解析、広告、Cookie', text: 'サービス利用状況を把握するためGoogle Analytics 4を使用し、広告表示のためGoogle AdSenseを使用する場合があります。Googleおよび広告パートナーは、広告配信、表示頻度の制御、測定、不正防止のためCookieまたは類似技術を使用する場合があります。適用法令および利用者の選択に応じて、パーソナライズ広告または非パーソナライズ広告が表示されます。同意管理画面が提供される場合、その画面で選択を管理できます。現時点で、すべての地域に個別の同意管理プラットフォームが常に表示されるとは表明しません。' },
      { icon: Cpu, title: '4. ダウンロードと外部リンク', text: 'ファイルのダウンロードに外部広告ページ、広告ゲート、広告ブロック検出は必要ありません。ゲームストアや配布元への外部リンクまたはアフィリエイトリンクを提供する場合があり、サイト移動後はリンク先運営者のプライバシーおよびCookieポリシーが適用されます。' },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = locale === 'en' || locale === 'ja' ? locale : 'ko';
  const page = content[currentLocale];

  return {
    title: `${page.title} | LocalPatcher`,
    description: page.subtitle,
    alternates: {
      canonical: `${SITE_URL}/${currentLocale}/privacy`,
      languages: localizedAlternates('/privacy'),
    },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale: Locale = locale === 'en' || locale === 'ja' || locale === 'ko' ? locale : 'ko';
  const t = getDictionary(currentLocale);
  const page = content[currentLocale];

  return <main className="max-w-4xl mx-auto px-6 py-12">
    <Link href={`/${currentLocale}`} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400"><ArrowLeft className="w-3.5 h-3.5" />{t.backToHome}</Link>
    <header className="text-center my-12"><Shield className="w-8 h-8 text-cyan-400 mx-auto mb-4" /><h1 className="font-bold text-3xl text-white">{page.title}</h1><p className="text-slate-400 text-sm mt-3">{page.subtitle}</p><p className="text-xs text-slate-500 mt-3">{page.updated}</p></header>
    <p className="p-5 mb-8 rounded-2xl border border-cyan-500/20 bg-cyan-950/10 text-xs leading-relaxed text-slate-300">{page.notice}</p>
    <div className="space-y-6">{page.sections.map(({ icon: Icon, title, text }) => <section key={title} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20"><Icon className="w-5 h-5 text-cyan-400 mb-3" /><h2 className="font-bold text-white">{title}</h2><p className="text-sm leading-relaxed text-slate-400 mt-3">{text}</p></section>)}</div>
  </main>;
}
