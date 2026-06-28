'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export default function SearchBar({ value, onChange, placeholder }: SearchBarProps) {
  return (
    <div className="relative w-full max-w-md">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-800 bg-slate-900/60 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/40 text-slate-200 placeholder-slate-500 transition-all shadow-inner"
      />
      <Search className="w-4.5 h-4.5 text-slate-500 absolute left-3.5 top-3" />
    </div>
  );
}
