'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Flame, Search, Save, Loader2 } from 'lucide-react';

interface Game {
  id: number;
  title_en: string;
  title_ko: string;
  slug: string;
  is_popular: boolean;
  popularity_index: number;
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [popularSearch, setPopularSearch] = useState('');
  const [popularLoading, setPopularLoading] = useState(false);
  
  // Edit State
  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  const [editPopularVal, setEditPopularVal] = useState(false);
  const [editIndexVal, setEditIndexVal] = useState(0);

  useEffect(() => {
    fetchGamesForPopular();
  }, []);

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
      console.error('Error fetching games:', err);
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
      
      await fetchGamesForPopular();
      setEditingGameId(null);
    } catch (err) {
      console.error('Error saving popularity settings:', err);
      alert('Failed to save settings.');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h3 className="text-xl font-bold text-white flex items-center">
          <Flame className="w-5 h-5 mr-3 text-rose-500" />
          Manage Popular Games
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
        <div className="flex justify-center items-center h-64 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden p-1">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider bg-slate-900/40">
                  <th className="py-4 px-6 rounded-tl-xl">Game</th>
                  <th className="py-4 px-6 w-32 text-center">Is Popular</th>
                  <th className="py-4 px-6 w-40 text-center">Popularity Index</th>
                  <th className="py-4 px-6 w-36 text-center rounded-tr-xl">Action</th>
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
                      <tr key={game.id} className="border-b border-slate-900/50 hover:bg-slate-900/20 text-slate-300 transition-colors">
                        <td className="py-4 px-6">
                          <div className="font-bold text-white text-sm">{game.title_en}</div>
                          <div className="text-xs text-slate-500 mt-1">{game.title_ko}</div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          {isEditing ? (
                            <input
                              type="checkbox"
                              checked={editPopularVal}
                              onChange={(e) => setEditPopularVal(e.target.checked)}
                              className="rounded border-slate-800 bg-slate-900 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer"
                            />
                          ) : (
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-widest ${
                              game.is_popular 
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' 
                                : 'bg-slate-900 text-slate-500 border border-slate-800'
                            }`}>
                              {game.is_popular ? 'POPULAR' : 'NORMAL'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editIndexVal}
                              onChange={(e) => setEditIndexVal(parseInt(e.target.value) || 0)}
                              className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-center text-white outline-none focus:border-cyan-500"
                            />
                          ) : (
                            <span className="font-mono text-slate-400 font-bold text-sm bg-slate-900/50 px-3 py-1 rounded border border-slate-800/50">
                              {game.popularity_index || 0}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {isEditing ? (
                            <div className="flex justify-center space-x-2">
                              <button
                                onClick={() => savePopularStatus(game.id, editPopularVal, editIndexVal)}
                                className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-xs font-bold transition-all flex items-center"
                              >
                                <Save className="w-3.5 h-3.5 mr-1.5" />
                                Save
                              </button>
                              <button
                                onClick={() => setEditingGameId(null)}
                                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-bold transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingGameId(game.id);
                                setEditPopularVal(game.is_popular);
                                setEditIndexVal(game.popularity_index || 0);
                              }}
                              className="px-4 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 text-xs font-bold transition-all"
                            >
                              Edit
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
  );
}
