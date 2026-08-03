'use client';

import React, { useState } from 'react';
import { Settings, Play, Database, HardDrive, ShieldAlert, Loader2 } from 'lucide-react';

export default function AdminSystemPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    'System initialization complete.',
    'Ready for manual tasks.'
  ]);

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
        addLog(`[Success] GitHub Action (scraper.yml) dispatched.`);
      } else if (taskId === 'gh-cover-maintenance') {
        const res = await fetch('/api/admin/system/trigger-workflow', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: 'maintenance.yml' }) 
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to trigger workflow');
        addLog(`[Success] GitHub Action (maintenance.yml) dispatched.`);
      }
    } catch (err: any) {
      addLog(`[Error] ${err.message}`);
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
              <div className="text-cyan-400 animate-pulse">Running task '{running}'...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
