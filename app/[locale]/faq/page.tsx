'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertOctagon, Ban, ChevronDown, HelpCircle, Lock } from 'lucide-react';

type Locale = 'ko' | 'en' | 'ja';
const copy = {
  ko: { title: '자주 묻는 질문', sub: '파일 처리, 백신 경고 및 안전 이용 안내', guide: '전체 안전 가이드 보기', items: [
    [AlertOctagon, '백신이 파일을 위험하다고 표시하면 어떻게 하나요?', '트레이너의 메모리 조작 방식 때문에 탐지될 수 있지만 모든 경고가 오진인 것은 아닙니다. 공식 배포처, 디지털 서명, 게시된 해시와 복수의 최신 검사 결과를 확인하고, 의심스러우면 실행하지 마세요. 백신 예외 등록을 무조건 권장하지 않습니다.'],
    [HelpCircle, '패치 후 게임이나 트레이너가 종료됩니다.', '게임과 트레이너 버전이 다르거나 원본 파일이 변경되었을 수 있습니다. 공식 배포처의 원본을 다시 확인하고 세이브 파일을 백업하세요. LocalPatcher의 해시 확인은 파일 안전이나 정상 작동을 보증하지 않습니다.'],
    [Ban, '온라인에서 사용해도 안전한가요?', '아니요. 온라인·멀티플레이·경쟁·안티치트 환경에서는 사용하지 마세요. 인터넷 연결을 끊거나 오프라인 모드를 선택하는 것만으로 제재 방지나 안전이 보장되지 않습니다. LocalPatcher는 안티치트 우회 방법을 제공하지 않습니다.'],
    [Lock, '선택한 트레이너 파일이 서버에 저장되나요?', '변환 대상 파일은 브라우저에서 로컬로 처리되며 LocalPatcher 자체 데이터베이스에 업로드하거나 저장하지 않습니다. GA4가 접속·기기·이용 정보를 처리할 수 있으며, 현재 Google 광고는 사용하지 않습니다. 자세한 내용은 개인정보처리방침을 확인하세요.'],
  ]},
  en: { title: 'Frequently Asked Questions', sub: 'File processing, antivirus alerts, and safer use', guide: 'Read the full safety guide', items: [
    [AlertOctagon, 'What should I do if antivirus flags a file?', 'Trainer behavior may trigger detection, but not every alert is a false positive. Check the official source, digital signature, published hash, and multiple up-to-date scan results. Do not run suspicious files. We do not automatically recommend adding antivirus exclusions.'],
    [HelpCircle, 'The game or trainer closes after patching.', 'The game and trainer versions may differ, or the original file may have changed. Recheck the official original and back up save files. LocalPatcher hash checks do not guarantee file safety or correct operation.'],
    [Ban, 'Is it safe to use online?', 'No. Do not use trainers in online, multiplayer, competitive, or anti-cheat environments. Disconnecting the internet or selecting offline mode alone does not guarantee safety or prevent sanctions. LocalPatcher does not provide anti-cheat bypass instructions.'],
    [Lock, 'Is my selected trainer file stored on a server?', 'The selected file is processed locally in your browser and is not uploaded to or stored in LocalPatcher’s own database. GA4 may process access, device, and usage information. Google advertising is not currently used. See the Privacy Policy for details.'],
  ]},
  ja: { title: 'よくある質問', sub: 'ファイル処理、ウイルス対策の警告、安全利用について', guide: '安全ガイドをすべて確認', items: [
    [AlertOctagon, 'ウイルス対策ソフトが警告した場合は？', 'トレーナーの動作により検出される場合がありますが、すべてが誤検出とは限りません。公式配布元、デジタル署名、公開ハッシュ、複数の最新スキャン結果を確認し、疑わしい場合は実行しないでください。除外登録を無条件には推奨しません。'],
    [HelpCircle, 'パッチ後にゲームやトレーナーが終了します。', 'ゲームとトレーナーのバージョンが異なるか、元ファイルが変更されている可能性があります。公式の元ファイルを再確認し、セーブデータをバックアップしてください。ハッシュ確認は安全性や正常動作を保証しません。'],
    [Ban, 'オンラインで使用しても安全ですか？', 'いいえ。オンライン、マルチプレイ、競争、アンチチート環境では使用しないでください。通信切断やオフラインモードだけで、安全や制裁回避が保証されることはありません。LocalPatcherはアンチチート回避方法を案内しません。'],
    [Lock, '選択したファイルはサーバーに保存されますか？', '対象ファイルはブラウザ内でローカル処理され、LocalPatcher独自のデータベースへアップロード・保存されません。GA4がアクセス・端末・利用情報を処理する場合があります。現在Google広告は使用していません。詳細はプライバシーポリシーをご覧ください。'],
  ]},
} as const;

export default function FAQPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = React.use(params);
  const currentLocale: Locale = locale === 'en' || locale === 'ja' ? locale : 'ko';
  const t = copy[currentLocale];
  const [open, setOpen] = useState<number | null>(null);

  return (
    <main className="max-w-4xl mx-auto px-5 py-10 md:py-14">
      <header className="text-center mb-10">
        <HelpCircle className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
        <h1 className="text-3xl md:text-4xl font-bold text-white font-outfit">{t.title}</h1>
        <p className="mt-3 text-sm text-slate-400">{t.sub}</p>
      </header>

      <div className="space-y-4">
        {t.items.map(([Icon, q, a], i) => {
          const buttonId = `faq-button-${i}`;
          const panelId = `faq-panel-${i}`;
          const isOpen = open === i;

          return (
            <section key={q} className="rounded-2xl border border-slate-800 overflow-hidden">
              <h2>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full p-5 flex items-center gap-3 text-left text-sm md:text-base font-bold text-slate-200"
                >
                  <Icon className="w-5 h-5 text-cyan-400 shrink-0" />
                  <span className="flex-1">{q}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </h2>
              {isOpen && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="px-5 pb-5 pt-1 text-sm text-slate-400 leading-relaxed border-t border-slate-800"
                >
                  {a}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Link href={`/${currentLocale}/guides`} className="mt-8 inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300">
        <AlertOctagon className="w-4 h-4" />
        {t.guide}
      </Link>
    </main>
  );
}
