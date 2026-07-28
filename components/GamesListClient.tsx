'use client';

import React, { useState, useEffect } from 'react';
import SearchBar from '@/components/SearchBar';
import GameCard from '@/components/GameCard';
import { Locale, getCommonDict, getPatcherDict, getGamesDict, getGameTitle } from '@/lib/i18n';
import { Info, ShieldCheck, Zap, ChevronDown } from 'lucide-react';

interface Game {
  id: number;
  title_en: string;
  title_ko: string;
  title_ja?: string;
  title_de?: string;
  title_es?: string;
  slug: string;
  cover_image_url: string;
  anti_cheat: string;
  fling_url?: string;
  is_popular?: boolean;
  popularity_index?: number;
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

function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function getAcronym(str: string): string {
  if (!str) return '';
  const words = str.split(/\s+/).filter(Boolean);
  let acronym = '';
  for (const word of words) {
    const cleanWord = normalizeText(word);
    if (cleanWord.length > 0) {
      acronym += cleanWord[0];
    }
  }
  return acronym;
}

function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function kanaToRomaji(str: string): string {
  const kanaMap: Record<string, string> = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o',
    'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
    'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    '나':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
    'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
    'わ':'wa','を':'wo','ん':'n',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
    'しゃ':'sha','しゅ':'shu','しょ':'sho',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
    'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
    'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
    'みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
    'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
    'じゃ':'ja','じゅ':'ju','じょ':'jo',
    'びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
    'ー':'', '・':''
  };
  const hira = katakanaToHiragana(str);
  let res = '';
  for (let i = 0; i < hira.length; i++) {
    const two = hira.substring(i, i + 2);
    if (kanaMap[two]) {
      res += kanaMap[two];
      i++;
    } else {
      res += kanaMap[hira[i]] || hira[i];
    }
  }
  return res;
}

const MULTI_LANG_SYNONYMS: Record<string, string[]> = {
  'fantasia': ['fantasy'],
  'fantasía': ['fantasy'],
  'monstruo': ['monster'],
  'monstruos': ['monster'],
  'cazador': ['hunter'],
  'almas': ['souls'],
  'guerra': ['war'],
  'krieg': ['war'],
  'leyenda': ['legend'],
  'legende': ['legend'],
  'anillo': ['ring'],
  'coche': ['auto', 'car'],
  'auto': ['gta', 'car'],
  'jager': ['hunter'],
  'jäger': ['hunter']
};

function getSynonyms(query: string): string[] {
  const norm = normalizeText(query);
  const synonyms = MULTI_LANG_SYNONYMS[norm] || [];
  return Array.from(new Set([norm, ...synonyms.map(s => normalizeText(s))]));
}

function getChosung(str: string): string {
  const cho = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
  ];
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code > -1 && code < 11172) {
      result += cho[Math.floor(code / 588)];
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}

export default function GamesListClient({ games, trainers, locale }: GamesListClientProps) {
  const t = getCommonDict(locale);
  const pt = getPatcherDict(locale as Locale);
  const gt = getGamesDict(locale as Locale);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(18);

  // 검색어가 변경되면 표시 개수를 초기값(18)으로 리셋
  useEffect(() => {
    setVisibleCount(18);
  }, [searchQuery]);

  // Find the trainer for a specific game
  const getTrainerInfo = (gameId: number) => {
    const trainer = trainers.find(t => t.game_id === gameId);
    return {
      version: trainer?.version_str || 'v1.0',
      count: trainer?.option_count || 0
    };
  };

  // Get games (we now include games even with 0 trainers, so users can still find them and download from FLiNG)
  const gamesWithTrainers = games;

  // Split into latest and popular games
  const latestGames = [...gamesWithTrainers].sort((a, b) => b.id - a.id);

  const popularGames = gamesWithTrainers
    .filter(game => game.is_popular === true)
    .sort((a, b) => (a.popularity_index ?? 999) - (b.popularity_index ?? 999));

  // Filter games based on search query across all languages (Chosung, Acronym, Diacritics, Hiragana/Katakana)
  const filteredGames = gamesWithTrainers
    .filter(game => {
      if (!searchQuery.trim()) return true;

      const normQuery = normalizeText(searchQuery);
      const querySynonyms = getSynonyms(searchQuery);
      const queryChosung = getChosung(normQuery);
      const queryKatakana = hiraganaToKatakana(searchQuery.toLowerCase());
      const queryHiragana = katakanaToHiragana(searchQuery.toLowerCase());
      const queryRomaji = kanaToRomaji(searchQuery.toLowerCase());

      const normEn = normalizeText(game.title_en);
      const normKo = normalizeText(game.title_ko);
      const normJa = normalizeText(game.title_ja || '');
      const normDe = normalizeText(game.title_de || '');
      const normEs = normalizeText(game.title_es || '');
      const normJaHiragana = katakanaToHiragana(normJa);
      const normJaKatakana = hiraganaToKatakana(normJa);

      const acronymEn = getAcronym(game.title_en);
      const acronymKo = getChosung(game.title_ko);

      return (
        // Exact / Substring search across all language titles and synonyms (e.g. fantasia -> fantasy)
        querySynonyms.some(q => 
          normEn.includes(q) || 
          normKo.includes(q) || 
          (normJa.length > 0 && normJa.includes(q)) ||
          (normDe.length > 0 && normDe.includes(q)) ||
          (normEs.length > 0 && normEs.includes(q))
        ) ||
        // Acronym / First-letter shortcut search (e.g., AOW -> Age of Wonders, ER -> Elden Ring)
        (acronymEn.length > 1 && querySynonyms.some(q => acronymEn.includes(q))) ||
        // Korean Chosung search (e.g., ㅇㅇㅇ -> 에이지 오브 원더스)
        (acronymKo.length > 0 && acronymKo.includes(queryChosung)) ||
        // Japanese Hiragana ↔ Katakana cross match
        (normJaKatakana.length > 0 && normJaKatakana.includes(queryKatakana)) ||
        (normJaHiragana.length > 0 && normJaHiragana.includes(queryHiragana)) ||
        // Romaji <-> English title match (e.g., "eiji" / "えいじ" matching "age")
        (queryRomaji.length > 1 && (normEn.includes(queryRomaji) || normKo.includes(queryRomaji)))
      );
    })
    .sort((a, b) => {
      const isAPopular = a.is_popular;
      const isBPopular = b.is_popular;
      
      if (isAPopular || isBPopular) {
        if (isAPopular && isBPopular) {
          return (a.popularity_index ?? 999) - (b.popularity_index ?? 999);
        }
        return isAPopular ? -1 : 1;
      }
      return b.id - a.id;
    });

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
      <div id="games-section" className={`w-full ${searchQuery ? 'max-w-4xl' : 'max-w-7xl'} mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-slate-800/50`}>
        <h2 className="font-bold text-xl sm:text-2xl tracking-tight text-white font-outfit">
          {searchQuery ? gt.supportedGamesTitle : gt.recentUpdatesTitle}
        </h2>
        
        <SearchBar 
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={gt.searchPlaceholder}
        />
      </div>

      {!searchQuery ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 w-full max-w-7xl mb-8 items-start">
          {/* Left Column: Recent Updates */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full">
              {latestGames.slice(0, visibleCount).map((game, index) => {
                const trainer = getTrainerInfo(game.id);
                return (
                  <GameCard
                    key={game.id}
                    game={game}
                    trainerVersion={trainer.version}
                    optionCount={trainer.count}
                    locale={locale}
                    optionsLabel={pt.optionsCount}
                    priority={index < 6}
                  />
                );
              })}
            </div>

            {/* Load More button */}
            {latestGames.length > 0 && visibleCount < latestGames.length && (
              <div className="flex flex-col items-center gap-3 w-full py-4">
                <p className="text-xs text-slate-500 font-outfit tracking-wide">
                  {Math.min(visibleCount, latestGames.length)} / {latestGames.length} 게임 표시 중
                </p>
                <button
                  onClick={() => setVisibleCount(prev => prev + 18)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300 font-outfit text-sm font-medium tracking-wide transition-all duration-300 hover:bg-cyan-500/20 hover:border-cyan-500/50 hover:text-cyan-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] cursor-pointer"
                >
                  {gt.loadMore}
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {(latestGames.length === 0 || visibleCount >= latestGames.length) && (
              <div className="mb-6" />
            )}
          </div>

          {/* Right Column: Popular Trainers Sidebar */}
          <div className="lg:col-span-1 lg:sticky lg:top-24 flex flex-col gap-4 p-4 sm:p-5 rounded-2xl border border-slate-800 bg-slate-900/20 backdrop-blur-sm">
            <h3 className="font-bold text-lg text-white font-outfit border-b border-slate-800 pb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              {gt.popularTrainersTitle}
            </h3>
            <div className="flex flex-col gap-3">
              {popularGames.slice(0, 10).map((game, index) => {
                const trainer = getTrainerInfo(game.id);
                const rank = index + 1;
                return (
                  <a
                    key={game.id}
                    href={`/${locale}/patcher/${game.slug}`}
                    className="flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-slate-800/40 group"
                  >
                    {/* Rank Badge */}
                    <div className={`w-6 h-6 flex items-center justify-center rounded-lg text-xs font-bold font-outfit shrink-0 ${
                      rank === 1 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      rank === 2 ? 'bg-slate-300/20 text-slate-300 border border-slate-300/30' :
                      rank === 3 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                      'bg-slate-800/50 text-slate-400 border border-slate-700/30'
                    }`}>
                      {rank}
                    </div>
                    
                    {/* Thumbnail */}
                    {game.cover_image_url ? (
                      <img
                        src={game.cover_image_url}
                        alt={getGameTitle(game, locale)}
                        className="w-10 h-12 object-cover rounded-lg bg-slate-800 shrink-0 border border-slate-800 group-hover:border-slate-700 transition-colors"
                      />
                    ) : (
                      <div className="w-10 h-12 bg-slate-900/80 rounded-lg shrink-0 border border-slate-800 group-hover:border-slate-700 transition-colors flex items-center justify-center text-[10px] text-slate-500">
                        No Cover
                      </div>
                    )}

                    {/* Title & Info */}
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-slate-200 truncate group-hover:text-cyan-400 transition-colors leading-tight">
                        {getGameTitle(game, locale)}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 font-outfit">
                        {trainer.count} {pt.optionsCount}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Game Cards Grid for Search Results */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-4xl mb-8">
            {filteredGames.length > 0 ? (
              filteredGames.slice(0, visibleCount).map((game, index) => {
                const trainer = getTrainerInfo(game.id);
                return (
                  <GameCard
                    key={game.id}
                    game={game}
                    trainerVersion={trainer.version}
                    optionCount={trainer.count}
                    locale={locale}
                    optionsLabel={pt.optionsCount}
                    priority={index < 6}
                  />
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center text-slate-500 text-sm">
                {gt.noGamesFound}
              </div>
            )}
          </div>

          {/* Load More button for Search Results */}
          {filteredGames.length > 0 && visibleCount < filteredGames.length && (
            <div className="flex flex-col items-center gap-3 w-full max-w-4xl mb-20">
              <p className="text-xs text-slate-500 font-outfit tracking-wide">
                {Math.min(visibleCount, filteredGames.length)} / {filteredGames.length} 게임 표시 중
              </p>
              <button
                onClick={() => setVisibleCount(prev => prev + 18)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300 font-outfit text-sm font-medium tracking-wide transition-all duration-300 hover:bg-cyan-500/20 hover:border-cyan-500/50 hover:text-cyan-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] cursor-pointer"
              >
                {gt.loadMore}
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}

          {(filteredGames.length === 0 || visibleCount >= filteredGames.length) && (
            <div className="mb-12" />
          )}
        </>
      )}

      {/* About & Safety Rules Section */}
      <div id="safety" className="w-full max-w-4xl p-6 md:p-8 rounded-2xl border border-slate-800 bg-slate-900/25 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-indigo-500/5 pointer-events-none"></div>
        
        <h3 className="text-lg md:text-xl font-bold text-white mb-6 flex items-center font-outfit">
          <ShieldCheck className="w-5 h-5 mr-2 text-cyan-400" />
          {pt.aboutHeader}
        </h3>

        <div className="space-y-6 text-sm text-slate-400">
          <div>
            <h4 className="font-semibold text-slate-200 flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-2"></span>
              {pt.aboutSub}
            </h4>
            <p className="mt-2 text-xs leading-relaxed pl-3.5">
              {pt.aboutDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800/60">
            <div>
              <h5 className="font-bold text-slate-200 flex items-center text-xs uppercase tracking-wide">
                {pt.safetyTitle1}
              </h5>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                {pt.safetyDesc1}
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-200 flex items-center text-xs uppercase tracking-wide">
                {pt.safetyTitle2}
              </h5>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                {pt.safetyDesc2}
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-200 flex items-center text-xs uppercase tracking-wide">
                {pt.safetyTitle3}
              </h5>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                {pt.safetyDesc3}
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-200 flex items-center text-xs uppercase tracking-wide">
                {pt.safetyTitle4}
              </h5>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                {pt.safetyDesc4}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
