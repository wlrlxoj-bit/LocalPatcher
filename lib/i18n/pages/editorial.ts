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

