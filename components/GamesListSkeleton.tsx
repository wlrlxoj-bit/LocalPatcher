import React from 'react';

export default function GamesListSkeleton() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-8 lg:py-12 min-h-screen">
      <div className="animate-pulse space-y-8 mt-6">
        <div className="h-12 w-64 bg-slate-800/50 rounded-xl" />
        <div className="h-12 w-full max-w-md bg-slate-800/50 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6 mt-8">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-slate-800/50 rounded-2xl border border-slate-700/50" />
          ))}
        </div>
      </div>
    </div>
  );
}
