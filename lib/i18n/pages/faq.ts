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

export const faqPageContent = {
  ko: { 
    title: '자주 묻는 질문', 
    sub: '파일 처리, 백신 경고 및 안전 이용 안내',
    keywords: ['LocalPatcher', 'FAQ', 'help', '지원', '자주묻는질문'], 
    guide: '전체 안전 가이드 보기', 
    items: [
      [AlertOctagon, '백신이 파일을 위험하다고 표시하면 어떻게 하나요?', '트레이너의 메모리 조작 방식 때문에 탐지될 수 있지만 모든 경고가 오진인 것은 아닙니다. 공식 배포처, 디지털 서명, 게시된 해시와 복수의 최신 검사 결과를 확인하고, 의심스러우면 실행하지 마십시오. 백신 예외 등록을 무조건 권장하지 않습니다.'],
      [HelpCircle, '패치 후 게임이나 트레이너가 종료됩니다.', '게임과 트레이너 버전이 다르거나 원본 파일이 변경되었을 수 있습니다. 공식 배포처의 원본을 다시 확인하고 세이브 파일을 백업하십시오. LocalPatcher의 해시 확인은 파일 안전이나 정상 작동을 보증하지 않습니다.'],
      [Ban, '온라인에서 사용해도 안전한가요?', '아니요. 온라인·멀티플레이·경쟁·안티치트 환경에서는 사용하지 마십시오. 인터넷 연결을 끊거나 오프라인 모드를 선택하는 것만으로 제재 방지나 안전이 보장되지 않습니다. LocalPatcher는 안티치트 우회 방법을 제공하지 않습니다.'],
      [Lock, '선택한 트레이너 파일이 서버에 저장되나요?', '변환 대상 파일은 브라우저에서 로컬로 처리되며 LocalPatcher 자체 데이터베이스에 업로드하거나 저장하지 않습니다. GA4가 접속·기기·이용 정보를 처리할 수 있고, 필요한 설정과 동의 준비가 완료된 경우 Google AdSense 광고가 표시될 수 있습니다. 자세한 내용은 개인정보처리방침을 확인하십시오.'],
    ]
  },
  en: { 
    title: 'Frequently Asked Questions', 
    sub: 'File processing, antivirus alerts, and safer use',
    keywords: ['LocalPatcher', 'FAQ', 'help', 'support', 'questions'], 
    guide: 'Read the full safety guide', 
    items: [
      [AlertOctagon, 'What should I do if antivirus flags a file?', 'Trainer behavior may trigger detection, but not every alert is a false positive. Check the official source, digital signature, published hash, and multiple up-to-date scan results. Do not run suspicious files. We do not automatically recommend adding antivirus exclusions.'],
      [HelpCircle, 'The game or trainer closes after patching.', 'The game and trainer versions may differ, or the original file may have changed. Recheck the official original and back up save files. LocalPatcher hash checks do not guarantee file safety or correct operation.'],
      [Ban, 'Is it safe to use online?', 'No. Do not use trainers in online, multiplayer, competitive, or anti-cheat environments. Disconnecting the internet or selecting offline mode alone does not guarantee safety or prevent sanctions. LocalPatcher does not provide anti-cheat bypass instructions.'],
      [Lock, 'Is my selected trainer file stored on a server?', 'The selected file is processed locally in your browser and is not uploaded to or stored in LocalPatcher’s own database. GA4 may process access, device, and usage information, and Google AdSense ads may be displayed when the required configuration and consent readiness are in place. See the Privacy Policy for details.'],
    ]
  },
  ja: { 
    title: 'よくある質問', 
    sub: 'ファイル処理、ウイルス対策の警告、安全利用について',
    keywords: ['LocalPatcher', 'FAQ', 'help', 'サポート', 'よくある質問'], 
    guide: '安全ガイドをすべて確認', 
    items: [
      [AlertOctagon, 'ウイルス対策ソフトが警告した場合は？', 'トレーナーの動作により検出される場合がありますが、すべてが誤検出とは限りません。公式配布元、デジタル署名、公開ハッシュ、複数の最新スキャン結果を確認し、疑わしい場合は実行しないでください。除外登録を無条件には推奨しません。'],
      [HelpCircle, 'パッチ後にゲームやトレーナーが終了します。', 'ゲームとトレーナーのバージョンが異なるか、元ファイルが変更されている可能性があります。公式の元ファイルを再確認し、セーブデータをバックアップしてください。ハッシュ確認は安全性や正常動作を保証しません。'],
      [Ban, 'オンラインで使用しても安全ですか？', 'いいえ。オンライン、マルチプレイ、競争、アンチチート環境では使用しないでください。通信切断やオフラインモードだけで、安全や制裁回避が保証されることはありません。LocalPatcherはアンチチート回避方法を案内しません。'],
      [Lock, '選択したファイルはサーバーに保存されますか？', '対象ファイルはブラウザ内でローカル処理され、LocalPatcher独自のデータベースへアップロード・保存されません。GA4がアクセス・端末・利用情報を処理する場合があり、必要な設定と同意準備が整っている場合はGoogle AdSense広告が表示されることがあります。詳細はプライバシーポリシーをご覧ください。'],
    ]
  },
  de: { 
    title: 'Häufig gestellte Fragen', 
    sub: 'Dateiverarbeitung, Antiviren-Warnungen und sichere Nutzung',
    keywords: ['LocalPatcher', 'FAQ', 'hilfe', 'unterstützung', 'fragen'], 
    guide: 'Vollständigen Sicherheitsleitfaden lesen', 
    items: [
      [AlertOctagon, 'Was tun, wenn der Virenscanner die Datei meldet?', 'Trainer-Methoden können Warnungen auslösen. Prüfen Sie digitale Signaturen und vermeiden Sie Verdächtiges.'],
      [HelpCircle, 'Das Spiel schließt sich nach dem Patchen.', 'Spiel- und Trainer-Versionen stimmen möglicherweise nicht überein. Sichern Sie stets Ihre Spielstände.'],
      [Ban, 'Ist die Nutzung online sicher?', 'Nein. Verwenden Sie Trainer niemals in Online-, Multiplayer- oder Anti-Cheat-Umgebungen.'],
      [Lock, 'Wird meine Trainer-Datei auf einen Server hochgeladen?', 'Nein. Die Verarbeitung erfolgt vollständig lokal in Ihrem Browser.'],
    ]
  },
  es: { 
    title: 'Preguntas Frecuentes', 
    sub: 'Procesamiento de archivos, alertas de antivirus y uso seguro',
    keywords: ['LocalPatcher', 'FAQ', 'ayuda', 'soporte', 'preguntas'], 
    guide: 'Leer la guía completa de seguridad', 
    items: [
      [AlertOctagon, '¿Qué hacer si el antivirus marca el archivo?', 'El comportamiento del trainer puede causar alertas. Verifique la fuente oficial y no añada exclusiones a ciegas.'],
      [HelpCircle, 'El juego se cierra tras aplicar el parche.', 'Las versiones del juego y del trainer pueden ser incompatibles. Respaldar partidas guardadas.'],
      [Ban, '¿Es seguro usarlo en línea?', 'No. No utilice trainers en entornos multijugador o con anti-cheat activo.'],
      [Lock, '¿Se guarda mi archivo en un servidor?', 'No. Los archivos se procesan únicamente en su navegador.'],
    ]
  }
};

export function getFaqContent(locale: Locale) {
  return faqPageContent[locale] || faqPageContent.en;
}

