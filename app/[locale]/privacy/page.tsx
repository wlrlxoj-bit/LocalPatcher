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
      { icon: UserRoundX, title: '1. 회원정보 및 직접 식별정보 미수집', text: 'LocalPatcher는 일반 사용자의 회원가입이나 로그인을 요구하지 않으며, 이름·이메일·소셜 계정 정보와 같은 직접적인 개인 식별정보를 자체 데이터베이스에 저장하지 않습니다. 다만 서비스 이용 현황 분석과 최소한의 광고 수익을 통한 운영을 위해 Google Analytics 4 및 Google AdSense가 쿠키, 기기 정보, 접속 정보 등을 처리할 수 있습니다.' },
      { icon: EyeOff, title: '2. 로컬 파일 처리', text: '도구에서 선택한 트레이너 실행 파일은 사용자의 브라우저 안에서 처리됩니다. LocalPatcher는 해당 파일을 자체 서버에 업로드하거나 저장하도록 설계되지 않았습니다.' },
      { icon: Cookie, title: '3. 분석·광고 서비스', text: '무료 서비스 운영에 필요한 최소한의 광고 수익과 이용 현황 파악을 위해 Google Analytics 4(GA4), Google AdSense 및 관련 제3자 서비스를 사용할 수 있습니다. 해당 서비스는 쿠키 또는 유사 기술을 사용할 수 있으며, 각 제공자의 정책이 적용됩니다.' },
      { icon: Cpu, title: '4. 다운로드와 외부 광고 페이지', text: '다운로드를 시작하면 운영 지원 목적으로 외부 광고 페이지가 새 탭으로 열릴 수 있습니다. 다운로드 시작과 광고 탭 열림 여부 같은 이벤트에는 이름·이메일 등 직접 식별정보를 매개변수로 보내지 않습니다. 다만 제3자 제공자는 해당 이벤트를 쿠키, 기기 정보, 접속 정보와 함께 처리할 수 있습니다. 광고 차단 여부와 관계없이 파일 다운로드는 제공됩니다.' },
    ],
  },
  en: {
    title: 'Privacy Policy', subtitle: 'How local file processing and minimal service data are handled', updated: 'Last updated: July 11, 2026',
    notice: 'This page describes the current operation of the service and is not legal advice for any particular jurisdiction.',
    sections: [
      { icon: UserRoundX, title: '1. No account or direct identity data collection', text: 'LocalPatcher does not require general users to create an account or sign in, and does not store direct identifiers such as names, email addresses, or social account details in its own database. Google Analytics 4 and Google AdSense may still process cookies, device information, and connection data for service analytics and minimal advertising revenue.' },
      { icon: EyeOff, title: '2. Local file processing', text: 'Trainer executables selected in the tool are processed in your browser. LocalPatcher is not designed to upload or store those files on its own servers.' },
      { icon: Cookie, title: '3. Analytics and advertising', text: 'To keep this free service operating with minimal advertising revenue and to understand usage, we may use Google Analytics 4 (GA4), Google AdSense, and related third-party services. Those providers may use cookies or similar technologies under their own policies.' },
      { icon: Cpu, title: '4. Downloads and external ad pages', text: 'Starting a download may open an external advertising page in a new tab to support operation. Event parameters for download starts and ad-tab status do not include direct identifiers such as names or email addresses. Third-party providers may still process those events together with cookies, device information, and connection data. The file download remains available when an ad blocker is detected.' },
    ],
  },
  ja: {
    title: 'プライバシーポリシー', subtitle: 'ローカルファイル処理とサービス運営に必要な最小限のデータ利用について', updated: '最終更新日：2026年7月11日',
    notice: '本ページはサービスの現在の運用方法を説明するものであり、特定の国や地域における法的助言ではありません。',
    sections: [
      { icon: UserRoundX, title: '1. 会員情報および直接識別情報を収集しません', text: 'LocalPatcherは一般利用者に会員登録やログインを求めず、氏名、メールアドレス、ソーシャルアカウント情報などの直接的な個人識別情報を自社データベースに保存しません。ただし、利用状況の分析と最小限の広告収益による運営のため、Google Analytics 4およびGoogle AdSenseがCookie、端末情報、接続情報などを処理する場合があります。' },
      { icon: EyeOff, title: '2. ローカルファイル処理', text: 'ツールで選択したトレーナー実行ファイルは、お使いのブラウザ内で処理されます。LocalPatcherは、そのファイルを自社サーバーへアップロードまたは保存するようには設計されていません。' },
      { icon: Cookie, title: '3. 分析・広告サービス', text: '無料サービスの運営に必要な最小限の広告収益と利用状況の把握のため、Google Analytics 4（GA4）、Google AdSenseおよび関連する第三者サービスを使用する場合があります。各サービスはCookieまたは類似技術を使用する場合があり、各提供者のポリシーが適用されます。' },
      { icon: Cpu, title: '4. ダウンロードと外部広告ページ', text: 'ダウンロードを開始すると、運営支援のため外部広告ページが新しいタブで開く場合があります。ダウンロード開始や広告タブの状態に関するイベントのパラメータには、氏名やメールアドレスなどの直接識別情報を送信しません。ただし、第三者提供者がCookie、端末情報、接続情報とともにこれらのイベントを処理する場合があります。広告ブロッカーが検出されてもファイルはダウンロードできます。' },
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
