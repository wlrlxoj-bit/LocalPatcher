'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Play, Database, ShieldAlert, Loader2, ExternalLink, CheckCircle, XCircle } from 'lucide-react';

type WorkflowRun = {
  runId: number | null;
  status: string;
  conclusion: string | null;
  operationalState: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped' | 'unknown';
  attempt: number;
  retrying: boolean;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type WorkflowStatus = {
  tracking: 'matched_dispatch' | 'awaiting_dispatch_run' | 'latest_run';
  run: WorkflowRun | null;
  latestSuccess: WorkflowRun | null;
};

type RetryQueueStatus = {
  ready: number;
  deferred: number;
  blocked: number;
  latestUpdatedAt: string | null;
  latestFailureCode: string | null;
  due?: number;
  scheduled?: number;
  processing?: number;
  checkedAt?: string;
};

type IntegrityQueueStatus = RetryQueueStatus & { completed: number };

type StatusKey = 'scraper' | 'maintenance' | 'retry' | 'integrity';

/** 조회 실패와 미조회 상태를 정상·빈 대기열로 오인하지 않도록 표시한다. */
function StatusNotice({ error, loading, empty }: { error?: string; loading: boolean; empty: boolean }) {
  if (error) return <p role="alert" className="mt-3 text-xs text-rose-300 break-words">{error} 기존 표시값은 숨겼습니다. 자동으로 다시 조회합니다.</p>;
  if (loading) return <p role="status" className="mt-3 text-xs text-slate-400">상태 조회 중…</p>;
  if (empty) return <p className="mt-3 text-xs text-slate-400">표시할 실행 기록이 없습니다.</p>;
  return null;
}

function StatusIndicator({ status }: { status: WorkflowStatus | null }) {
  if (!status) return null;
  if (status.tracking === 'awaiting_dispatch_run') {
    return <div className="mt-3 flex items-center space-x-1.5 text-xs text-amber-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>GitHub 실행 대기 중</span></div>;
  }
  const run = status.run;
  if (!run) return <p className="mt-3 text-xs text-slate-400">실행 기록 없음</p>;
  const inProgress = run.operationalState === 'running' || run.operationalState === 'queued';
  const success = run.operationalState === 'succeeded';
  const latestSuccessAt = status.latestSuccess?.updatedAt || status.latestSuccess?.createdAt;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-3 text-xs bg-black/40 px-3 py-2 rounded-lg border border-slate-800/50 w-fit">
        <div className="flex flex-wrap items-center gap-1.5">
          {inProgress ? (
            <><Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" /><span className="text-amber-400 font-medium">{run.operationalState === 'queued' ? '대기 중 (Queued)' : '작업 중 (Running)'}</span></>
          ) : success ? (
            <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400 font-medium">실행 종료 (GitHub 성공)</span></>
          ) : (
            <><XCircle className="w-3.5 h-3.5 text-rose-400" /><span className="text-rose-400 font-medium">{run.operationalState === 'cancelled' ? '실행 취소됨' : run.operationalState === 'skipped' ? '실행 건너뜀' : run.operationalState === 'unknown' ? '실행 상태 확인 불가' : '실행 실패'}</span></>
          )}
          {run.retrying && <span className="text-amber-300 border-l border-slate-700 pl-3">재시도 #{run.attempt}</span>}
        </div>
        {run.url && (
          <a href={run.url} target="_blank" rel="noopener noreferrer" className="flex items-center text-cyan-400 hover:text-cyan-300 transition-colors border-l border-slate-700 pl-3">
            <ExternalLink className="w-3 h-3 mr-1" />
            <span>GitHub 실제 실행 로그 보기</span>
          </a>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">이 표시는 작업 프로세스 결과입니다. 번역 승인·페이지 공개 완료를 뜻하지 않습니다.</p>
      {(run.updatedAt || run.createdAt) && <p className="mt-1 text-[11px] text-slate-500">실행 갱신: {new Date((run.updatedAt || run.createdAt)!).toLocaleString()}</p>}
      {status.latestSuccess && status.latestSuccess.runId !== run.runId && latestSuccessAt && (
        <p className="mt-2 text-[11px] text-slate-500">최근 성공: {new Date(latestSuccessAt).toLocaleString()}</p>
      )}
    </>
  );
}

function RetryQueueIndicator({ status }: { status: RetryQueueStatus | null }) {
  if (!status) return null;
  const hasBlocked = status.blocked > 0;
  return (
    <div className={`rounded-xl border p-3 text-xs ${hasBlocked ? 'border-rose-500/30 bg-rose-950/20' : 'border-slate-800 bg-black/30'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-slate-200">자동 번역 재처리 대기열</span>
        <span className={hasBlocked ? 'text-rose-300' : 'text-slate-400'}>{hasBlocked ? '확인 필요' : '차단 항목 없음'}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-slate-400">
        <span>기한 도래 {status.due ?? '확인 불가'}</span>
        <span>예약·작업 보호 대기 {status.scheduled ?? '확인 불가'}</span>
        <span className={hasBlocked ? 'text-rose-300 font-medium' : ''}>차단됨 {status.blocked}</span>
      </div>
      <p className="mt-2 text-slate-500">언어별 작업 건수입니다. 기한 도래는 실행 중이라는 뜻이 아닙니다.</p>
      {(status.ready + status.deferred + status.blocked) === 0 && <p className="mt-2 text-slate-400">등록된 재처리 작업이 없습니다.</p>}
      {status.latestFailureCode && <p className="mt-2 text-slate-400 break-all">최근 처리 사유: {status.latestFailureCode}</p>}
      {status.checkedAt && <p className="mt-1 text-slate-500">집계 시각: {new Date(status.checkedAt).toLocaleString()}</p>}
    </div>
  );
}

function IntegrityQueueIndicator({ status }: { status: IntegrityQueueStatus | null }) {
  if (!status) return null;
  const blocked = status.blocked > 0;
  return <div className={`rounded-xl border p-3 text-xs ${blocked ? 'border-rose-500/30 bg-rose-950/20' : 'border-slate-800 bg-black/30'}`}>
    <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-200">승인 번역 무결성 복구</span><span className={blocked ? 'text-rose-300' : 'text-slate-400'}>{blocked ? '안전 차단 항목 있음' : '대기열 집계'}</span></div>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-slate-400"><span>기한 도래 {status.due ?? '확인 불가'}</span><span>예약 {status.scheduled ?? '확인 불가'}</span><span>처리 임대 중 {status.processing ?? '확인 불가'}</span><span>완료 {status.completed}</span><span className={blocked ? 'text-rose-300 font-medium' : ''}>안전 차단 {status.blocked}</span></div>
    <p className="mt-2 text-slate-500">게임별 복구 건수입니다. 원본 불일치는 강제 승인하지 않습니다. 처리 임대 중 건수는 작업자의 보호 기간이며 실제 진행을 보장하지 않습니다.</p>
    {(status.ready + status.deferred + status.blocked + status.completed) === 0 && <p className="mt-2 text-slate-400">등록된 복구 작업이 없습니다.</p>}
    {status.latestFailureCode && <p className="mt-2 text-slate-400 break-all">최근 보호 사유: {status.latestFailureCode}</p>}
    {status.checkedAt && <p className="mt-1 text-slate-500">집계 시각: {new Date(status.checkedAt).toLocaleString()}</p>}
  </div>;
}

export default function AdminSystemPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const [scraperStatus, setScraperStatus] = useState<WorkflowStatus | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<WorkflowStatus | null>(null);
  const [retryQueueStatus, setRetryQueueStatus] = useState<RetryQueueStatus | null>(null);
  const [integrityQueueStatus, setIntegrityQueueStatus] = useState<IntegrityQueueStatus | null>(null);
  const [dispatchRequestedAt, setDispatchRequestedAt] = useState<Record<string, string>>({});
  const [statusErrors, setStatusErrors] = useState<Partial<Record<StatusKey, string>>>({});
  const [statusLoading, setStatusLoading] = useState<Record<StatusKey, boolean>>({ scraper: true, maintenance: true, retry: true, integrity: true });

  useEffect(() => {
    let active = true;
    let fetching = false;
    const fetchStatus = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const workflowStatusUrl = (workflowId: string) => {
          const params = new URLSearchParams({ workflowId });
          const requestedAt = dispatchRequestedAt[workflowId];
          if (requestedAt) params.set('dispatchRequestedAt', requestedAt);
          return `/api/admin/system/workflow-status?${params.toString()}`;
        };
        // 각각 처리하여 한 API의 실패가 다른 카드의 최신 상태를 가리지 않게 한다.
        const fetchOne = async <T,>(key: StatusKey, url: string, setter: (value: T | null) => void) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15_000);
          try {
            const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error(`상태 조회 실패 (HTTP ${response.status}).`);
            const value = await response.json();
            if (!active) return;
            setter(value);
            setStatusErrors(previous => ({ ...previous, [key]: undefined }));
          } catch (error) {
            if (!active) return;
            setter(null);
            const label = { scraper: '트레이너 수집', maintenance: '게임 커버 보완', retry: '자동 번역 재처리', integrity: '승인 번역 무결성 복구' }[key];
            const message = error instanceof Error && error.name === 'AbortError'
              ? '상태 조회 시간 초과(15초).'
              : error instanceof Error ? error.message : '상태 조회 실패: 연결을 확인해 주세요.';
            setStatusErrors(previous => ({ ...previous, [key]: `${label}: ${message}` }));
          } finally {
            clearTimeout(timeout);
            if (active) setStatusLoading(previous => ({ ...previous, [key]: false }));
          }
        };
        await Promise.all([
          fetchOne('scraper', workflowStatusUrl('scraper.yml'), setScraperStatus),
          fetchOne('maintenance', workflowStatusUrl('maintenance.yml'), setMaintenanceStatus),
          fetchOne('retry', '/api/admin/system/translation-retry-status', setRetryQueueStatus),
          fetchOne('integrity', '/api/admin/system/translation-integrity-status', setIntegrityQueueStatus),
        ]);
      } finally {
        fetching = false;
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [dispatchRequestedAt]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleRunTask = async (taskId: string) => {
    setRunning(taskId);
    addLog(`작업 요청 시작: ${taskId}`);
    
    try {
      if (taskId === 'purge-cache') {
        const res = await fetch('/api/admin/system/purge', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to purge cache');
        addLog('캐시 초기화 요청이 완료됐습니다. 번역 재처리와는 별개입니다.');
      } else if (taskId === 'sync-popular') {
        const res = await fetch('/api/admin/system/trigger-workflow', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: 'scraper.yml' }) 
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to trigger workflow');
        setDispatchRequestedAt((previous) => ({ ...previous, [data.workflowId]: data.dispatchRequestedAt }));
        addLog('scraper.yml 실행 요청이 접수됐습니다. 번역 완료가 아니며 실행 ID를 확인 중입니다.');
      } else if (taskId === 'gh-cover-maintenance') {
        const res = await fetch('/api/admin/system/trigger-workflow', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: 'maintenance.yml' }) 
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to trigger workflow');
        setDispatchRequestedAt((previous) => ({ ...previous, [data.workflowId]: data.dispatchRequestedAt }));
        addLog('maintenance.yml 실행 요청이 접수됐습니다. 실행 ID를 확인 중입니다.');
      }
    } catch (err: unknown) {
      addLog(`[요청 실패] ${err instanceof Error ? err.message : '작업 요청에 실패했습니다.'}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <h3 className="text-xl font-bold text-white flex items-center">
          <Settings className="w-5 h-5 mr-3 text-slate-400" />
          System Control & Automated Tasks
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          
          {/* 1. Sync Popular Trainers (scraper.yml) */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center">
                  <Database className="w-4 h-4 mr-2 text-cyan-400" />
                  Sync Popular Trainers
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Runs the crawler to fetch the latest trainer versions from FLiNG.<br/>
                  <span className="text-slate-500">FLiNG 사이트에서 최신 트레이너 버전을 수집합니다. (GitHub Action)</span>
                </p>
                <StatusIndicator status={scraperStatus} />
                <StatusNotice error={statusErrors.scraper} loading={statusLoading.scraper} empty={false} />
              </div>
              <button 
                aria-label="트레이너 수집 작업 실행"
                disabled={running !== null}
                onClick={() => handleRunTask('sync-popular')}
                className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {running === 'sync-popular' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 2. Game Cover Image Maintenance (maintenance.yml) */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center">
                  <Settings className="w-4 h-4 mr-2 text-amber-400" />
                  Game Cover Image Maintenance
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Regularly backfills missing game cover images and metadata via Steam API.<br/>
                  <span className="text-slate-500">Steam API를 통해 누락된 게임 커버 이미지와 메타데이터를 정기적으로 보완합니다. (GitHub Action)</span>
                </p>
                <StatusIndicator status={maintenanceStatus} />
                <StatusNotice error={statusErrors.maintenance} loading={statusLoading.maintenance} empty={false} />
              </div>
              <button 
                aria-label="게임 커버 보완 작업 실행"
                disabled={running !== null}
                onClick={() => handleRunTask('gh-cover-maintenance')}
                className="p-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
              >
                {running === 'gh-cover-maintenance' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 3. Purge Cache */}
          <div className="p-5 rounded-2xl border border-rose-500/20 bg-rose-950/10 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center">
                  <ShieldAlert className="w-4 h-4 mr-2 text-rose-400" />
                  Purge Cache
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Clears all Next.js App Router Data Cache across the site.<br/>
                  <span className="text-slate-500">사이트 전체의 Next.js 데이터 캐시를 강제로 초기화합니다.</span>
                </p>
              </div>
              <button 
                aria-label="사이트 데이터 캐시 초기화"
                disabled={running !== null}
                onClick={() => handleRunTask('purge-cache')}
                className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
              >
                {running === 'purge-cache' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <RetryQueueIndicator status={retryQueueStatus} />
          <StatusNotice error={statusErrors.retry} loading={statusLoading.retry} empty={false} />
          <IntegrityQueueIndicator status={integrityQueueStatus} />
          <StatusNotice error={statusErrors.integrity} loading={statusLoading.integrity} empty={false} />

        </div>

        {/* Task Terminal / Logs */}
        <div className="rounded-2xl border border-slate-800 bg-black p-4 flex flex-col h-[400px]">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">
            현재 탭의 수동 요청 기록
          </h4>
          <p className="mb-3 text-xs text-slate-400">서버 실행 로그가 아닙니다. 새로고침하면 사라집니다. 실제 처리 결과는 왼쪽의 GitHub 실행 로그에서 확인하세요.</p>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] text-emerald-400 space-y-1">
            {logs.length === 0 && <p className="text-slate-500">이 탭에서 요청한 작업이 없습니다.</p>}
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
            {running && (
              <div role="status" className="text-cyan-400 animate-pulse">작업 요청 전송 중: {running}…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
