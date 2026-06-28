'use client';

import React, { useState } from 'react';
import SearchBar from '@/components/SearchBar';
import GameCard from '@/components/GameCard';
import { Locale, getDictionary } from '@/lib/i18n';
import { Info, ShieldCheck, Zap } from 'lucide-react';

interface Game {
  id: number;
  title_en: string;
  title_ko: string;
  slug: string;
  cover_image_url: string;
  anti_cheat: string;
  fling_url?: string;
}

interface Trainer {
  id: number;
  game_id: number;
  version_str: string;
  option_count: number;
}

interface GamesListClientProps {
  games: Game[];
  trainers: Trainer[];
  locale: Locale;
}

export default function GamesListClient({ games, trainers, locale }: GamesListClientProps) {
  const t = getDictionary(locale);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter games based on search query (checks both English and Korean titles)
  const filteredGames = games.filter(game => {
    const query = searchQuery.toLowerCase();
    return (
      game.title_en.toLowerCase().includes(query) ||
      game.title_ko.toLowerCase().includes(query)
    );
  });

  // Find the trainer for a specific game
  const getTrainerInfo = (gameId: number) => {
    const trainer = trainers.find(t => t.game_id === gameId);
    return {
      version: trainer?.version_str || 'v1.0',
      count: trainer?.option_count || 0
    };
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center">
      
      {/* Hero Section */}
      <div className="text-center max-w-2xl mb-12">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-xs font-semibold text-cyan-400 mb-4 tracking-wide glow-cyan">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>{t.badgeSecure}</span>
        </div>
        <h1 className="font-bold text-4xl sm:text-5xl tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300 font-outfit">
          {t.subtitle}
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
          {t.desc}
        </p>
      </div>

      {/* Security Trust Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full mb-16">
        <div className="flex items-center space-x-3.5 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.badgeAnonTitle}</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t.badgeAnonDesc}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3.5 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.badgeSpeedTitle}</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t.badgeSpeedDesc}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3.5 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.badgeTechTitle}</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t.badgeTechDesc}</p>
          </div>
        </div>
      </div>

      {/* Games List Title & Search */}
      <div id="games-section" className="w-full max-w-4xl mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-slate-800/50">
        <h2 className="font-bold text-xl sm:text-2xl tracking-tight text-white font-outfit">
          {t.supportedGamesTitle}
        </h2>
        
        <SearchBar 
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t.searchPlaceholder}
        />
      </div>

      {/* Game Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-4xl mb-20">
        {filteredGames.length > 0 ? (
          filteredGames.map(game => {
            const trainer = getTrainerInfo(game.id);
            return (
              <GameCard
                key={game.id}
                game={game}
                trainerVersion={trainer.version}
                optionCount={trainer.count}
                locale={locale}
                optionsLabel={t.optionsCount}
              />
            );
          })
        ) : (
          <div className="col-span-full py-12 text-center text-slate-500 text-sm">
            검색 결과가 없습니다. 다른 게임을 검색해 주세요.
          </div>
        )}
      </div>

      {/* About & Safety Rules Section */}
      <div id="safety" className="w-full max-w-4xl p-6 md:p-8 rounded-2xl border border-slate-800 bg-slate-900/25 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-indigo-500/5 pointer-events-none"></div>
        
        <h3 className="text-lg md:text-xl font-bold text-white mb-6 flex items-center font-outfit">
          <ShieldCheck className="w-5 h-5 mr-2 text-cyan-400" />
          {t.aboutHeader}
        </h3>

        <div className="space-y-6 text-sm text-slate-400">
          <div>
            <h4 className="font-semibold text-slate-200 flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-2"></span>
              {t.aboutSub}
            </h4>
            <p className="mt-2 text-xs leading-relaxed pl-3.5">
              LocalPatcher는 게임 실행 파일을 조작하여 어떠한 불법 크랙이나 악성 바이러스를 배포하지 않습니다. 당사는 사용자가 공식 트레이너를 활용하여 싱글 플레이를 쾌적하게 즐길 수 있도록 돕는 다국어 번역 교체 툴입니다. 모든 연산과 패치 처리는 로컬 브라우저에서 수행되며, 원본 파일의 무결성 검증을 완료한 후 오직 영문 텍스트 영역만 덮어씌웁니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800/60">
            <div>
              <h5 className="font-bold text-slate-200 flex items-center text-xs uppercase tracking-wide">
                1. 오프라인 모드 플레이 준수 (Account Ban 방지)
              </h5>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                트레이너를 활성화한 상태에서 온라인 멀티플레이 세션에 접속하는 행위는 멀티플레이 치팅 위반으로 스팀 계정 영구 정지(VAC Ban 등)를 유발할 수 있습니다. 트레이너를 켜기 전에 반드시 스팀 런처를 오프라인 상태로 설정해 주시기 바랍니다.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-200 flex items-center text-xs uppercase tracking-wide">
                2. 보안 프로그램 오진 안내 (False Positive)
              </h5>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                게임 트레이너는 메모리 데이터 후킹 기술을 이용해 치트를 작동하기 때문에 대부분의 백신 프로그램(Windows Defender 등)에서 위험 요소로 오진할 수 있습니다. 당사의 해시 무결성 검증을 거친 정식 원본에 한해 예외 등록을 한 뒤 안심하고 사용하셔도 무방합니다.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-200 flex items-center text-xs uppercase tracking-wide">
                3. 세이브 파일 백업 습관화
              </h5>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                트레이너 가동 도중 드물게 발생하는 메모리 충돌로 인해 세이브 파일이 유실될 위험이 존재합니다. 트레이너를 사용하기 전에 중요한 스팀 로컬 세이브 파일 위치를 찾아 수동으로 별도 백업해 두는 습관을 권장합니다.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-200 flex items-center text-xs uppercase tracking-wide">
                4. 게임 및 트레이너 버전 확인
              </h5>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                게임 버전(예: Steam v1.1.0)과 다운로드한 트레이너 버전이 일치하지 않을 시 비정상 종료(Crash)가 일어납니다. 원본 파일 크기가 다른 경우 해시 불일치 에러를 발생시켜 안전하게 차단하므로, 버전에 꼭 맞춰 올려주십시오.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
