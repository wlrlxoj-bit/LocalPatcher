import React from 'react';
import { ShieldAlert, BookOpen, Key, AlertTriangle } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';

export default async function GuidesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';
  const t = getDictionary(currentLocale);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      
      {/* Page Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-950/40 text-xs font-semibold text-indigo-400 mb-4 tracking-wide glow-cyan">
          <BookOpen className="w-3.5 h-3.5" />
          <span>공식 세이프 게임 가이드</span>
        </div>
        <h1 className="font-bold text-3xl md:text-4xl tracking-tight mb-3 text-white font-outfit">
          {t.guideHeader}
        </h1>
        <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
          {t.guideSub}
        </p>
      </div>

      {/* Account Safety Ban Warning (Sticky Highlight Box) */}
      <div className="p-6 rounded-2xl border border-red-500/20 bg-rose-950/15 mb-10 flex items-start space-x-4">
        <div className="p-2 bg-red-500/10 text-red-400 rounded-lg shrink-0">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-red-400 uppercase tracking-wide">
            {t.guideSteamOfflineTitle}
          </h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {t.guideSteamOfflineDesc} 게임 내 EAC(Easy Anti-Cheat)나 BattlEye 시스템이 백그라운드 메모리 조작을 탐지하는 즉시, 사용자 계정에 불이익(멀티플레이 차단 또는 영구 밴)이 적용됩니다. 본 패치를 사용할 때는 **반드시 스팀 클라이언트를 '오프라인 모드'로 전환한 뒤 싱글 플레이 환경에서만 구동**하셔야 절대 안전합니다.
          </p>
        </div>
      </div>

      {/* Bypass Method List */}
      <div className="space-y-8">
        
        {/* Method 1: Easy Anti-Cheat (EAC) Bypass */}
        <div className="p-6 md:p-8 rounded-2xl border border-slate-800 bg-slate-900/10">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 font-bold text-sm font-outfit">
              METHOD 01
            </div>
            <h3 className="text-lg font-bold text-white font-outfit">EAC (Easy Anti-Cheat) 우회법 (실행 파일명 교체)</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            엘든 링, 아머드 코어 VI 등 가장 널리 쓰이는 EAC 보호 게임들은 스팀에서 정식 실행 시 안티치트 런처를 강제 실행합니다. 파일명 대체를 통하여 런처 구동을 우회하고 다이렉트로 게임 오프라인 세션에 진입하는 규격 가이드입니다.
          </p>

          {/* Step Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Step 01</span>
                <h5 className="text-xs font-semibold text-slate-200 mt-1">로컬 폴더 열기</h5>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  스팀 라이브러리에서 게임 우클릭 ➡️ [관리] ➡️ [로컬 파일 탐색]을 클릭하여 게임 바이너리가 위치한 최상위 디렉토리로 이동합니다.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Step 02</span>
                <h5 className="text-xs font-semibold text-slate-200 mt-1">안티치트 런처 백업</h5>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  디렉토리 내의 안티치트 실행 파일인 <code className="text-cyan-400/90 font-mono text-[10px]">start_protected_game.exe</code>를 찾아 이름을 <code className="text-slate-400 font-mono text-[10px]">start_protected_game.exe.bak</code>로 변경합니다.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Step 03</span>
                <h5 className="text-xs font-semibold text-slate-200 mt-1">파일명 복사 매핑</h5>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  실제 게임 구동 파일인 <code className="text-cyan-400/90 font-mono text-[10px]">eldenring.exe</code>를 복사한 뒤, 복사본의 파일 이름을 <code className="text-cyan-400/90 font-mono text-[10px]">start_protected_game.exe</code>로 교체해 둡니다.
                </p>
              </div>
            </div>

          </div>

          <div className="mt-6 p-4 rounded-xl bg-slate-950/50 border border-slate-900 text-[11px] text-slate-500 flex items-center space-x-2">
            <Key className="w-4 h-4 text-cyan-500 shrink-0" />
            <span>완료 후 Steam에서 일반 플레이를 실행하면 안티치트 검사 없이 게임이 즉시 오프라인 오프닝으로 구동되어 트레이너와 바로 결합됩니다.</span>
          </div>
        </div>

        {/* Method 2: Steam Launch Parameters */}
        <div className="p-6 md:p-8 rounded-2xl border border-slate-800 bg-slate-900/10">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 font-bold text-sm font-outfit">
              METHOD 02
            </div>
            <h3 className="text-lg font-bold text-white font-outfit">시작 매개변수 주입 (Launch Options)</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            게임 개발사에서 공식적으로 오프라인 디버깅 파라미터를 허용한 경우에 쓰는 가장 가볍고 정석적인 방식입니다. 파일 수정이 일절 필요 없어 보안 위협이나 무결성 깨짐이 없습니다.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Step 01</span>
              <h5 className="text-xs font-semibold text-slate-200 mt-1">스팀 속성 진입</h5>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                스팀 라이브러리에서 대상을 우클릭하고 [속성 (Properties)] 메뉴를 클릭하여 일반 탭의 설정을 엽니다.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Step 02</span>
              <h5 className="text-xs font-semibold text-slate-200 mt-1">명령어 주입</h5>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                하단의 [시작 옵션 (Launch Options)] 공란에 <code className="text-indigo-400/90 font-mono text-[10px] bg-slate-900 px-1 py-0.5 rounded">-eac_launcher</code> 또는 <code className="text-indigo-400/90 font-mono text-[10px] bg-slate-900 px-1 py-0.5 rounded">-offline</code> 매개변수를 기입한 후 속성을 닫습니다.
              </p>
            </div>
          </div>
        </div>

        {/* Method 3: Custom Injector / Mod Loader */}
        <div className="p-6 md:p-8 rounded-2xl border border-slate-800 bg-slate-900/10">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 font-bold text-sm font-outfit">
              METHOD 03
            </div>
            <h3 className="text-lg font-bold text-white font-outfit">커스텀 바이패스 DLL/인젝터 (Custom Loader)</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            일부 최신 3D 게임들은 안티치트 런처의 우회가 막혀 있으므로, 게임이 켜질 때 모더들이 제작한 오프라인 전환 DLL 모듈을 메모리에 먼저 삽입해야 합니다.
          </p>

          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-start space-x-3">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-slate-500 leading-relaxed">
              <strong className="text-slate-300">신뢰할 수 있는 소스만 사용하십시오:</strong> 커스텀 바이패스 DLL 파일의 경우, 출처가 불분명한 악성 dll 파일이 섞여 있을 위험이 크므로 오직 유명 모드 포털(NexusMods 등)에서 1만 회 이상 다운로드되고 안전성이 입증된 파일만 복사하여 로컬 폴더에 덮어씌우는 것을 지켜주시기 바랍니다.
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
