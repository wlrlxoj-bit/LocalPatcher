import type { Locale } from '@/lib/i18n/types';
import type { TrainerOptionTable } from '@/lib/trainer-option-table';

const LABELS: Record<Locale, { title: string; description: string; shortcut: string; option: string; count: string }> = {
  ko: { title: '최신 승인 번역의 전체 옵션', description: '최신 트레이너의 승인 번역에서 원문과 일치하는 단축키를 확인한 전체 옵션입니다. 이 목록은 JavaScript 없이도 열어 볼 수 있습니다.', shortcut: '단축키', option: '번역 옵션', count: '{count}개 옵션' },
  en: { title: 'All options in the latest approved translation', description: 'The complete option list, verified against the source shortcuts in the latest approved trainer translation. This list can be opened without JavaScript.', shortcut: 'Shortcut', option: 'Translated option', count: '{count} options' },
  ja: { title: '最新承認済み翻訳の全オプション', description: '最新トレーナーの承認済み翻訳で、原文と一致するショートカットを確認した全オプションです。JavaScriptなしでも開けます。', shortcut: 'ショートカット', option: '翻訳オプション', count: '{count}個のオプション' },
  de: { title: 'Alle Optionen der neuesten bestätigten Übersetzung', description: 'Die vollständige Optionsliste der neuesten bestätigten Trainerübersetzung, deren Tastenkürzel mit dem Original abgeglichen wurden. Die Liste lässt sich ohne JavaScript öffnen.', shortcut: 'Tastenkürzel', option: 'Übersetzte Option', count: '{count} Optionen' },
  es: { title: 'Todas las opciones de la última traducción aprobada', description: 'Lista completa de opciones de la última traducción aprobada del trainer, con los atajos verificados frente al original. Se puede abrir sin JavaScript.', shortcut: 'Atajo', option: 'Opción traducida', count: '{count} opciones' },
};

/** 네이티브 details의 초기 HTML에 모든 행을 넣어 번역 미리보기 조작과 분리합니다. */
export default function PatcherOptionTable({ locale, table }: { locale: Locale; table: TrainerOptionTable | null }) {
  if (!table || table.items.length === 0) return null;
  const labels = LABELS[locale];
  return (
    <details open className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-bold text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400">
        {labels.title} — {labels.count.replace('{count}', table.items.length.toLocaleString(locale))}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{labels.description}</p>
      <table className="mt-4 w-full table-fixed text-left text-sm">
        <caption className="sr-only">{labels.title}</caption>
        <thead>
          <tr className="border-b border-slate-700 text-xs text-slate-400">
            <th scope="col" className="w-1/3 px-2 py-2 sm:w-1/4">{labels.shortcut}</th>
            <th scope="col" className="px-2 py-2">{labels.option}</th>
          </tr>
        </thead>
        <tbody>
          {table.items.map((item) => (
            <tr key={item.shortcut} className="border-b border-slate-800/70 last:border-0">
              <th scope="row" className="break-words px-2 py-2.5 font-mono text-xs font-semibold text-cyan-300">{item.shortcut}</th>
              <td className="break-words px-2 py-2.5 text-slate-200">{item.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
