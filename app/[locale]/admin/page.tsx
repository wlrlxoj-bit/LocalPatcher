'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Lock, 
  LayoutDashboard, 
  Flame, 
  Languages, 
  BookOpen, 
  TrendingUp, 
  Plus, 
  Save, 
  Trash2, 
  Search, 
  Sparkles, 
  RefreshCw, 
  Check, 
  X,
  FileText,
  Gamepad2
} from 'lucide-react';

interface Game {
  id: number;
  title_en: string;
  title_ko: string;
  slug: string;
  cover_image_url: string;
  anti_cheat: string;
  download_count: number;
  is_popular: boolean;
  popularity_index: number;
}

interface Trainer {
  id: number;
  version_str: string;
  original_file_hash: string;
  original_file_size: number;
  option_count?: number;
}

interface Mapping {
  id: number;
  trainer_id: number;
  offset_dec: number;
  encoding: 'UTF-16LE' | 'ASCII' | 'UTF-8';
  original_text: string;
  translated_text: string;
  max_char_len: number;
}

interface DictItem {
  id: number;
  english_term: string;
  korean_translation: string;
}

interface MonthlyMetrics {
  status: 'available' | 'unavailable';
  reason?: string;
  monthlyActiveUsers: number | null;
  previousMonthActiveUsers: number | null;
  downloadStarts: number | null;
  pricePlacement: {
    status: 'collecting' | 'keep_bottom' | 'consider_raise';
    measurementStartDate: string;
    daysCollected: number;
    minDays: number;
    cumulativeViews: number;
    minViews: number;
    recentViews: number;
    recentClicks: number;
    affiliateClicks: number;
    allMerchantClicks: number;
    recentPatcherViews: number;
    previousPatcherViews: number;
    clickThroughRate: number | null;
    fileSelected: number;
    previousFileSelected: number;
    patchCompleted: number;
    previousPatchCompleted: number;
    selectionRate: number | null;
    previousSelectionRate: number | null;
    completionRate: number | null;
    previousCompletionRate: number | null;
    funnelComparisonAvailable: boolean;
    reason: string;
    nextReviewDate: string | null;
  } | null;
}

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'popular' | 'translations' | 'dictionary'>('stats');

  // Stats State
  const [stats, setStats] = useState({
    totalGames: 0,
    totalTrainers: 0,
    totalDownloads: 0,
  });
  const [topGames, setTopGames] = useState<Game[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [monthlyMetrics, setMonthlyMetrics] = useState<MonthlyMetrics>({
    status: 'unavailable',
    monthlyActiveUsers: null,
    previousMonthActiveUsers: null,
    downloadStarts: null,
    pricePlacement: null,
  });

  // Popular Games State
  const [games, setGames] = useState<Game[]>([]);
  const [popularSearch, setPopularSearch] = useState('');
  const [popularLoading, setPopularLoading] = useState(false);
  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  const [editPopularVal, setEditPopularVal] = useState(false);
  const [editIndexVal, setEditIndexVal] = useState(0);

  // Translation Editor State
  const [transGames, setTransGames] = useState<Game[]>([]);
  const [transSearch, setTransSearch] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mappingEdits, setMappingEdits] = useState<Record<number, string>>({});
  const [transLoading, setTransLoading] = useState(false);

  // Dictionary Editor State
  const [dictItems, setDictItems] = useState<DictItem[]>([]);
  const [dictSearch, setDictSearch] = useState('');
  const [dictLoading, setDictLoading] = useState(false);
  const [newEngTerm, setNewEngTerm] = useState('');
  const [newKorTrans, setNewKorTrans] = useState('');
  const [dictEdits, setDictEdits] = useState<Record<number, string>>({});

  // HttpOnly 세션 쿠키는 JavaScript에서 읽지 않고 보호된 API 응답으로만 확인합니다.
  useEffect(() => {
    fetch('/api/admin/metrics').then((response) => {
      if (response.ok) setIsAuthenticated(true);
    }).catch(() => undefined);
  }, []);

  // Fetch stats when authenticated or tab changes
  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'stats') {
        fetchStats();
        fetchMonthlyMetrics();
      } else if (activeTab === 'popular') {
        fetchGamesForPopular();
      } else if (activeTab === 'translations') {
        fetchGamesForTranslations();
      } else if (activeTab === 'dictionary') {
        fetchDictionary();
      }
    }
  }, [isAuthenticated, activeTab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
      } else {
        setLoginError('Invalid administrator password.');
      }
    } catch (err) {
      setLoginError('An error occurred during authentication.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/verify', { method: 'DELETE' }).catch(() => undefined);
    setIsAuthenticated(false);
    setPassword('');
  };

  const fetchMonthlyMetrics = async () => {
    try {
      const response = await fetch('/api/admin/metrics');
      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!response.ok) return;
      const data = await response.json() as MonthlyMetrics;
      setMonthlyMetrics(data);
    } catch (err) {
      console.error('월간 GA4 지표를 불러오지 못했습니다.', err);
    }
  };

  // Stats Logic
  const fetchStats = async () => {
    if (!supabase) return;
    setStatsLoading(true);
    try {
      // 1. Get total games count
      const { count: gameCount, error: gameCountErr } = await supabase
        .from('games')
        .select('*', { count: 'exact', head: true });
      
      // 2. Get total trainers count
      const { count: trainerCount, error: trainerCountErr } = await supabase
        .from('trainers')
        .select('*', { count: 'exact', head: true });

      // 3. Get total download count sum and games list
      const { data: allGames, error: gamesErr } = await supabase
        .from('games')
        .select('*');

      if (gamesErr) throw gamesErr;

      const totalDownloads = (allGames || []).reduce((sum, g) => sum + (g.download_count || 0), 0);
      const sortedGames = [...(allGames || [])]
        .sort((a, b) => (b.download_count || 0) - (a.download_count || 0));

      setStats({
        totalGames: gameCount || 0,
        totalTrainers: trainerCount || 0,
        totalDownloads,
      });

      setTopGames(sortedGames.slice(0, 15));
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Popular Games Logic
  const fetchGamesForPopular = async () => {
    if (!supabase) return;
    setPopularLoading(true);
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('id', { ascending: false });
      if (error) throw error;
      setGames(data || []);
    } catch (err) {
      console.error('Error fetching games for popularity view:', err);
    } finally {
      setPopularLoading(false);
    }
  };

  const savePopularStatus = async (gameId: number, isPopular: boolean, index: number) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('games')
        .update({
          is_popular: isPopular,
          popularity_index: index
        })
        .eq('id', gameId);
      
      if (error) throw error;
      
      // Refresh list
      await fetchGamesForPopular();
      setEditingGameId(null);
      alert('Game popularity settings saved successfully.');
    } catch (err) {
      console.error('Error saving popularity settings:', err);
      alert('Failed to save settings.');
    }
  };

  // Translation Editor Logic
  const fetchGamesForTranslations = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('title_en', { ascending: true });
      if (error) throw error;
      setTransGames(data || []);
    } catch (err) {
      console.error('Error fetching games for translations:', err);
    }
  };

  const handleGameSelect = async (gameId: number) => {
    if (!supabase) return;
    setSelectedGameId(gameId);
    setSelectedTrainerId(null);
    setMappings([]);
    setMappingEdits({});
    try {
      const { data, error } = await supabase
        .from('trainers')
        .select('*')
        .eq('game_id', gameId)
        .order('version_str', { ascending: false });
      if (error) throw error;
      setTrainers(data || []);
    } catch (err) {
      console.error('Error fetching trainers for game:', err);
    }
  };

  const handleTrainerSelect = async (trainerId: number) => {
    if (!supabase) return;
    setSelectedTrainerId(trainerId);
    setTransLoading(true);
    try {
      const { data, error } = await supabase
        .from('translation_mappings')
        .select('*')
        .eq('trainer_id', trainerId)
        .order('offset_dec', { ascending: true });
      if (error) throw error;
      setMappings(data || []);
      
      // Initialize edits state
      const initialEdits: Record<number, string> = {};
      (data || []).forEach(m => {
        initialEdits[m.id] = m.translated_text;
      });
      setMappingEdits(initialEdits);
    } catch (err) {
      console.error('Error fetching mappings:', err);
    } finally {
      setTransLoading(false);
    }
  };

  const saveMappingEdit = async (mappingId: number) => {
    if (!supabase) return;
    const newText = mappingEdits[mappingId];
    try {
      const { error } = await supabase
        .from('translation_mappings')
        .update({ translated_text: newText })
        .eq('id', mappingId);
      if (error) throw error;
      alert('Mapping saved successfully.');
    } catch (err) {
      console.error('Error updating mapping:', err);
      alert('Failed to update mapping.');
    }
  };

  // Dictionary Logic
  const fetchDictionary = async () => {
    if (!supabase) return;
    setDictLoading(true);
    try {
      const { data, error } = await supabase
        .from('common_dictionary')
        .select('*')
        .order('english_term', { ascending: true });
      if (error) throw error;
      setDictItems(data || []);

      const initialEdits: Record<number, string> = {};
      (data || []).forEach(item => {
        initialEdits[item.id] = item.korean_translation;
      });
      setDictEdits(initialEdits);
    } catch (err) {
      console.error('Error fetching dictionary:', err);
    } finally {
      setDictLoading(false);
    }
  };

  const handleAddDictItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newEngTerm.trim() || !newKorTrans.trim()) return;
    try {
      const { error } = await supabase
        .from('common_dictionary')
        .insert({
          english_term: newEngTerm.trim().toLowerCase(),
          korean_translation: newKorTrans.trim()
        });
      if (error) throw error;
      setNewEngTerm('');
      setNewKorTrans('');
      await fetchDictionary();
      alert('Dictionary term added.');
    } catch (err: any) {
      console.error('Error adding term:', err);
      alert(err.message || 'Failed to add term.');
    }
  };

  const handleUpdateDictItem = async (id: number) => {
    if (!supabase) return;
    const newText = dictEdits[id];
    try {
      const { error } = await supabase
        .from('common_dictionary')
        .update({ korean_translation: newText })
        .eq('id', id);
      if (error) throw error;
      alert('Term updated successfully.');
      await fetchDictionary();
    } catch (err) {
      console.error('Error updating term:', err);
      alert('Failed to update term.');
    }
  };

  const handleDeleteDictItem = async (id: number) => {
    if (!supabase) return;
    if (!confirm('Are you sure you want to delete this term?')) return;
    try {
      const { error } = await supabase
        .from('common_dictionary')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchDictionary();
    } catch (err) {
      console.error('Error deleting term:', err);
      alert('Failed to delete term.');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 relative">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[350px] h-[350px] bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none z-0"></div>
        <div className="w-full max-w-md p-8 rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur-md relative z-10 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 shadow-lg shadow-cyan-500/10">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white font-outfit">LocalPatcher Admin Portal</h1>
            <p className="text-xs text-slate-500 mt-2">Enter credentials to unlock control dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-sm text-white placeholder-slate-600 transition-all outline-none"
                required
              />
            </div>

            {loginError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-lg p-2.5 text-center font-medium">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/10 transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
            >
              {loginLoading ? 'Authenticating...' : 'Access Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 mb-8 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/25">Management</span>
            <span className="text-slate-600">/</span>
            <span className="text-[10px] font-semibold text-slate-400">Portal</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1 font-outfit">LocalPatcher Administrator Panel</h1>
        </div>

        <button 
          onClick={handleLogout}
          className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/50 transition-all self-start md:self-auto"
        >
          Sign Out
        </button>
      </div>

      {/* Tabs list */}
      <div className="flex flex-wrap border-b border-slate-800 mb-8 gap-2">
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'stats'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard Stats</span>
        </button>
        <button
          onClick={() => setActiveTab('popular')}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'popular'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Popular Games</span>
        </button>
        <button
          onClick={() => setActiveTab('translations')}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'translations'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Languages className="w-4 h-4" />
          <span>Translation Editor</span>
        </button>
        <button
          onClick={() => setActiveTab('dictionary')}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'dictionary'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Dictionary Editor</span>
        </button>
      </div>

      {/* Tab 1: Stats view */}
      {activeTab === 'stats' && (
        <div className="space-y-8 animate-fadeIn">
          {statsLoading ? (
            <div className="py-20 text-center text-slate-500 text-xs">Loading analytics data...</div>
          ) : (
            <>
              <section className="rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-cyan-300">월간 방문 성장 목표</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">1차 Humble 체크포인트 10,000명, 장기 성장 목표 100,000명. GA4 활성 사용자는 내부 참고 지표이며 파트너가 정의하는 UMV와 다를 수 있습니다.</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${monthlyMetrics.status === 'available' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                    {monthlyMetrics.status === 'available' ? 'GA4 연결됨' : 'GA4 연결 필요'}
                  </span>
                </div>
                {monthlyMetrics.status === 'available' && monthlyMetrics.monthlyActiveUsers !== null ? (() => {
                  const humbleProgress = Math.min(100, (monthlyMetrics.monthlyActiveUsers / 10000) * 100);
                  const growthProgress = Math.min(100, (monthlyMetrics.monthlyActiveUsers / 100000) * 100);
                  const change = monthlyMetrics.previousMonthActiveUsers && monthlyMetrics.previousMonthActiveUsers > 0
                    ? ((monthlyMetrics.monthlyActiveUsers - monthlyMetrics.previousMonthActiveUsers) / monthlyMetrics.previousMonthActiveUsers) * 100
                    : null;
                  return <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">최근 30일 활성 사용자</p><p className="mt-1 text-3xl font-extrabold text-white">{monthlyMetrics.monthlyActiveUsers.toLocaleString()}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">10k Humble 체크</p><p className="mt-1 text-3xl font-extrabold text-cyan-400">{humbleProgress.toFixed(1)}%</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">100k 성장 목표</p><p className="mt-1 text-3xl font-extrabold text-emerald-400">{growthProgress.toFixed(1)}%</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">이전 30일 대비 / 다운로드 시작</p><p className="mt-1 text-lg font-bold text-slate-200">{change === null ? '비교 데이터 없음' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`} <span className="text-xs font-normal text-slate-500">/ {monthlyMetrics.downloadStarts?.toLocaleString() ?? '—'}</span></p></div><div className="sm:col-span-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-400" style={{ width: `${humbleProgress}%` }} /></div><div className="sm:col-span-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" style={{ width: `${growthProgress}%` }} /></div></div>;
                })() : <p className="mt-5 text-xs leading-relaxed text-slate-400">{monthlyMetrics.reason || 'GA4 속성 ID와 서버 전용 서비스 계정 설정 후 월간 활성 사용자, 전월 대비, 다운로드 시작 수가 표시됩니다. 이 값은 내부 참고 지표이며 파트너가 정의하는 UMV와 다를 수 있습니다.'}</p>}
              </section>

              <section className="rounded-2xl border border-indigo-500/30 bg-indigo-950/10 p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-indigo-200">가격 비교 배치 판단</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">가격 비교를 언제 위로 올릴지 GA4 데이터로 판단합니다. 권고만 표시하며 위치는 자동으로 바뀌지 않습니다.</p>
                  </div>
                  {monthlyMetrics.pricePlacement && <span className={`w-fit rounded-full px-3 py-1 text-[10px] font-bold ${monthlyMetrics.pricePlacement.status === 'consider_raise' ? 'bg-emerald-500/15 text-emerald-300' : monthlyMetrics.pricePlacement.status === 'keep_bottom' ? 'bg-amber-500/15 text-amber-300' : 'bg-indigo-500/15 text-indigo-200'}`}>{monthlyMetrics.pricePlacement.status === 'consider_raise' ? '위치 상승 검토' : monthlyMetrics.pricePlacement.status === 'keep_bottom' ? '하단 유지' : '데이터 수집 중'}</span>}
                </div>
                {monthlyMetrics.pricePlacement ? (() => {
                  const metric = monthlyMetrics.pricePlacement;
                  const dayProgress = Math.min(100, (metric.daysCollected / metric.minDays) * 100);
                  const viewProgress = Math.min(100, (metric.cumulativeViews / metric.minViews) * 100);
                  return <div className="mt-5 space-y-5">
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">수집 기간</p><p className="mt-1 text-xl font-extrabold text-white">{metric.daysCollected}일 <span className="text-xs font-normal text-slate-500">/ {metric.minDays}일</span></p></div>
                      <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">누적 노출</p><p className="mt-1 text-xl font-extrabold text-white">{metric.cumulativeViews.toLocaleString()}회 <span className="text-xs font-normal text-slate-500">/ {metric.minViews}회</span></p></div>
                      <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">최근 28일 제휴 클릭률</p><p className="mt-1 text-xl font-extrabold text-cyan-300">{metric.clickThroughRate === null ? '데이터 없음' : `${metric.clickThroughRate.toFixed(1)}%`}</p><p className="mt-1 text-[10px] text-slate-500">가격 영역 노출 {metric.recentViews.toLocaleString()} / 제휴 클릭 {metric.affiliateClicks.toLocaleString()} · 전체 판매처 클릭 {metric.allMerchantClicks.toLocaleString()}</p></div>
                      <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">최근 28일 패처 퍼널</p><p className="mt-1 text-sm font-bold text-slate-200">패처 도달 {metric.recentPatcherViews.toLocaleString()} · 파일 선택 {metric.fileSelected.toLocaleString()} · 패치 완료 {metric.patchCompleted.toLocaleString()}</p><p className="mt-1 text-[10px] text-slate-500">선택률(파일 선택 ÷ 패처 도달) {metric.selectionRate === null ? '—' : `${metric.selectionRate.toFixed(1)}%`} · 완료율 {metric.completionRate === null ? '—' : `${metric.completionRate.toFixed(1)}%`}</p></div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>28일 수집</span><span>{dayProgress.toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-indigo-400" style={{ width: `${dayProgress}%` }} /></div></div>
                      <div><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>노출 500회</span><span>{viewProgress.toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${viewProgress}%` }} /></div></div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs leading-relaxed text-slate-300"><p className="font-bold text-white">현재 권고</p><p className="mt-1">{metric.reason}</p>{metric.status === 'collecting' && <p className="mt-2 text-slate-500">{metric.nextReviewDate ? `최초 날짜 검토: ${metric.nextReviewDate}` : '28일 조건 충족'} · 남은 노출 {Math.max(0, metric.minViews - metric.cumulativeViews).toLocaleString()}회</p>}{!metric.funnelComparisonAvailable && <p className="mt-2 text-amber-300/80">이전 기간과 퍼널 하락을 비교하려면 최소 56일의 이벤트 데이터와 충분한 이전 기간 모수가 필요합니다.</p>}</div>
                  </div>;
                })() : <p className="mt-5 text-xs leading-relaxed text-slate-400">가격 비교 측정 시작일이 설정되지 않았습니다. 배포 환경변수 <span className="font-mono text-slate-300">PRICE_COMPARE_MEASUREMENT_START_DATE</span>에 측정 배포일을 YYYY-MM-DD 형식으로 설정하면 집계를 시작합니다.</p>}
              </section>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20 flex flex-col justify-between">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Supported Games</div>
                  <div className="text-4xl font-extrabold text-white mt-4 font-outfit">{stats.totalGames}</div>
                </div>
                <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20 flex flex-col justify-between">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Trainers Scraped</div>
                  <div className="text-4xl font-extrabold text-indigo-400 mt-4 font-outfit">{stats.totalTrainers}</div>
                </div>
                <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20 flex flex-col justify-between">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Aggregate Downloads Tracked</div>
                  <div className="text-4xl font-extrabold text-cyan-400 mt-4 font-outfit">{stats.totalDownloads.toLocaleString()}</div>
                </div>
              </div>

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
                        <th className="py-3 px-4 w-32 text-right">Download Count</th>
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
            </>
          )}
        </div>
      )}

      {/* Tab 2: Popular Games view */}
      {activeTab === 'popular' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center">
              <Flame className="w-4 h-4 mr-2 text-rose-500" />
              Manage Popular Games Order
            </h3>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={popularSearch}
                onChange={(e) => setPopularSearch(e.target.value)}
                placeholder="Filter games by title..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-all"
              />
            </div>
          </div>

          {popularLoading ? (
            <div className="py-20 text-center text-slate-500 text-xs">Loading game database...</div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Game</th>
                      <th className="py-3 px-4 w-32 text-center">Is Popular</th>
                      <th className="py-3 px-4 w-32 text-center">Popularity Index</th>
                      <th className="py-3 px-4 w-36 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games
                      .filter(g => 
                        g.title_en.toLowerCase().includes(popularSearch.toLowerCase()) ||
                        g.title_ko.toLowerCase().includes(popularSearch.toLowerCase())
                      )
                      .map((game) => {
                        const isEditing = editingGameId === game.id;
                        return (
                          <tr key={game.id} className="border-b border-slate-900 hover:bg-slate-900/10 text-slate-300">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-white">{game.title_en}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">{game.title_ko}</div>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {isEditing ? (
                                <input
                                  type="checkbox"
                                  checked={editPopularVal}
                                  onChange={(e) => setEditPopularVal(e.target.checked)}
                                  className="rounded border-slate-800 bg-slate-900 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer"
                                />
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  game.is_popular 
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                    : 'bg-slate-900 text-slate-500 border border-slate-800'
                                }`}>
                                  {game.is_popular ? 'POPULAR' : 'NORMAL'}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editIndexVal}
                                  onChange={(e) => setEditIndexVal(parseInt(e.target.value) || 0)}
                                  className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-center text-white outline-none"
                                />
                              ) : (
                                <span className="font-mono text-slate-400 font-bold">{game.popularity_index || 0}</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {isEditing ? (
                                <div className="flex justify-center space-x-2">
                                  <button
                                    onClick={() => savePopularStatus(game.id, editPopularVal, editIndexVal)}
                                    className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all"
                                    title="Save changes"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingGameId(null)}
                                    className="p-1.5 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-all"
                                    title="Cancel"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingGameId(game.id);
                                    setEditPopularVal(game.is_popular);
                                    setEditIndexVal(game.popularity_index || 0);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-white rounded border border-slate-800 hover:border-slate-700 bg-slate-900/40 transition-all"
                                >
                                  Edit Configuration
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Translation Editor */}
      {activeTab === 'translations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
          {/* Game Selection sidebar */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select Game Target</h3>
            
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={transSearch}
                onChange={(e) => setTransSearch(e.target.value)}
                placeholder="Search games..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-all"
              />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2 max-h-[50vh] overflow-y-auto space-y-1">
              {transGames
                .filter(g => 
                  g.title_en.toLowerCase().includes(transSearch.toLowerCase()) ||
                  g.title_ko.toLowerCase().includes(transSearch.toLowerCase())
                )
                .map(game => (
                  <button
                    key={game.id}
                    onClick={() => handleGameSelect(game.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all flex items-center space-x-2 ${
                      selectedGameId === game.id
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold'
                        : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Gamepad2 className="w-3.5 h-3.5" />
                    <span className="truncate">{game.title_en}</span>
                  </button>
                ))}
            </div>

            {selectedGameId && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-4">Trainer Versions</h4>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2 space-y-1">
                  {trainers.length > 0 ? (
                    trainers.map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleTrainerSelect(t.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all ${
                          selectedTrainerId === t.id
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold'
                            : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300 border border-transparent'
                        }`}
                      >
                        {t.version_str}
                      </button>
                    ))
                  ) : (
                    <div className="py-4 text-center text-slate-600 text-[10px]">No trainer versions registered.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mappings Editor */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
              <span>Translation Mapping Rows</span>
              {selectedTrainerId && (
                <span className="text-[10px] text-slate-500 normal-case">Trainer ID: {selectedTrainerId}</span>
              )}
            </h3>

            {!selectedTrainerId ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/5 p-12 text-center text-slate-500 text-xs">
                Select a game and trainer version to load translation mappings.
              </div>
            ) : transLoading ? (
              <div className="py-20 text-center text-slate-500 text-xs">Loading mapping entries...</div>
            ) : mappings.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/5 p-12 text-center text-slate-500 text-xs">
                No translation mappings exist for this trainer version yet.
              </div>
            ) : (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                {mappings.map((m) => (
                  <div key={m.id} className="p-4 rounded-xl border border-slate-850 bg-slate-950/60 space-y-3">
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                      <span>Offset: {m.offset_dec} ({m.encoding})</span>
                      <span>Max Chars: {m.max_char_len}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Original Text (English)</div>
                        <div className="p-2.5 rounded bg-slate-900 border border-slate-800/50 text-xs text-slate-400 whitespace-pre-wrap font-mono select-all">
                          {m.original_text}
                        </div>
                      </div>

                      <div>
                        <div className="text-[9px] font-bold text-cyan-500/70 uppercase mb-1 flex items-center justify-between">
                          <span>Translated Text (Korean)</span>
                          <button
                            onClick={() => saveMappingEdit(m.id)}
                            className="text-[9px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center space-x-0.5"
                          >
                            <Save className="w-3 h-3" />
                            <span>Save Item</span>
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={mappingEdits[m.id] || ''}
                          onChange={(e) => setMappingEdits({
                            ...mappingEdits,
                            [m.id]: e.target.value
                          })}
                          className="w-full p-2.5 rounded bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:border-cyan-500 outline-none resize-y"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Dictionary Editor */}
      {activeTab === 'dictionary' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Create new term form */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Add Global Translation</h3>
              <form onSubmit={handleAddDictItem} className="p-5 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">English Source Term</label>
                  <input
                    type="text"
                    value={newEngTerm}
                    onChange={(e) => setNewEngTerm(e.target.value)}
                    placeholder="e.g. infinite health"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-cyan-500 transition-all placeholder-slate-700"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Korean Translation</label>
                  <input
                    type="text"
                    value={newKorTrans}
                    onChange={(e) => setNewKorTrans(e.target.value)}
                    placeholder="e.g. 무한 체력"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-cyan-500 transition-all placeholder-slate-700"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-xs font-bold text-slate-950 shadow-md transition-all active:scale-[0.98] flex items-center justify-center space-x-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Insert Term</span>
                </button>
              </form>
            </div>

            {/* List and search terms */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Common Dictionary Terms</h3>
                
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={dictSearch}
                    onChange={(e) => setDictSearch(e.target.value)}
                    placeholder="Search terms..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-all"
                  />
                </div>
              </div>

              {dictLoading ? (
                <div className="py-20 text-center text-slate-500 text-xs">Loading common dictionary...</div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 overflow-hidden">
                  <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-2">
                    {dictItems
                      .filter(item => 
                        item.english_term.toLowerCase().includes(dictSearch.toLowerCase()) ||
                        item.korean_translation.toLowerCase().includes(dictSearch.toLowerCase())
                      )
                      .map((item) => (
                        <div key={item.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="font-mono text-slate-300 font-semibold">{item.english_term}</div>
                          
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={dictEdits[item.id] || ''}
                              onChange={(e) => setDictEdits({
                                ...dictEdits,
                                [item.id]: e.target.value
                              })}
                              className="px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white focus:border-cyan-500 outline-none w-44"
                            />
                            
                            <button
                              onClick={() => handleUpdateDictItem(item.id)}
                              className="p-2 rounded bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/10 transition-all"
                              title="Update translation"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDeleteDictItem(item.id)}
                              className="p-2 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/10 transition-all"
                              title="Delete term"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
