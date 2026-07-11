'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, Info, Download } from 'lucide-react';
import { Locale, getDictionary } from '@/lib/i18n';
import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js';
import { supabase } from '@/lib/supabase';
import { trackAnalyticsEvent } from '@/lib/analytics';

interface DropZoneProps {
  locale: Locale;
  gameId: number;
  gameSlug?: string;
  gameTitle?: string;
  trainer: {
    id: number;
    version_str: string;
    original_file_hash: string;
    original_file_size: number;
  };
  allTrainers: Array<{
    id: number;
    version_str: string;
    original_file_hash: string;
    original_file_size: number;
  }>;
  mappingsMap: Record<number, Array<{
    offset_dec: number;
    encoding: 'UTF-16LE' | 'ASCII' | 'UTF-8';
    original_text: string;
    translated_text: string;
    max_char_len: number;
  }>>;
  onTrainerDetected: (trainerId: number) => void;
}
const adBlockTexts = {
  ko: {
    title: '💚 따뜻한 후원의 클릭 한 번 부탁드립니다!',
    message: '안녕하세요, LocalPatcher 개발자입니다. 저희 사이트는 유저님의 <span class="text-cyan-400 font-bold">어떠한 개인정보나 파일도 서버에 전송/수집하지 않고</span>, 브라우저 로컬에서 안전하게 번역을 진행하는 착한 무료 웹 도구입니다. 730여 개 패키지 게임의 번역 사전 데이터베이스를 무료로 유지하기 위해 <span class="text-cyan-400 font-bold">다운로드 시 딱 한 번만 실행되는 광고</span> 하나만 아주 조심스레 운영하고 있습니다. 괜찮으시다면 <span class="text-cyan-400 font-bold">광고 차단(AdBlock)을 잠시 꺼주시고</span> 아래의 새로고침을 통해 기부에 동참해 주시겠어요? 유저님의 <span class="text-cyan-400 font-bold">따뜻한 클릭 한 번</span>이 서버 유지에 큰 보탬이 됩니다. 늘 진심으로 감사드립니다!',
    primaryBtn: '광고 허용 후 새로고침하기 (감사합니다! 💚)',
    secondaryBtn: '광고 차단을 유지한 채 그냥 다운로드받기',
  },
  ja: {
    title: '💚 温かい応援のクリックをお願いいたします！',
    message: 'こんにちは、LocalPatcherの開発者です。当サイトはユーザー様の<span class="text-cyan-400 font-bold">個人情報やファイルを一切サーバーに送信・収集せず</span>、ブラウザのローカル環境で安全に翻訳を行う無料のウェブツールです。730タイトル以上のゲーム翻訳データベースを無料で維持するため、<span class="text-cyan-400 font-bold">ダウンロード時に一度だけ表示される広告</span>のみを慎重に運営しております。もしよろしければ、<span class="text-cyan-400 font-bold">広告ブロック(AdBlock)を一時的に無効化し</span>、リロードしてご協力いただけないでしょうか？皆様の<span class="text-cyan-400 font-bold">温かいクリック</span>がサーバー維持に大きな力となります。いつも心より感謝申し上げます！',
    primaryBtn: '広告を許可してリロードする (ありがとうございます！ 💚)',
    secondaryBtn: '広告ブロックを維持したままダウンロード',
  },
  en: {
    title: '💚 Support us with a simple click!',
    message: 'Hello, this is the developer of LocalPatcher. Our site is a free web tool that localizes trainers completely in your local browser <span class="text-cyan-400 font-bold">without uploading any of your files or personal data to servers</span>. In order to maintain the database for over 730 games for free, we <span class="text-cyan-400 font-bold">only run a single download ad</span>. If you don\'t mind, could you please <span class="text-cyan-400 font-bold">temporarily disable your ad blocker (AdBlock)</span> and refresh the page to support us? <span class="text-cyan-400 font-bold">Your kind click</span> goes a long way in covering our hosting costs. Thank you so much for your support!',
    primaryBtn: 'Disable AdBlock & Refresh (Thank you! 💚)',
    secondaryBtn: 'Keep AdBlock active and download anyway',
  }
};

export default function DropZone({ locale, gameId, gameSlug, gameTitle, trainer, allTrainers, mappingsMap, onTrainerDetected }: DropZoneProps) {
  const t = getDictionary(locale);
  const adText = adBlockTexts[locale] || adBlockTexts.en;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragActive, setIsDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'packaging' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [fileName, setFileName] = useState('');
  const [bypassCheck, setBypassCheck] = useState(false);
  const [patchedFileUrl, setPatchedFileUrl] = useState<string | null>(null);
  const [patchedFileName, setPatchedFileName] = useState('');
  const [isAdBlockActive, setIsAdBlockActive] = useState(false);

  useEffect(() => {
    const detectAdBlock = () => {
      // Create a dummy bait element with common ad classes that ad blockers target
      const bait = document.createElement('div');
      // Common class names targeted by AdBlock lists like EasyList
      bait.className = 'pub_300x250 pub_300x250m pub_728x90 text-ad ad-text ad-banner ad-link adsbox';
      bait.setAttribute(
        'style',
        'width: 1px !important; height: 1px !important; position: absolute !important; left: -10000px !important; top: -10000px !important;'
      );
      
      try {
        document.body.appendChild(bait);
        
        // Wait a tiny delay (100ms) to allow the ad blocker's stylesheet hiding injection to trigger
        setTimeout(() => {
          const styles = window.getComputedStyle(bait);
          const isBlocked =
            styles.getPropertyValue('display') === 'none' ||
            styles.getPropertyValue('visibility') === 'hidden' ||
            bait.offsetHeight === 0 ||
            bait.offsetWidth === 0 ||
            bait.clientHeight === 0;
            
          setIsAdBlockActive(isBlocked);
          if (isBlocked) trackAnalyticsEvent('adblock_detected', { adblock: 'detected' });
          
          if (document.body.contains(bait)) {
            document.body.removeChild(bait);
          }
        }, 100);
      } catch (err) {
        console.error('AdBlock detection failed:', err);
        // Fallback to true if appending element throws an error (usually indicates strict sandboxing/adblock)
        setIsAdBlockActive(true);
        trackAnalyticsEvent('adblock_detected', { adblock: 'detected' });
      }
    };

    if (document.readyState === 'complete') {
      detectAdBlock();
    } else {
      window.addEventListener('load', detectAdBlock);
      return () => window.removeEventListener('load', detectAdBlock);
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'packaging') {
      setProgress(0);
      const duration = 5000; // 5초
      const intervalTime = 50; // 50ms마다
      const step = (intervalTime / duration) * 100;
      
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setStatus('success');
            return 100;
          }
          return Math.min(prev + step, 100);
        });
      }, intervalTime);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  useEffect(() => {
    if (status === 'packaging') {
      try {
        const adsbygoogle = (window as any).adsbygoogle;
        if (adsbygoogle) {
          adsbygoogle.push({});
        }
      } catch (e) {
        console.error('AdSense push error in packaging:', e);
      }
    }
  }, [status]);

  // Calculate SHA-256 of file buffer
  const calculateSHA256 = async (buffer: ArrayBuffer): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Perform binary patch process
  const processFile = async (file: File) => {
    setStatus('processing');
    setErrorMsg('');
    setFileName(file.name);

    try {
      // 1. File Size Verification (Max 15MB size limit)
      if (file.size > 15 * 1024 * 1024) {
        throw new Error('파일 크기가 최대 제한 용량(15MB)을 초과합니다.');
      }

      const buffer = await file.arrayBuffer();

      // PE Header Parsing & Executable Code Protection
      let textSectionOffset = 0;
      let textSectionSize = 0;
      let isPE = false;

      if (buffer.byteLength >= 64) {
        const dosHeader = new DataView(buffer);
        if (dosHeader.getUint16(0, true) === 0x5A4D) { // 'MZ'
          const peHeaderOffset = dosHeader.getUint32(0x3C, true);
          if (peHeaderOffset + 24 <= buffer.byteLength) {
            if (dosHeader.getUint32(peHeaderOffset, true) === 0x00004550) { // 'PE\0\0'
              isPE = true;
              const numSections = dosHeader.getUint16(peHeaderOffset + 6, true);
              const sizeOfOptionalHeader = dosHeader.getUint16(peHeaderOffset + 20, true);
              const sectionTableOffset = peHeaderOffset + 24 + sizeOfOptionalHeader;
              if (sectionTableOffset + numSections * 40 <= buffer.byteLength) {
                const uint8View = new Uint8Array(buffer);
                for (let i = 0; i < numSections; i++) {
                  const offset = sectionTableOffset + i * 40;
                  let name = '';
                  for (let j = 0; j < 8; j++) {
                    const charCode = uint8View[offset + j];
                    if (charCode === 0) break;
                    name += String.fromCharCode(charCode);
                  }
                  if (name === '.text') {
                    textSectionSize = dosHeader.getUint32(offset + 16, true);
                    textSectionOffset = dosHeader.getUint32(offset + 20, true);
                    break;
                  }
                }
              }
            }
          }
        }
      }

      let activeMappings = mappingsMap[trainer.id] || [];

      // If bypassCheck is false, enforce PE validity and protect executable code section
      if (!bypassCheck) {
        if (!isPE) {
          console.warn('Uploaded file is not a valid PE executable.');
          throw new Error('올바른 정식 원본 트레이너 파일이 아닙니다. 버전에 맞는 FLiNG 원본 실행 파일을 올려주십시오.');
        }

        // 1. Check if the uploaded file's size matches the currently selected trainer.original_file_size
        if (file.size !== trainer.original_file_size) {
          console.warn(`File size mismatch. Expected: ${trainer.original_file_size} bytes, Got: ${file.size} bytes`);
          
          // Search the allTrainers array to find a trainer t whose original_file_size matches file.size
          const sizeMatchingTrainers = allTrainers.filter(t => t.original_file_size === file.size);
          if (sizeMatchingTrainers.length > 0) {
            const fileHash = await calculateSHA256(buffer);
            const matchingTrainer = sizeMatchingTrainers.find(t => t.original_file_hash === fileHash);
            if (matchingTrainer) {
              console.log(`Auto-detected matching version: ${matchingTrainer.version_str} (ID: ${matchingTrainer.id})`);
              onTrainerDetected(matchingTrainer.id);
              activeMappings = mappingsMap[matchingTrainer.id] || [];
            } else {
              console.warn(`No trainer version matches file hash ${fileHash}.`);
              throw new Error('올바른 정식 원본 트레이너 파일이 아닙니다. 버전에 맞는 FLiNG 원본 실행 파일을 올려주십시오.');
            }
          } else {
            console.warn(`No trainer version matches file size ${file.size} bytes.`);
            throw new Error('올바른 정식 원본 트레이너 파일이 아닙니다. 버전에 맞는 FLiNG 원본 실행 파일을 올려주십시오.');
          }
        } else {
          // File size matches the currently selected trainer
          const fileHash = await calculateSHA256(buffer);
          if (fileHash !== trainer.original_file_hash) {
            console.warn(`Hash mismatch with selected trainer. Expected: ${trainer.original_file_hash}, Got: ${fileHash}. Checking other versions...`);
            
            // Check if another version matches before throwing the error
            const otherTrainer = allTrainers.find(t => t.original_file_size === file.size && t.original_file_hash === fileHash);
            if (otherTrainer) {
              console.log(`Auto-detected matching version: ${otherTrainer.version_str} (ID: ${otherTrainer.id})`);
              onTrainerDetected(otherTrainer.id);
              activeMappings = mappingsMap[otherTrainer.id] || [];
            } else {
              console.warn(`No trainer version matches file size and hash.`);
              throw new Error('올바른 정식 원본 트레이너 파일이 아닙니다. 버전에 맞는 FLiNG 원본 실행 파일을 올려주십시오.');
            }
          } else {
            // Perfect match with currently selected trainer
            activeMappings = mappingsMap[trainer.id] || [];
          }
        }
      }

      // PE Header Executable Code Protection: Block patch if any mapping offset falls within the .text section
      if (isPE && textSectionSize > 0) {
        for (const mapping of activeMappings) {
          const { offset_dec } = mapping;
          if (offset_dec >= textSectionOffset && offset_dec < textSectionOffset + textSectionSize) {
            console.warn(`Blocked attempt to patch executable code in .text section at offset: ${offset_dec} (range: [${textSectionOffset}, ${textSectionOffset + textSectionSize}))`);
            throw new Error('올바른 정식 원본 트레이너 파일이 아닙니다. 버전에 맞는 FLiNG 원본 실행 파일을 올려주십시오.');
          }
        }
      }

      // 4. Overwrite text bytes at offset locations
      const bytes = new Uint8Array(buffer);

      for (const mapping of activeMappings) {
        const { offset_dec, encoding, original_text, translated_text, max_char_len } = mapping;

        // Perform automatic line-by-line length synchronization if multiline text is detected
        let processedText = translated_text;
        if (original_text.includes('\n')) {
          const originalLines = original_text.split('\n');
          const translatedLines = translated_text.split('\n');
          const paddedLines: string[] = [];

          const encoder = new TextEncoder();

          for (let i = 0; i < originalLines.length; i++) {
            const origLine = originalLines[i];
            const transLine = i < translatedLines.length ? translatedLines[i] : '';

            if (encoding === 'UTF-16LE') {
              // UTF-16LE: 1 char = 2 bytes consistently. Character count padding is safe.
              const origLen = origLine.length;
              const transLen = transLine.length;
              if (transLen > origLen) {
                paddedLines.push(transLine.slice(0, origLen));
              } else {
                paddedLines.push(transLine + ' '.repeat(origLen - transLen));
              }
            } else {
              // UTF-8 / ASCII: Measure byte lengths
              const origByteLen = encoder.encode(origLine).length;
              
              // Calculate how much text we can fit
              let fitText = "";
              let currentByteLen = 0;
              for (const char of transLine) {
                const charByteLen = encoder.encode(char).length;
                if (currentByteLen + charByteLen <= origByteLen) {
                  fitText += char;
                  currentByteLen += charByteLen;
                } else {
                  break; // Stop to prevent memory overflow
                }
              }
              
              // Pad remaining bytes with spaces
              const paddingSpaces = ' '.repeat(origByteLen - currentByteLen);
              paddedLines.push(fitText + paddingSpaces);
            }
          }
          processedText = paddedLines.join('\n');
        }

        let patchBytes: Uint8Array;

        if (encoding === 'UTF-16LE') {
          // UTF-16LE uses 2 bytes per character
          patchBytes = new Uint8Array(max_char_len * 2);
          
          // Pre-fill with spaces (0x0020)
          for (let i = 0; i < max_char_len; i++) {
            patchBytes[i * 2] = 0x20;
            patchBytes[i * 2 + 1] = 0x00;
          }

          // Copy characters
          for (let i = 0; i < processedText.length && i < max_char_len; i++) {
            const charCode = processedText.charCodeAt(i);
            patchBytes[i * 2] = charCode & 0xFF;
            patchBytes[i * 2 + 1] = (charCode >> 8) & 0xFF;
          }

          // Add Null terminator
          if (processedText.length < max_char_len) {
            const termIndex = processedText.length;
            patchBytes[termIndex * 2] = 0x00;
            patchBytes[termIndex * 2 + 1] = 0x00;
          }

        } else {
          // ASCII / UTF-8 fallback
          patchBytes = new Uint8Array(max_char_len);
          
          // Pre-fill with spaces (0x20)
          patchBytes.fill(0x20);

          // Copy characters
          const encoder = new TextEncoder();
          const encoded = encoder.encode(processedText);
          
          for (let i = 0; i < encoded.length && i < max_char_len; i++) {
            patchBytes[i] = encoded[i];
          }

          // Add Null terminator
          if (encoded.length < max_char_len) {
            const termIndex = encoded.length;
            patchBytes[termIndex] = 0x00;
          }
        }

        // Apply overwrite to the original buffer
        bytes.set(patchBytes, offset_dec);
      }

      // 5. Package the patched executable into a password-protected ZIP archive to bypass Defender quarantine
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
      
      const suffix = locale === 'ko' ? '_KOR' : locale === 'ja' ? '_JPN' : '_patched';
      const exeName = file.name.replace(/\.exe$/i, `${suffix}.exe`);
      const exeBlob = new Blob([bytes], { type: 'application/octet-stream' });
      
      // Add the patched .exe bytes to the ZIP with the password
      await zipWriter.add(exeName, new BlobReader(exeBlob), {
        password: "11111111",
        zipCrypto: true // PKWare ZipCrypto for native Windows Explorer compatibility
      });
      
      // Generate the ZIP blob client-side
      const zippedContent = await zipWriter.close();
      const downloadUrl = URL.createObjectURL(zippedContent);
      const targetZipName = file.name.replace(/\.exe$/i, `${suffix}.zip`);

      setPatchedFileUrl(downloadUrl);
      setPatchedFileName(targetZipName);
      setStatus('packaging');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || '파일 패치 중 알 수 없는 에러가 발생했습니다.');
    }
  };

  const handleReset = () => {
    if (patchedFileUrl) {
      URL.revokeObjectURL(patchedFileUrl);
    }
    setPatchedFileUrl(null);
    setPatchedFileName('');
    setStatus('idle');
  };

  const handleDownloadClick = async () => {
    const analyticsContext = {
      game_id: gameId,
      trainer_id: trainer.id,
      locale,
      game_slug: gameSlug || '',
      game_title: gameTitle || '',
      trainer_version: trainer.version_str,
      source_page: 'patcher',
    };

    trackAnalyticsEvent('download_started', analyticsContext);
    try {
      const adUrl = process.env.NEXT_PUBLIC_AD_GATE_URL || "https://www.effectivecpmnetwork.com/idhbg4vm?key=33b748a68cf17f28c5cf24a5aabfb561";
      try {
        const adWindow = window.open(adUrl, '_blank');
        if (adWindow) {
          trackAnalyticsEvent('ad_gate_opened', { ...analyticsContext, ad_gate: 'opened' });
          adWindow.blur();
          window.focus();
        } else {
          trackAnalyticsEvent('popup_blocked', { ...analyticsContext, ad_gate: 'blocked' });
        }
      } catch (popupErr) {
        trackAnalyticsEvent('popup_blocked', { ...analyticsContext, ad_gate: 'blocked', reason: 'exception' });
        console.warn('Ad pop-up blocked or failed.', popupErr);
      }

      // Increment download count in Supabase asynchronously using RPC
      if (supabase && gameId) {
        console.log(`Incrementing download count for game ID: ${gameId}`);
        const { error } = await supabase.rpc('increment_game_download', { game_id: gameId });
        if (error) {
          console.error('Failed to increment download count:', error);
        }
      }
    } catch (err) {
      console.warn('Ad pop-up/analytics increment error.', err);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* Drop Zone Box */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed p-8 md:p-12 flex flex-col items-center justify-center text-center group transition-all duration-300 overflow-hidden ${
          isDragActive
            ? 'border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)] bg-cyan-950/30 scale-[1.02] duration-300 animate-pulse'
            : 'border-slate-800 bg-slate-900/10 hover:border-cyan-500/50 hover:bg-slate-900/20'
        } ${status === 'processing' ? 'pointer-events-none' : ''}`}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

        {/* Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".exe"
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Status display */}
        {status === 'idle' && (
          <>
            <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:border-cyan-500/50 transition-all duration-300 shadow-md">
              <UploadCloud className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-200 mt-5 group-hover:text-cyan-400 transition-colors">
              {t.dropzoneTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-2">
              {t.dropzoneSub}
            </p>
            <button
              onClick={triggerFileSelect}
              className="mt-6 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-xs font-bold text-slate-950 shadow-md transition-all active:scale-95"
            >
              {t.dropzoneSelectBtn}
            </button>
          </>
        )}

        {status === 'processing' && (
          <div className="flex flex-col items-center py-4">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <h3 className="text-sm font-semibold text-slate-300 mt-4">{t.patcherProcessing}</h3>
          </div>
        )}

        {status === 'packaging' && (
          <div className="flex flex-col items-center py-6 w-full max-w-sm">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <h3 className="text-sm font-semibold text-slate-300 mt-4">
              {locale === 'ko' ? '보안 패키징 진행 중...' : locale === 'ja' ? 'セキュリティパッケージ進行中...' : 'Securing and packaging file...'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {locale === 'ko' ? '백신 오진 우회를 위한 보안 압축이 진행 중입니다.' : locale === 'ja' ? 'ワクチン誤検知回避のための暗号化圧縮を行っています。' : 'Applying security compression to bypass antivirus false-positives.'}
            </p>
            
            {/* 프로그레스 바 */}
            <div className="w-full bg-slate-950 rounded-full h-2.5 mt-5 overflow-hidden border border-slate-800">
              <div 
                className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2.5 rounded-full transition-all duration-75 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-cyan-400 mt-1.5 font-mono font-bold">{Math.round(progress)}%</span>
            
            {/* 광고 슬롯 (배너 노출 영역) */}
            <div className="w-full mt-6 p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col items-center justify-center min-h-[100px] relative overflow-hidden">
              <span className="absolute top-1 right-2 text-[8px] text-slate-600 font-mono tracking-widest font-bold">ADVERTISEMENT</span>
              
              <ins className="adsbygoogle"
                   style={{ display: 'block', width: '100%', height: '90px' }}
                   data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_ID || "ca-pub-XXXXXXXXXX"}
                   data-ad-slot="XXXXXXXXXX"
                   data-ad-format="horizontal"
                   data-full-width-responsive="true"></ins>
              
              <div className="text-[9px] text-slate-500 text-center pointer-events-none z-10 mt-1">
                {locale === 'ko' ? '추천 스폰서 광고' : locale === 'ja' ? 'おすすめのスポンサー広告' : 'Sponsored Ad'}
              </div>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center py-4 w-full">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-emerald-400 mt-4">PATCH SUCCESS</h3>
            <p className="text-xs text-slate-400 mt-2 max-w-sm">
              {t.patcherSuccess}
            </p>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">File: {fileName}</p>
            <p className="text-[10px] text-cyan-400 mt-1 font-semibold">감지된 버전: {trainer.version_str}</p>
            
            {/* 광고 차단 여부와 관계없이 다운로드는 항상 제공합니다. */}
            {isAdBlockActive ? (
              <div className="mt-6 border-emerald-500/20 bg-slate-900/40 p-5 rounded-2xl border text-left max-w-sm w-full space-y-4">
                <div className="text-sm font-semibold text-emerald-400 flex items-center space-x-1.5">
                  <span>{adText.title}</span>
                </div>
                <p 
                  className="text-xs text-slate-300 leading-relaxed whitespace-pre-line"
                  dangerouslySetInnerHTML={{ __html: adText.message }}
                />
                <div className="flex flex-col space-y-2 pt-2">
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 text-center"
                  >
                    {adText.primaryBtn}
                  </button>
                  <a
                    href={patchedFileUrl || '#'}
                    download={patchedFileName}
                    onClick={handleDownloadClick}
                    className="w-full px-4 py-2.5 rounded-xl border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 font-bold text-xs transition-all text-center"
                  >
                    {adText.secondaryBtn}
                  </a>
                </div>
              </div>
            ) : (
              <a
                href={patchedFileUrl || '#'}
                download={patchedFileName}
                onClick={handleDownloadClick}
                className="mt-6 w-full max-w-xs px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/25 flex items-center justify-center space-x-2 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200"
              >
                <Download className="w-4 h-4 text-slate-950" />
                <span>
                  {locale === 'ko'
                    ? '한글화 패치 파일 다운로드'
                    : locale === 'ja'
                      ? '日本語化パッチのダウンロード'
                      : 'Download Localized Trainer'}
                </span>
              </a>
            )}

            <p className="mt-3 max-w-sm text-center text-[10px] leading-relaxed text-slate-500">
              {locale === 'ko'
                ? '다운로드를 시작하면 서비스 운영을 위한 광고 페이지가 새 탭에서 열릴 수 있습니다. 광고 차단 여부와 관계없이 파일 다운로드는 계속됩니다. '
                : locale === 'ja'
                  ? 'ダウンロード開始時に、サービス運営のための広告ページが新しいタブで開く場合があります。広告ブロックの有無にかかわらず、ファイルのダウンロードは続行されます。 '
                  : 'Starting the download may open a new tab with an advertisement that supports the service. Your file download continues whether or not an ad blocker is active. '}
              <Link href={`/${locale}/privacy`} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
                {locale === 'ko' ? '개인정보처리방침' : locale === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}
              </Link>
            </p>

            {/* Password Notice */}
            <div className="mt-4 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-left max-w-xs w-full">
              <p className="text-[11px] font-semibold text-amber-400 flex items-center justify-center space-x-1">
                <Info className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                <span>
                  {locale === 'ko'
                    ? '압축 해제 비밀번호: 11111111'
                    : locale === 'ja'
                      ? '解凍パスワード: 11111111'
                      : 'Extraction Password: 11111111'}
                </span>
              </p>
              <p className="text-[9px] text-slate-400 mt-1 leading-normal text-center">
                {locale === 'ko'
                  ? '백신(Windows Defender)의 실시간 다운로드 삭제 및 오진을 우회하기 위해 비밀번호가 걸려 있습니다.'
                  : locale === 'ja'
                    ? 'ワクチンの強制削除を回避するため、暗号化されています。'
                    : 'Encrypted to prevent immediate Windows Defender delete/quarantine.'}
              </p>
            </div>

            <button
              onClick={handleReset}
              className="mt-4 text-[11px] text-slate-500 hover:text-slate-300 underline transition-colors"
            >
              다른 파일 패치하기
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-2">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-rose-400 mt-4">PATCH FAILED</h3>
            <p className="text-xs text-slate-300 mt-2 max-w-md bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 text-left leading-relaxed">
              {errorMsg}
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-6 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
            >
              재시도하기
            </button>
          </div>
        )}
      </div>

      {/* Developer Mode Bypass Checkbox */}
      {process.env.NODE_ENV === 'development' && (
        <div className="flex items-center justify-end space-x-2 px-1">
          <label className="flex items-center space-x-2 text-[10px] text-slate-500 hover:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bypassCheck}
              onChange={(e) => setBypassCheck(e.target.checked)}
              className="rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer"
            />
            <span className="flex items-center">
              <Info className="w-3 h-3 mr-1 text-slate-500" />
              개발자 테스트용 무결성 검증 우회 (Force Patch)
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
