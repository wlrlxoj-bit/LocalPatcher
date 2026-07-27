'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpen, Search, Save, Trash2, Plus, Loader2 } from 'lucide-react';

interface DictItem {
  id: number;
  english_term: string;
  korean_translation: string;
}

export default function AdminDictionaryPage() {
  const [dictItems, setDictItems] = useState<DictItem[]>([]);
  const [dictSearch, setDictSearch] = useState('');
  const [dictLoading, setDictLoading] = useState(false);
  
  const [newEngTerm, setNewEngTerm] = useState('');
  const [newKorTrans, setNewKorTrans] = useState('');
  const [dictEdits, setDictEdits] = useState<Record<number, string>>({});

  useEffect(() => {
    fetchDictionary();
  }, []);

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

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <h3 className="text-xl font-bold text-white flex items-center">
          <BookOpen className="w-5 h-5 mr-3 text-emerald-400" />
          Common Dictionary Management
        </h3>
      </div>

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
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-emerald-500 transition-all placeholder-slate-700"
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
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-emerald-500 transition-all placeholder-slate-700"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-xs font-bold text-slate-950 shadow-md transition-all active:scale-[0.98] flex items-center justify-center space-x-1"
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
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          {dictLoading ? (
            <div className="flex justify-center items-center h-64 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
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
                          className="px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white focus:border-emerald-500 outline-none w-44"
                        />
                        
                        <button
                          onClick={() => handleUpdateDictItem(item.id)}
                          className="p-2 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/10 transition-all"
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
  );
}
