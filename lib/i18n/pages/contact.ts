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

export const contactPageContent = {
  ko: { 
    title: '오류 및 번역 문제 신고', 
    description: '개인정보를 보내지 않고 재현 가능한 오류를 신고하는 방법입니다.', 
    back: '게임 목록으로', 
    notice: '설문지(Google Forms)를 통해 번역 및 사이트 오류를 접수합니다. 아래 정보를 작성해 주십시오.', 
    action: '오류 신고하기 (Google Forms)', 
    privacy: '트레이너 실행 파일, 저장 파일, 비밀번호, 이메일, 계정 정보 등 개인정보나 실행 파일 자체는 첨부하지 마십시오. 신고 내용은 공개될 수 있습니다.', 
    items: [
      ['페이지 정보', '문제가 발생한 페이지 URL, 표시 언어, 게임 이름을 기록합니다.'], 
      ['버전과 문구', '트레이너의 정확한 버전과 잘못 표시된 원문·번역문을 텍스트로 기록합니다.'], 
      ['재현 단계', '어떤 동작 뒤에 문제가 나타났는지 순서대로 적고, 브라우저 이름과 버전을 함께 기록합니다.']
    ]
  },
  en: { 
    title: 'Report a Translation or Site Issue', 
    description: 'How to report a reproducible issue without sending personal data.', 
    back: 'Back to games', 
    notice: 'Translation and site issues are accepted through an anonymous Google Form. Provide the details below.', 
    action: 'Report Issue (Google Form)', 
    privacy: 'Do not attach trainer executables, save files, passwords, email addresses, account details, or other personal information. Reports may be public.', 
    items: [
      ['Page details', 'Record the affected page URL, display language, and game name.'], 
      ['Version and wording', 'Record the exact trainer version and the incorrect source and translated text as plain text.'], 
      ['Reproduction steps', 'List the actions that led to the issue and include the browser name and version.']
    ]
  },
  ja: { 
    title: '翻訳・サイトの問題を報告', 
    description: '個人情報を送らず、再現可能な問題を報告する方法です。', 
    back: 'ゲーム一覧へ', 
    notice: '翻訳とサイトの問題は、匿名アンケート(Google Form)で受け付けます。以下の情報を記載してください。', 
    action: '問題を報告する (Google Form)', 
    privacy: 'トレーナー実行ファイル、セーブファイル、パスワード、メールアドレス、アカウント情報などの個人情報を添付しないでください。報告内容は公開される場合があります。', 
    items: [
      ['ページ情報', '問題が発生したページのURL、表示言語、ゲーム名を記録します。'], 
      ['バージョンと文言', 'トレーナーの正確なバージョンと、誤って表示された原文・翻訳文をテキストで記録します。'], 
      ['再現手順', '問題が発生するまでの操作を順番に記載し、ブラウザ名とバージョンも記録します。']
    ]
  },
  de: { 
    title: 'Problem melden', 
    description: 'Melden Sie Fehler ohne Angabe persönlicher Daten.', 
    back: 'Zurück zur Spiele-Liste', 
    notice: 'Übermitteln Sie Fehlerberichte über ein anonymes Google Formular.', 
    action: 'Fehler melden (Google Form)', 
    privacy: 'Fügen Sie keine persönlichen Daten oder Trainer-Dateien bei.', 
    items: [
      ['Seiten-Details', 'Notieren Sie URL, Sprache und Spielname.'], 
      ['Version & Text', 'Notieren Sie Trainer-Version und Fehler.'], 
      ['Schritte', 'Beschreiben Sie die Schritte zur Reproduktion.']
    ]
  },
  es: { 
    title: 'Reportar un Problema', 
    description: 'Cómo reportar problemas sin enviar datos personales.', 
    back: 'Volver a la lista de juegos', 
    notice: 'Reporte problemas de traducción a través de un formulario anónimo de Google.', 
    action: 'Reportar problema (Google Form)', 
    privacy: 'No adjunte datos personales ni ejecutables de trainers.', 
    items: [
      ['Detalles de página', 'Registre la URL, idioma y nombre del juego.'], 
      ['Versión y texto', 'Registre la versión exacta del trainer y el error.'], 
      ['Pasos', 'Detalle los pasos para reproducir el error.']
    ]
  }
};

export function getContactContent(locale: Locale) {
  return contactPageContent[locale] || contactPageContent.en;
}
