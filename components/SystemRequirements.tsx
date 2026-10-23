import React from 'react';
import { getSteamAppDetails } from '@/lib/steam';
import { getPatcherDict, Locale } from '@/lib/i18n/index';

interface SystemRequirementsProps {
  steamAppId: number;
  locale: Locale;
}

export default async function SystemRequirements({ steamAppId, locale }: SystemRequirementsProps) {
  const details = await getSteamAppDetails(steamAppId, locale);
  
  if (!details || !details.pc_requirements) {
    return null;
  }

  const { minimum, recommended } = details.pc_requirements;
  
  // If no requirement text is found, do not render
  if (!minimum && !recommended) {
    return null;
  }

  const pt = getPatcherDict(locale);

  // 외부 HTML은 실행 가능한 마크업으로 삽입하지 않고 React가 이스케이프하는 텍스트로 표시합니다.
  // 중복 제목과 태그를 제거하되 줄바꿈·목록 구분은 보존합니다. 링크·굵게 서식은 적용하지 않습니다.
  const requirementText = (html: string) => html
    .replace(/^\s*<strong>.*?<\/strong>\s*<br\s*\/?>/i, '')
    .replace(/<br\b[^>]*>|<\/?(?:ul|ol|li|p|div)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n[\t ]*\n+/g, '\n')
    .trim();

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
      <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
        <h3 className="font-bold text-slate-200 uppercase tracking-wider">{pt.systemRequirements}</h3>
      </div>
      
      <div className="p-6 max-h-[500px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {minimum && (
            <div className="flex flex-col space-y-3">
              <h4 className="text-sm font-bold text-emerald-400 font-mono border-b border-slate-800 pb-2">{pt.minimum}</h4>
              <div 
                className="text-xs text-slate-400 whitespace-pre-line leading-relaxed font-sans"
              >{requirementText(minimum)}</div>
            </div>
          )}
          
          {recommended && (
            <div className="flex flex-col space-y-3">
              <h4 className="text-sm font-bold text-cyan-400 font-mono border-b border-slate-800 pb-2">{pt.recommended}</h4>
              <div 
                className="text-xs text-slate-400 whitespace-pre-line leading-relaxed font-sans"
              >{requirementText(recommended)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
