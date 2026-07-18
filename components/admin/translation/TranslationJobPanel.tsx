'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

type Language = 'ko' | 'ja' | 'de' | 'fr' | 'es' | 'pt' | 'zh-Hans' | 'zh-Hant';
type Provider = 'azure' | 'openai_paid';
type TranslationItem = { key: string; text: string };
type RunResult = TranslationItem & { translatedText: string; memoryHit: boolean };
type Quota = { used: number; limit: number; remaining: number; status: string };
type PreviewResponse = { previewHash: string; itemCount: number; characters: number; batchCount: number; quota: Quota; items: TranslationItem[]; pending: unknown };
type Phase = 'loading_source' | 'idle' | 'previewing' | 'ready' | 'running' | 'pending_review' | 'approving' | 'approved' | 'conflict' | 'quota_blocked' | 'unavailable' | 'error';

class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({ error: 'Invalid server response.' }));
  if (!response.ok) throw new ApiError(response.status, typeof data?.error === 'string' ? data.error : `Request failed (${response.status}).`);
  return data as T;
}

const languageOptions: Array<[Language, string]> = [['ko', 'Korean'], ['ja', 'Japanese'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['zh-Hans', 'Chinese (Simplified)'], ['zh-Hant', 'Chinese (Traditional)']];
const phaseForError = (reason: unknown): Phase => reason instanceof ApiError && reason.status === 409 ? 'conflict' : reason instanceof ApiError && reason.status === 429 ? 'quota_blocked' : reason instanceof ApiError && reason.status === 503 ? 'unavailable' : 'error';

export default function TranslationJobPanel({ trainerId }: { trainerId: number }) {
  const [language, setLanguage] = useState<Language>('ko');
  const [provider, setProvider] = useState<Provider>('azure');
  const [source, setSource] = useState<{ trainerId: number; targetLanguage: Language; sourceMappingId: number; sourceVersion: string; items: TranslationItem[]; pending: unknown } | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [job, setJob] = useState<{ id: string; status: 'completed' | 'approved'; result: RunResult[]; idempotent?: boolean } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [paidConsent, setPaidConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading_source');
  const [error, setError] = useState('');
  const sourceMatchesScope = source?.trainerId === trainerId && source.targetLanguage === language;
  const busy = !sourceMatchesScope || phase === 'loading_source' || phase === 'previewing' || phase === 'running' || phase === 'approving';
  const displayedPhase: Phase = sourceMatchesScope ? phase : 'loading_source';

  useEffect(() => {
    const controller = new AbortController();
    const loadSource = async () => {
      try {
        const response = await fetch(`/api/admin/translations/source?trainerId=${trainerId}&targetLanguage=${encodeURIComponent(language)}`, { signal: controller.signal });
        const data = await readResponse<{ trainerId: number; targetLanguage: Language; sourceMappingId: number; sourceVersion: string; items: TranslationItem[]; pending: unknown }>(response);
        if (controller.signal.aborted) return;
        setSource(data); setError(''); setPhase('idle');
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Source loading failed.'); setPhase(phaseForError(reason));
      }
    };
    void loadSource();
    return () => controller.abort();
  }, [trainerId, language]);

  const pendingCount = useMemo(() => Array.isArray(source?.pending) ? source.pending.length : source?.pending ? 1 : 0, [source]);
  const setLanguageSafely = (next: Language) => { setLanguage(next); setSource(null); setPreview(null); setJob(null); setDrafts({}); setIdempotencyKey(''); setPaidConsent(false); setError(''); setPhase('loading_source'); };
  const setProviderSafely = (next: Provider) => { setProvider(next); setPaidConsent(false); setPreview(null); setJob(null); setDrafts({}); setIdempotencyKey(''); setError(''); setPhase('idle'); };

  const requestPreview = async () => {
    if (!source || busy) return; setPhase('previewing'); setError('');
    try {
      const data = await readResponse<PreviewResponse>(await fetch('/api/admin/translations/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, trainerId, targetLanguage: language }) }));
      setPreview(data); setIdempotencyKey(globalThis.crypto?.randomUUID?.() || `${trainerId}-${language}-${data.previewHash}`); setPhase('ready');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Preview failed.'); setPhase(phaseForError(reason)); }
  };

  const runTranslation = async () => {
    if (!preview || !idempotencyKey || busy || (provider === 'openai_paid' && !paidConsent)) return; setPhase('running'); setError('');
    try {
      const data = await readResponse<{ id: string; status: 'completed' | 'approved' | 'running' | 'failed'; result: RunResult[] | null; idempotent?: boolean }>(await fetch('/api/admin/translations/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, trainerId, targetLanguage: language, previewHash: preview.previewHash, idempotencyKey, ...(provider === 'openai_paid' ? { paidConsent: true } : {}) }) }));
      const result = Array.isArray(data.result) ? data.result : [];
      if ((data.status !== 'completed' && data.status !== 'approved') || !result.length) throw new ApiError(409, `Job returned ${data.status} without a completed result.`);
      setJob({ ...data, status: data.status, result }); setDrafts(Object.fromEntries(result.map((item) => [item.key, item.translatedText]))); setPhase(data.status === 'approved' ? 'approved' : 'pending_review');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Translation failed.'); setPhase(phaseForError(reason)); }
  };

  const approveDrafts = async () => {
    if (!job || busy) return;
    const edits = job.result.map((item) => ({ key: item.key, translatedText: drafts[item.key] ?? item.translatedText }));
    if (edits.some((item, index) => job.result[index].text.trim() !== '' && item.translatedText.trim() === '')) { setError('A non-empty source item cannot be approved with an empty translation.'); return; }
    setPhase('approving'); setError('');
    try { await readResponse(await fetch('/api/admin/translations/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id, edits }) })); setPhase('approved'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Approval failed.'); setPhase(phaseForError(reason)); }
  };

  const results = job?.result ?? [];
  const hits = results.filter((item) => item.memoryHit).length;
  return <section className="rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-5 space-y-5" aria-labelledby="translation-job-title">
    <div><h3 id="translation-job-title" className="flex items-center gap-2 font-bold text-white"><Sparkles className="w-4 h-4 text-cyan-400" />Server-sourced Translation Job</h3><p className="mt-1 text-xs text-slate-400">Source text, scope, keys, and versions are controlled by the authenticated server.</p></div>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-300">Target language<select value={language} disabled={busy && sourceMatchesScope} onChange={(event) => setLanguageSafely(event.target.value as Language)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white">{languageOptions.map(([value, label]) => <option key={value} value={value}>{label} ({value})</option>)}</select></label><label className="text-xs text-slate-300">Provider<select value={provider} disabled={busy} onChange={(event) => setProviderSafely(event.target.value as Provider)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white"><option value="azure">Azure free quota (default)</option><option value="openai_paid">OpenAI paid — manual consent</option></select></label></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs"><div className="rounded-lg bg-slate-900 p-3"><span className="text-slate-500">Server scope</span><strong className="block mt-1 text-white">Trainer {trainerId}</strong></div><div className="rounded-lg bg-slate-900 p-3"><span className="text-slate-500">Source</span><strong className="block mt-1 truncate text-white">{source ? `${source.sourceMappingId} · ${source.sourceVersion}` : 'loading'}</strong></div><div className="rounded-lg bg-slate-900 p-3"><span className="text-slate-500">Items / chars / batches</span><strong className="block mt-1 text-white">{preview ? `${preview.itemCount} / ${preview.characters} / ${preview.batchCount}` : `${source?.items.length ?? 0} / — / —`}</strong></div><div className="rounded-lg bg-slate-900 p-3"><span className="text-slate-500">Memory hit / miss</span><strong className="block mt-1 text-white">{job ? `${hits} / ${results.length - hits}` : 'after run'}</strong></div></div>
    {preview && <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">Quota: <strong>{preview.quota.status}</strong> · used {preview.quota.used} / {preview.quota.limit} · remaining {preview.quota.remaining} · existing pending {Array.isArray(preview.pending) ? preview.pending.length : preview.pending ? 1 : pendingCount}</div>}
    {provider === 'openai_paid' && <label className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs leading-5 text-amber-100"><input type="checkbox" checked={paidConsent} disabled={busy} onChange={(event) => setPaidConsent(event.target.checked)} className="mt-1" /><span><strong className="block">Explicit paid-provider confirmation</strong>I understand this job uses the paid OpenAI provider and may incur charges. No language or bulk job is selected automatically.</span></label>}
    {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-300">{error}</p>}
    <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={requestPreview} disabled={busy || !source?.items.length} className="rounded-lg border border-cyan-500/40 px-4 py-2 text-xs font-bold text-cyan-300 disabled:opacity-50">{phase === 'previewing' ? 'Previewing…' : 'Preview estimate'}</button><button type="button" onClick={runTranslation} disabled={busy || !preview || (provider === 'openai_paid' && !paidConsent)} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{phase === 'running' ? 'Running…' : 'Run translation'}</button><span className="text-xs text-slate-400">Status: <strong className={['error','conflict','quota_blocked','unavailable'].includes(displayedPhase) ? 'text-rose-400' : 'text-cyan-300'}>{displayedPhase}</strong></span>{busy && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}</div>
    {job && <div className="space-y-3"><div className="flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Pending review · job {job.id}</h4><span className="text-xs text-slate-500">{results.length} drafts{job.idempotent ? ' · reused' : ''}</span></div><div className="max-h-96 space-y-3 overflow-y-auto pr-1">{results.map((item) => <div key={item.key} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 md:grid-cols-2"><div className="text-xs whitespace-pre-wrap text-slate-400">{item.text}<span className="mt-2 block text-[10px] text-slate-600">Server key {item.key} · {item.memoryHit ? 'memory hit' : 'memory miss'}</span></div><textarea value={drafts[item.key] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [item.key]: event.target.value }))} rows={3} disabled={phase === 'approved'} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" aria-label={`Translation draft ${item.key}`} /></div>)}</div><button type="button" onClick={approveDrafts} disabled={busy || phase === 'approved'} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{phase === 'approved' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{phase === 'approving' ? 'Approving…' : phase === 'approved' ? 'Approved' : 'Approve reviewed drafts'}</button></div>}
  </section>;
}
