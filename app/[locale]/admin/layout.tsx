import React from 'react';
import { cookies } from 'next/headers';
import { isValidAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import LoginForm from '@/components/admin/LoginForm';
import Link from 'next/link';
import { LayoutDashboard, Flame, Languages, BookOpen, Settings } from 'lucide-react';
import LogoutButton from '@/components/admin/LogoutButton';

export const metadata = {
  title: 'Admin Dashboard - LocalPatcher',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const isAuthenticated = isValidAdminSession(token);

  if (!isAuthenticated) {
    return (
      <div className="bg-[#0a0f16] min-h-screen text-slate-200">
        <LoginForm />
      </div>
    );
  }

  const navItems = [
    { label: 'Dashboard Stats', href: `/${locale}/admin`, icon: LayoutDashboard },
    { label: 'Popular Games', href: `/${locale}/admin/games`, icon: Flame },
    { label: 'Translation Editor', href: `/${locale}/admin/translations`, icon: Languages },
    { label: 'Dictionary Editor', href: `/${locale}/admin/dictionary`, icon: BookOpen },
    { label: 'System Control', href: `/${locale}/admin/system`, icon: Settings },
  ];

  return (
    <div className="bg-[#0a0f16] min-h-screen text-slate-200 flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-64 border-r border-slate-800 bg-slate-950/50 flex flex-col sticky top-0 md:h-screen z-20">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/25">Management</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white font-outfit">LocalPatcher Admin</h1>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <LogoutButton />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-x-hidden min-h-screen relative z-10 p-6 md:p-10">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
