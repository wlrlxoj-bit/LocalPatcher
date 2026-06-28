import React from 'react';
import Link from 'next/link';
import { FileText, ShieldAlert, Scale, ArrowLeft, ShieldCheck } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';
  const t = getDictionary(currentLocale);

  const content = {
    ko: {
      title: '이용 약관',
      subtitle: 'LocalPatcher 서비스 이용 조건 및 책임 한계 고지',
      lastUpdated: '최종 수정일: 2026년 6월 29일',
      sections: [
        {
          icon: FileText,
          title: '1. 목적 및 정의 (Purpose)',
          text: 'LocalPatcher는 게임 트레이너 실행 파일(.exe)의 바이너리 내에서 영문 옵션 문자열의 메모리 오프셋을 탐색하여, 사용자 지정 언어 문자열로 1:1 치환(대체)해 주는 오프라인 텍스트 전용 오프셋 매칭 유틸리티입니다. 어떠한 게임의 실행 코드 자체를 리버스 엔지니어링하여 크랙을 생성하거나 동작 구조를 무단 변경하는 행위를 수행하지 않습니다.',
        },
        {
          icon: ShieldCheck,
          title: '2. 지적 재산권 보호 (Intellectual Property)',
          text: '본 사이트는 저작권이 있는 게임 실행 파일, 크랙 파일 또는 저작권 라이브러리를 영구적으로 서버에 보존, 수정 또는 무단 배포하지 않습니다. 모든 패칭 연산은 브라우저 상의 로컬 휘발성 메모리 내에서 1:1 매칭 방식으로 실시간 처리되며, 최종적으로 변경된 바이너리는 사용자의 로컬 컴퓨터 저장 공간에 직접 생성 및 다운로드됩니다.',
        },
        {
          icon: ShieldAlert,
          title: '3. 책임 한계 및 계정 차단 (Liability & Bans)',
          text: '트레이너 및 패치된 파일의 사용에 따른 시스템 에러, 게임 실행 실패 등 모든 결과와 위험은 사용자 본인이 전적으로 부담합니다. 게임 개발사의 안티치트(EAC, BattlEye 등) 탐지를 예방하기 위한 안티치트 우회 조치 및 스팀 오프라인 모드 플레이는 필수 권장 사항입니다. 당사는 트레이너 가동으로 인해 발생하는 온라인 멀티플레이 서비스 영구 정지(Ban) 또는 게임 계정 제재에 대하여 어떠한 법적/도의적 책임도 지지 않습니다.',
        },
      ],
      warningTitle: '경고: 안전한 싱글 플레이 권장',
      warningText: '본 유틸리티로 패치된 트레이너는 철저하게 오프라인 싱글 플레이 목적으로만 활용되어야 합니다. 멀티플레이가 동반되는 온라인 로비 진입 시 안티치트 솔루션에 의해 계정 제재 조치가 취해질 수 있으므로 각별히 유의하십시오.',
    },
    en: {
      title: 'Terms of Service',
      subtitle: 'LocalPatcher Service terms and limits of liability',
      lastUpdated: 'Last Updated: June 29, 2026',
      sections: [
        {
          icon: FileText,
          title: '1. Purpose & Definition',
          text: 'LocalPatcher is a text-only offset matching utility. It scans the memory offsets of English option strings within game trainer executables (.exe) and overwrites them 1:1 with localized language strings in local browser memory. It does not reverse engineer executable logic or bypass game code blocks.',
        },
        {
          icon: ShieldCheck,
          title: '2. Intellectual Property Protection',
          text: 'We do not modify or distribute copyrighted binaries. We do not host or distribute any copyright-protected game files, cracks, or unauthorized software. All translation operations are processed in the user\'s local volatile memory, and the patched executable is generated directly on the client side without server storage.',
        },
        {
          icon: ShieldAlert,
          title: '3. Liability & Account Bans',
          text: 'The user assumes all risks associated with using localized trainer files. Anti-cheat bypass and offline play are mandatory safety precautions. LocalPatcher assumes no responsibility for online multiplayer bans, account restrictions, hardware bans, or system crashes resulting from trainer usage.',
        },
      ],
      warningTitle: 'Warning: Single Player Only',
      warningText: 'Trainers patched with this utility must be used strictly for offline single-player games. Connecting to online servers or multiplayer lobbies with a trainer active will likely trigger anti-cheat bans. Play at your own risk.',
    },
    ja: {
      title: '利用規約',
      subtitle: 'LocalPatcher サービス利用規約および免責事項',
      lastUpdated: '最終更新日: 2026年6月29日',
      sections: [
        {
          icon: FileText,
          title: '1. 目的および定義',
          text: 'LocalPatcherは、ゲームトレーナー実行ファイル（.exe）のバイナリ内の英語オプション文字列의メモリ・オフセットを検出し、ローカライズされた文字列に1:1で置換するテキスト専用のオフセットマッチングユーティリティです。実行コード自体をリバースエンジニアリングしてクラックを生成したり、プログラムの動作構造を不正に変更したりすることはありません。',
        },
        {
          icon: ShieldCheck,
          title: '2. 知的財産権の保護',
          text: '当サイトは、著作権で保護されたバイナリ、クラックファイル、または違法プログラムを一切配布・変更・ホストしません。すべての翻訳処理はブラウザのローカル一時メモリ上で行われ、修正されたバイナリはユーザーのPCのダウンロードフォルダに直接保存されます。サーバーにファイルが保存されることはありません。',
        },
        {
          icon: ShieldAlert,
          title: '3. 免責事項およびアカウントの停止',
          text: 'トレーナーおよびパッチの使用に伴うシステムエラーやゲームの強制終了など、すべての結果とリスクはユーザー自身が負うものとします。アンチチート（EAC、BattlEyeなど）の検出を回避するためのオフラインプレイおよびアンチチートの無効化手順は必須です。当サイトは、オンラインマルチプレイでのアカウント停止（BAN）やその他の損害について一切の責任を負いません。',
        },
      ],
      warningTitle: '警告: シングルプレイ専用',
      warningText: '当ユーティリティでパッチを適用したトレーナーは、完全にオフラインのシングルプレイ目的でのみ使用してください。トレーナーを起動した状態でオンラインマルチプレイヤーやロビーに接続すると、アカウント停止（BAN）のリスクが非常に高くなります。',
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
          <Scale className="w-3.5 h-3.5" />
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

      {/* Warning highlight */}
      <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-950/10 mb-10 flex items-start space-x-4">
        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg shrink-0">
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wide">
            {localizedContent.warningTitle}
          </h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {localizedContent.warningText}
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
