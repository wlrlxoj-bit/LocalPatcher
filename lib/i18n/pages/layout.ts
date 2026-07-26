import { Locale } from '@/lib/i18n/types';
import { 
  AlertOctagon, Ban, HelpCircle, Lock, 
  UserRoundX, EyeOff, Cookie, Cpu, Database,
  FileText, ShieldCheck, ShieldAlert,
  Monitor, FileCheck2, ShieldOff,
  BadgeCheck, RefreshCw, Bot, Megaphone,
  FileWarning, Bug, AlertTriangle, ExternalLink,
  ArrowLeft
} from 'lucide-react';

export const layoutMetadataContent = {
  ko: {
    title: '게임 트레이너 한글 패치 & 다운로드 플랫폼 | LocalPatcher',
    description: '스팀 게임 트레이너 및 플링(FLiNG) 치트 키 한글화 패치 플랫폼. 서버 업로드 없이 브라우저에서 로컬로 한글 패치를 적용하고 다운로드하십시오.',
    keywords: ['게임', '한글', '패치', '트레이너', '치트', '스팀', '플링', '번역', '다운로드', '무료', '로컬패처', 'LocalPatcher'],
  },
  en: {
    title: 'LocalPatcher - Game Trainer Localization Portal',
    description: 'A client-side trainer patch utility that replaces supported text in game trainers with localized strings without uploading files to our server.',
    keywords: ['game', 'trainer', 'cheats', 'translation', 'patch', 'download', 'free', 'localized', 'localpatcher'],
  },
  ja: {
    title: 'ゲームトレーナー日本語化パッチ＆ダウンロード | LocalPatcher',
    description: 'SteamゲームトレーナーおよびFLiNGチートツールの日本語化パッチプラットフォーム。ファイルをサーバーにアップロードせず、ブラウザ上でローカルに日本語訳パッチを適用・ダウンロードできます。',
    keywords: ['ゲーム', '日本語化', '日本語訳', 'パッチ', 'トレーナー', 'チート', '無料', 'ダウンロード', '日本', 'ローカルパッチャー', 'LocalPatcher'],
  },
  de: {
    title: 'LocalPatcher - Spiele-Trainer Lokalisierungs-Tool',
    description: 'Ein Browser-Tool zum lokalen Übersetzen von Spiele-Trainern ohne Datei-Upload.',
    keywords: ['spiele', 'trainer', 'cheats', 'übersetzung', 'patch', 'download', 'deutsch', 'localpatcher', 'spieletrainer', 'lokalisierung'],
  },
  es: {
    title: 'LocalPatcher - Herramienta de Localización de Trainers',
    description: 'Una herramienta de navegador para parchear trainers de juegos localmente sin subir archivos.',
    keywords: ['juegos', 'trainer', 'trucos', 'traducción', 'parche', 'descargar', 'español', 'localpatcher', 'parcheador', 'localización'],
  },
};

export function getLayoutMetadata(locale: Locale) {
  return layoutMetadataContent[locale] || layoutMetadataContent.en;
}
