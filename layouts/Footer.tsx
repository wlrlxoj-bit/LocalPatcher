import React from 'react';
import Link from 'next/link';
import { getDictionary, Locale } from '@/lib/i18n';

interface FooterProps {
  locale: Locale;
}

export default function Footer({ locale }: FooterProps) {
  const t = getDictionary(locale);

  return (
    <footer className="border-t border-slate-800/60 bg-slate-950/40 py-8 mt-16">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center md:items-start justify-between gap-6 text-xs text-slate-500">
        
        {/* Left Side: Copyright & Anti-virus disclaimer */}
        <div className="max-w-2xl text-center md:text-left">
          <p className="font-medium text-slate-400">{t.footerCopyright}</p>
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
            <strong className="text-amber-500/90">{t.footerNoticeTitle}</strong> {t.footerNoticeText}
          </p>
        </div>

        {/* Right Side: Links */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center md:justify-end min-w-[240px] text-slate-400">
          <Link href={`/${locale}/terms`} className="hover:text-slate-200 transition-colors">
            {t.terms}
          </Link>
          <Link href={`/${locale}/privacy`} className="hover:text-slate-200 transition-colors">
            {t.privacy}
          </Link>
          <Link href={`/${locale}/faq`} className="hover:text-slate-200 transition-colors">
            {t.faq}
          </Link>
        </div>

      </div>
    </footer>
  );
}
