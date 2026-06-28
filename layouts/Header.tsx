'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, Globe, Menu, X, Heart } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';

interface HeaderProps {
  locale: Locale;
}

export default function Header({ locale }: HeaderProps) {
  const t = getDictionary(locale);
  const pathname = usePathname();
  const router = useRouter();
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLanguageChange = (newLocale: Locale) => {
    setIsLangDropdownOpen(false);
    const segments = pathname.split('/');
    if (segments.length > 1) {
      segments[1] = newLocale;
      const newPath = segments.join('/');
      router.push(newPath);
    } else {
      router.push(`/${newLocale}`);
    }
  };

  const getLanguageLabel = (loc: Locale) => {
    switch (loc) {
      case 'ko': return '한국어 (KO)';
      case 'en': return 'English (EN)';
      case 'ja': return '日本語 (JA)';
      default: return '한국어 (KO)';
    }
  };

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80 bg-slate-950/75">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Logo */}
        <Link href={`/${locale}`} className="flex items-center space-x-3 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-200">
            <Shield className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-cyan-400">
            LocalPatcher
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex space-x-8 text-sm font-medium">
          <Link 
            href={`/${locale}`} 
            className={`${pathname === `/${locale}` || pathname.includes('/patcher') ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'} transition-colors duration-200`}
          >
            {t.backToHome}
          </Link>
          <Link 
            href={`/${locale}/guides`} 
            className={`${pathname.includes('/guides') ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'} transition-colors duration-200`}
          >
            {t.guideTab}
          </Link>
          <Link 
            href={`/${locale}/#safety`} 
            className="text-slate-400 hover:text-slate-200 transition-colors duration-200"
          >
            {t.aboutTab}
          </Link>
        </nav>

        {/* Right Side Menu Buttons */}
        <div className="flex items-center space-x-4">
          
          {/* Language Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 text-xs font-medium text-slate-300 transition-all duration-200 focus:outline-none"
            >
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>{getLanguageLabel(locale)}</span>
              <svg className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${isLangDropdownOpen ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
            
            {isLangDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsLangDropdownOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-36 rounded-lg border border-slate-800 bg-slate-900 shadow-xl p-1.5 text-xs text-slate-400 z-20">
                  {(['ko', 'en', 'ja'] as Locale[]).map((loc) => (
                    <button
                      key={loc}
                      onClick={() => handleLanguageChange(loc)}
                      className={`w-full text-left block px-3 py-2 rounded hover:bg-slate-800 hover:text-white transition-colors duration-150 ${locale === loc ? 'text-cyan-400 font-semibold bg-slate-800/40' : ''}`}
                    >
                      {getLanguageLabel(loc).split(' ')[0]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sponsor Link Button */}
          <Link 
            href={`/${locale}/support`}
            className="hidden sm:flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-all duration-200"
          >
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>{t.sponsor}</span>
          </Link>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white transition-all focus:outline-none"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950 px-6 py-4 space-y-4">
          <nav className="flex flex-col space-y-3 text-sm">
            <Link 
              href={`/${locale}`}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`${pathname === `/${locale}` || pathname.includes('/patcher') ? 'text-cyan-400 font-semibold' : 'text-slate-400'} transition-colors`}
            >
              {t.backToHome}
            </Link>
            <Link 
              href={`/${locale}/guides`}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`${pathname.includes('/guides') ? 'text-cyan-400 font-semibold' : 'text-slate-400'} transition-colors`}
            >
              {t.guideTab}
            </Link>
            <Link 
              href={`/${locale}/#safety`}
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-slate-400 transition-colors"
            >
              {t.aboutTab}
            </Link>
            <Link 
              href={`/${locale}/support`}
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center space-x-1 py-1.5 text-indigo-400 font-semibold"
            >
              <Heart className="w-4.5 h-4.5 fill-current mr-1" />
              <span>{t.sponsor}</span>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
