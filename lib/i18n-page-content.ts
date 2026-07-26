import { Locale } from '@/lib/i18n';
import { 
  AlertOctagon, Ban, HelpCircle, Lock, 
  UserRoundX, EyeOff, Cookie, Cpu, Database,
  FileText, ShieldCheck, ShieldAlert,
  Monitor, FileCheck2, ShieldOff,
  BadgeCheck, RefreshCw, Bot, Megaphone,
  FileWarning, Bug, AlertTriangle, ExternalLink
} from 'lucide-react';

export const faqPageContent = {
  ko: { 
    title: '자주 묻는 질문', 
    sub: '파일 처리, 백신 경고 및 안전 이용 안내', 
    guide: '전체 안전 가이드 보기', 
    items: [
      [AlertOctagon, '백신이 파일을 위험하다고 표시하면 어떻게 하나요?', '트레이너의 메모리 조작 방식 때문에 탐지될 수 있지만 모든 경고가 오진인 것은 아닙니다. 공식 배포처, 디지털 서명, 게시된 해시와 복수의 최신 검사 결과를 확인하고, 의심스러우면 실행하지 마세요. 백신 예외 등록을 무조건 권장하지 않습니다.'],
      [HelpCircle, '패치 후 게임이나 트레이너가 종료됩니다.', '게임과 트레이너 버전이 다르거나 원본 파일이 변경되었을 수 있습니다. 공식 배포처의 원본을 다시 확인하고 세이브 파일을 백업하세요. LocalPatcher의 해시 확인은 파일 안전이나 정상 작동을 보증하지 않습니다.'],
      [Ban, '온라인에서 사용해도 안전한가요?', '아니요. 온라인·멀티플레이·경쟁·안티치트 환경에서는 사용하지 마세요. 인터넷 연결을 끊거나 오프라인 모드를 선택하는 것만으로 제재 방지나 안전이 보장되지 않습니다. LocalPatcher는 안티치트 우회 방법을 제공하지 않습니다.'],
      [Lock, '선택한 트레이너 파일이 서버에 저장되나요?', '변환 대상 파일은 브라우저에서 로컬로 처리되며 LocalPatcher 자체 데이터베이스에 업로드하거나 저장하지 않습니다. GA4가 접속·기기·이용 정보를 처리할 수 있고, 필요한 설정과 동의 준비가 완료된 경우 Google AdSense 광고가 표시될 수 있습니다. 자세한 내용은 개인정보처리방침을 확인하세요.'],
    ]
  },
  en: { 
    title: 'Frequently Asked Questions', 
    sub: 'File processing, antivirus alerts, and safer use', 
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

export const guidesPageContent = {
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
    title: 'Trainer Safety Guide', 
    description: 'Basic precautions for avoiding online and anti-cheat environments and checking trainer files carefully.',
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
    title: 'トレーナー安全利用ガイド', 
    description: 'オンライン・アンチチート環境を避け、トレーナーファイルを慎重に確認するための基本的な安全ルールです。',
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
  de: {
    title: 'Sicherheitsleitfaden für Trainer', 
    description: 'Wichtige Sicherheitsregeln für die Nutzung von Spiele-Trainern.',
    warningTitle: 'Nicht in Online- oder Multiplayer-Modi verwenden',
    warning: 'Die Nutzung von Trainern in Online-Modi verstößt gegen Richtlinien und kann zu Kontosperren führen.',
    sections: [
      ['Nur offizielle Einzelspieler-Modi', 'Nutzen Sie Trainer ausschließlich im Offline-Singleplayer.'],
      ['Keine Bypass-Unterstützung', 'LocalPatcher unterstützt keine Umgehung von Anti-Cheat-Systemen.'],
      ['Dateien vor der Ausführung prüfen', 'Sichern Sie stets Ihre Spielstände und prüfen Sie Versionen.'],
      ['Virenwarnungen ernst nehmen', 'Prüfen Sie Quelldateien sorgfältig auf digitalen Signaturen.'],
    ],
    note: 'Die Verantwortung liegt beim Nutzer. LocalPatcher garantiert nicht für Dateisicherheit.',
    terms: 'Nutzungsbedingungen', privacy: 'Datenschutz', badge: 'SAFETY FIRST',
  },
  es: {
    title: 'Guía de Seguridad del Trainer', 
    description: 'Precauciones básicas para evitar entornos online y anti-cheat.',
    warningTitle: 'No usar en modos en línea o multijugador',
    warning: 'Usar trainers en entornos multijugador puede sancionar su cuenta o dañar datos.',
    sections: [
      ['Usar solo opciones offline oficiales', 'Utilice solo funciones en solitario offline confirmadas.'],
      ['Sin soporte de bypass', 'LocalPatcher no proporciona métodos de evasión de anti-cheat.'],
      ['Comprobar archivos antes de ejecutar', 'Verifique versiones y respalde sus partidas antes de jugar.'],
      ['No ignorar alertas de antivirus', 'Consulte múltiples antivirus antes de ejecutar un archivo.'],
    ],
    note: 'El usuario es responsable del uso del archivo. LocalPatcher no garantiza la seguridad final.',
    terms: 'Términos de Servicio', privacy: 'Política de Privacidad', badge: 'SAFETY FIRST',
  }
};

export function getGuidesContent(locale: Locale) {
  return guidesPageContent[locale] || guidesPageContent.en;
}

export const aboutPageContent = {
  ko: { 
    title: 'LocalPatcher 소개', 
    description: 'LocalPatcher의 목적, 처리 범위 및 비제휴 원칙을 안내합니다.', 
    back: '게임 목록으로', 
    intro: 'LocalPatcher는 등록된 게임 트레이너의 영문 옵션 문자열을 다른 언어로 바꾸는 브라우저 기반 도구입니다.', 
    sections: [
      ['브라우저 안에서 처리', '사용자가 선택한 파일의 확인과 텍스트 변환은 브라우저 안에서 이루어집니다. 선택한 원본 파일을 LocalPatcher 서버에 업로드하거나 보관하도록 설계하지 않았습니다.'],
      ['제공 범위', 'LocalPatcher는 원본 트레이너 실행 파일을 배포하지 않습니다. 사용자는 합법적으로 확보한 지원 버전의 원본 파일을 직접 준비해야 하며, 변환 결과의 안전성이나 정상 작동을 보증하지 않습니다.'],
      ['독립 서비스', 'LocalPatcher는 게임 개발사·배급사 및 트레이너 제작자와 제휴하거나 이들의 보증을 받는 서비스가 아닙니다. 상표와 게임명은 식별 목적으로만 사용합니다.'],
      ['우회 기능 아님', '이 서비스는 DRM, 라이선스 확인, 온라인 서비스 또는 안티치트 기술을 우회하지 않으며 그러한 방법을 안내하지 않습니다. 온라인·경쟁·안티치트 환경에서는 사용하지 마세요.'],
    ]
  },
  en: { 
    title: 'About LocalPatcher', 
    description: 'Learn the purpose, processing scope, and independence of LocalPatcher.', 
    back: 'Back to games', 
    intro: 'LocalPatcher is a browser-based tool that replaces registered English option strings in supported game trainers with localized text.', 
    sections: [
      ['Processed in your browser', 'File checks and text replacement take place in your browser. The service is not designed to upload or retain your selected original file on LocalPatcher servers.'],
      ['Scope of the service', 'LocalPatcher does not distribute original trainer executables. You must obtain a supported original version lawfully. We do not guarantee the safety or correct operation of the source or resulting file.'],
      ['Independent service', 'LocalPatcher is not affiliated with or endorsed by game developers, publishers, or trainer authors. Trademarks and game names are used only for identification.'],
      ['Not a bypass tool', 'The service does not bypass DRM, license checks, online services, or anti-cheat systems, and does not provide instructions to do so. Do not use trainers in online, competitive, or anti-cheat environments.'],
    ]
  },
  ja: { 
    title: 'LocalPatcherについて', 
    description: 'LocalPatcherの目的、処理範囲、非提携方針をご案内します。', 
    back: 'ゲーム一覧へ', 
    intro: 'LocalPatcherは、対応トレーナーに登録された英語オプション文字列を翻訳文へ置き換えるブラウザベースのツールです。', 
    sections: [
      ['ブラウザ内で処理', 'ファイルの確認とテキスト変換はブラウザ内で行われます。選択した元ファイルをLocalPatcherのサーバーへアップロードまたは保存するようには設計されていません。'],
      ['サービスの範囲', 'LocalPatcherは元のトレーナー実行ファイルを配布しません。利用者自身が適法に入手した対応バージョンを用意してください。元ファイルや変換後ファイルの安全性・正常動作は保証しません。'],
      ['独立したサービス', 'LocalPatcherはゲーム開発会社、販売会社、トレーナー作者と提携せず、これらの承認を受けたサービスでもありません。商標とゲーム名は識別目的でのみ使用します。'],
      ['回避ツールではありません', 'DRM、ライセンス確認、オンラインサービス、アンチチートを回避する機能や方法は提供しません。オンライン、競争、アンチチート環境では使用しないでください。'],
    ]
  },
  de: { 
    title: 'Über LocalPatcher', 
    description: 'Erfahren Sie mehr über Zweck, Umfang und Unabhängigkeit von LocalPatcher.', 
    back: 'Zurück zur Spiele-Liste', 
    intro: 'LocalPatcher ist ein browserbasiertes Tool, das englische Optionstext in unterstützten Spiele-Trainern lokal übersetzt.', 
    sections: [
      ['Im Browser verarbeitet', 'Dateiprüfungen und Text-Ersetzungen finden lokal in Ihrem Browser statt. Es werden keine Dateien auf Server hochgeladen.'],
      ['Umfang des Dienstes', 'LocalPatcher verteilt keine Original-Trainer-Exekutivdateien. Sie müssen die unterstützte Version selbst besitzen.'],
      ['Unabhängiger Dienst', 'LocalPatcher steht in keiner Verbindung zu Spiele-Entwicklern oder Trainer-Erstellern.'],
      ['Kein Bypass-Tool', 'Der Dienst umgeht keine Anti-Cheat- oder DRM-Systeme. Verwenden Sie Trainer niemals in Online-Modi.'],
    ]
  },
  es: { 
    title: 'Acerca de LocalPatcher', 
    description: 'Conozca el propósito, alcance y la independencia de LocalPatcher.', 
    back: 'Volver a la lista de juegos', 
    intro: 'LocalPatcher es una herramienta de navegador que reemplaza textos de opciones de trainers con traducciones locales.', 
    sections: [
      ['Procesado en su navegador', 'La verificación y sustitución de texto ocurren en su navegador. No se suben archivos a nuestros servidores.'],
      ['Alcance del servicio', 'LocalPatcher no distribuye ejecutables originales de trainers. Debe obtener legalmente la versión compatible.'],
      ['Servicio independiente', 'LocalPatcher no está afiliado ni respaldado por desarrolladores de juegos ni creadores de trainers.'],
      ['No es una herramienta de bypass', 'El servicio no elude sistemas anti-cheat ni DRM. No use trainers en modos online.'],
    ]
  }
};

export function getAboutContent(locale: Locale) {
  return aboutPageContent[locale] || aboutPageContent.en;
}

export const editorialPageContent = {
  ko: { 
    title: '편집 및 검수 정책', 
    description: '번역 데이터의 수집, 검수, 버전 관리와 광고·제휴 공개 원칙입니다.', 
    back: '게임 목록으로', 
    intro: '등록되는 번역은 정확성과 출처 확인을 목표로 다음 절차에 따라 관리합니다.', 
    sections: [
      ['수집과 승인', '지원할 원본 트레이너의 버전과 문자열을 확인한 뒤 번역 초안을 수집합니다. 문맥, 단축키, 수치 표기를 검토하고 승인된 매핑만 서비스에 등록합니다.'], 
      ['버전 일치 확인', '파일 크기와 SHA-256 해시는 등록된 빌드와의 일치 여부를 확인하는 수단입니다. 일치 여부는 파일의 안전성이나 제작자의 진위를 보증하지 않으며, 버전이 다르면 패치를 중단합니다.'], 
      ['수정과 오류 처리', '오역, 누락, 잘못된 게임명 또는 버전 정보가 확인되면 해당 항목을 재검토하고 수정합니다. 재현에 필요한 게임명, 트레이너 버전, 화면의 문구를 오류 신고 페이지의 형식에 따라 알려 주세요.'], 
      ['자동화와 수동 검토', '기계 번역이나 자동화 도구를 초안 작성과 비교에 사용할 수 있지만, 공개 전에는 사람이 문맥과 표기를 검토하는 것을 원칙으로 합니다. 검토가 완료되지 않은 결과를 승인된 번역으로 표시하지 않습니다.'], 
      ['광고와 제휴', '서비스 운영을 위해 광고와 제휴 링크를 사용할 수 있습니다. 광고·제휴 관계는 번역 승인이나 평가에 영향을 주지 않으며, 가격과 외부 제공 내용은 해당 제공자의 조건을 따릅니다.']
    ]
  },
  en: { 
    title: 'Editorial and Review Policy', 
    description: 'How translations are collected, reviewed, versioned, corrected, and separated from advertising.', 
    back: 'Back to games', 
    intro: 'Published translations are managed under the following process to improve accuracy and traceability.', 
    sections: [
      ['Collection and approval', 'We identify the supported original trainer build and source strings before collecting a translation draft. Context, shortcuts, and numeric notation are reviewed, and only approved mappings are registered.'], 
      ['Version matching', 'File size and SHA-256 hashes only compare a file with a registered build. A match does not guarantee safety or authorship. Patching stops when the version does not match.'], 
      ['Corrections and errors', 'Mistranslations, omissions, incorrect game names, and version errors are reviewed and corrected when confirmed. Use the issue-report format with the game, trainer version, and exact displayed wording needed to reproduce the problem.'], 
      ['Automation and human review', 'Machine translation or automation may assist drafting and comparison, but a person should review context and terminology before publication. Unreviewed output is not presented as an approved translation.'], 
      ['Advertising and affiliate disclosure', 'The service may use advertising and affiliate links to support operation. Commercial relationships do not control translation approval or evaluation; prices and external offers remain subject to each provider’s terms.']
    ]
  },
  ja: { 
    title: '編集・レビュー方針', 
    description: '翻訳データの収集、確認、バージョン管理、訂正、広告・提携の開示方針です。', 
    back: 'ゲーム一覧へ', 
    intro: '公開する翻訳は、正確性と確認可能性を高めるため、次の手順で管理します。', 
    sections: [
      ['収集と承認', '対応する元トレーナーのバージョンと文字列を確認してから翻訳案を収集します。文脈、ショートカット、数値表記を確認し、承認された対応表のみ登録します。'], 
      ['バージョンの一致', 'ファイルサイズとSHA-256ハッシュは登録済みビルドとの一致を比較する手段にすぎません。一致しても安全性や作者の真正性は保証されません。バージョンが一致しない場合は処理を中止します。'], 
      ['訂正とエラー対応', '誤訳、欠落、誤ったゲーム名やバージョン情報が確認された場合は再確認して訂正します。ゲーム名、トレーナーのバージョン、画面に表示された文言を問題報告ページの形式でお知らせください。'], 
      ['自動化と人による確認', '機械翻訳や自動化ツールを下書き・比較に利用する場合がありますが、公開前に人が文脈と用語を確認することを原則とします。未確認の出力を承認済み翻訳として表示しません。'], 
      ['広告とアフィリエイト', '運営を支えるため広告やアフィリエイトリンクを使用する場合があります。商業上の関係は翻訳の承認や評価に影響せず、価格と外部提供内容には各提供者の条件が適用されます。']
    ]
  },
  de: { 
    title: 'Redaktionsrichtlinien', 
    description: 'Qualitätskontrolle, Versionierung und Transparenz von Übersetzungen.', 
    back: 'Zurück zur Spiele-Liste', 
    intro: 'Veröffentlichte Übersetzungen werden nach strengen Richtlinien verwaltet.', 
    sections: [
      ['Erfassung und Genehmigung', 'Wir prüfen Trainer-Builds vor der Genehmigung.'], 
      ['Versionsabgleich', 'SHA-256 Hashes dienen zum Abgleich mit registrierten Builds.'], 
      ['Korrekturen', 'Übersetzungsfehler werden nach Überprüfung umgehend korrigiert.'], 
      ['Menschliche Prüfung', 'Automatische Entwürfe werden vor Veröffentlichung geprüft.'], 
      ['Offenlegung', 'Werbelinks beeinflussen keine Übersetzungsbewertungen.']
    ]
  },
  es: { 
    title: 'Política Editorial', 
    description: 'Recopilación, revisión y transparencia de las traducciones.', 
    back: 'Volver a la lista de juegos', 
    intro: 'Las traducciones publicadas se gestionan mediante procesos rigurosos.', 
    sections: [
      ['Recopilación y aprobación', 'Verificamos las versiones de trainers antes de aprobar traducciones.'], 
      ['Coincidencia de versión', 'Los hashes SHA-256 comparan ejecutables registrados.'], 
      ['Correcciones', 'Los errores confirmados se corrigen a la brevedad.'], 
      ['Revisión humana', 'Un humano revisa los borradores automatizados antes de publicar.'], 
      ['Divulgación', 'Los enlaces de afiliados no afectan la aprobación de traducciones.']
    ]
  }
};

export function getEditorialContent(locale: Locale) {
  return editorialPageContent[locale] || editorialPageContent.en;
}

export const contactPageContent = {
  ko: { 
    title: '오류 및 번역 문제 신고', 
    description: '개인정보를 보내지 않고 재현 가능한 오류를 신고하는 방법입니다.', 
    back: '게임 목록으로', 
    notice: '공개 GitHub Issues에서 번역 및 사이트 오류를 접수합니다. 아래 정보를 텍스트로 작성해 주세요.', 
    action: 'GitHub Issues에서 신고하기', 
    privacy: '트레이너 실행 파일, 저장 파일, 비밀번호, 이메일, 계정 정보 등 개인정보나 실행 파일 자체는 첨부하지 마세요. 신고 내용은 공개될 수 있습니다.', 
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
    notice: 'Translation and site issues are accepted through the public GitHub Issues page. Provide the details below as text.', 
    action: 'Report on GitHub Issues', 
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
    notice: '翻訳とサイトの問題は、公開GitHub Issuesで受け付けます。以下の情報をテキストで記載してください。', 
    action: 'GitHub Issuesで報告', 
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
    notice: 'Übermitteln Sie Fehlerberichte über GitHub Issues.', 
    action: 'Auf GitHub Issues melden', 
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
    notice: 'Reporte problemas de traducción a través de GitHub Issues.', 
    action: 'Reportar en GitHub Issues', 
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

export const privacyPageContent = {
  ko: {
    title: '개인정보처리방침',
    subtitle: '로컬 파일 처리와 서비스 운영을 위한 데이터 사용 안내',
    updated: '최종 수정일: 2026년 7월 25일',
    notice: '이 문서는 현재 서비스의 운영 방식을 설명하며, 특정 국가나 지역에 대한 법률 자문이 아닙니다.',
    sections: [
      [UserRoundX, '1. 계정 및 직접 식별정보', 'LocalPatcher는 일반 사용자에게 회원가입이나 로그인을 요구하지 않으며, 이름·이메일·소셜 계정 정보 같은 직접 식별정보를 자체 데이터베이스에 저장하지 않습니다. 다만 Google Analytics 4 및 Google AdSense가 쿠키, 기기 정보와 접속 정보를 처리할 수 있습니다.'],
      [EyeOff, '2. 로컬 파일 처리', '도구에서 선택한 트레이너 실행 파일은 사용자의 브라우저 안에서 처리됩니다. LocalPatcher는 해당 파일을 자체 서버에 업로드하거나 저장하도록 설계하지 않았습니다.'],
      [Cookie, '3. 분석, 광고 및 쿠키', '서비스 이용 현황을 이해하기 위해 Google Analytics 4를 사용할 수 있으며, 서비스 운영을 위해 Google AdSense 광고를 표시할 수 있습니다. Google과 그 광고 파트너는 쿠키 또는 유사 기술을 이용해 광고 제공, 빈도 제한, 측정 및 부정행위 방지를 수행할 수 있습니다.'],
      [Cpu, '4. 다운로드와 외부 링크', '파일 다운로드는 외부 광고 페이지, 광고 관문 또는 광고 차단 감지를 요구하지 않습니다. 게임 상점이나 원본 배포처로 이동하는 외부 또는 제휴 링크가 제공될 수 있습니다.'],
    ],
  },
  en: {
    title: 'Privacy Policy',
    subtitle: 'How local file processing and service data are handled',
    updated: 'Last updated: July 25, 2026',
    notice: 'This page describes the current operation of the service and is not legal advice for any particular jurisdiction.',
    sections: [
      [UserRoundX, '1. Accounts and direct identifiers', 'LocalPatcher does not require general users to create an account or sign in, and does not store direct identifiers such as names, email addresses, or social account details in its own database.'],
      [EyeOff, '2. Local file processing', 'Trainer executables selected in the tool are processed in your browser. LocalPatcher is not designed to upload or store those files on its own servers.'],
      [Cookie, '3. Analytics, advertising, and cookies', 'We may use Google Analytics 4 to understand service usage and Google AdSense to display advertising.'],
      [Cpu, '4. Downloads and external links', 'File downloads do not require an external ad page, an advertising gate, or ad-block detection.'],
    ],
  },
  ja: {
    title: 'プライバシーポリシー',
    subtitle: 'ローカルファイル処理およびサービスデータの取扱い',
    updated: '最終更新日：2026年7月25日',
    notice: '本ページは現在のサービス運用を説明するものであり、特定の国または地域に対する法的助言ではありません。',
    sections: [
      [UserRoundX, '1. アカウントおよび直接識別情報', 'LocalPatcherは一般利用者にアカウント作成やログインを求めず、氏名、メールアドレスなどの直接識別情報を独自のデータベースに保存しません。'],
      [EyeOff, '2. ローカルファイル処理', 'ツールで選択したトレーナー実行ファイルは、利用者のブラウザ内で処理されます。サーバーへアップロードまたは保存する設計ではありません。'],
      [Cookie, '3. アクセス解析、広告、Cookie', 'サービス利用状況を把握するためGoogle Analytics 4を使用し、広告表示のためGoogle AdSenseを使用する場合があります。'],
      [Cpu, '4. ダウンロードと外部リンク', 'ファイルのダウンロードに外部広告ページ、広告ゲート、広告ブロック検出は必要ありません。'],
    ],
  },
  de: {
    title: 'Datenschutzbestimmungen',
    subtitle: 'Hinweise zur lokalen Dateiverarbeitung und Datennutzung',
    updated: 'Zuletzt aktualisiert: 25. Juli 2026',
    notice: 'Diese Seite beschreibt die aktuelle Funktionsweise des Dienstes.',
    sections: [
      [UserRoundX, '1. Konten und direkte Identifikatoren', 'LocalPatcher erfordert keine Registrierung. Es werden keine persönlichen Daten in eigenen Datenbanken gespeichert.'],
      [EyeOff, '2. Lokale Dateiverarbeitung', 'Ausgewählte Dateien werden lokal in Ihrem Browser verarbeitet und nicht auf Server hochgeladen.'],
      [Cookie, '3. Analysen, Werbung und Cookies', 'Wir nutzen Google Analytics 4 und Google AdSense zur Analyse und Werbeanzeige.'],
      [Cpu, '4. Downloads und externe Links', 'Downloads erfordern keine Werbenotifikationen. Es gelten die Datenschutzrichtlinien der verlinkten Zielseiten.'],
    ],
  },
  es: {
    title: 'Política de Privacidad',
    subtitle: 'Información sobre el procesamiento local de archivos y el uso de datos',
    updated: 'Última actualización: 25 de julio de 2026',
    notice: 'Esta página describe el funcionamiento actual del servicio.',
    sections: [
      [UserRoundX, '1. Cuentas e identificadores directos', 'LocalPatcher no requiere registro ni almacena datos personales en sus bases de datos.'],
      [EyeOff, '2. Procesamiento local de archivos', 'Los archivos seleccionados se procesan localmente en su navegador y no se suben a servidores.'],
      [Cookie, '3. Analítica, publicidad y cookies', 'Utilizamos Google Analytics 4 y Google AdSense para análisis y anuncios.'],
      [Cpu, '4. Descargas y enlaces externos', 'Las descargas no requieren bloqueos publicitarios. Se aplican las políticas del sitio de destino.'],
    ],
  },
};

export function getPrivacyContent(locale: Locale) {
  return privacyPageContent[locale] || privacyPageContent.en;
}

export const termsPageContent = {
  ko: {
    title: '서비스 이용 약관',
    subtitle: 'LocalPatcher 서비스 이용 조건 및 책임 한계 안내',
    updated: '최종 수정일: 2026년 7월 25일',
    warning: 'LocalPatcher는 게임 트레이너 파일의 텍스트 오프셋을 조작하여 언어를 변환하는 유틸리티 도구입니다. 변환된 파일의 실행 및 사용으로 인해 발생하는 게임 계정 제재, 세이브 파일 손상, 보안 문제에 대한 모든 책임은 사용자 본인에게 있습니다.',
    privacy: '서비스 이용 시 처리되는 데이터 정책은 개인정보 처리방침을 참조해 주세요.',
    sections: [
      [AlertOctagon, '1. 안티치트 및 오프라인 이용', '안티치트(EAC, BattlEye 등)가 적용된 온라인/멀티플레이 환경에서는 절대로 트레이너를 사용하지 마십시오. 오프라인 싱글플레이 게임에서만 이용할 것을 강력히 권장합니다.'],
      [HelpCircle, '2. 오진 및 보안 검사', '트레이너 파일은 메모리 조작 특성으로 인해 백신에서 오진(False Positive)으로 탐지될 수 있습니다. 실행 전 복수의 보안 스캐너로 무결성을 검증하세요.'],
      [Ban, '3. 면책 조항', '본 사이트는 원본 트레이너 파일이나 저작권물을 직접 저장·배포하지 않으며, 사용자가 제공한 파일의 로컬 변환 기능만을 제공합니다.'],
      [Lock, '4. 약관의 변경', '본 약관은 서비스 개선 및 관련 법령 준수를 위해 사전 공지 후 변경될 수 있습니다.'],
    ],
  },
  en: {
    title: 'Terms of Service',
    subtitle: 'LocalPatcher service conditions and limitations of liability',
    updated: 'Last updated: July 25, 2026',
    warning: 'LocalPatcher is a client-side utility tool. Users assume all responsibility for any game account bans, save file corruption, or security issues resulting from executing patched files.',
    privacy: 'Please review our Privacy Policy regarding data handling during service use.',
    sections: [
      [AlertOctagon, '1. Anti-cheat & Offline Use', 'Never use trainers in online or multiplayer games protected by anti-cheat systems. Use strictly in offline single-player modes.'],
      [HelpCircle, '2. False Positives & Scanning', 'Trainer executables often trigger antivirus false positives. Verify file integrity using multiple scanners before execution.'],
      [Ban, '3. Limitation of Liability', 'This site does not store or distribute copyrighted game trainers; it only provides local client-side text translation.'],
      [Lock, '4. Terms Modifications', 'These terms may be updated to reflect service improvements or compliance updates.'],
    ],
  },
  ja: {
    title: '利用規約',
    subtitle: 'LocalPatcher サービス利用条件および免責事項',
    updated: '最終更新日：2026年7月25日',
    warning: 'LocalPatcherはクライアントサイドのテキスト変換ツールです。パッチ適用ファイルの executable 実行に伴うアカウント制裁やセーブデータ破損の責任は利用者に帰属します。',
    privacy: 'データ処理方針についてはプライバシーポリシーをご確認ください。',
    sections: [
      [AlertOctagon, '1. アンチチートとオフライン利用', 'アンチチート保護のあるオンライン・マルチプレイ環境では絶対に使用せず、オフラインのシングルプレイのみでご利用ください。'],
      [HelpCircle, '2. 誤検出とセキュリティ確認', 'メモリ操作の性質上、セキュリティソフトで誤検出される場合があります。実行前に複数のスキャナーで確認してください。'],
      [Ban, '3. 免責事項', '本サイトは著作権物を直接保存・配布せず、ローカルでのテキスト変換機能のみを提供します。'],
      [Lock, '4. 規約の変更', '本規約はサービス改善や法令 준수를 ため予告なく変更される場合があります。'],
    ],
  },
  de: {
    title: 'Nutzungsbedingungen',
    subtitle: 'Nutzungsbedingungen und Haftungsausschluss für LocalPatcher',
    updated: 'Zuletzt aktualisiert: 25. Juli 2026',
    warning: 'LocalPatcher ist ein lokales Dienstprogramm. Die Verantwortung für die Nutzung gepatchter Dateien liegt beim Benutzer.',
    privacy: 'Informationen zur Datenverarbeitung finden Sie in unseren Datenschutzbestimmungen.',
    sections: [
      [AlertOctagon, '1. Anti-Cheat & Offline-Nutzung', 'Niemals in Online- oder Multiplayer-Spielen verwenden. Nur im Offline-Einzelspieler nutzen.'],
      [HelpCircle, '2. Fehlalarme & Sicherheitsüberprüfung', 'Trainer-Dateien können Antiviren-Fehlalarme auslösen. Vor der Ausführung stets prüfen.'],
      [Ban, '3. Haftungsausschluss', 'Diese Website speichert oder verbreitet keine urheberrechtlich geschützten Dateien.'],
      [Lock, '4. Änderungen der Bedingungen', 'Diese Bedingungen können bei Bedarf aktualisiert werden.'],
    ],
  },
  es: {
    title: 'Términos de Servicio',
    subtitle: 'Condiciones de uso y limitación de responsabilidad de LocalPatcher',
    updated: 'Última actualización: 25 de julio de 2026',
    warning: 'LocalPatcher es una herramienta de utilidad local. El usuario asume toda la responsabilidad por el uso de archivos parcheados.',
    privacy: 'Consulte nuestra Política de Privacidad para obtener información sobre el tratamiento de datos.',
    sections: [
      [AlertOctagon, '1. Anti-Cheat y Uso Offline', 'No utilice trainers en juegos en línea o multijugador. Utilícelos únicamente en modo individual sin conexión.'],
      [HelpCircle, '2. Falsos Positivos y Verificación', 'Los ejecutables pueden activar falsos positivos de antivirus. Verifique siempre antes de ejecutar.'],
      [Ban, '3. Limitación de Responsabilidad', 'Este sitio no almacena ni distribuye archivos protegidos por derechos de autor.'],
      [Lock, '4. Modificación de Términos', 'Estos términos pueden ser actualizados para reflejar mejoras en el servicio.'],
    ],
  },
};

export function getTermsContent(locale: Locale) {
  return termsPageContent[locale] || termsPageContent.en;
}

export const supportPageContent = {
  ko: {
    title: 'LocalPatcher 운영 후원 안내',
    subtitle: '서버 업로드 없는 로컬 패치 플랫폼의 지속 가능한 가동을 응원해 주세요.',
    cardTitle: 'Patreon 정기 후원 (준비 중)',
    cardIntro: 'LocalPatcher는 회원가입이나 유료 결제 없이 무료로 이용할 수 있는 유틸리티 서비스입니다. 안정적인 서버 운영과 지속적인 신규 트레이너 데이터 업데이트를 지원하고자 하신다면 후원에 참여하실 수 있습니다.',
    pledgeText: '매월 커피 한 잔 분량의 작은 후원이 서버 인프라 유지와 최신 게임 대응 데이터베이스의 신속한 업데이트를 지속하는 가장 큰 원동력이 됩니다.',
    cta: 'Patreon 정기 후원하기',
    footerNote: '모든 후원금은 서버 유지비, 데이터베이스 용량 증설 및 스크래핑 효율화 개발에 투명하게 사용됩니다.',
    comingSoonText: '후원 서비스 준비 중 (Coming Soon)',
    costs: [
      [Database, '실시간 데이터베이스 유지', '게임 트레이너의 고유 해시값(SHA-256) 및 번역용 텍스트의 오프셋 위치 정보의 관리와 쿼리 처리.'],
      [Cpu, '자동 스크래퍼 가동', '최신 게임 출시 및 트레이너 버전 업데이트 정보를 상시 감지하고 시스템에 등록하는 엔진의 가동 비용.'],
      [FileCheck2, '글로벌 CDN 호스팅', '전 세계 이용자가 업로드 대기시간 없이 브라우저에서 즉시 변환 처리를 마칠 수 있는 초고속 에지 네트워크 인프라 구축.'],
    ],
  },
  en: {
    title: 'Support LocalPatcher',
    subtitle: 'Help keep our client-side trainer patch utility free and continuously updated.',
    cardTitle: 'Patreon Monthly Sponsorship (Coming Soon)',
    cardIntro: 'LocalPatcher is a free tool available without accounts or paid paywalls. If you would like to support server operations and continuous database updates for new games, you can contribute on Patreon.',
    pledgeText: 'A monthly pledge equal to a cup of coffee helps cover server infrastructure costs and enables rapid updates for new game titles.',
    cta: 'Sponsor on Patreon',
    footerNote: 'All contributions directly fund server costs, database capacity expansion, and scraping efficiency improvements.',
    comingSoonText: 'Sponsorship Under Preparation (Coming Soon)',
    costs: [
      [Database, 'Database Infrastructure', 'Managing SHA-256 binary signatures and text translation offset mappings for fast client query processing.'],
      [Cpu, 'Automated Scraping Pipeline', 'Operational costs for automated background engines detecting new game trainer build releases daily.'],
      [FileCheck2, 'Global Edge CDN Hosting', 'Fast edge infrastructure ensuring instant browser-based processing without queues or uploads.'],
    ],
  },
  ja: {
    title: 'LocalPatcher 運営支援のご案内',
    subtitle: 'ファイルをアップロードしないローカルパッチツールの継続的な運営を応援してください。',
    cardTitle: 'Patreon 定期支援 (準備中)',
    cardIntro: 'LocalPatcherは会員登録や有料決済を必要とせず、無料で利用できるツールです。安定したサーバー運営と継続的な最新データ更新を支援していただける場合は、Patreonからご支援いただけます。',
    pledgeText: '毎月コーヒー1杯分の小さなご支援が、サーバーインフラの維持、最新ゲームの対応リストの高速なアップデート活動を支える大きな原動力になります。',
    cta: 'Patreonで定期支援する',
    footerNote: 'すべての支援金は、サーバーの維持費、データベース容量増設、およびスクレイピング効率化の開発に透明性を持って充てられます。',
    comingSoonText: '支援サービス準備中 (Coming Soon)',
    costs: [
      [Database, 'リアルタイムデータベースの維持', 'ゲームトレーナーの固有ハッシュ値(SHA-256)およびローカライズ用テキストのオフセット配置情報の管理とクエリ処理。'],
      [Cpu, '自動スクレイパーの稼働', '最新ゲームのリリースとトレーナーのバージョンアップデート情報を常時監視し、システムに登録するエンジンの稼働費。'],
      [FileCheck2, 'グローバルCDNホスティング', '世界中のユーザーがアップロード待ち時間なしで、ブラウザ上で一瞬で変換処理を終えられる高速なエッジネットワークインフラの構築。'],
    ],
  },
  de: {
    title: 'LocalPatcher unterstützen',
    subtitle: 'Helfen Sie mit, unser lokales Patcher-Tool kostenlos und dauerhaft auf dem neuesten Stand zu halten.',
    cardTitle: 'Patreon Sponsoring (Demnächst)',
    cardIntro: 'LocalPatcher ist ein kostenloses Tool ohne Registrierung. Unterstützen Sie den Betrieb und die Aktualisierung der Datenbank auf Patreon.',
    pledgeText: 'Ein kleiner monatlicher Beitrag hilft, die Serverkosten zu decken und schnelle Updates für neue Spiele zu ermöglichen.',
    cta: 'Auf Patreon unterstützen',
    footerNote: 'Alle Beiträge fließen direkt in Serverkosten und die Erweiterung der Datenbank.',
    comingSoonText: 'Unterstützungsdienst wird vorbereitet (Demnächst)',
    costs: [
      [Database, 'Datenbank-Infrastruktur', 'Verwaltung von SHA-256 Signaturen und Übersetzungs-Offsets für schnelle Abfragen.'],
      [Cpu, 'Automatische Scraper-Engine', 'Betriebskosten für Hintergrund-Engines zur täglichen Erkennung neuer Trainer-Updates.'],
      [FileCheck2, 'Globales Edge CDN Hosting', 'Schnelle Edge-Infrastruktur für sofortige Browser-Verarbeitung ohne Uploads.'],
    ],
  },
  es: {
    title: 'Apoyar a LocalPatcher',
    subtitle: 'Ayude a mantener nuestra herramienta de parcheo gratuita y continuamente actualizada.',
    cardTitle: 'Patrocinio Mensual en Patreon (Próximamente)',
    cardIntro: 'LocalPatcher es una herramienta gratuita sin registros. Si desea apoyar las operaciones del servidor, puede contribuir en Patreon.',
    pledgeText: 'Una pequeña contribución mensual ayuda a cubrir los costos de infraestructura y permite actualizaciones rápidas.',
    cta: 'Patrocinar en Patreon',
    footerNote: 'Todas las contribuciones financian directamente los costos de servidor y ampliación de base de datos.',
    comingSoonText: 'Servicio de patrocinio en preparación (Próximamente)',
    costs: [
      [Database, 'Infraestructura de Base de Datos', 'Gestión de firmas SHA-256 y mapeos de texto para un procesamiento rápido.'],
      [Cpu, 'Pipeline de Scraper Automatizado', 'Costos operativos de motores en segundo plano que detectan nuevos lanzamientos.'],
      [FileCheck2, 'Alojamiento CDN Global Edge', 'Infraestructura rápida en el borde que garantiza un procesamiento instantáneo en el navegador.'],
    ],
  },
};

export function getSupportContent(locale: Locale) {
  return supportPageContent[locale] || supportPageContent.en;
}

export const layoutMetadataContent = {
  ko: {
    title: '게임 트레이너 한글 패치 & 다운로드 플랫폼 | LocalPatcher',
    description: '스팀 게임 트레이너 및 플링(FLiNG) 치트 키 한글화 패치 플랫폼. 서버 업로드 없이 브라우저에서 로컬로 한글 패치를 적용하고 다운로드하세요.',
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
