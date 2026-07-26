import React from 'react';
import { getSteamNews, SteamNewsItem } from '@/lib/steam';
import { getPatcherDict } from '@/lib/i18n';
import { Locale } from '@/lib/i18n/types';
import { ExternalLink } from 'lucide-react';

interface SteamNewsProps {
  steamAppId: number;
  locale: Locale;
}

export default async function SteamNews({ steamAppId, locale }: SteamNewsProps) {
  const newsItems = await getSteamNews(steamAppId, 3);
  const pt = getPatcherDict(locale);

  if (newsItems.length === 0) {
    return null;
  }

  // Helper to format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="w-full mt-6 bg-slate-900/40 rounded-xl border border-slate-800/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/60 bg-slate-800/30 flex items-center gap-3">
        {/* Steam Icon SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="w-5 h-5 text-cyan-400"
          fill="currentColor"
        >
          <path d="M11.979 0C5.353 0 0 5.373 0 12c0 4.675 2.664 8.71 6.556 10.706L9.61 18.25c-.244-.108-.475-.245-.693-.414-2.034-1.574-2.404-4.52-.826-6.559.73-.941 1.769-1.542 2.92-1.724l2.883-4.148c-.015-.122-.023-.245-.023-.37 0-2.316 1.88-4.198 4.196-4.198 2.315 0 4.195 1.882 4.195 4.198 0 2.318-1.88 4.2-4.195 4.2-.843 0-1.623-.255-2.268-.69L12.9 12.7c.18.995-.084 2.05-.79 2.85-.923 1.042-2.378 1.4-3.666.924l-3.056 4.457a11.996 11.996 0 006.591 1.942C18.601 22.873 24 17.5 24 10.873 24 4.248 18.6 0 11.979 0zm6.092 3.238c1.688 0 3.059 1.373 3.059 3.064 0 1.69-1.371 3.064-3.059 3.064-1.689 0-3.06-1.374-3.06-3.064 0-1.691 1.37-3.064 3.06-3.064zm-5.748 7.37c1.196 0 2.167.973 2.167 2.17 0 1.199-.971 2.172-2.167 2.172-1.195 0-2.166-.973-2.166-2.171 0-1.197.971-2.17 2.166-2.17z" />
        </svg>
        <h3 className="text-sm font-bold text-slate-200">
          {pt.steamNewsTitle}
        </h3>
      </div>
      
      <div className="p-2">
        <ul className="flex flex-col gap-1">
          {newsItems.map((item: SteamNewsItem) => (
            <li key={item.gid}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg hover:bg-slate-800/40 transition-colors gap-2"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-slate-300 group-hover:text-cyan-300 transition-colors line-clamp-1 truncate">
                    {item.title}
                  </h4>
                  <span className="text-xs text-slate-500 mt-1 block">
                    {formatDate(item.date)}
                  </span>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-4 bg-cyan-950/20 border-t border-cyan-900/30">
        <p className="text-xs text-cyan-200/80 leading-relaxed">
          {pt.steamNewsSeo}
        </p>
      </div>
    </div>
  );
}
