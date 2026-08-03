'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { TrendingUp, AlertTriangle, PlayCircle, Loader2, Users } from 'lucide-react';
import Link from 'next/link';
import AiReportButton from '@/components/AiReportButton';

interface Game {
  id: number;
  title_en: string;
  title_ko: string;
  slug: string;
  download_count: number;
}

interface PendingTranslation {
  gameTitle: string;
  gameSlug: string;
  trainerVersion: string;
  pendingCount: number;
}

export default function AdminDashboardHome() {
  const [stats, setStats] = useState({
    totalGames: 0,
    totalTrainers: 0,
    totalDownloads: 0,
  });
  const [topGames, setTopGames] = useState<Game[]>([]);
  const [monthlyMetrics, setMonthlyMetrics] = useState<any>(null);
  const [pendingTranslations, setPendingTranslations] = useState<PendingTranslation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      // 1. Fetch metrics from API
      try {
        const response = await fetch('/api/admin/metrics');
        if (response.ok) {
          const data = await response.json();
          setMonthlyMetrics(data);
        }
      } catch (err) {
        console.error('Error fetching metrics', err);
      }

      if (supabase) {
        // 2. Fetch basic stats
        const { count: gameCount } = await supabase.from('games').select('*', { count: 'exact', head: true });
        const { count: trainerCount } = await supabase.from('trainers').select('*', { count: 'exact', head: true });
        
        const { data: allGames } = await supabase.from('games').select('id, title_en, title_ko, slug, download_count');
        const totalDownloads = (allGames || []).reduce((sum, g) => sum + (g.download_count || 0), 0);
        const sortedGames = [...(allGames || [])].sort((a, b) => (b.download_count || 0) - (a.download_count || 0));

        setStats({
          totalGames: gameCount || 0,
          totalTrainers: trainerCount || 0,
          totalDownloads,
        });
        setTopGames(sortedGames.slice(0, 15));
      }

      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Prepare Funnel Data for Recharts
  const funnelData = [];
  if (monthlyMetrics?.patchFunnel) {
    const funnel = monthlyMetrics.patchFunnel;
    funnelData.push(
      { name: 'FLiNG Click', count: funnel.flingClicks },
      { name: 'File Selected', count: funnel.fileSelected },
      { name: 'Patch Completed', count: funnel.patchCompleted },
      { name: 'Download Start', count: funnel.downloadStarts },
      { name: 'Ad Opened', count: funnel.adGateOpened }
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
        {!loading && <AiReportButton stats={stats} metrics={monthlyMetrics} topGames={topGames} />}
      </div>

      {/* Top Action Items / To-Do */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-950/10">
          <h3 className="text-sm font-bold text-amber-400 flex items-center mb-4">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Action Required
          </h3>
          <p className="text-xs text-slate-400 mb-4">You have pending translations that need approval or review.</p>
          <Link href="admin/translations" className="inline-flex px-4 py-2 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded-lg text-xs font-bold transition-all">
            Review Translations
          </Link>
        </div>

        <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-950/10">
          <h3 className="text-sm font-bold text-emerald-400 flex items-center mb-4">
            <PlayCircle className="w-4 h-4 mr-2" />
            System Status
          </h3>
          <p className="text-xs text-slate-400 mb-4">All systems operational. Next scheduled crawl is in 4 hours.</p>
          <Link href="admin/system" className="inline-flex px-4 py-2 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded-lg text-xs font-bold transition-all">
            Manage Tasks
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Supported Games</div>
          <div className="text-4xl font-extrabold text-white mt-4 font-outfit">{stats.totalGames}</div>
        </div>
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Trainers Scraped</div>
          <div className="text-4xl font-extrabold text-indigo-400 mt-4 font-outfit">{stats.totalTrainers}</div>
        </div>
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Aggregate Downloads</div>
          <div className="text-4xl font-extrabold text-cyan-400 mt-4 font-outfit">{stats.totalDownloads.toLocaleString()}</div>
        </div>
      </div>

      {/* Visitor KPI Cards (GA4) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-950/10">
          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center"><Users className="w-3 h-3 mr-1" /> Daily Visitors</div>
          <div className="text-3xl font-extrabold text-white mt-4 font-outfit">{monthlyMetrics?.dailyActiveUsers?.toLocaleString() || 0}</div>
        </div>
        <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-950/10">
          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center"><Users className="w-3 h-3 mr-1" /> Weekly Visitors</div>
          <div className="text-3xl font-extrabold text-white mt-4 font-outfit">{monthlyMetrics?.weeklyActiveUsers?.toLocaleString() || 0}</div>
        </div>
        <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-950/10">
          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center"><Users className="w-3 h-3 mr-1" /> Monthly Visitors</div>
          <div className="text-3xl font-extrabold text-white mt-4 font-outfit">{monthlyMetrics?.monthlyActiveUsers?.toLocaleString() || 0}</div>
        </div>
        <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-950/10">
          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center"><Users className="w-3 h-3 mr-1" /> All-Time Visitors</div>
          <div className="text-3xl font-extrabold text-white mt-4 font-outfit">{monthlyMetrics?.totalActiveUsers?.toLocaleString() || 0}</div>
        </div>
      </div>

      {/* Charts Section */}
      {funnelData.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-1">
            Patch Funnel Conversion
          </h3>
          <p className="text-[10px] text-slate-500 mb-6 font-medium">
            ※ 최근 30일 누적 데이터 기준이므로 이전에 제거된 광고 내역(Ad Opened)도 포함될 수 있습니다.
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: '#0f172a'}} 
                  contentStyle={{backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px'}}
                  itemStyle={{color: '#22d3ee', fontWeight: 'bold'}}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === funnelData.length - 1 ? '#10b981' : '#06b6d4'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Downloaded Games Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-6 flex items-center">
          <TrendingUp className="w-4 h-4 mr-2 text-cyan-400" />
          Top 15 Downloaded Games
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">Rank</th>
                <th className="py-3 px-4">Game Title</th>
                <th className="py-3 px-4 w-40">Slug</th>
                <th className="py-3 px-4 w-32 text-right">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {topGames.map((game, idx) => (
                <tr key={game.id} className="border-b border-slate-900 hover:bg-slate-900/10 text-slate-300">
                  <td className="py-3.5 px-4 text-center font-semibold text-slate-500">{idx + 1}</td>
                  <td className="py-3.5 px-4 font-medium text-white">
                    <div>{game.title_en}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{game.title_ko}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-500">{game.slug}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-cyan-400 font-outfit">
                    {(game.download_count || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Pages Table (GA4) */}
      {monthlyMetrics?.topPages && monthlyMetrics.topPages.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-6 flex items-center">
            <TrendingUp className="w-4 h-4 mr-2 text-indigo-400" />
            Top 10 Most Visited Pages (Last 29 Days)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">Rank</th>
                  <th className="py-3 px-4">Page Path</th>
                  <th className="py-3 px-4 w-32 text-right">Views</th>
                </tr>
              </thead>
              <tbody>
                {monthlyMetrics.topPages.slice(0, 10).map((page: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-900 hover:bg-slate-900/10 text-slate-300">
                    <td className="py-3.5 px-4 text-center font-semibold text-slate-500">{idx + 1}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">{page.path}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-indigo-400 font-outfit">
                      {page.views.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
