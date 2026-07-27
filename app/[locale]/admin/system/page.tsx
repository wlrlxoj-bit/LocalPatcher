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
    
    // Placeholder for actual API calls that run python scripts or Next.js background workers
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    addLog(`Task completed successfully: ${taskId}`);
    setRunning(null);
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
          
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center">
                  <Database className="w-4 h-4 mr-2 text-cyan-400" />
                  Sync Popular Trainers
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Runs the crawler to fetch the latest trainer versions from FLiNG.
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

          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center">
                  <HardDrive className="w-4 h-4 mr-2 text-indigo-400" />
                  Backfill SEO Metadata
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Fetches Steam APIs to populate missing game covers and descriptions.
                </p>
              </div>
              <button 
                disabled={running !== null}
                onClick={() => handleRunTask('backfill-seo')}
                className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50"
              >
                {running === 'backfill-seo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-rose-500/20 bg-rose-950/10 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center">
                  <ShieldAlert className="w-4 h-4 mr-2 text-rose-400" />
                  Purge Cache
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Clears all Next.js App Router Data Cache across the site.
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
