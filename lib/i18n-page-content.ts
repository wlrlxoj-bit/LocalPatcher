import { Locale } from '@/lib/i18n';
import { 
  AlertOctagon, Ban, HelpCircle, Lock, 
  UserRoundX, EyeOff, Cookie, Cpu, 
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
