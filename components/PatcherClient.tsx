'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { Locale, getDictionary } from '@/lib/i18n';
import DropZone from '@/components/DropZone';

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
  version_str: string;
  original_file_hash: string;
  original_file_size: number;
  option_count?: number;
}

interface Mapping {
  offset_dec: number;
  encoding: 'UTF-16LE' | 'ASCII' | 'UTF-8';
  original_text: string;
  translated_text: string;
  max_char_len: number;
}

interface PatcherClientProps {
  game: Game;
  trainers: Trainer[];
  // Map of trainerId -> mapping data
  mappingsMap: Record<number, Mapping[]>;
  locale: Locale;
}

export default function PatcherClient({ game, trainers, mappingsMap, locale }: PatcherClientProps) {
  const t = getDictionary(locale);
  const displayTitle = locale === 'ko' ? game.title_ko : game.title_en;
  
  // Set default selected trainer version
  const [selectedTrainerId, setSelectedTrainerId] = useState<number>(
    trainers.length > 0 ? trainers[0].id : 0
  );

  const selectedTrainer = trainers.find(t => t.id === selectedTrainerId);

  const handleTrainerDetected = (id: number) => {
    setSelectedTrainerId(id);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col">
      
      {/* Back button */}
      <div className="mb-6">
        <Link 
          href={`/${locale}`}
          className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>목록으로 돌아가기</span>
        </Link>
      </div>

      {/* Game Details Banner */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start justify-between gap-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-indigo-500/5 pointer-events-none"></div>
        
        {/* Game Specs */}
        <div className="flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-4 z-10">
          <div 
            className="w-20 h-28 bg-slate-800 rounded-xl bg-cover bg-center border border-slate-700/50 shadow-md shrink-0"
            style={{ backgroundImage: `url(${game.cover_image_url})` }}
          />
          <div className="pt-1">
            <h1 className="text-xl md:text-2xl font-bold text-white font-outfit">{displayTitle}</h1>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-mono">Original Game: {game.title_en}</p>

          </div>
        </div>

        {/* Anti-cheat status & official download link */}
        {(game.fling_url || (game.anti_cheat && game.anti_cheat !== 'none')) && (
          <div className="z-10 flex flex-col items-center md:items-end justify-center gap-2">
            {game.anti_cheat && game.anti_cheat !== 'none' && (
              <Link
                href={`/${locale}/guides`}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-all duration-200"
              >
                <span>{game.anti_cheat} 우회 가이드</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}

            {game.fling_url && (
              <a
                href={game.fling_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-all duration-200"
              >
                <span>{
                  locale === 'ko' 
                    ? 'FLiNG 공식 다운로드 ↗' 
                    : locale === 'ja' 
                      ? 'FLiNG公式ダウンロード ↗' 
                      : 'FLiNG Official Download ↗'
                }</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Trainer UI Preview — right below title */}
      {selectedTrainer && (
        <TrainerUIPreview 
          game={game}
          trainer={selectedTrainer}
          mappings={mappingsMap[selectedTrainer.id] || []}
          locale={locale}
        />
      )}

      {/* Main Patcher Area */}
      {selectedTrainer ? (
        <div className="space-y-6">
          <DropZone 
            locale={locale} 
            trainer={selectedTrainer} 
            allTrainers={trainers}
            mappingsMap={mappingsMap}
            onTrainerDetected={handleTrainerDetected}
          />

          {/* Quick instructions */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/10 text-xs text-slate-400">
            <h5 className="font-bold text-slate-300 uppercase tracking-wider mb-2">
              {locale === 'ko' ? '작동 가이드 (Quick Help)' : locale === 'ja' ? '操作ガイド (Quick Help)' : 'Quick Help'}
            </h5>
            {locale === 'ja' ? (
              <ul className="space-y-1.5 list-decimal list-inside leading-relaxed text-slate-400">
                <li>対象バージョンに適合する FLiNG のオリジナル実行ファイル(.exe)を用意します。</li>
                <li>用意した実行ファイルを上の点線エリア(ドロップゾーン)にドラッグ＆ドロップします。</li>
                <li>パッチ適用完了後、有効化されたダウンロードボタンをクリックして保存します。</li>
                <li>ダウンロードされた ZIP ファイルはウイルス誤検出およびダウンロード強制削除を防止するため、解凍パスワード <strong className="text-amber-400 font-mono">11111111</strong> が設定されています。解凍後に実行してください。</li>
              </ul>
            ) : locale === 'en' ? (
              <ul className="space-y-1.5 list-decimal list-inside leading-relaxed text-slate-400">
                <li>Prepare the original FLiNG trainer executable (.exe) corresponding to the version.</li>
                <li>Drag & drop the executable into the dotted box (Drop Zone) above.</li>
                <li>Click the download button enabled after successful verification to save the file.</li>
                <li>The downloaded ZIP file is protected with password <strong className="text-amber-400 font-mono">11111111</strong> to prevent immediate antivirus quarantine.</li>
              </ul>
            ) : (
              <ul className="space-y-1.5 list-decimal list-inside leading-relaxed text-slate-400">
                <li>해당 버전에 맞는 FLiNG 원본 실행 파일(.exe)을 준비합니다.</li>
                <li>준비한 실행 파일을 위의 점선 영역(드롭존)에 드래그 앤 드롭합니다.</li>
                <li>해시 검증 및 패치 성공 시 활성화되는 다운로드 버튼을 눌러 저장합니다.</li>
                <li>다운로드된 ZIP 파일은 백신 오진 방지를 위해 비밀번호 <strong className="text-amber-400 font-mono">11111111</strong>이 걸려 있습니다. 압축 해제 후 가동하십시오.</li>
              </ul>
            )}
          </div>

          {/* Supported Trainer Builds */}
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
            
            <h5 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
              지원하는 트레이너 빌드 목록 (Supported Trainer Builds)
            </h5>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider font-mono">
                    <th className="py-3 px-4 font-semibold">빌드 버전 (Build Version)</th>
                    <th className="py-3 px-4 font-semibold">예상 파일 크기 (File Size)</th>
                    <th className="py-3 px-4 font-semibold text-center">치트 옵션 수 (Option Count)</th>
                    <th className="py-3 px-4 font-semibold text-right">상태 (Status)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs">
                  {trainers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/10 transition-colors group">
                      <td className="py-3.5 px-4 font-semibold text-slate-300 group-hover:text-cyan-400 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 font-mono text-[10px] bg-slate-800/40 px-1.5 py-0.5 rounded">ID: {t.id}</span>
                          <span>{t.version_str}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono">
                        {t.original_file_size ? `${(t.original_file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                        {t.option_count ? `${t.option_count}개 치트` : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                          ✅ 자동 감지 가능
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        <div className="py-12 text-center text-slate-500">
          이 게임에 대한 사용 가능한 트레이너 버전이 등록되지 않았습니다.
        </div>
      )}

    </div>
  );
}

interface CheatOption {
  id: string;
  hotkey: string;
  label: string;
  notes: string[];
  isHeader: boolean;
  type: 'toggle' | 'slider' | 'input';
}

function parseMappings(translatedText: string): CheatOption[] {
  const lines = translatedText.split('\n');
  const result: CheatOption[] = [];
  let lastCheat: CheatOption | null = null;

  const hotkeyRegex = /^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*(.*)$/;

  const checkHeader = (line: string): boolean => {
    const headers = [
      '스탯 에디터', 'edit player stats', 'hotkey guide', '단축키 안내', '게임 감지', '게임 실행 중', '경고', '주의'
    ];
    const lower = line.toLowerCase();
    if (headers.some(h => lower.includes(h))) return true;
    if (line.length < 15 && !line.startsWith('*') && !line.startsWith('-')) return true;
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const match = line.match(hotkeyRegex);
    if (match) {
      const hotkey = match[1].trim();
      let label = match[2].trim();
      let notes: string[] = [];

      if (label.includes('**')) {
        const parts = label.split('**');
        label = parts[0].trim();
        const noteText = parts.slice(1).join('**').trim();
        if (noteText) notes.push(noteText);
      }

      // Determine control type
      let type: 'toggle' | 'slider' | 'input' = 'toggle';
      if (/배율|속도|Multiplier|Speed/i.test(label)) {
        type = 'slider';
      } else if (/편집|에디트|수치|Edit|Points|Level/i.test(label)) {
        type = 'input';
      }

      lastCheat = {
        id: `cheat-${i}`,
        hotkey,
        label,
        notes,
        isHeader: false,
        type
      };
      result.push(lastCheat);
    } else {
      if (checkHeader(line)) {
        lastCheat = null;
        result.push({
          id: `header-${i}`,
          hotkey: '',
          label: line,
          notes: [],
          isHeader: true,
          type: 'toggle'
        });
      } else if (lastCheat) {
        // Treat as note for last cheat
        const noteText = line.replace(/^\*\*|^\*|^-/, '').trim();
        if (noteText) lastCheat.notes.push(noteText);
      } else {
        // Fallback to header if no last cheat
        result.push({
          id: `header-${i}`,
          hotkey: '',
          label: line,
          notes: [],
          isHeader: true,
          type: 'toggle'
        });
      }
    }
  }

  return result;
}

interface TrainerUIPreviewProps {
  game: Game;
  trainer: Trainer;
  mappings: Mapping[];
  locale: Locale;
}

function TrainerUIPreview({ game, trainer, mappings, locale }: TrainerUIPreviewProps) {
  if (!mappings || mappings.length === 0) {
    return (
      <div className="mt-8 p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden text-center text-xs text-slate-500">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>
        한글 번역 매핑 정보가 등록되지 않아 트레이너 미리보기를 표시할 수 없습니다.
      </div>
    );
  }

  // Find the cheat list mapping
  const cheatMapping = mappings.find(m => 
    m.translated_text.includes('Num 1') || 
    m.translated_text.includes('Ctrl+Num') ||
    m.translated_text.includes('Alt+Num')
  ) || mappings[0];

  const cheats = cheatMapping ? parseMappings(cheatMapping.translated_text) : [];

  return (
    <div className="mt-8 p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md relative overflow-hidden shadow-[0_0_25px_rgba(6,182,212,0.05)]">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
      
      <h5 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
        {locale === 'ko' ? '한글 번역 치트 옵션 목록 미리보기' : locale === 'ja' ? '翻訳チートオプション一覧プレビュー' : 'Translated Cheat Options Preview'}
      </h5>
      
      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
        {locale === 'ko'
          ? '아래는 한글화 패치 적용 시 트레이너에 표시되는 번역된 치트 옵션 명칭과 단축키 목록입니다. 실제 게임에는 영향을 주지 않으며, 패치 전에 어떤 한글 번역 항목들이 포함되어 있는지 미리 확인하는 용도입니다.'
          : locale === 'ja'
            ? '以下は韓国語パッチ適用時にトレーナーに表示される翻訳されたチートオプション名とホットキーの一覧です。実際のゲームには影響を与えません。'
            : 'Below is a list of translated cheat option names and hotkeys that will appear in the trainer after applying the localization patch. This does not affect the actual game.'
        }
      </p>

      {/* Static Trainer Preview Container */}
      <div className="max-w-2xl mx-auto rounded-xl border border-slate-700/50 bg-[#16181d] shadow-2xl overflow-hidden font-sans text-slate-300 text-sm select-none">
        
        {/* Title Bar */}
        <div className="bg-[#0f1115] px-4 py-2 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="bg-red-600 text-white font-black px-1.5 py-0.5 rounded text-[10px] tracking-tighter select-none font-mono">FLiNG</span>
            <span className="text-xs font-semibold text-slate-400 font-mono truncate max-w-[320px] sm:max-w-[450px]">
              {game.title_en} {trainer.version_str} Trainer - FLiNG
            </span>
          </div>
          <div className="flex items-center space-x-3 text-slate-600 text-xs">
            <span>_</span>
            <span>▢</span>
            <span className="font-bold">✕</span>
          </div>
        </div>

        {/* Header Banner */}
        <div className="relative h-28 bg-[#181a20] overflow-hidden flex items-center px-6 border-b border-slate-800">
          <div className="absolute inset-0 bg-gradient-to-r from-[#16181d] via-[#16181d]/85 to-transparent z-10"></div>
          {/* Game cover background blurred */}
          <div 
            className="absolute right-0 top-0 bottom-0 w-1/2 bg-cover bg-center opacity-30 blur-[1px]"
            style={{ backgroundImage: `url(${game.cover_image_url})` }}
          />
          
          <div className="z-10 py-3">
            <h4 className="text-base sm:text-lg font-bold text-white font-outfit drop-shadow-md">
              {locale === 'ko' ? game.title_ko : game.title_en}
            </h4>
            <p className="text-slate-400 text-xs mt-1 font-mono">{trainer.version_str}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded font-semibold">
                KOREAN EDITION
              </span>
            </div>
          </div>
        </div>

        {/* Cheat Options List (Static, Read-Only) */}
        <div className="p-4 bg-[#14161a] max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full space-y-1">
          {cheats.map((cheat) => {
            if (cheat.isHeader) {
              return (
                <div 
                  key={cheat.id} 
                  className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-3 pb-1 border-b border-slate-800/40 mb-1.5 font-mono first:pt-0"
                >
                  {cheat.label}
                </div>
              );
            }

            return (
              <div 
                key={cheat.id}
                className="flex items-center p-2 rounded border border-transparent bg-[#181a1f]/60 space-x-3"
              >
                {/* Hotkey Badge */}
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border text-slate-400 bg-[#1f232d] border-slate-700 select-none shrink-0 w-[95px] text-center">
                  {cheat.hotkey}
                </span>
                {/* Option Name */}
                <div className="min-w-0">
                  <span className="text-xs block truncate text-slate-300">
                    {cheat.label}
                  </span>
                  {cheat.notes && cheat.notes.length > 0 && (
                    <span className="text-[10px] text-slate-500 block truncate mt-0.5 max-w-[280px] sm:max-w-md">
                      {cheat.notes.join(' ')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bg-[#0f1115] px-4 py-2 border-t border-slate-800 text-center">
          <span className="text-[10px] text-slate-600 font-mono">
            {locale === 'ko' ? `총 ${cheats.filter(c => !c.isHeader).length}개 치트 옵션` : locale === 'ja' ? `合計 ${cheats.filter(c => !c.isHeader).length} チートオプション` : `${cheats.filter(c => !c.isHeader).length} cheat options total`}
          </span>
        </div>

      </div>

      {/* Disclaimer Notice */}
      <p className="mt-4 text-[10px] text-amber-500/70 leading-relaxed text-center">
        {locale === 'ko'
          ? '※ 본 미리보기는 웹상에서 트레이너를 직접 구동시키는 프로그램이 아니며, 패치 후의 번역된 치트 명칭을 확인하기 위한 읽기 전용 목록입니다. 업로드한 원본 파일 버전에 따라 실제 제공되는 치트 옵션의 종류와 단축키 정보는 다를 수 있습니다.'
          : locale === 'ja'
            ? '※ 本プレビューはウェブ上でトレーナーを直接駆動させるプログラムではなく、パッチ後の翻訳されたチート名を確認するための読み取り専用リストです。アップロードした元のファイルのバージョンによって実際のチートオプションが異なる場合があります。'
            : '* This preview is not a functioning web trainer. It is a read-only list to verify translated cheat option names after patching. Actual cheat options and hotkeys vary depending on the original file version uploaded.'
        }
      </p>
    </div>
  );
}
