import { FileCheck2, Fingerprint, History, Link as LinkIcon } from 'lucide-react';
import type { Locale } from '@/lib/i18n/types';
import type { TrainerProvenance } from '@/lib/trainer-provenance';

interface PatcherVerificationProvenanceProps {
  locale: Locale;
  provenance: TrainerProvenance;
}

const LABELS: Record<Locale, {
  title: string;
  description: string;
  source: string;
  latest: string;
  fingerprint: string;
  size: string;
  coverage: string;
  history: string;
  sourceLink: string;
}> = {
  ko: { title: '등록된 최신 빌드 정보', description: '등록된 원본 링크, 최신 빌드 식별 정보 및 승인 매핑 범위입니다.', source: '원본 링크', latest: '현재 표시 빌드', fingerprint: '파일 식별값', size: '등록 파일 크기', coverage: '승인 매핑 범위', history: '등록된 버전 기록', sourceLink: '등록된 원본 배포 페이지 열기' },
  en: { title: 'Listed latest build details', description: 'The registered source link, latest build identifier, and approved mapping coverage.', source: 'Source link', latest: 'Displayed build', fingerprint: 'File fingerprint', size: 'Listed file size', coverage: 'Approved mapping coverage', history: 'Listed version history', sourceLink: 'Open listed source page' },
  ja: { title: '登録済み最新ビルド情報', description: '登録された原本リンク、最新ビルド識別情報、承認済みマッピング範囲です。', source: '原本リンク', latest: '表示中のビルド', fingerprint: 'ファイル識別値', size: '登録ファイルサイズ', coverage: '承認済みマッピング範囲', history: '登録済みバージョン履歴', sourceLink: '登録済み原本ページを開く' },
  de: { title: 'Details zum gelisteten aktuellen Build', description: 'Der hinterlegte Quelllink, die Kennung des aktuellen Builds und der Umfang bestätigter Mappings.', source: 'Quelllink', latest: 'Angezeigter Build', fingerprint: 'Datei-Fingerabdruck', size: 'Geliste Dateigröße', coverage: 'Bestätigter Mapping-Umfang', history: 'Geliste Versionshistorie', sourceLink: 'Geliste Quellseite öffnen' },
  es: { title: 'Detalles de la compilación más reciente registrada', description: 'El enlace de origen registrado, el identificador de la compilación más reciente y la cobertura de mapeos aprobados.', source: 'Enlace de origen', latest: 'Compilación mostrada', fingerprint: 'Huella del archivo', size: 'Tamaño de archivo registrado', coverage: 'Cobertura de mapeos aprobados', history: 'Historial de versiones registrado', sourceLink: 'Abrir página de origen registrada' },
};

/** 최신 빌드의 수집 사실을 서버 HTML에만 표시하는 비대화형 정보 영역입니다. */
export default function PatcherVerificationProvenance({ locale, provenance }: PatcherVerificationProvenanceProps) {
  const labels = LABELS[locale] || LABELS.en;
  return (
    <section className="mx-auto mb-6 w-full max-w-5xl rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-5 text-slate-300 shadow-xl sm:p-6" aria-labelledby="trainer-provenance-title">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-300" aria-hidden="true"><FileCheck2 className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h2 id="trainer-provenance-title" className="text-lg font-bold text-slate-100">{labels.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{labels.description}</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><dt className="text-xs text-slate-500">{labels.latest}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-100">{provenance.latestVersion}</dd></div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><dt className="flex items-center gap-1.5 text-xs text-slate-500"><Fingerprint className="h-3.5 w-3.5" />{labels.fingerprint}</dt><dd className="mt-1 font-mono text-sm text-slate-200">{provenance.fingerprint}</dd></div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><dt className="text-xs text-slate-500">{labels.size}</dt><dd className="mt-1 text-sm text-slate-200">{provenance.fileSize}</dd></div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><dt className="text-xs text-slate-500">{labels.coverage}</dt><dd className="mt-1 text-sm text-slate-200">{provenance.approvedOptionCount.toLocaleString(locale)}</dd></div>
      </dl>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><History className="h-3.5 w-3.5" />{labels.history}</h3>
        <p className="mt-2 break-words text-sm text-slate-200">{provenance.versionHistory.join(' · ')}</p>
      </div>
      <p className="mt-4 text-xs"><a className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300" href={provenance.sourceUrl} target="_blank" rel="noopener noreferrer"><LinkIcon className="h-3.5 w-3.5" />{labels.sourceLink}<span className="sr-only"> ({labels.source})</span></a></p>
    </section>
  );
}
