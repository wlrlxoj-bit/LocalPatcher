'use client';

import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const router = useRouter();

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
        // Refresh the page to trigger Server Component re-render
        router.refresh();
      } else {
        setLoginError('Invalid administrator password.');
      }
    } catch (err) {
      setLoginError('An error occurred during authentication.');
    } finally {
      setLoginLoading(false);
    }
  };

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
