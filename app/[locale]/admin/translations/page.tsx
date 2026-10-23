'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Languages, Search, Save, Loader2, Gamepad2, CheckCircle2 } from 'lucide-react';
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
  language_code: string;
  offset_dec: number;
  encoding: string;
  original_text: string;
  translated_text: string;
  max_char_len: number;
  is_approved: boolean;
  translation_status: string | null;
  translation_provider: string | null;
}

// 수동 쓰기 RPC 응답에는 조회 전용 언어 필드가 포함되지 않을 수 있다.
type MappingWriteResult = Omit<Mapping, 'language_code'> & { language_code?: string };

export default function AdminTranslationsPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | null>(null);
  
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mappingEdits, setMappingEdits] = useState<Record<number, string>>({});
  const [mappingMessages, setMappingMessages] = useState<Record<number, string>>({});
  const [mappingBusy, setMappingBusy] = useState<Record<number, boolean>>({});
  
  const [loading, setLoading] = useState(false);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const mounted = useRef(true);
  const gameRequest = useRef(0);
  const selectionGeneration = useRef(0);
  const writeRequests = useRef<Record<number, number>>({});

  // 선택 세대는 이벤트 시점에 갱신하여 이전 조회·쓰기의 후속 UI 변경을 차단한다.
  const resetMappings = () => {
    setMappings([]);
    setMappingEdits({});
    setMappingMessages({});
    setMappingBusy({});
    setMappingsLoading(false);
  };

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    async function loadGames() {
      try {
        const response = await fetch('/api/admin/translations/catalog', { cache: 'no-store' });
        const payload = await response.json() as { games?: Game[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'games_read_failed');
        if (!cancelled) setGames(payload.games || []);
      } catch (err) {
        console.error(err);
      }
    }
    void loadGames();
    return () => {
      cancelled = true;
      mounted.current = false;
      gameRequest.current += 1;
      selectionGeneration.current += 1;
    };
  }, []);

  const handleGameSelect = async (gameId: number) => {
    const request = ++gameRequest.current;
    selectionGeneration.current += 1;
    const isCurrent = () => mounted.current && request === gameRequest.current;
    setSelectedGameId(gameId);
    setSelectedTrainerId(null);
    setTrainers([]);
    resetMappings();
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/translations/trainers?gameId=${encodeURIComponent(String(gameId))}`, { cache: 'no-store' });
      const payload = await response.json() as { trainers?: Trainer[]; error?: string };
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(payload.error || 'trainers_read_failed');
      setTrainers(payload.trainers || []);
    } catch (err) {
      if (isCurrent()) console.error(err);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  const handleTrainerSelect = async (trainerId: number) => {
    const generation = ++selectionGeneration.current;
    const isCurrent = () => mounted.current && generation === selectionGeneration.current;
    setSelectedTrainerId(trainerId);
    resetMappings();
    setMappingsLoading(true);
    try {
      const response = await fetch(`/api/admin/translations/mappings?trainerId=${encodeURIComponent(String(trainerId))}`, { cache: 'no-store' });
      const payload = await response.json() as { mappings?: Mapping[]; error?: string };
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(payload.error || 'mappings_read_failed');
      const data = payload.mappings || [];
      setMappings(data);
      setMappingMessages({});
      
      const edits: Record<number, string> = {};
      (data || []).forEach(m => { edits[m.id] = m.translated_text; });
      setMappingEdits(edits);
    } catch (err) {
      if (isCurrent()) console.error(err);
    } finally {
      if (isCurrent()) setMappingsLoading(false);
    }
  };

  const saveMapping = async (id: number) => {
    const generation = selectionGeneration.current;
    const request = (writeRequests.current[id] || 0) + 1;
    writeRequests.current[id] = request;
    const isCurrent = () => mounted.current && generation === selectionGeneration.current && request === writeRequests.current[id];
    setMappingBusy((current) => ({ ...current, [id]: true }));
    setMappingMessages((current) => ({ ...current, [id]: '' }));
    try {
      const response = await fetch(`/api/admin/translations/mappings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translatedText: mappingEdits[id] }),
      });
      const payload = await response.json() as { mapping?: MappingWriteResult; error?: string };
      if (!isCurrent()) return;
      if (!response.ok || !payload.mapping || payload.mapping.id !== id) throw new Error(payload.error || 'mapping_update_failed');
      const updated = payload.mapping;
      setMappings((current) => current.map((mapping) => mapping.id === id ? { ...mapping, ...updated, id: mapping.id, language_code: mapping.language_code } : mapping));
      setMappingEdits((current) => ({ ...current, [id]: updated.translated_text }));
      setMappingMessages((current) => ({ ...current, [id]: '검수 대기 중 — 승인 전에는 페이지 색인 대상이 아닙니다.' }));
    } catch (err) {
      if (!isCurrent()) return;
      console.error(err);
      setMappingMessages((current) => ({ ...current, [id]: '저장하지 못했습니다. 내용을 새로고침해 다시 확인하세요.' }));
    } finally {
      if (isCurrent()) setMappingBusy((current) => ({ ...current, [id]: false }));
    }
  };

  const approveManualMapping = async (id: number) => {
    const generation = selectionGeneration.current;
    const request = (writeRequests.current[id] || 0) + 1;
    writeRequests.current[id] = request;
    const isCurrent = () => mounted.current && generation === selectionGeneration.current && request === writeRequests.current[id];
    setMappingBusy((current) => ({ ...current, [id]: true }));
    setMappingMessages((current) => ({ ...current, [id]: '' }));
    try {
      const response = await fetch(`/api/admin/translations/mappings/${id}/approve`, { method: 'POST' });
      const payload = await response.json() as { mapping?: MappingWriteResult; error?: string };
      if (!isCurrent()) return;
      if (!response.ok || !payload.mapping || payload.mapping.id !== id) throw new Error(payload.error || 'mapping_approval_failed');
      const updated = payload.mapping;
      setMappings((current) => current.map((mapping) => mapping.id === id ? { ...mapping, ...updated, id: mapping.id, language_code: mapping.language_code } : mapping));
      setMappingMessages((current) => ({ ...current, [id]: '승인 완료 — 공개 및 색인 자격에 반영됩니다.' }));
    } catch (err) {
      if (!isCurrent()) return;
      console.error(err);
      setMappingMessages((current) => ({ ...current, [id]: '승인하지 못했습니다. 이미 변경되었는지 새로고침해 확인하세요.' }));
    } finally {
      if (isCurrent()) setMappingBusy((current) => ({ ...current, [id]: false }));
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
              {selectedTrainerId && <TranslationJobPanel key={selectedTrainerId} trainerId={selectedTrainerId} />}

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
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="rounded bg-cyan-500/10 px-2 py-1 font-bold text-cyan-300">{m.language_code}</span>
                            {m.is_approved ? <span className="rounded bg-emerald-500/15 px-2 py-1 font-bold text-emerald-300">승인 완료</span>
                              : m.translation_provider === 'manual' && m.translation_status === 'pending' ? <span className="rounded bg-amber-500/15 px-2 py-1 font-bold text-amber-200">검수 대기 중</span>
                                : <span className="rounded bg-slate-700/70 px-2 py-1 text-slate-300">자동 번역 검증 및 재시도 중</span>}
                            {mappingMessages[m.id] && <span role="status" className="text-slate-400">{mappingMessages[m.id]}</span>}
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
                                <div className="flex items-center gap-2">
                                  {m.translation_provider === 'manual' && m.translation_status === 'pending' && !m.is_approved && <button type="button" onClick={() => approveManualMapping(m.id)} disabled={mappingBusy[m.id]} className="text-[9px] text-emerald-300 hover:text-white bg-emerald-500/10 px-2 py-0.5 rounded flex items-center disabled:opacity-50">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> {mappingBusy[m.id] ? '처리 중' : '승인'}
                                  </button>}
                                  <button type="button" onClick={() => saveMapping(m.id)} disabled={mappingBusy[m.id]} className="text-[9px] text-cyan-400 hover:text-white bg-cyan-500/10 px-2 py-0.5 rounded flex items-center disabled:opacity-50">
                                    <Save className="w-3 h-3 mr-1" /> {mappingBusy[m.id] ? '저장 중' : '저장 후 검수 대기'}
                                  </button>
                                </div>
                              </div>
                              <textarea
                                value={mappingEdits[m.id] || ''}
                                disabled={mappingBusy[m.id]}
                                onChange={(e) => {
                                  if (mappingBusy[m.id]) return;
                                  const value = e.target.value;
                                  setMappingEdits((current) => ({ ...current, [m.id]: value }));
                                }}
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
