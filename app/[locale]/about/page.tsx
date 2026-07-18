import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileCheck2, Monitor, ShieldOff } from 'lucide-react';
import { SITE_URL, localizedAlternates } from '@/lib/site';
import type { Locale } from '@/lib/i18n';

const content = {
  ko: { title: 'LocalPatcher 소개', description: 'LocalPatcher의 목적, 처리 범위 및 비제휴 원칙을 안내합니다.', back: '게임 목록으로', intro: 'LocalPatcher는 등록된 게임 트레이너의 영문 옵션 문자열을 다른 언어로 바꾸는 브라우저 기반 도구입니다.', sections: [
    ['브라우저 안에서 처리', '사용자가 선택한 파일의 확인과 텍스트 변환은 브라우저 안에서 이루어집니다. 선택한 원본 파일을 LocalPatcher 서버에 업로드하거나 보관하도록 설계하지 않았습니다.'],
    ['제공 범위', 'LocalPatcher는 원본 트레이너 실행 파일을 배포하지 않습니다. 사용자는 합법적으로 확보한 지원 버전의 원본 파일을 직접 준비해야 하며, 변환 결과의 안전성이나 정상 작동을 보증하지 않습니다.'],
    ['독립 서비스', 'LocalPatcher는 게임 개발사·배급사 및 트레이너 제작자와 제휴하거나 이들의 보증을 받는 서비스가 아닙니다. 상표와 게임명은 식별 목적으로만 사용합니다.'],
    ['우회 기능 아님', '이 서비스는 DRM, 라이선스 확인, 온라인 서비스 또는 안티치트 기술을 우회하지 않으며 그러한 방법을 안내하지 않습니다. 온라인·경쟁·안티치트 환경에서는 사용하지 마세요.'],
  ]},
  en: { title: 'About LocalPatcher', description: 'Learn the purpose, processing scope, and independence of LocalPatcher.', back: 'Back to games', intro: 'LocalPatcher is a browser-based tool that replaces registered English option strings in supported game trainers with localized text.', sections: [
    ['Processed in your browser', 'File checks and text replacement take place in your browser. The service is not designed to upload or retain your selected original file on LocalPatcher servers.'],
    ['Scope of the service', 'LocalPatcher does not distribute original trainer executables. You must obtain a supported original version lawfully. We do not guarantee the safety or correct operation of the source or resulting file.'],
    ['Independent service', 'LocalPatcher is not affiliated with or endorsed by game developers, publishers, or trainer authors. Trademarks and game names are used only for identification.'],
    ['Not a bypass tool', 'The service does not bypass DRM, license checks, online services, or anti-cheat systems, and does not provide instructions to do so. Do not use trainers in online, competitive, or anti-cheat environments.'],
  ]},
  ja: { title: 'LocalPatcherについて', description: 'LocalPatcherの目的、処理範囲、非提携方針をご案内します。', back: 'ゲーム一覧へ', intro: 'LocalPatcherは、対応トレーナーに登録された英語オプション文字列を翻訳文へ置き換えるブラウザベースのツールです。', sections: [
    ['ブラウザ内で処理', 'ファイルの確認とテキスト変換はブラウザ内で行われます。選択した元ファイルをLocalPatcherのサーバーへアップロードまたは保存するようには設計されていません。'],
    ['サービスの範囲', 'LocalPatcherは元のトレーナー実行ファイルを配布しません。利用者自身が適法に入手した対応バージョンを用意してください。元ファイルや変換後ファイルの安全性・正常動作は保証しません。'],
    ['独立したサービス', 'LocalPatcherはゲーム開発会社、販売会社、トレーナー作者と提携せず、これらの承認を受けたサービスでもありません。商標とゲーム名は識別目的でのみ使用します。'],
    ['回避ツールではありません', 'DRM、ライセンス確認、オンラインサービス、アンチチートを回避する機能や方法は提供しません。オンライン、競争、アンチチート環境では使用しないでください。'],
  ]},
} satisfies Record<Locale, { title: string; description: string; back: string; intro: string; sections: [string, string][] }>;

const localeOf = (value: string): Locale => value === 'en' || value === 'ja' ? value : 'ko';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> { const { locale } = await params; const current = localeOf(locale); const page = content[current]; return { title: `${page.title} | LocalPatcher`, description: page.description, alternates: { canonical: `${SITE_URL}/${current}/about`, languages: localizedAlternates('/about') } }; }
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) { const current = localeOf((await params).locale); const page = content[current]; const icons = [Monitor, FileCheck2, FileCheck2, ShieldOff]; return <main className="max-w-4xl mx-auto px-5 sm:px-6 py-10 md:py-14"><Link href={`/${current}`} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400"><ArrowLeft className="w-4 h-4" />{page.back}</Link><header className="my-10"><h1 className="text-3xl md:text-4xl font-bold text-white">{page.title}</h1><p className="mt-4 text-slate-300 leading-relaxed">{page.intro}</p></header><div className="grid gap-5 md:grid-cols-2">{page.sections.map(([title, text], index) => { const Icon = icons[index]; return <section key={title} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6"><Icon className="w-5 h-5 text-cyan-400" /><h2 className="mt-4 text-lg font-bold text-white">{title}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{text}</p></section>; })}</div></main>; }
