'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { HelpCircle, AlertOctagon, Ban, Lock, ChevronDown, ArrowLeft } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';

interface FAQItemProps {
  question: string;
  answer: string;
  icon: React.ComponentType<{ className?: string }>;
  isOpen: boolean;
  onToggle: () => void;
}

function FAQItem({ question, answer, icon: Icon, isOpen, onToggle }: FAQItemProps) {
  return (
    <div 
      className={`rounded-2xl border transition-all duration-300 overflow-hidden bg-slate-900/10 ${
        isOpen 
          ? 'border-cyan-500/40 shadow-lg shadow-cyan-500/5 bg-slate-900/40' 
          : 'border-slate-800/80 hover:border-slate-700/80'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-6 flex items-center justify-between gap-4 focus:outline-none"
      >
        <div className="flex items-center space-x-3.5">
          <div className={`p-2.5 rounded-xl transition-colors duration-300 shrink-0 ${
            isOpen ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800/50 text-slate-400'
          }`}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="font-bold text-sm md:text-base text-slate-200 hover:text-white transition-colors duration-200">
            {question}
          </span>
        </div>
        <ChevronDown 
          className={`w-4 h-4 text-slate-500 transition-transform duration-300 shrink-0 ${
            isOpen ? 'transform rotate-180 text-cyan-400' : ''
          }`} 
        />
      </button>
      
      <div 
        className={`transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-[500px] border-t border-slate-800/50' : 'max-h-0'
        }`}
      >
        <div className="p-6 text-xs md:text-sm text-slate-400 leading-relaxed bg-slate-950/20">
          {answer}
        </div>
      </div>
    </div>
  );
}

export default function FAQPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = React.use(params);
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';
  const t = getDictionary(currentLocale);
  
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const faqData = {
    ko: {
      title: '자주 묻는 질문 (FAQ)',
      subtitle: '사용법, 안전 지침, 파일 보안에 관한 안내 사항',
      items: [
        {
          icon: AlertOctagon,
          question: '백신 프로그램(또는 Windows Defender)에서 바이러스로 오진합니다. 왜 그런가요?',
          answer: '게임 트레이너는 메모리 내부의 특정 값(골드, 체력 등)을 변경하기 위해 프로세스 메모리 주소 스캔, 후킹(Hooking) 및 메모리 쓰기(Injection) 기능을 수행합니다. 이러한 동작 방식은 악성코드나 트로이 목마와 기술적으로 매우 유사하여 Windows Defender를 포함한 대다수 상용 백신에서 바이러스로 빈번히 감지(오진)됩니다. LocalPatcher는 실행 로직을 건드리지 않고 게임 트레이너 내의 순수 영문 텍스트 영역만 1:1로 덮어씌우는 투명한 웹 매칭 유틸리티이므로 어떠한 시스템 위협도 주지 않습니다.',
        },
        {
          icon: HelpCircle,
          question: '패치 후 트레이너 실행 시 게임이 튕기거나(크래시) 오동작합니다.',
          answer: '트레이너와 실행 중인 게임의 버전이 일치하지 않을 때 일어납니다. LocalPatcher는 데이터베이스에 등록된 무결성이 보장된 원본 트레이너 파일의 고유 해시값(SHA-256)과 용량을 비교해 일치하는 경우에만 패칭 처리를 허용합니다. 만약 해시 검증이 통과되었는데도 튕긴다면 게임이 업데이트되어 오프라인 메모리 맵이 변경되었을 가능성이 큽니다. 올바른 버전의 원본 파일인지 꼭 확인하시고, 무단으로 수정 또는 변조된 트레이너 파일은 사용을 자제해 주시기 바랍니다.',
        },
        {
          icon: Ban,
          question: '스팀(Steam) 계정이 영구 정지(VAC BAN)될 위험이 있나요?',
          answer: '네, 트레이너 사용 시 멀티플레이 온라인 로비에 진입하면 매우 높은 확률로 정지됩니다! 이지 안티치트(Easy Anti-Cheat), 배틀아이(BattlEye) 등 게임에 내장된 보안 솔루션이 트레이너의 활성화 메모리 오프셋을 탐색하는 순간 계정 정지가 실행될 수 있습니다. 이를 예방하려면 반드시 스팀 클라이언트를 [오프라인 모드]로 설정하고 인터넷 랜선을 차단한 상태에서 실행해야 안전합니다. 당사가 상세 기재한 [안티치트 우회 가이드] 탭을 정독해 지침을 준수해 주십시오.',
        },
        {
          icon: Lock,
          question: '제가 분석을 위해 올린 트레이너 파일이 서버에 보관되나요?',
          answer: '전혀 보관되지 않습니다. 당사 플랫폼은 0% 데이터 수집 원칙을 준수합니다. 파일 업로드를 요청하는 대신, 브라우저가 지원하는 HTML5 FileReader 및 ArrayBuffer Web API를 사용하여 모든 이진 바이트 비교 및 문자 치환 과정을 100% 사용자의 컴퓨터 브라우저 메모리 내부에서 해결합니다. 단 1바이트의 트레이너 파일도 당사의 원격 서버로 업로드되지 않으므로 안심하고 사용하셔도 됩니다.',
        },
      ]
    },
    en: {
      title: 'Frequently Asked Questions (FAQ)',
      subtitle: 'Information about usage guidelines, security, and account protection',
      items: [
        {
          icon: AlertOctagon,
          question: 'Why does my antivirus / Windows Defender flag the patched trainer as a threat?',
          answer: 'Game trainers require process hooks and memory injection routines to edit values (like gold, health, items) in real time. Because these behaviors resemble malicious patterns, antivirus tools frequently flag them as false positives. LocalPatcher does not modify or inject any execution logic; we only replace English text strings 1:1 in your local memory. The file remains as clean as the original trainer.',
        },
        {
          icon: HelpCircle,
          question: 'The game crashes or the trainer closes immediately after applying the patch.',
          answer: 'This is usually caused by a mismatch between the game version and the trainer version. LocalPatcher verifies the exact file size and SHA-256 hash against our database of clean official trainers before patching. If it still crashes, ensure your game has not been updated since the trainer was released. Also, avoid trying to patch pre-modified, cracked, or virus-infected trainers.',
        },
        {
          icon: Ban,
          question: 'Can my Steam account get banned for using these trainers?',
          answer: 'Yes. Connecting to online multiplayer sessions or multiplayer lobbies while using any game trainer will likely trigger an anti-cheat ban (e.g., Easy Anti-Cheat or BattlEye). To play with 100% safety, you must set Steam to "Offline Mode," disconnect your internet connection, and follow the steps in our "Anti-Cheat Bypass Guide" tab before launching the game.',
        },
        {
          icon: Lock,
          question: 'Are my uploaded trainer files kept or analyzed on your servers?',
          answer: 'No files are ever uploaded. LocalPatcher strictly follows a zero-storage, local-only data privacy rule. We process files completely client-side in your browser using FileReader and ArrayBuffer Web APIs. All calculations occur inside your local memory, and not a single byte of your trainer file is transmitted over the internet.',
        },
      ]
    },
    ja: {
      title: 'よくある質問 (FAQ)',
      subtitle: '使い方、安全基準、ファイル保護に関するご案内',
      items: [
        {
          icon: AlertOctagon,
          question: 'セキュリティソフト（またはWindows Defender）でウイルスとして検出されるのはなぜですか？',
          answer: 'ゲームトレーナーは、メモリ内の数値を直接改変するために「メモリインジェクション」や「プロセスフッキング」などの技術を使用します。これらの挙動は不正プログラムのパターンと酷似しているため、多くのセキュリティソフトで「誤検出（False Positive）」されます。当サイトのツールは、実行コードを一切改変せず、英語のオプションテキストのみを1:1で置換するため、ファイル本体の安全性は完全に維持されます。',
        },
        {
          icon: HelpCircle,
          question: 'パッチを当てた後にトレーナーを実行すると、ゲームがクラッシュまたは強制終了します。',
          answer: 'ゲームのバージョンとトレーナーのバージョンが一致していない可能性があります。当サイトではデータベースに登録された安全なオリジナルファイルのSHA-256ハッシュ値とファイルサイズを照合し、一致した場合のみパッチを適用できるようにしています。ハッシュ検証に合格してもエラーになる場合は、ゲーム本体がアップデートされた可能性が高いので、正しいバージョンであるか再確認してください。',
        },
        {
          icon: Ban,
          question: 'Steamアカウントが停止（BAN）される危険性はありますか？',
          answer: 'はい、非常に危険です。トレーナーを起動した状態でオンラインマルチプレイヤーやマルチプレイ用のロビーに接続すると、Easy Anti-Cheat（EAC）やBattlEyeなどのセキュリティシステムによって検出され、永久アカウント停止（BAN）になります。パッチを使用する際は、必ずSteamクライアントを「オフラインモード」に切り替え、インターネット接続を切断したシングルプレイ専用環境でプレイしてください。詳細は「アンチチート回避ガイド」をご確認ください。',
        },
        {
          icon: Lock,
          question: 'ローカライズのために選択したファイルがサーバーに保存されることはありますか？',
          answer: '一切ありません。当サイトは「データ収集ゼロ（0%）」のポリシーを遵守しています。HTML5のFileReaderおよびArrayBuffer Web APIを活用し、すべての比較とテキスト置換処理を100%ユーザーのPC（ブラウザメモリ内）で実行します。ファイルデータが外部サーバーへ送信されることは一切ありませんのでご安心ください。',
        },
      ]
    },
  };

  const localizedContent = faqData[currentLocale as Locale] || faqData.ko;

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
          <HelpCircle className="w-3.5 h-3.5" />
          <span>FAQ</span>
        </div>
        <h1 className="font-bold text-3xl md:text-4xl tracking-tight mb-3 text-white font-outfit">
          {localizedContent.title}
        </h1>
        <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
          {localizedContent.subtitle}
        </p>
      </div>

      {/* FAQ Cards */}
      <div className="space-y-4">
        {localizedContent.items.map((item, idx) => (
          <FAQItem
            key={idx}
            question={item.question}
            answer={item.answer}
            icon={item.icon}
            isOpen={openIndex === idx}
            onToggle={() => handleToggle(idx)}
          />
        ))}
      </div>
    </div>
  );
}
