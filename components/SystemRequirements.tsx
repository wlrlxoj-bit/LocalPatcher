import React from 'react';
import { getSteamAppDetails } from '@/lib/steam';
import { getPatcherDict, Locale } from '@/lib/i18n/index';

interface SystemRequirementsProps {
  steamAppId: number;
  locale: Locale;
}

export default async function SystemRequirements({ steamAppId, locale }: SystemRequirementsProps) {
  const details = await getSteamAppDetails(steamAppId);
  
  if (!details || !details.pc_requirements) {
    return null;
  }

  const { minimum, recommended } = details.pc_requirements;
  
  // If no requirement text is found, do not render
  if (!minimum && !recommended) {
    return null;
  }

  const pt = getPatcherDict(locale);

  // Helper to sanitize/clean up Steam's messy HTML strings a bit
  // Steam usually prepends "<strong>Minimum:</strong><br>" which we want to hide if we are using our own headers.
  const cleanHtml = (html: string, keywordToStrip: string) => {
    let clean = html;
    // Attempt to remove the prefixed header (e.g. <strong>Minimum:</strong><br>)
    clean = clean.replace(/<strong>.*?<\/strong><br\s*\/?>/i, '');
    return clean;
  };

  return (
    <div className="mt-12 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
      <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
        <h3 className="font-bold text-slate-200 uppercase tracking-wider">{pt.systemRequirements}</h3>
      </div>
      
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {minimum && (
            <div className="flex flex-col space-y-3">
              <h4 className="text-sm font-bold text-emerald-400 font-mono border-b border-slate-800 pb-2">{pt.minimum}</h4>
              <div 
                className="text-xs text-slate-400 space-y-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul_li]:mb-1 [&_strong]:text-slate-300 [&_a]:text-cyan-400 leading-relaxed font-sans"
                dangerouslySetInnerHTML={{ __html: cleanHtml(minimum, 'Minimum') }}
              />
            </div>
          )}
          
          {recommended && (
            <div className="flex flex-col space-y-3">
              <h4 className="text-sm font-bold text-cyan-400 font-mono border-b border-slate-800 pb-2">{pt.recommended}</h4>
              <div 
                className="text-xs text-slate-400 space-y-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul_li]:mb-1 [&_strong]:text-slate-300 [&_a]:text-cyan-400 leading-relaxed font-sans"
                dangerouslySetInnerHTML={{ __html: cleanHtml(recommended, 'Recommended') }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
