import React from 'react';
import { ShieldCheck, Lock, AlertTriangle, FileCheck, HelpCircle, HardDriveDownload, Cpu } from 'lucide-react';
import type { Locale } from '@/lib/i18n/types';

interface PatcherUniqueContentProps {
  locale: Locale;
  gameTitle: string;
  gameSlug: string;
}

const UNIQUE_CONTENT_DATA: Record<Locale, {
  securityTitle: string;
  securitySubtitle: string;
  securityPoints: Array<{ title: string; desc: string }>;
  safetyTitle: string;
  safetySubtitle: string;
  safetyPoints: Array<{ title: string; desc: string }>;
  faqTitle: string;
  faqSubtitle: string;
  faqs: Array<{ q: string; a: string }>;
}> = {
  ko: {
    securityTitle: "LocalPatcher의 100% 로컬 브라우저 패칭 원리",
    securitySubtitle: "선택하신 트레이너 파일은 외부 서버로 절대 업로드되지 않으며 사용자의 PC 브라우저 내부에서만 처리됩니다.",
    securityPoints: [
      {
        title: "제로 업로드(Zero Upload) 보안 아키텍처",
        desc: "드래그 앤 드롭한 파일은 클라우드나 외부 데이터베이스로 전송되지 않습니다. HTML5 File API와 WebAssembly/JS를 통해 사용자의 웹 브라우저 메모리(RAM) 내부에서만 즉시 문자열 치환이 일어납니다."
      },
      {
        title: "바이너리 해시 무결성 검증",
        desc: "등록된 정식 원본 트레이너의 SHA-256 해시값 및 바이트 크기와 일치하는지 로컬에서 대조하여, 변조되거나 손상된 파일의 오작동을 사전에 방지합니다."
      },
      {
        title: "개인정보 및 회원가입 프리(Free)",
        desc: "별도의 계정 생성이나 로그인 없이 모든 기능을 무료로 이용할 수 있으며, 어떠한 사용자 식별 정보도 수집하거나 저장하지 않습니다."
      }
    ],
    safetyTitle: "트레이너 안전 이용 수칙 & 세이브 파일 보호",
    safetySubtitle: "싱글 플레이어 게임의 재미를 극대화하면서 세이브 데이터 유실 및 제재를 예방하는 가이드입니다.",
    safetyPoints: [
      {
        title: "스팀 클라우드 및 로컬 세이브 수동 백업",
        desc: "치트 옵션(무제한 스탯, 아이템 증식 등) 활성화 시 드물게 게임 내부 로직 충돌로 세이브 파일이 손상될 수 있습니다. 실행 전 반드시 %USERPROFILE%/AppData/Local 또는 Documents 내의 게임 세이브 폴더를 별도 백업하십시오."
      },
      {
        title: "싱글 플레이어 및 오프라인 모드 전용",
        desc: "멀티플레이, 협동(Co-op), 온라인 랭킹 또는 EAC(Easy Anti-Cheat), 배틀아이(BattlEye) 등의 안티치트가 적용된 환경에서는 절대 실행하지 마십시오. 오프라인 싱글 캠페인에서만 사용해야 합니다."
      },
      {
        title: "백신 오탐지(False Positive) 대응 요령",
        desc: "게임 트레이너는 실행 중인 프로세스의 메모리 주소(RAM)를 후킹하여 수치를 변경하므로, 백신 프로그램(Windows Defender 등)이 트로이목마/위험 소프트웨어로 오인 탐지할 수 있습니다. 공식 해시값을 확인한 후 예외 처리를 진행하세요."
      }
    ],
    faqTitle: "자주 묻는 질문 (FAQ) & 문제 해결",
    faqSubtitle: "트레이너 한글 패치 적용 및 실행 중 발생하는 주요 문제와 해결 방안입니다.",
    faqs: [
      {
        q: "패치된 트레이너를 실행했는데 게임에 치트가 적용되지 않아요.",
        a: "게임의 실행 파일(.exe) 버전과 트레이너의 지원 버전이 일치하는지 확인해 주세요. 게임이 최근 업데이트되었다면 이전 버전 트레이너는 메모리 주소가 달라져 치트가 작동하지 않을 수 있습니다. 관리자 권한으로 트레이너를 실행하는 것도 권장됩니다."
      },
      {
        q: "다운로드한 파일의 압축 해제 비밀번호는 무엇인가요?",
        a: "보안 패키징 파일의 기본 압축 해제 비밀번호는 11111111 입니다. 파일 다운로드 후 압축 해제 프로그램(알집, 반디집, 7-Zip 등)에서 비밀번호를 입력해 주시면 됩니다."
      },
      {
        q: "한글 글자가 깨지거나 사각형(□)으로 표시되는 경우 어떻게 하나요?",
        a: "일부 트레이너는 영문 전용 폰트(Bitmap)를 내장하고 있어 다국어 문자가 정상 렌더링되지 않을 수 있습니다. 윈도우 시스템 로캘을 한국어로 설정하거나, LocalPatcher에서 제공하는 번역 옵션 미리보기를 통해 원본 옵션 명칭과 대조하여 이용하십시오."
      },
      {
        q: "LocalPatcher 이용에 비용이나 유료 결제가 필요한가요?",
        a: "LocalPatcher는 100% 무료 공공 웹 유틸리티입니다. 광고 시청이나 유료 결제 유도 없이 누구나 브라우저에서 자유롭게 트레이너 번역 패치를 생성하실 수 있습니다."
      }
    ]
  },
  en: {
    securityTitle: "How LocalPatcher Works: 100% Local In-Browser Processing",
    securitySubtitle: "Your trainer files are never uploaded to any remote server. Everything runs securely within your local PC browser.",
    securityPoints: [
      {
        title: "Zero-Upload Architecture",
        desc: "Files dropped into LocalPatcher remain strictly on your machine. Using HTML5 File APIs and client-side processing, translation string patching happens directly in your browser's local RAM."
      },
      {
        title: "Binary Hash & Integrity Verification",
        desc: "The tool locally verifies SHA-256 hashes and file sizes against verified records to prevent accidental modifications to incompatible trainer versions."
      },
      {
        title: "No Account or Registration Required",
        desc: "All features are completely free and require no account registration, logins, or personal data collection."
      }
    ],
    safetyTitle: "Trainer Safety Guide & Save File Protection",
    safetySubtitle: "Best practices to prevent save corruption and ensure a safe single-player gaming experience.",
    safetyPoints: [
      {
        title: "Always Back Up Game Saves",
        desc: "Activating memory-altering cheats (such as infinite inventory or attribute boosts) can occasionally cause unexpected in-game script errors. Always back up your save folder located in %USERPROFILE%/AppData or Documents prior to using cheats."
      },
      {
        title: "Strictly for Single-Player Offline Modes",
        desc: "Never use trainers in multiplayer, cooperative, or competitive environments protected by Anti-Cheat solutions (EAC, BattlEye). Use exclusively in offline single-player games."
      },
      {
        title: "Antivirus False Positives",
        desc: "Because game trainers work by reading and writing to game process memory (RAM), antivirus software (e.g., Windows Defender) may flag them as suspicious. Verify hashes and add exclusions only for trusted trainers."
      }
    ],
    faqTitle: "Frequently Asked Questions & Troubleshooting",
    faqSubtitle: "Common questions and solutions regarding trainer localization and execution.",
    faqs: [
      {
        q: "Why are cheats not taking effect in my game?",
        a: "Ensure the game executable version strictly matches the trainer version. If the game received a recent update, memory offsets may have shifted. Also, try launching both the game and trainer with Administrator privileges."
      },
      {
        q: "What is the extraction password for the downloaded ZIP?",
        a: "The standard extraction password for protected zip archives is 11111111. Enter this in your archive manager (7-Zip, WinRAR) when extracting."
      },
      {
        q: "What if characters appear corrupted or distorted?",
        a: "Some trainers utilize embedded custom bitmap fonts. If rendering issues occur, check your system display locale or reference our on-page preview table."
      },
      {
        q: "Is LocalPatcher completely free to use?",
        a: "Yes, LocalPatcher is 100% free with no registration, forced paywalls, or mandatory ad watching required."
      }
    ]
  },
  ja: {
    securityTitle: "LocalPatcherの100%ローカルブラウザ処理の仕組み",
    securitySubtitle: "選択したトレーナーファイルは外部サーバーへアップロードされることなく、PCブラウザ内でのみ安全に処理されます。",
    securityPoints: [
      {
        title: "ゼロアップロード（Zero Upload）セキュリティ",
        desc: "ドラッグ＆ドロップされたファイルは外部サーバーやデータベースに送信されません。HTML5 File APIとブラウザ内メモリ（RAM）を活用して瞬時にテキストの書き換えを行います。"
      },
      {
        title: "バイナリ整合性検証",
        desc: "公式トレーナーのSHA-256ハッシュ値とファイルサイズをローカルで比較し、互換性のないファイルや改ざんされたファイルの誤作動を事前に防ぎます。"
      },
      {
        title: "会員登録・個人情報不要",
        desc: "アカウント登録やログインなしですべての機能を無料でご利用いただけます。個人情報は一切収集されません。"
      }
    ],
    safetyTitle: "トレーナー安全利用ガイド＆セーブデータ保護",
    safetySubtitle: "シングルプレイヤーゲームを安全に楽しみ、セーブデータの消失を防ぐためのガイドラインです。",
    safetyPoints: [
      {
        title: "セーブデータの事前バックアップ",
        desc: "チート機能（所持金無限、ステータス変更等）の使用により、ゲーム内のデータ整合性が崩れる場合があります。使用前に必ずローカルセーブフォルダ（AppData等）をバックアップしてください。"
      },
      {
        title: "シングルプレイヤー・オフライン専用",
        desc: "オンライン対戦、Co-op、アンチチート（EAC等）が導入されている環境では絶対に使用しないでください。完全にオフラインのシングルプレイでのみご利用ください。"
      },
      {
        title: "セキュリティソフトの誤検出について",
        desc: "トレーナーは実行中のプロセスメモリ（RAM）を直接操作するため、セキュリティソフト（Windows Defender等）によって誤検知される場合があります。ハッシュ値を確認した上で必要に応じて例外設定を行ってください。"
      }
    ],
    faqTitle: "よくある質問 (FAQ) & トラブルシューティング",
    faqSubtitle: "トレーナー日本語化および実行に関するよくある疑問と解決策です。",
    faqs: [
      {
        q: "パッチを適用したトレーナーでチートが機能しません。",
        a: "ゲームのバージョンとトレーナーの対応バージョンが一致しているかご確認ください。ゲームがアップデートされた直後はメモリ構造が変わり機能しない場合があります。管理者権限での実行もお試しください。"
      },
      {
        q: "ダウンロードしたZIPファイルの解凍パスワードは何ですか？",
        a: "セキュリティZIPファイルの解凍パスワードは「 11111111 」です。解凍ソフト（7-Zip、WinRAR等）に入力してください。"
      },
      {
        q: "文字化けが発生する場合はどうすればよいですか？",
        a: "一部のトレーナーには英字専用フォントが埋め込まれている場合があります。当サイトのオプションプレビュー一覧と照らし合わせて機能をご確認ください。"
      },
      {
        q: "LocalPatcherは完全に無料ですか？",
        a: "はい、LocalPatcherは会員登録不要・完全無料で利用できるWebユーティリティです。"
      }
    ]
  },
  de: {
    securityTitle: "So funktioniert LocalPatcher: 100% lokale Browser-Verarbeitung",
    securitySubtitle: "Ihre Trainer-Dateien werden niemals auf einen Remote-Server hochgeladen. Alles läuft sicher in Ihrem Browser ab.",
    securityPoints: [
      {
        title: "Zero-Upload-Sicherheitsarchitektur",
        desc: "Ausgewählte Dateien verbleiben vollständig auf Ihrem lokalen PC. Die Textübersetzung erfolgt direkt im Arbeitsspeicher (RAM) Ihres Webbrowsers."
      },
      {
        title: "Hash- und Integritätsprüfung",
        desc: "Das Tool gleicht SHA-256-Hashes und Dateigrößen lokal ab, um fehlerhafte Patches auf inkompatiblen Versionen zu verhindern."
      },
      {
        title: "Keine Registrierung erforderlich",
        desc: "Alle Funktionen stehen kostenlos zur Verfügung, ohne dass ein Konto oder persönliche Daten erforderlich sind."
      }
    ],
    safetyTitle: "Trainer-Sicherheitsleitfaden & Spielstandsicherung",
    safetySubtitle: "Empfehlungen zur Vermeidung von Speicherfehlern und für ein sicheres Einzelspieler-Erlebnis.",
    safetyPoints: [
      {
        title: "Spielstände vorab sichern",
        desc: "Cheats können in seltenen Fällen Speicherstände beschädigen. Sichern Sie immer Ihre Speicherordner in %USERPROFILE%/AppData oder Documents vor der Verwendung von Trainern."
      },
      {
        title: "Ausschließlich für Offline-Einzelspieler",
        desc: "Verwenden Sie Trainer niemals in Multiplayer- oder Anti-Cheat-Umgebungen (EAC, BattlEye). Nur für den Offline-Einzelspielermodus geeignet."
      },
      {
        title: "Antiviren-Fehlalarme (False Positives)",
        desc: "Trainer greifen auf den Prozessspeicher (RAM) des Spiels zu, weshalb Antivirenprogramme sie oft fälschlicherweise als verdächtig einstufen."
      }
    ],
    faqTitle: "Häufig gestellte Fragen (FAQ) & Problemlösung",
    faqSubtitle: "Wichtige Fragen und Antworten zur Trainer-Lokalisierung.",
    faqs: [
      {
        q: "Warum funktionieren die Cheats in meinem Spiel nicht?",
        a: "Überprüfen Sie, ob die Spielversion mit der Version des Trainers übereinstimmt. Führen Sie den Trainer gegebenenfalls als Administrator aus."
      },
      {
        q: "Wie lautet das Passwort zum Entpacken der ZIP-Datei?",
        a: "Das Standardpasswort für das Archiv lautet 11111111."
      },
      {
        q: "Ist LocalPatcher dauerhaft kostenlos?",
        a: "Ja, LocalPatcher ist ein zu 100% kostenloses Web-Dienstprogramm."
      }
    ]
  },
  es: {
    securityTitle: "Cómo funciona LocalPatcher: Procesamiento 100% Local en Navegador",
    securitySubtitle: "Sus archivos nunca se suben a servidores remotos. Todo se procesa de forma segura en la memoria de su navegador.",
    securityPoints: [
      {
        title: "Arquitectura Sin Subidas (Zero-Upload)",
        desc: "Los archivos seleccionados permanecen en su equipo. La traducción se realiza en la memoria RAM de su navegador mediante APIs locales de HTML5."
      },
      {
        title: "Verificación de Integridad por Hash",
        desc: "Comparamos localmente los valores hash SHA-256 y el tamaño del archivo con los registros originales para evitar incompatibilidades."
      },
      {
        title: "Sin Registro ni Cuentas",
        desc: "Todas las utilidades son gratuitas y no requieren registro ni recopilación de información personal."
      }
    ],
    safetyTitle: "Guía de Seguridad para Trainers y Copia de Partidas",
    safetySubtitle: "Recomendaciones para evitar la pérdida de partidas y garantizar una experiencia segura en juegos para un solo jugador.",
    safetyPoints: [
      {
        title: "Copia de Seguridad de Partidas Guardadas",
        desc: "El uso de trucos puede alterar la lógica interna del juego. Realice siempre una copia de seguridad de sus partidas guardadas antes de activar trucos."
      },
      {
        title: "Uso Exclusivo en Modo Un Jugador / Offline",
        desc: "Nunca utilice trainers en modos multijugador o con sistemas antitrampas (EAC, BattlEye). Úselo únicamente en solitario y sin conexión."
      },
      {
        title: "Falsos Positivos de Antivirus",
        desc: "Los trainers modifican la memoria de procesos activos, por lo que los antivirus pueden detectarlos erróneamente como sospechosos."
      }
    ],
    faqTitle: "Preguntas Frecuentes (FAQ) y Solución de Problemas",
    faqSubtitle: "Dudas habituales sobre la localización y ejecución de trainers.",
    faqs: [
      {
        q: "¿Por qué no se activan los trucos en mi juego?",
        a: "Verifique que la versión de su juego coincida con la versión admitida por el trainer. Ejecute el trainer como administrador."
      },
      {
        q: "¿Cuál es la contraseña para descomprimir el archivo ZIP?",
        a: "La contraseña predeterminada es 11111111."
      },
      {
        q: "¿LocalPatcher es completamente gratuito?",
        a: "Sí, LocalPatcher es una utilidad web 100% gratuita y sin registro."
      }
    ]
  }
};

export default function PatcherUniqueContent({ locale, gameTitle, gameSlug }: PatcherUniqueContentProps) {
  const content = UNIQUE_CONTENT_DATA[locale] || UNIQUE_CONTENT_DATA.en;

  // Generate Schema.org FAQPage & SoftwareApplication JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": `LocalPatcher - ${gameTitle}`,
        "operatingSystem": "Windows 10, Windows 11",
        "applicationCategory": "GameApplication, UtilitiesApplication",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        },
        "description": `${gameTitle} Trainer Localization & In-Browser Language Patching Utility.`
      },
      {
        "@type": "FAQPage",
        "mainEntity": content.faqs.map(faq => ({
          "@type": "Question",
          "name": faq.q,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.a
          }
        }))
      }
    ]
  };

  return (
    <div className="w-full max-w-5xl mx-auto mt-16 space-y-12 text-slate-300">
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 1. Security & Technology Architecture Section */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 font-outfit">
              {content.securityTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {content.securitySubtitle}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {content.securityPoints.map((point, index) => (
            <div key={index} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/50 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-cyan-300 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  {point.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed text-justify">
                  {point.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Safety Guidelines & Save Backup Section */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 font-outfit">
              {content.safetyTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {content.safetySubtitle}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {content.safetyPoints.map((point, index) => (
            <div key={index} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/50">
              <h3 className="text-sm font-semibold text-amber-300 mb-2 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-amber-400 shrink-0" />
                {point.title}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed text-justify">
                {point.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Detailed FAQ & Troubleshooting Accordion */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 font-outfit">
              {content.faqTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {content.faqSubtitle}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {content.faqs.map((faq, index) => (
            <details key={index} className="group p-4 rounded-xl bg-slate-950/60 border border-slate-800/60 open:border-cyan-500/30 transition-all">
              <summary className="font-semibold text-sm text-slate-200 cursor-pointer flex items-center justify-between list-none select-none">
                <span className="flex items-center gap-2">
                  <span className="text-cyan-400 font-mono text-xs">Q.</span>
                  {faq.q}
                </span>
                <span className="text-slate-500 text-xs group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-3 pt-3 border-t border-slate-800/40 text-xs text-slate-400 leading-relaxed pl-5">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
