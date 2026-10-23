'use client';

import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, Info, Download } from 'lucide-react';
import { Locale, getPatcherDict, getLocaleSuffix } from '@/lib/i18n/index';
import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js';
import { supabase } from '@/lib/supabase';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { patchTrainerBinary } from '@/lib/trainer-binary-patch';

interface DropZoneProps {
  locale: Locale;
  gameId: number;
  gameSlug?: string;
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

type PatchFailureReason = 'invalid_type' | 'file_too_large' | 'not_pe' | 'unsupported_version' | 'processing_error';

/** 사용자 파일의 실제 내용은 노출하지 않고, 퍼널 분석에 필요한 실패 유형만 전달합니다. */
class PatchFailureError extends Error {
  constructor(public readonly reason: PatchFailureReason, message: string) {
    super(message);
    this.name = 'PatchFailureError';
  }
}
export default function DropZone({ locale, gameId, gameSlug, trainer, allTrainers, mappingsMap, onTrainerDetected }: DropZoneProps) {
  const pt = getPatcherDict(locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragActive, setIsDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'packaging' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [fileName, setFileName] = useState('');
  const [bypassCheck, setBypassCheck] = useState(false);
  const [patchedFileUrl, setPatchedFileUrl] = useState<string | null>(null);
  const [patchedFileName, setPatchedFileName] = useState('');
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const urlRef = useRef<string | null>(null);

  const clearArtifact = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPatchedFileUrl(null);
    setPatchedFileName('');
  };
  // 퍼널 비교를 위해 첫 시도만 집계합니다. 성공/실패 재시도 횟수는 별도 지표에 섞지 않습니다.
  const fileSelectionAttemptTrackedRef = useRef(false);
  const fileSelectedTrackedRef = useRef(false);
  const patchFailedTrackedRef = useRef(false);
  const patchCompletedTrackedRef = useRef(false);

  const analyticsContext = {
    game_id: gameId,
    trainer_id: trainer.id,
    locale,
    game_slug: gameSlug || '',
    trainer_version: trainer.version_str,
    source_page: 'patcher',
  };

  // 해제된 화면과 이전 작업은 URL·상태·분석 이벤트를 확정할 수 없습니다.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      busyRef.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  // Calculate SHA-256 of file buffer
  const calculateSHA256 = async (buffer: ArrayBuffer): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Perform binary patch process
  const processFile = async (file: File, inputMethod: 'drag_and_drop' | 'file_picker') => {
    if (busyRef.current || !mountedRef.current) return;
    busyRef.current = true;
    const generation = ++generationRef.current;
    const isCurrent = () => mountedRef.current && generationRef.current === generation;
    clearArtifact();
    setProgress(0);
    if (!fileSelectionAttemptTrackedRef.current) {
      fileSelectionAttemptTrackedRef.current = true;
      trackAnalyticsEvent('file_selection_attempted', {
        ...analyticsContext,
        input_method: inputMethod,
      });
    }
    setStatus('processing');
    setErrorMsg('');
    setFileName(file.name);

    try {
      // 1. File Size Verification (Max 15MB size limit)
      if (file.size > 15 * 1024 * 1024) {
        throw new PatchFailureError('file_too_large', pt.errFileTooLarge);
      }

      if (!file.name.toLowerCase().endsWith('.exe') || file.size < 64) {
        throw new PatchFailureError('invalid_type', pt.errInvalidType);
      }

      if (!fileSelectedTrackedRef.current && !patchFailedTrackedRef.current) {
        fileSelectedTrackedRef.current = true;
        trackAnalyticsEvent('file_selected', {
          ...analyticsContext,
          input_method: 'file_or_drop',
          file_size: file.size,
        });
      }

      const buffer = await file.arrayBuffer();

      if (!isCurrent()) return;
      let activeMappings = mappingsMap[trainer.id] || [];
      let detectedTrainerId = trainer.id;
      if (!bypassCheck) {
        const fileHash = await calculateSHA256(buffer);
        if (!isCurrent()) return;
        // 같은 크기의 다른 버전도 반드시 해시까지 일치하는 매핑을 선택합니다.
        const matchingTrainer = [trainer, ...allTrainers].find(candidate =>
          candidate.original_file_size === file.size && candidate.original_file_hash === fileHash);
        if (!matchingTrainer) throw new PatchFailureError('unsupported_version', pt.errNotPe);
        detectedTrainerId = matchingTrainer.id;
        activeMappings = mappingsMap[matchingTrainer.id] || [];
      }

      // 개발자 일치 검사 우회도 PE·인코딩·슬롯 보호는 우회하지 않습니다.
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = patchTrainerBinary(buffer, activeMappings);
      } catch {
        throw new PatchFailureError('not_pe', pt.errNotPe);
      }
      if (!isCurrent()) return;
      setStatus('packaging');
      setProgress(0);

      // 검증된 별도 복제본만 ZIP으로 포장합니다.
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
      
      const suffix = getLocaleSuffix(locale);
      const exeName = file.name.replace(/\.exe$/i, `${suffix}.exe`);
      const exeBlob = new Blob([bytes], { type: 'application/octet-stream' });
      
      // Add the patched .exe bytes to the ZIP with the password
      await zipWriter.add(exeName, new BlobReader(exeBlob), {
        password: "11111111",
        zipCrypto: true // PKWare ZipCrypto for native Windows Explorer compatibility
      });
      
      // Generate the ZIP blob client-side
      const zippedContent = await zipWriter.close();
      if (!isCurrent()) return;
      const downloadUrl = URL.createObjectURL(zippedContent);
      const targetZipName = file.name.replace(/\.exe$/i, `${suffix}.zip`);

      urlRef.current = downloadUrl;
      setPatchedFileUrl(downloadUrl);
      setPatchedFileName(targetZipName);
      if (!patchCompletedTrackedRef.current && !patchFailedTrackedRef.current) {
        patchCompletedTrackedRef.current = true;
        trackAnalyticsEvent('patch_completed', analyticsContext);
      }
      setProgress(100);
      setStatus('success');
      if (detectedTrainerId !== trainer.id) onTrainerDetected(detectedTrainerId);
    } catch (err: unknown) {
      if (!isCurrent()) return;
      clearArtifact();
      const reason = err instanceof PatchFailureError ? err.reason : 'processing_error';
      if (!patchFailedTrackedRef.current && !patchCompletedTrackedRef.current) {
        patchFailedTrackedRef.current = true;
        trackAnalyticsEvent('patch_failed', {
          ...analyticsContext,
          patch_failure_reason: reason,
        });
      }
      setStatus('error');
      setErrorMsg(err instanceof PatchFailureError ? err.message : pt.errUnknown);
    } finally {
      if (isCurrent()) busyRef.current = false;
    }
  };

  const handleReset = () => {
    generationRef.current++;
    busyRef.current = false;
    clearArtifact();
    setStatus('idle');
    setProgress(0);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadClick = async () => {
    trackAnalyticsEvent('download_started', analyticsContext);
    try {
      // Increment download count in Supabase asynchronously using RPC
      if (supabase && gameId) {
        console.log(`Incrementing download count for game ID: ${gameId}`);
        const { error } = await supabase.rpc('increment_game_download', { game_id: gameId });
        if (error) {
          console.error('Failed to increment download count:', error);
        }
      }
    } catch (err) {
      console.warn('Download analytics increment error.', err);
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
      await processFile(e.dataTransfer.files[0], 'drag_and_drop');
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0], 'file_picker');
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
              {pt.dropzoneTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-2">
              {pt.dropzoneSub}
            </p>
            <button
              onClick={triggerFileSelect}
              className="mt-6 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-xs font-bold text-slate-950 shadow-md transition-all active:scale-95"
            >
              {pt.dropzoneSelectBtn}
            </button>
          </>
        )}

        {status === 'processing' && (
          <div className="flex flex-col items-center py-4">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <h3 className="text-sm font-semibold text-slate-300 mt-4">{pt.patcherProcessing}</h3>
          </div>
        )}

        {status === 'packaging' && (
          <div className="flex flex-col items-center py-6 w-full max-w-sm">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <h3 className="text-sm font-semibold text-slate-300 mt-4">
              {pt.securingPackagingTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {pt.securingPackagingSub}
            </p>
            
            {/* 프로그레스 바 */}
            <div className="w-full bg-slate-950 rounded-full h-2.5 mt-5 overflow-hidden border border-slate-800">
              <div 
                className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2.5 rounded-full transition-all duration-75 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-cyan-400 mt-1.5 font-mono font-bold">{Math.round(progress)}%</span>
            
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center py-4 w-full">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-emerald-400 mt-4">PATCH SUCCESS</h3>
            <p className="text-xs text-slate-400 mt-2 max-w-sm">
              {pt.patcherSuccess}
            </p>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">File: {fileName}</p>
            <p className="text-[10px] text-cyan-400 mt-1 font-semibold">{pt.detectedVersionLabel}: {trainer.version_str}</p>
            
            <a
                href={patchedFileUrl || '#'}
                download={patchedFileName}
                onClick={handleDownloadClick}
                className="mt-6 w-full max-w-xs px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/25 flex items-center justify-center space-x-2 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200"
              >
                <Download className="w-4 h-4 text-slate-950" />
                <span>{pt.downloadPatchedFile}</span>
              </a>

            {/* Password Notice */}
            <div className="mt-4 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-left max-w-xs w-full">
              <p className="text-[11px] font-semibold text-amber-400 flex items-center justify-center space-x-1">
                <Info className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                <span>{pt.extractionPasswordNotice}</span>
              </p>
              <p className="text-[9px] text-slate-400 mt-1 leading-normal text-center">
                {pt.extractionSecurityNotice}
              </p>
            </div>

            <button
              onClick={handleReset}
              className="mt-4 text-[11px] text-slate-500 hover:text-slate-300 underline transition-colors"
            >
              {pt.patchAnotherFileBtn}
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-2">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-rose-400 mt-4">{pt.patchFailedHeading}</h3>
            <p className="text-xs text-slate-300 mt-2 max-w-md bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 text-left leading-relaxed">
              {errorMsg}
            </p>
            <button
              onClick={handleReset}
              className="mt-6 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
            >
              {pt.retryBtnText}
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
              개발자 테스트용 파일 일치 검사 건너뛰기
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
