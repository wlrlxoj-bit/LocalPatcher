import type { Locale } from '@/lib/i18n/types';
import type { TrainerOptionSummary } from '@/lib/trainer-option-summary';

interface PatcherOptionSummaryProps {
  locale: Locale;
  summary: TrainerOptionSummary | null;
}

const LABELS: Record<Locale, { title: string; description: string; shortcut: string; option: string }> = {
  ko: { title: '최신 승인 번역 옵션 일부', description: '승인된 최신 트레이너 번역 데이터에서 확인된 단축키와 옵션명입니다.', shortcut: '단축키', option: '번역 옵션' },
  en: { title: 'Verified options from the latest translation', description: 'Shortcuts and option labels confirmed in the approved latest trainer translation.', shortcut: 'Shortcut', option: 'Translated option' },
  ja: { title: '最新承認済み翻訳のオプション（一部）', description: '承認済みの最新トレーナー翻訳データで確認されたショートカットとオプション名です。', shortcut: 'ショートカット', option: '翻訳オプション' },
  de: { title: 'Auszug der neuesten bestätigten Übersetzungsoptionen', description: 'Tastenkürzel und Optionsnamen, die in der bestätigten neuesten Trainerübersetzung enthalten sind.', shortcut: 'Tastenkürzel', option: 'Übersetzte Option' },
  es: { title: 'Opciones verificadas de la última traducción', description: 'Atajos y nombres de opciones confirmados en la traducción aprobada del último trainer.', shortcut: 'Atajo', option: 'Opción traducida' },
};

/** 승인된 최신 트레이너 매핑에서 검증된 6~10개 옵션만 서버 HTML로 표시한다. */
export default function PatcherOptionSummary({ locale, summary }: PatcherOptionSummaryProps) {
  if (!summary || summary.items.length < 6) return null;

  const labels = LABELS[locale] || LABELS.en;
  return (
    <section className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5" aria-labelledby="trainer-option-summary-title">
      <h3 id="trainer-option-summary-title" className="text-sm font-bold text-slate-100">{labels.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{labels.description}</p>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        {summary.items.map((item) => (
          <div key={`${item.shortcut}-${item.label}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-800/80 bg-slate-900/50 px-3 py-2.5">
            <dt className="shrink-0 rounded bg-cyan-500/10 px-2 py-1 font-mono text-xs font-semibold text-cyan-300" aria-label={labels.shortcut}>{item.shortcut}</dt>
            <dd className="min-w-0 text-sm text-slate-200">{item.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
