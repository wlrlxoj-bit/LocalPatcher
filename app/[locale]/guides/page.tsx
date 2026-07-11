import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldAlert } from 'lucide-react';

type Locale = 'ko' | 'en' | 'ja';

const content = {
  ko: {
    title: '트레이너 안전 이용 가이드',
    description: '온라인·안티치트 환경을 피하고 트레이너 파일을 신중하게 확인하는 기본 안전 수칙입니다.',
    warningTitle: '온라인·멀티플레이에서는 사용하지 마세요',
    warning: '경쟁 모드, 멀티플레이, 순위표 및 안티치트가 작동하는 환경에서 트레이너를 사용하면 운영정책 위반, 계정 정지 또는 데이터 손상이 발생할 수 있습니다. 오프라인 사용도 제재나 안전을 보장하지 않습니다.',
    sections: [
      ['공식 오프라인 기능만 확인', '게임 개발사나 플랫폼이 공식적으로 제공하는 싱글플레이·오프라인 옵션만 공식 문서에서 확인해 사용하세요. 인터넷 연결을 끊는 것만으로 안티치트가 비활성화되거나 안전해지는 것은 아닙니다.'],
      ['우회·보호 파일 변경 미지원', 'LocalPatcher는 안티치트 우회, 보호된 실행 파일 변경, DLL 주입, 커스텀 로더 또는 보안 기능 무력화 방법을 제공하거나 지원하지 않습니다.'],
      ['실행 전 파일 확인', '게임과 트레이너 버전을 맞추고, 중요한 세이브 파일을 별도 위치에 백업하세요. 트레이너는 제작자의 공식 배포처에서 받고, 가능하면 디지털 서명과 게시된 해시를 확인하세요.'],
      ['백신 경고를 무조건 무시하지 않기', '메모리 조작 도구는 백신에 탐지될 수 있지만 모든 경고가 오진인 것은 아닙니다. 최신 백신과 복수 검사 서비스를 참고하고, 출처·서명·해시가 불명확하거나 결과가 의심스러우면 실행하지 마세요.'],
    ],
    note: '파일 사용과 계정 제재에 대한 최종 책임은 이용자에게 있습니다. LocalPatcher의 로컬 변환이나 해시 확인은 원본 또는 결과 파일의 안전성을 보증하지 않습니다.',
    terms: '이용약관', privacy: '개인정보처리방침', badge: 'SAFETY FIRST',
  },
  en: {
    title: 'Trainer Safety Guide', description: 'Basic precautions for avoiding online and anti-cheat environments and checking trainer files carefully.',
    warningTitle: 'Do not use trainers in online or multiplayer modes',
    warning: 'Using trainers in competitive, multiplayer, ranked, or anti-cheat-protected environments may violate platform rules, cause account sanctions, or damage data. Offline use does not guarantee safety or protection from sanctions.',
    sections: [
      ['Use only official offline features', 'Use only single-player or offline options officially provided by the developer or platform, and confirm them in official documentation. Disconnecting the internet alone does not disable anti-cheat or make trainer use safe.'],
      ['No bypass or protected-file modification support', 'LocalPatcher does not provide or support anti-cheat bypasses, protected executable changes, DLL injection, custom loaders, or instructions for disabling security controls.'],
      ['Check files before running them', 'Match the game and trainer versions and back up important save files separately. Obtain trainers from the publisher’s official source and verify digital signatures and published hashes when available.'],
      ['Never dismiss antivirus warnings automatically', 'Memory-modifying tools may be detected, but not every alert is a false positive. Check with updated antivirus tools and multiple scanners. Do not run a file if its source, signature, hash, or scan results are suspicious.'],
    ],
    note: 'You remain responsible for file use and account sanctions. Local processing or hash checks by LocalPatcher do not guarantee the safety of the original or resulting file.',
    terms: 'Terms of Service', privacy: 'Privacy Policy', badge: 'SAFETY FIRST',
  },
  ja: {
    title: 'トレーナー安全利用ガイド', description: 'オンライン・アンチチート環境を避け、トレーナーファイルを慎重に確認するための基本的な安全ルールです。',
    warningTitle: 'オンライン・マルチプレイでは使用しないでください',
    warning: '競争、マルチプレイ、ランキング、アンチチートが動作する環境での使用は、規約違反、アカウント制裁、データ破損につながる可能性があります。オフライン利用でも安全や制裁回避は保証されません。',
    sections: [
      ['公式のオフライン機能のみ確認', '開発元やプラットフォームが公式に提供するシングルプレイ・オフライン機能だけを公式文書で確認してください。通信を切断するだけでアンチチートが無効になったり、安全になったりするわけではありません。'],
      ['回避・保護ファイル変更は非対応', 'LocalPatcherは、アンチチート回避、保護された実行ファイルの変更、DLLインジェクション、カスタムローダー、セキュリティ機能の無効化を案内・支援しません。'],
      ['実行前にファイルを確認', 'ゲームとトレーナーのバージョンを合わせ、重要なセーブデータを別の場所にバックアップしてください。公式配布元から入手し、可能であればデジタル署名と公開ハッシュを確認してください。'],
      ['ウイルス対策の警告を無条件に無視しない', 'メモリ操作ツールは検出される場合がありますが、すべてが誤検出とは限りません。最新の対策ソフトと複数のスキャン結果を確認し、出所・署名・ハッシュ・検査結果が疑わしい場合は実行しないでください。'],
    ],
    note: 'ファイル利用とアカウント制裁の最終責任は利用者にあります。LocalPatcherのローカル処理やハッシュ確認は、元ファイルまたは出力ファイルの安全性を保証しません。',
    terms: '利用規約', privacy: 'プライバシーポリシー', badge: 'SAFETY FIRST',
  },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = locale === 'en' || locale === 'ja' ? locale : 'ko';
  const t = content[currentLocale];
  return { title: `${t.title} | LocalPatcher`, description: t.description, alternates: { canonical: `https://localpatcher.com/${currentLocale}/guides`, languages: { ko: 'https://localpatcher.com/ko/guides', en: 'https://localpatcher.com/en/guides', ja: 'https://localpatcher.com/ja/guides' } } };
}

export default async function GuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale: Locale = locale === 'en' || locale === 'ja' ? locale : 'ko';
  const t = content[currentLocale];
  return <main className="max-w-4xl mx-auto px-5 py-10 md:py-14">
    <header className="text-center mb-10">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/30 text-xs font-bold text-cyan-400 mb-4"><ShieldAlert className="w-4 h-4" />{t.badge}</div>
      <h1 className="font-bold text-3xl md:text-4xl text-white font-outfit">{t.title}</h1>
      <p className="mt-3 text-sm text-slate-400 leading-relaxed">{t.description}</p>
    </header>
    <section className="p-6 rounded-2xl border border-red-500/30 bg-red-950/20 mb-8 flex gap-4" aria-labelledby="online-warning">
      <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
      <div><h2 id="online-warning" className="font-bold text-red-300">{t.warningTitle}</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{t.warning}</p></div>
    </section>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {t.sections.map(([title, text]) => <section key={title} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20"><CheckCircle2 className="w-5 h-5 text-cyan-400 mb-3" /><h2 className="font-bold text-white">{title}</h2><p className="mt-2 text-sm text-slate-400 leading-relaxed">{text}</p></section>)}
    </div>
    <p className="mt-8 p-5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-slate-300 leading-relaxed">{t.note}</p>
    <nav aria-label="Legal" className="mt-6 flex flex-wrap gap-3 text-sm"><Link href={`/${currentLocale}/terms`} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">{t.terms}<ExternalLink className="w-3.5 h-3.5" /></Link><Link href={`/${currentLocale}/privacy`} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">{t.privacy}<ExternalLink className="w-3.5 h-3.5" /></Link></nav>
  </main>;
}
