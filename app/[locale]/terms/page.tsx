import Link from 'next/link';
import { ArrowLeft, FileText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';

type Content = { title: string; subtitle: string; updated: string; warning: string; sections: Array<{ title: string; text: string; icon: typeof FileText }> };
const content: Record<Locale, Content> = {
  ko: { title: '이용약관', subtitle: 'LocalPatcher 이용 조건과 책임 범위 안내', updated: '최종 수정일: 2026년 7월 10일', warning: '트레이너 사용에 따른 결과와 위험은 사용자에게 있습니다. 온라인·멀티플레이 환경에서의 사용은 권장하지 않습니다.', sections: [
    { icon: FileText, title: '1. 서비스 목적', text: 'LocalPatcher는 사용자가 보유한 트레이너 실행 파일의 옵션 문구를 브라우저 로컬 환경에서 번역하기 위한 보조 도구입니다.' },
    { icon: ShieldCheck, title: '2. 무료 운영 및 광고', text: '서비스는 무료 제공을 유지하기 위해 최소한의 광고 수익과 비식별 이용 통계를 활용할 수 있습니다. 다운로드 시작 시 운영 지원 목적의 외부 광고 페이지가 새 탭에서 열릴 수 있으며, 파일 다운로드 자체는 광고 차단 여부와 무관하게 계속됩니다.' },
    { icon: ShieldAlert, title: '3. 사용자 책임', text: '사용자는 관련 법령, 게임 및 플랫폼의 약관을 확인하고 스스로 책임져야 합니다. 본 서비스는 특정 결과, 호환성 또는 제재가 없음을 보장하지 않습니다.' },
  ] },
  en: { title: 'Terms of Service', subtitle: 'LocalPatcher service conditions and limits', updated: 'Last updated: July 10, 2026', warning: 'You assume the risks of using trainers. Use in online or multiplayer environments is not recommended.', sections: [
    { icon: FileText, title: '1. Service purpose', text: 'LocalPatcher is a helper tool for translating option text in trainer executables you possess, using your local browser environment.' },
    { icon: ShieldCheck, title: '2. Free operation and advertising', text: 'To keep the service free, we may use minimal advertising revenue and de-identified usage statistics. Starting a download may open an external advertising page in a new tab to support operation; the file download continues regardless of ad-blocking status.' },
    { icon: ShieldAlert, title: '3. User responsibility', text: 'You must review applicable laws and the terms of the game and platform. The service does not guarantee outcomes, compatibility, or absence of enforcement actions.' },
  ] },
  ja: { title: '利用規約', subtitle: 'LocalPatcherの利用条件と責任範囲について', updated: '最終更新日: 2026年7月10日', warning: 'トレーナー利用に伴う結果とリスクは利用者が負います。オンラインまたはマルチプレイヤー環境での利用は推奨しません。', sections: [
    { icon: FileText, title: '1. サービスの目的', text: 'LocalPatcherは、利用者が保有するトレーナー実行ファイルのオプション文言を、ローカルのブラウザ環境で翻訳するための補助ツールです。' },
    { icon: ShieldCheck, title: '2. 無料運営と広告', text: '無料サービスを維持するため、最小限の広告収益と個人を特定しない利用統計を使用する場合があります。ダウンロード開始時に運営支援の外部広告ページが新しいタブで開く場合がありますが、広告ブロックの有無にかかわらずファイルのダウンロードは続行されます。' },
    { icon: ShieldAlert, title: '3. 利用者の責任', text: '利用者は関連法令、ゲームおよびプラットフォームの規約を確認し、自らの責任で利用する必要があります。本サービスは結果、互換性、または制裁がないことを保証しません。' },
  ] },
};

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale: Locale = locale === 'en' || locale === 'ja' || locale === 'ko' ? locale : 'ko';
  const t = getDictionary(currentLocale);
  const page = content[currentLocale];
  return <main className="max-w-4xl mx-auto px-6 py-12"><Link href={`/${currentLocale}`} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400"><ArrowLeft className="w-3.5 h-3.5" />{t.backToHome}</Link><header className="text-center my-12"><FileText className="w-8 h-8 text-cyan-400 mx-auto mb-4" /><h1 className="font-bold text-3xl text-white">{page.title}</h1><p className="text-slate-400 text-sm mt-3">{page.subtitle}</p><p className="text-xs text-slate-500 mt-3">{page.updated}</p></header><p className="p-5 mb-8 rounded-2xl border border-amber-500/20 bg-amber-950/10 text-xs leading-relaxed text-slate-300">{page.warning}</p><div className="space-y-6">{page.sections.map(({ icon: Icon, title, text }) => <section key={title} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20"><Icon className="w-5 h-5 text-cyan-400 mb-3" /><h2 className="font-bold text-white">{title}</h2><p className="text-sm leading-relaxed text-slate-400 mt-3">{text}</p></section>)}</div></main>;
}
