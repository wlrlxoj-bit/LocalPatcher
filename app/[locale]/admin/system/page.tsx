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
};

function StatusIndicator({ status }: { status: WorkflowStatus | null }) {
  if (!status) return null;
  if (status.tracking === 'awaiting_dispatch_run') {
    return <div className="mt-3 flex items-center space-x-1.5 text-xs text-amber-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>GitHub 실행 대기 중</span></div>;
  }
  const run = status.run;
  if (!run || run.operationalState === 'unknown') return null;
  const inProgress = run.operationalState === 'running' || run.operationalState === 'queued';
  const success = run.operationalState === 'succeeded';
  const latestSuccessAt = status.latestSuccess?.updatedAt || status.latestSuccess?.createdAt;

  return (
    <>
      <div className="mt-3 flex items-center space-x-3 text-xs bg-black/40 px-3 py-2 rounded-lg border border-slate-800/50 w-fit">
        <div className="flex items-center space-x-1.5">
          {inProgress ? (
            <><Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" /><span className="text-amber-400 font-medium">{run.operationalState === 'queued' ? '대기 중 (Queued)' : '작업 중 (Running)'}</span></>
          ) : success ? (
            <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400 font-medium">완료 (Success)</span></>
          ) : (
            <><XCircle className="w-3.5 h-3.5 text-rose-400" /><span className="text-rose-400 font-medium">실패 (Failed)</span></>
          )}
          {run.retrying && <span className="text-amber-300 border-l border-slate-700 pl-3">재시도 #{run.attempt}</span>}
        </div>
        {run.url && (
          <a href={run.url} target="_blank" rel="noopener noreferrer" className="flex items-center text-cyan-400 hover:text-cyan-300 transition-colors border-l border-slate-700 pl-3">
            <ExternalLink className="w-3 h-3 mr-1" />
            <span>상세 터미널 로그 보기</span>
          </a>
        )}
      </div>
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
        <span className={hasBlocked ? 'text-rose-300' : 'text-emerald-300'}>{hasBlocked ? '확인 필요' : '정상'}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-slate-400">
        <span>즉시 처리 {status.ready}</span>
        <span>재시도 대기 {status.deferred}</span>
        <span className={hasBlocked ? 'text-rose-300 font-medium' : ''}>차단됨 {status.blocked}</span>
      </div>
      {status.latestFailureCode && <p className="mt-2 text-slate-500">최근 처리 사유: {status.latestFailureCode}</p>}
    </div>
  );
}

export default function AdminSystemPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    'System initialization complete.',
    'Ready for manual tasks.'
  ]);

  const [scraperStatus, setScraperStatus] = useState<WorkflowStatus | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<WorkflowStatus | null>(null);
  const [retryQueueStatus, setRetryQueueStatus] = useState<RetryQueueStatus | null>(null);
  const [dispatchRequestedAt, setDispatchRequestedAt] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const workflowStatusUrl = (workflowId: string) => {
          const params = new URLSearchParams({ workflowId });
          const requestedAt = dispatchRequestedAt[workflowId];
          if (requestedAt) params.set('dispatchRequestedAt', requestedAt);
          return `/api/admin/system/workflow-status?${params.toString()}`;
        };
        const [scraperRes, maintRes, retryRes] = await Promise.all([
          fetch(workflowStatusUrl('scraper.yml'), { cache: 'no-store' }),
          fetch(workflowStatusUrl('maintenance.yml'), { cache: 'no-store' }),
          fetch('/api/admin/system/translation-retry-status', { cache: 'no-store' }),
        ]);
        if (scraperRes.ok) setScraperStatus(await scraperRes.json());
        if (maintRes.ok) setMaintenanceStatus(await maintRes.json());
        if (retryRes.ok) setRetryQueueStatus(await retryRes.json());
      } catch (err) {
        console.error('Failed to fetch workflow status', err);
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [dispatchRequestedAt]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleRunTask = async (taskId: string) => {
    setRunning(taskId);
    addLog(`Started task: ${taskId}`);
    
    try {
      if (taskId === 'purge-cache') {
        const res = await fetch('/api/admin/system/purge', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to purge cache');
        addLog(`[Success] Next.js Data Cache Purged!`);
      } else if (taskId === 'sync-popular') {
        const res = await fetch('/api/admin/system/trigger-workflow', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: 'scraper.yml' }) 
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to trigger workflow');
        setDispatchRequestedAt((previous) => ({ ...previous, [data.workflowId]: data.dispatchRequestedAt }));
        addLog(`[Success] GitHub Action (scraper.yml) dispatched. 실행 ID 확인 중...`);
      } else if (taskId === 'gh-cover-maintenance') {
        const res = await fetch('/api/admin/system/trigger-workflow', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: 'maintenance.yml' }) 
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to trigger workflow');
        setDispatchRequestedAt((previous) => ({ ...previous, [data.workflowId]: data.dispatchRequestedAt }));
        addLog(`[Success] GitHub Action (maintenance.yml) dispatched. 실행 ID 확인 중...`);
      }
    } catch (err: unknown) {
      addLog(`[Error] ${err instanceof Error ? err.message : '작업 요청에 실패했습니다.'}`);
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
              </div>
              <button 
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
              </div>
              <button 
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
                disabled={running !== null}
                onClick={() => handleRunTask('purge-cache')}
                className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
              >
                {running === 'purge-cache' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <RetryQueueIndicator status={retryQueueStatus} />

        </div>

        {/* Task Terminal / Logs */}
        <div className="rounded-2xl border border-slate-800 bg-black p-4 flex flex-col h-[400px]">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">
            Execution Logs
          </h4>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] text-emerald-400 space-y-1">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
            {running && (
              <div className="text-cyan-400 animate-pulse">Running task &apos;{running}&apos;...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
