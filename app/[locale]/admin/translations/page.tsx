'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Languages, Search, Save, Loader2, Gamepad2, FileText } from 'lucide-react';
import TranslationJobPanel from '@/components/admin/translation/TranslationJobPanel';

interface Game {
  id: number;
  title_en: string;
  title_ko: string;
}

interface Trainer {
  id: number;
  version_str: string;
}

interface Mapping {
  id: number;
  offset_dec: number;
  encoding: string;
  original_text: string;
  translated_text: string;
  max_char_len: number;
}

export default function AdminTranslationsPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | null>(null);
  
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mappingEdits, setMappingEdits] = useState<Record<number, string>>({});
  
  const [loading, setLoading] = useState(false);
  const [mappingsLoading, setMappingsLoading] = useState(false);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('games').select('id, title_en, title_ko').order('title_en', { ascending: true });
      setGames(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGameSelect = async (gameId: number) => {
    if (!supabase) return;
    setSelectedGameId(gameId);
    setSelectedTrainerId(null);
    setMappings([]);
    setLoading(true);
    try {
      const { data } = await supabase.from('trainers').select('id, version_str').eq('game_id', gameId).order('version_str', { ascending: false });
      setTrainers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrainerSelect = async (trainerId: number) => {
    if (!supabase) return;
    setSelectedTrainerId(trainerId);
    setMappingsLoading(true);
    try {
      const { data } = await supabase.from('translation_mappings').select('*').eq('trainer_id', trainerId).order('offset_dec', { ascending: true });
      setMappings(data || []);
      
      const edits: Record<number, string> = {};
      (data || []).forEach(m => { edits[m.id] = m.translated_text; });
      setMappingEdits(edits);
    } catch (err) {
      console.error(err);
    } finally {
      setMappingsLoading(false);
    }
  };

  const saveMapping = async (id: number) => {
    if (!supabase) return;
    try {
      await supabase.from('translation_mappings').update({ translated_text: mappingEdits[id] }).eq('id', id);
      alert('Saved');
    } catch (err) {
      console.error(err);
      alert('Error saving');
    }
  };

  const filteredGames = games.filter(g => g.title_en.toLowerCase().includes(search.toLowerCase()) || g.title_ko?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <h3 className="text-xl font-bold text-white flex items-center">
          <Languages className="w-5 h-5 mr-3 text-cyan-400" />
          Translation Editor
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Game Selection Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search games..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-all"
            />
          </div>
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl max-h-[600px] overflow-y-auto">
            {filteredGames.map(game => (
              <button
                key={game.id}
                onClick={() => handleGameSelect(game.id)}
                className={`w-full text-left p-3 text-xs border-b border-slate-800/50 hover:bg-slate-900 transition-all ${selectedGameId === game.id ? 'bg-slate-900 border-l-2 border-l-cyan-500' : ''}`}
              >
                <div className="font-bold text-white truncate">{game.title_en}</div>
                <div className="text-[10px] text-slate-500 mt-1 truncate">{game.title_ko}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3 space-y-6">
          {!selectedGameId ? (
            <div className="h-full min-h-[400px] rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500">
              <Gamepad2 className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">Select a game from the sidebar to view its trainers.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Job Panel Component for Approval Workflow */}
              {selectedTrainerId && <TranslationJobPanel trainerId={selectedTrainerId} />}

              {/* Trainers List */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin text-cyan-500" /> : trainers.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleTrainerSelect(t.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${selectedTrainerId === t.id ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'}`}
                  >
                    {t.version_str}
                  </button>
                ))}
              </div>

              {/* Mapping Editor */}
              {selectedTrainerId && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
                  {mappingsLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
                  ) : mappings.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-sm">No text strings found for this trainer.</div>
                  ) : (
                    <div className="space-y-4">
                      {mappings.map(m => (
                        <div key={m.id} className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 space-y-3">
                          <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                            <span>Offset: {m.offset_dec} ({m.encoding})</span>
                            <span>Max: {m.max_char_len}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Original Text</div>
                              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs text-slate-400 whitespace-pre-wrap font-mono">
                                {m.original_text}
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <div className="text-[9px] font-bold text-cyan-500 uppercase">Translated Text</div>
                                <button onClick={() => saveMapping(m.id)} className="text-[9px] text-cyan-400 hover:text-white bg-cyan-500/10 px-2 py-0.5 rounded flex items-center">
                                  <Save className="w-3 h-3 mr-1" /> Save
                                </button>
                              </div>
                              <textarea
                                value={mappingEdits[m.id] || ''}
                                onChange={(e) => setMappingEdits({ ...mappingEdits, [m.id]: e.target.value })}
                                className="w-full p-2.5 rounded bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:border-cyan-500 outline-none resize-y min-h-[60px]"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
