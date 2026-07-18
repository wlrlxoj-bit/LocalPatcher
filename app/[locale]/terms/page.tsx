import Link from 'next/link';
import { ArrowLeft, FileText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { SITE_URL, localizedAlternates } from '@/lib/site';

type Section = { title: string; text: string; icon: typeof FileText };
type Content = { title: string; subtitle: string; updated: string; warning: string; privacy: string; sections: Section[] };

const content: Record<Locale, Content> = {
  ko: {
    title: '이용약관',
    subtitle: 'LocalPatcher 서비스 이용에 관한 권리, 의무 및 책임',
    updated: '시행일: 2026년 7월 11일',
    warning: '트레이너와 변환 파일의 사용에는 게임 데이터 손상, 보안 프로그램의 탐지, 게임 또는 플랫폼의 제재 위험이 따를 수 있습니다. 특히 온라인·멀티플레이·안티치트 환경에서는 사용하지 마세요.',
    privacy: '개인정보, 분석 및 외부·제휴 링크에 관한 자세한 사항은 개인정보처리방침을 확인해 주세요.',
    sections: [
      { icon: FileText, title: '1. 목적 및 약관 동의', text: '이 약관은 LocalPatcher가 제공하는 웹사이트, 파일 변환 기능, 안내 콘텐츠 및 관련 기능(이하 “서비스”)의 이용 조건을 정합니다. 서비스를 접속하거나 이용하면 이 약관과 개인정보처리방침을 확인하고 동의한 것으로 봅니다. 동의하지 않는 경우 서비스를 이용하지 않아야 합니다.' },
      { icon: ShieldCheck, title: '2. 운영 주체 및 적용 범위', text: '서비스는 개인 운영자인 “LocalPatcher 운영자”가 제공합니다. 이 약관은 별도로 명시된 조건이 없는 한 LocalPatcher의 한국어·영어·일본어 페이지와 그에 부수되는 기능에 동일하게 적용됩니다.' },
      { icon: FileText, title: '3. 무료 서비스와 로컬 파일 처리', text: '서비스는 현재 무료로 제공됩니다. 지원되는 트레이너 실행 파일을 사용자의 브라우저에서 선택하여 표시 문구를 변환하도록 돕습니다. 변환 대상 파일의 핵심 처리는 브라우저의 로컬 환경에서 이루어지도록 설계되어 있으나, 사용자는 중요한 원본 파일을 별도로 백업하고 결과를 직접 확인해야 합니다.' },
      { icon: ShieldCheck, title: '4. 분석 및 광고 정책', text: '서비스 이용 현황을 파악하기 위해 Google Analytics 4를 사용할 수 있습니다. 현재 외부 팝업 광고와 Google 광고, 광고 게이트 및 광고 차단 감지는 사용하지 않습니다. 향후 광고 또는 제휴 사용 방식이 달라지면 관련 고지를 실제 적용 전에 갱신합니다.' },
      { icon: ShieldAlert, title: '5. 사용자의 권리 보유 및 책임', text: '사용자는 변환하거나 이용하는 파일을 적법하게 보유·사용할 권한이 있어야 하며, 관련 법령과 게임·플랫폼·트레이너 제공자의 약관을 확인해야 합니다. 파일 선택, 백업, 변환 결과의 검토 및 실제 사용에 따른 책임은 사용자에게 있습니다.' },
      { icon: ShieldAlert, title: '6. 금지행위', text: '서비스 또는 서버에 대한 무단 접근, 보안 우회, 과도한 자동 요청, 악성코드 유포, 타인의 권리 침해, 불법 목적의 이용, 서비스 운영 방해, 허가 없는 복제·재판매·재배포를 금지합니다. 운영자는 위반이 의심되는 이용을 합리적인 범위에서 제한할 수 있습니다.' },
      { icon: ShieldAlert, title: '7. 온라인 게임 및 안티치트 위험', text: '트레이너나 변환 파일을 온라인, 멀티플레이 또는 안티치트가 작동하는 환경에서 사용하면 계정 정지, 이용 제한 또는 데이터 손상이 발생할 수 있습니다. 서비스는 오프라인·싱글플레이 환경에서의 신중한 사용을 전제로 하며 어떠한 제재 회피도 보장하거나 지원하지 않습니다.' },
      { icon: FileText, title: '8. FLiNG, 외부 링크 및 제휴 링크', text: '서비스는 편의를 위해 FLiNG 공식 페이지, 게임 구매처, 다운로드 출처 또는 제휴 링크로 연결할 수 있습니다. 외부 사이트는 각 운영자의 정책과 책임 아래 제공되며 LocalPatcher는 그 내용, 파일, 보안, 가용성 또는 거래를 통제하거나 보증하지 않습니다. 링크를 열기 전에 주소와 파일 출처를 확인하세요.' },
      { icon: ShieldCheck, title: '9. 지식재산권 및 비제휴 고지', text: 'LocalPatcher의 자체 디자인, 문구 및 코드에 관한 권리는 운영자 또는 정당한 권리자에게 있습니다. 게임명, 상표, 로고, 트레이너 및 관련 저작물은 각 권리자에게 귀속됩니다. 명시적인 표시가 없는 한 LocalPatcher는 게임 개발사·배급사·플랫폼 또는 FLiNG과 제휴하거나 이들의 승인을 받은 서비스가 아닙니다.' },
      { icon: FileText, title: '10. 서비스 변경·중단·종료', text: '운영자는 보안, 유지보수, 법률·정책 변경, 기술적 문제 또는 운영상 필요에 따라 서비스의 전부 또는 일부를 수정·제한·중단·종료할 수 있습니다. 가능한 경우 중요한 변경을 사이트에 안내하되, 긴급하거나 통제할 수 없는 사유가 있으면 사전 안내가 어려울 수 있습니다.' },
      { icon: ShieldAlert, title: '11. 보증의 부인', text: '서비스는 현재 상태와 이용 가능한 범위에서 제공됩니다. 운영자는 특정 목적 적합성, 오류나 중단의 부재, 모든 파일·버전과의 호환성, 변환의 완전성, 외부 파일의 안전성 또는 특정 결과를 보증하지 않습니다. 사용자는 변환 전 원본을 백업하고 보안 검사를 수행해야 합니다.' },
      { icon: ShieldCheck, title: '12. 책임의 합리적 제한', text: '법률이 허용하는 범위에서 운영자는 무료 서비스 이용으로 발생한 간접·특별·부수적 손해, 데이터 손실 또는 기대이익 상실에 책임을 지지 않습니다. 다만 운영자의 고의 또는 중대한 과실로 인한 손해, 생명·신체에 관한 손해 및 관련 강행법규상 제한할 수 없는 책임에는 이 제한이 적용되지 않습니다.' },
      { icon: FileText, title: '13. 개인정보처리방침', text: '개인정보, 쿠키, 분석 및 광고 서비스의 처리 기준은 별도의 개인정보처리방침에 따릅니다. 개인정보처리방침은 이 약관의 일부로 함께 적용되며, 서비스 이용 전 확인할 것을 권장합니다.' },
      { icon: ShieldCheck, title: '14. 약관 변경, 준거법, 관할 및 언어', text: '운영자는 필요한 경우 약관을 변경하고 시행일과 함께 사이트에 게시합니다. 이용자에게 중대한 영향을 주는 변경은 합리적인 사전 기간을 두고 게시하며, 법률상 별도의 동의가 필요한 경우 그 동의를 받습니다. 관련 법률이 허용하는 범위에서 변경 후 서비스를 계속 이용하면 변경 약관에 동의한 것으로 봅니다. 이 약관과 서비스 이용 관계에는 대한민국 법률을 적용하되, 이용자 거주국의 배제할 수 없는 소비자보호 강행규정은 제한하지 않습니다. 분쟁은 대한민국 민사소송법에 따른 관할 법원에서 해결합니다. 번역본과 한국어본이 충돌하는 경우 관련 법률이 허용하는 범위에서 한국어본을 우선합니다.' },
    ],
  },
  en: {
    title: 'Terms of Service',
    subtitle: 'Rights, obligations, and responsibilities for using LocalPatcher',
    updated: 'Effective: July 11, 2026',
    warning: 'Using trainers or converted files may result in corrupted game data, security-software alerts, or enforcement by a game or platform. Do not use them in online, multiplayer, or anti-cheat environments.',
    privacy: 'For details about privacy, analytics, and external or affiliate links, please review the Privacy Policy.',
    sections: [
      { icon: FileText, title: '1. Purpose and acceptance', text: 'These Terms govern your use of the LocalPatcher website, file-conversion tools, guidance, and related features (the “Service”). By accessing or using the Service, you acknowledge and agree to these Terms and the Privacy Policy. If you do not agree, do not use the Service.' },
      { icon: ShieldCheck, title: '2. Operator and scope', text: 'The Service is provided by the individual operator identified as the “LocalPatcher Operator.” Unless separate terms are expressly stated, these Terms apply equally to the Korean, English, and Japanese pages and their related features.' },
      { icon: FileText, title: '3. Free service and local file processing', text: 'The Service is currently provided free of charge. It helps users select supported trainer executable files and convert displayed text in their browser. Core processing of the selected file is designed to occur locally in the browser; however, users must keep a separate backup and independently verify every result.' },
      { icon: ShieldCheck, title: '4. Analytics and advertising policy', text: 'The Service may use Google Analytics 4 to understand usage. We currently do not use external popup ads, Google advertising, advertising gates, or ad-block detection. If advertising or affiliate practices change, the related notice will be updated before they are put into use.' },
      { icon: ShieldAlert, title: '5. User rights and responsibility', text: 'You must have the lawful right to possess and use every file you convert or use, and you must review applicable laws and the terms of the relevant game, platform, and trainer provider. You are responsible for file selection, backups, review of converted output, and actual use.' },
      { icon: ShieldAlert, title: '6. Prohibited conduct', text: 'You may not gain unauthorized access, bypass security, send excessive automated requests, distribute malware, infringe others’ rights, use the Service unlawfully, disrupt its operation, or reproduce, resell, or redistribute it without permission. The Operator may reasonably restrict suspected violations.' },
      { icon: ShieldAlert, title: '7. Online games and anti-cheat risks', text: 'Using trainers or converted files in online, multiplayer, or anti-cheat environments may cause account suspension, access restrictions, or data loss. The Service assumes cautious offline, single-player use and neither guarantees nor assists with avoiding enforcement.' },
      { icon: FileText, title: '8. FLiNG, external links, and affiliate links', text: 'For convenience, the Service may link to official FLiNG pages, game stores, download sources, or affiliate destinations. Those services operate under their own policies and responsibility. LocalPatcher does not control or guarantee their content, files, security, availability, or transactions. Verify the address and source before opening or downloading.' },
      { icon: ShieldCheck, title: '9. Intellectual property and no affiliation', text: 'Rights in LocalPatcher’s original design, text, and code belong to the Operator or their lawful owners. Game names, trademarks, logos, trainers, and related works belong to their respective owners. Unless expressly stated, LocalPatcher is not affiliated with, endorsed by, or sponsored by any game developer, publisher, platform, or FLiNG.' },
      { icon: FileText, title: '10. Changes, suspension, and termination', text: 'The Operator may modify, restrict, suspend, or terminate all or part of the Service for security, maintenance, legal or policy changes, technical issues, or operational needs. Material changes will be announced on the site when reasonably possible, but advance notice may be unavailable in emergencies or circumstances beyond the Operator’s control.' },
      { icon: ShieldAlert, title: '11. Disclaimer of warranties', text: 'The Service is provided “as is” and “as available.” The Operator does not warrant fitness for a particular purpose, uninterrupted or error-free operation, compatibility with every file or version, complete conversion, the safety of external files, or any particular outcome. Back up originals and perform appropriate security checks.' },
      { icon: ShieldCheck, title: '12. Reasonable limitation of liability', text: 'To the extent permitted by law, the Operator is not liable for indirect, special, incidental, or consequential loss, loss of data, or lost expected profits arising from this free Service. This limitation does not apply to intentional misconduct or gross negligence, injury to life or body, or liability that cannot be limited under mandatory law.' },
      { icon: FileText, title: '13. Privacy Policy', text: 'The separate Privacy Policy governs the processing of privacy-related information, cookies, analytics, and advertising services. It forms part of these Terms, and you should review it before using the Service.' },
      { icon: ShieldCheck, title: '14. Amendments, governing law, jurisdiction, and language', text: 'The Operator may amend these Terms and publish the effective date on the site. Changes that materially affect users will be posted with reasonable advance notice, and separate consent will be obtained when required by law. To the extent permitted by applicable law, continued use after an amendment constitutes acceptance. These Terms and the Service are governed by the laws of the Republic of Korea, without limiting mandatory consumer protections that cannot be excluded under the law of your country of residence. Disputes are submitted to the court having jurisdiction under the Civil Procedure Act of the Republic of Korea. If a translation conflicts with the Korean version, the Korean version controls to the extent permitted by law.' },
    ],
  },
  ja: {
    title: '利用規約',
    subtitle: 'LocalPatcherの利用に関する権利、義務および責任',
    updated: '施行日：2026年7月11日',
    warning: 'トレーナーや変換済みファイルの使用により、ゲームデータの破損、セキュリティソフトによる検知、ゲームまたはプラットフォームからの制裁が生じる場合があります。オンライン、マルチプレイ、アンチチート環境では使用しないでください。',
    privacy: 'プライバシー、分析、外部・アフィリエイトリンクの詳細については、プライバシーポリシーをご確認ください。',
    sections: [
      { icon: FileText, title: '1. 目的および規約への同意', text: '本規約は、LocalPatcherのウェブサイト、ファイル変換機能、案内コンテンツおよび関連機能（以下「本サービス」）の利用条件を定めます。本サービスにアクセスまたは利用することにより、本規約およびプライバシーポリシーを確認し、同意したものとみなされます。同意しない場合は利用しないでください。' },
      { icon: ShieldCheck, title: '2. 運営主体および適用範囲', text: '本サービスは、個人運営者である「LocalPatcher運営者」が提供します。別途明示されない限り、本規約は韓国語・英語・日本語の各ページおよび付随する機能に同様に適用されます。' },
      { icon: FileText, title: '3. 無料サービスおよびローカル処理', text: '本サービスは現在無料で提供されています。対応するトレーナー実行ファイルをブラウザで選択し、表示文言を変換することを補助します。対象ファイルの主要な処理はブラウザ内のローカル環境で行われるよう設計されていますが、利用者は原本を別途バックアップし、結果を自ら確認する必要があります。' },
      { icon: ShieldCheck, title: '4. 分析・広告方針', text: '利用状況を把握するためGoogle Analytics 4を使用する場合があります。現在、外部ポップアップ広告、Google広告、広告ゲート、広告ブロック検知は使用していません。今後、広告またはアフィリエイトの利用方法を変更する場合は、実際の適用前に関連する告知を更新します。' },
      { icon: ShieldAlert, title: '5. 利用者の権利および責任', text: '利用者は、変換または使用するファイルを適法に保有・利用する権限を有し、関連法令ならびにゲーム、プラットフォーム、トレーナー提供者の規約を確認しなければなりません。ファイルの選択、バックアップ、変換結果の確認および実際の使用は利用者の責任です。' },
      { icon: ShieldAlert, title: '6. 禁止事項', text: '不正アクセス、セキュリティの回避、過度な自動リクエスト、マルウェアの配布、第三者の権利侵害、違法目的での利用、運営妨害、許可のない複製・再販売・再配布を禁止します。運営者は違反が疑われる利用を合理的な範囲で制限できます。' },
      { icon: ShieldAlert, title: '7. オンラインゲームおよびアンチチートの危険', text: 'オンライン、マルチプレイまたはアンチチートが作動する環境でトレーナーや変換済みファイルを使用すると、アカウント停止、利用制限またはデータ破損が生じる場合があります。本サービスは慎重なオフライン・シングルプレイ利用を前提とし、制裁の回避を保証または支援しません。' },
      { icon: FileText, title: '8. FLiNG、外部リンクおよびアフィリエイトリンク', text: '利便性のため、FLiNG公式ページ、ゲームストア、ダウンロード元またはアフィリエイトリンクを提供する場合があります。外部サイトは各運営者の方針と責任で提供され、LocalPatcherはその内容、ファイル、安全性、可用性または取引を管理・保証しません。アクセスやダウンロードの前にURLと提供元を確認してください。' },
      { icon: ShieldCheck, title: '9. 知的財産権および非提携の表示', text: 'LocalPatcher独自のデザイン、文章およびコードの権利は運営者または正当な権利者に帰属します。ゲーム名、商標、ロゴ、トレーナーおよび関連著作物は各権利者に帰属します。明示がない限り、LocalPatcherはゲーム開発者、販売元、プラットフォームまたはFLiNGと提携せず、承認・後援を受けていません。' },
      { icon: FileText, title: '10. サービスの変更・停止・終了', text: '運営者は、セキュリティ、保守、法令・方針の変更、技術上の問題または運営上の必要により、本サービスの全部または一部を変更、制限、停止または終了できます。合理的に可能な場合は重要な変更をサイトで案内しますが、緊急時または管理不能な事情では事前案内できない場合があります。' },
      { icon: ShieldAlert, title: '11. 保証の否認', text: '本サービスは現状有姿かつ提供可能な範囲で提供されます。運営者は、特定目的への適合性、無停止・無誤謬、すべてのファイルやバージョンとの互換性、変換の完全性、外部ファイルの安全性または特定の結果を保証しません。利用前に原本をバックアップし、適切なセキュリティ確認を行ってください。' },
      { icon: ShieldCheck, title: '12. 合理的な責任制限', text: '法令で認められる範囲で、運営者は無料の本サービスに起因する間接的、特別、付随的または結果的損害、データ喪失、期待利益の喪失について責任を負いません。ただし、運営者の故意または重大な過失、生命・身体に関する損害、強行法規上制限できない責任には適用されません。' },
      { icon: FileText, title: '13. プライバシーポリシー', text: 'プライバシーに関する情報、Cookie、分析および広告サービスの取扱いは、別途定めるプライバシーポリシーに従います。同ポリシーは本規約の一部として適用されるため、利用前にご確認ください。' },
      { icon: ShieldCheck, title: '14. 規約変更、準拠法、管轄および言語', text: '運営者は必要に応じて本規約を変更し、施行日とともにサイトへ掲載します。利用者に重大な影響を与える変更は合理的な事前期間を設けて掲載し、法令上別途の同意が必要な場合はその同意を得ます。適用法令で認められる範囲で、変更後も利用を継続した場合は変更規約に同意したものとみなします。本規約および利用関係には大韓民国法を適用しますが、利用者の居住国で排除できない消費者保護の強行規定を制限しません。紛争は大韓民国民事訴訟法上の管轄裁判所で解決します。翻訳版と韓国語版が矛盾する場合、法令で認められる範囲で韓国語版を優先します。' },
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
      canonical: `${SITE_URL}/${currentLocale}/terms`,
      languages: localizedAlternates('/terms'),
    },
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale: Locale = locale === 'en' || locale === 'ja' || locale === 'ko' ? locale : 'ko';
  const t = getDictionary(currentLocale);
  const page = content[currentLocale];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href={`/${currentLocale}`} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition-colors hover:text-cyan-400">
        <ArrowLeft className="h-3.5 w-3.5" />{t.backToHome}
      </Link>
      <header className="my-10 text-center sm:my-14">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
          <FileText className="h-7 w-7 text-cyan-400" />
        </div>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{page.title}</h1>
        <p className="mt-3 text-sm text-slate-400">{page.subtitle}</p>
        <p className="mt-3 text-xs text-slate-500">{page.updated}</p>
      </header>
      <div className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-950/20 p-5 sm:p-6">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm leading-7 text-slate-300">{page.warning}</p>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {page.sections.map(({ icon: Icon, title, text }) => (
          <section key={title} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 transition-colors hover:border-slate-700 sm:p-6">
            <Icon className="mb-3 h-5 w-5 text-cyan-400" />
            <h2 className="font-bold leading-6 text-white">{title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">{text}</p>
          </section>
        ))}
      </div>
      <aside className="mt-8 rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-5 text-sm leading-7 text-slate-300 sm:p-6">
        {page.privacy}{' '}
        <Link href={`/${currentLocale}/privacy`} className="font-semibold text-cyan-400 underline decoration-cyan-400/30 underline-offset-4 hover:text-cyan-300">
          {currentLocale === 'ko' ? '개인정보처리방침 보기' : currentLocale === 'ja' ? 'プライバシーポリシーを見る' : 'View Privacy Policy'}
        </Link>
      </aside>
    </main>
  );
}
