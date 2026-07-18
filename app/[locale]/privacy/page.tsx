import Link from 'next/link';
import { ArrowLeft, Cookie, Cpu, EyeOff, Shield, UserRoundX } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { SITE_URL, localizedAlternates } from '@/lib/site';

type Content = { title: string; subtitle: string; updated: string; notice: string; sections: Array<{ title: string; text: string; icon: typeof EyeOff }> };

const content: Record<Locale, Content> = {
  ko: {
    title: '개인정보처리방침', subtitle: '로컬 파일 처리와 서비스 운영을 위한 최소한의 데이터 사용 안내', updated: '최종 수정일: 2026년 7월 11일',
    notice: '이 문서는 서비스의 현재 운영 방식을 설명하기 위한 정보이며, 개별 국가·지역의 법률 자문을 대신하지 않습니다.',
    sections: [
      { icon: UserRoundX, title: '1. 회원정보 및 직접 식별정보 미수집', text: 'LocalPatcher는 일반 사용자의 회원가입이나 로그인을 요구하지 않으며, 이름·이메일·소셜 계정 정보와 같은 직접적인 개인 식별정보를 자체 데이터베이스에 저장하지 않습니다. 다만 서비스 이용 현황 분석을 위해 Google Analytics 4가 쿠키, 기기 정보, 접속 정보 등을 처리할 수 있습니다.' },
      { icon: EyeOff, title: '2. 로컬 파일 처리', text: '도구에서 선택한 트레이너 실행 파일은 사용자의 브라우저 안에서 처리됩니다. LocalPatcher는 해당 파일을 자체 서버에 업로드하거나 저장하도록 설계되지 않았습니다.' },
      { icon: Cookie, title: '3. 분석 및 광고 서비스', text: '이용 현황 파악을 위해 Google Analytics 4(GA4)를 사용할 수 있으며, 해당 서비스는 쿠키 또는 유사 기술을 사용할 수 있습니다. 현재 외부 팝업 광고와 Google 광고는 사용하지 않습니다. 향후 광고 또는 제휴 사용 방식이 달라지면 실제 적용 전에 이 방침을 갱신합니다.' },
      { icon: Cpu, title: '4. 다운로드와 외부 제휴 링크', text: '파일 다운로드는 외부 광고 페이지 열기, 광고 게이트 또는 광고 차단 감지를 요구하지 않습니다. 게임 구매처나 원본 배포처 등 사용자가 직접 선택하는 외부·제휴 링크가 제공될 수 있으며, 이동한 사이트에서는 각 운영자의 개인정보처리방침과 쿠키 정책이 적용됩니다.' },
    ],
  },
  en: {
    title: 'Privacy Policy', subtitle: 'How local file processing and minimal service data are handled', updated: 'Last updated: July 11, 2026',
    notice: 'This page describes the current operation of the service and is not legal advice for any particular jurisdiction.',
    sections: [
      { icon: UserRoundX, title: '1. No account or direct identity data collection', text: 'LocalPatcher does not require general users to create an account or sign in, and does not store direct identifiers such as names, email addresses, or social account details in its own database. Google Analytics 4 may still process cookies, device information, and connection data for service analytics.' },
      { icon: EyeOff, title: '2. Local file processing', text: 'Trainer executables selected in the tool are processed in your browser. LocalPatcher is not designed to upload or store those files on its own servers.' },
      { icon: Cookie, title: '3. Analytics and advertising', text: 'We may use Google Analytics 4 (GA4) to understand service usage, and it may use cookies or similar technologies. We currently do not use external popup ads or Google advertising. If advertising or affiliate practices change, this policy will be updated before they are put into use.' },
      { icon: Cpu, title: '4. Downloads and external affiliate links', text: 'File downloads do not require an external ad page, an advertising gate, or ad-block detection. User-selected external or affiliate links to game stores and original distribution sources may be provided; the destination operator’s privacy and cookie policies apply after you leave this site.' },
    ],
  },
  ja: {
    title: 'プライバシーポリシー', subtitle: 'ローカルファイル処理とサービス運営に必要な最小限のデータ利用について', updated: '最終更新日：2026年7月11日',
    notice: '本ページはサービスの現在の運用方法を説明するものであり、特定の国や地域における法的助言ではありません。',
    sections: [
      { icon: UserRoundX, title: '1. 会員情報および直接識別情報を収集しません', text: 'LocalPatcherは一般利用者に会員登録やログインを求めず、氏名、メールアドレス、ソーシャルアカウント情報などの直接的な個人識別情報を自社データベースに保存しません。ただし、利用状況の分析のため、Google Analytics 4がCookie、端末情報、接続情報などを処理する場合があります。' },
      { icon: EyeOff, title: '2. ローカルファイル処理', text: 'ツールで選択したトレーナー実行ファイルは、お使いのブラウザ内で処理されます。LocalPatcherは、そのファイルを自社サーバーへアップロードまたは保存するようには設計されていません。' },
      { icon: Cookie, title: '3. 分析・広告サービス', text: '利用状況の把握のためGoogle Analytics 4（GA4）を使用する場合があり、Cookieまたは類似技術が使用される場合があります。現在、外部ポップアップ広告およびGoogle広告は使用していません。今後、広告またはアフィリエイトの利用方法を変更する場合は、実際の適用前に本ポリシーを更新します。' },
      { icon: Cpu, title: '4. ダウンロードと外部アフィリエイトリンク', text: 'ファイルのダウンロードに、外部広告ページ、広告ゲート、広告ブロック検知は必要ありません。ゲームストアや元の配布元など、利用者が選択して開く外部・アフィリエイトリンクを提供する場合があり、移動後は各運営者のプライバシーおよびCookieポリシーが適用されます。' },
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
