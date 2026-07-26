import React from 'react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0f16] text-slate-200">
      <div className="h-64 md:h-80 w-full bg-slate-900/50 animate-pulse border-b border-slate-800" />
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 -mt-16 relative z-10">
        <div className="flex flex-col lg:flex-row gap-8 pb-12">
          {/* Main Content Skeleton */}
          <div className="flex-1 space-y-6">
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6 animate-pulse h-48" />
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6 animate-pulse h-96" />
          </div>
          {/* Sidebar Skeleton */}
          <div className="w-full lg:w-[380px] xl:w-[420px] space-y-6">
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6 animate-pulse h-64" />
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6 animate-pulse h-80" />
          </div>
        </div>
      </div>
    </div>
  );
}
