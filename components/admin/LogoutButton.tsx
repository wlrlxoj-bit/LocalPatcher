'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/admin/verify', { method: 'DELETE' }).catch(() => undefined);
    // Refresh the router to let the Server Component layout re-check the cookie
    router.refresh();
  };

  return (
    <button 
      onClick={handleLogout}
      className="w-full px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/50 transition-all text-left"
    >
      Sign Out
    </button>
  );
}
