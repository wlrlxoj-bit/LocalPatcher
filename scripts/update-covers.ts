/**
 * update-covers.ts
 *
 * 게임 커버 이미지 및 한국어 제목 자동 유지보수 스크립트
 * ──────────────────────────────────────────────────────────
 * - Supabase `games` 테이블에서 커버 이미지가 누락/깨진 게임을 탐지
 * - Steam Store API를 통해 자동으로 커버 이미지 URL을 복구
 * - 한국어 제목(title_ko)이 누락된 게임의 한국어 명칭도 보완
 * - GitHub Actions 환경에서 주기적으로 실행되도록 설계됨
 *
 * @requires NEXT_PUBLIC_SUPABASE_URL - Supabase 프로젝트 URL
 * @requires SUPABASE_SERVICE_ROLE_KEY - Supabase 서비스 역할 키 (관리자 권한)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

/** Supabase games 테이블의 행 타입 (필요한 컬럼만 추출) */
interface GameRow {
  id: number;
  title_en: string;
  title_ko: string | null;
  slug: string;
  cover_image_url: string | null;
}

/** Steam Store 검색 API 응답 구조 */
interface SteamSearchResponse {
  total: number;
  items: Array<{
    type: string;
    name: string;
    id: number; // Steam AppID
    tiny_image: string;
  }>;
}

/** Steam AppDetails API 응답 구조 */
interface SteamAppDetailsResponse {
  [appId: string]: {
    success: boolean;
    data?: {
      name: string;
      steam_appid: number;
      type: string;
    };
  };
}

/** 작업 결과 요약을 위한 카운터 */
interface MaintenanceReport {
  totalGames: number;
  coverUpdated: string[];
  titleKoUpdated: string[];
  coverFailed: string[];
  titleKoFailed: string[];
  brokenCovers: string[];
}

// ─────────────────────────────────────────────
// 공통 HTTP 헤더 (레이트 리밋 회피용 User-Agent 포함)
// ─────────────────────────────────────────────
const FETCH_HEADERS: HeadersInit = {
  'User-Agent': 'LocalPatcher/1.0 (maintenance script)',
};

// ─────────────────────────────────────────────
// 유틸리티 함수
// ─────────────────────────────────────────────

/** Steam API 레이트 리밋 방지를 위한 1초 대기 */
async function delay(ms: number = 1000): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * 주어진 URL이 유효한지 HEAD 요청으로 확인
 * @returns true이면 정상, false이면 404 또는 네트워크 오류
 */
async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10000), // 10초 타임아웃
    });
    return response.ok; // 2xx 응답만 유효로 판단
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Supabase 클라이언트 초기화
// ─────────────────────────────────────────────

function initSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '❌ 환경 변수 누락: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.'
    );
  }

  // 서비스 역할 키를 사용하여 RLS 우회 가능한 관리자 클라이언트 생성
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ─────────────────────────────────────────────
// 데이터 조회: 전체 게임 목록 (페이지네이션 지원)
// ─────────────────────────────────────────────

/**
 * Supabase에서 전체 게임 목록을 페이지네이션하여 가져옴
 * Supabase의 기본 페이지 크기(1000행) 제한을 우회하기 위해 반복 조회
 */
async function fetchAllGames(supabase: SupabaseClient): Promise<GameRow[]> {
  const allGames: GameRow[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  console.log('📦 전체 게임 목록을 조회합니다...');

  while (hasMore) {
    const { data, error } = await supabase
      .from('games')
      .select('id, title_en, title_ko, slug, cover_image_url')
      .range(offset, offset + pageSize - 1)
      .order('id', { ascending: true });

    if (error) {
      throw new Error(`Supabase 쿼리 오류: ${error.message}`);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allGames.push(...(data as GameRow[]));
      offset += pageSize;
      // 반환된 행이 페이지 크기보다 적으면 마지막 페이지
      if (data.length < pageSize) {
        hasMore = false;
      }
    }
  }

  console.log(`✅ 총 ${allGames.length}개 게임 조회 완료`);
  return allGames;
}

// ─────────────────────────────────────────────
// 문제 게임 식별: 커버 이미지 누락 또는 깨짐 탐지
// ─────────────────────────────────────────────

interface ProblematicGames {
  /** 커버 이미지가 NULL이거나 빈 문자열인 게임 */
  missingCover: GameRow[];
  /** 커버 이미지 URL이 404를 반환하는 게임 */
  brokenCover: GameRow[];
  /** 한국어 제목이 누락된 게임 */
  missingTitleKo: GameRow[];
}

/**
 * 전체 게임 목록에서 보수가 필요한 게임을 분류
 * 깨진 커버 확인은 레이트 리밋 방지를 위해 최대 50건까지만 검사
 */
async function identifyProblematicGames(
  games: GameRow[]
): Promise<ProblematicGames> {
  const missingCover: GameRow[] = [];
  const brokenCover: GameRow[] = [];
  const missingTitleKo: GameRow[] = [];

  // 1단계: NULL/빈 문자열 커버 이미지 탐지 (즉시 분류)
  const gamesWithCovers: GameRow[] = [];
  for (const game of games) {
    if (!game.cover_image_url || game.cover_image_url.trim() === '') {
      missingCover.push(game);
    } else {
      gamesWithCovers.push(game);
    }

    // 한국어 제목 누락 여부 체크
    if (!game.title_ko || game.title_ko.trim() === '') {
      missingTitleKo.push(game);
    }
  }

  console.log(`🔍 커버 이미지 NULL/빈값: ${missingCover.length}건`);
  console.log(`🔍 한국어 제목 누락: ${missingTitleKo.length}건`);

  // 2단계: 기존 커버 URL이 404인지 HEAD 요청으로 확인 (최대 50건)
  const checkLimit = Math.min(gamesWithCovers.length, 50);
  console.log(
    `🔎 커버 이미지 깨짐 확인 중... (최대 ${checkLimit}/${gamesWithCovers.length}건 검사)`
  );

  for (let i = 0; i < checkLimit; i++) {
    const game = gamesWithCovers[i];
    const accessible = await isUrlAccessible(game.cover_image_url!);
    if (!accessible) {
      console.log(`  ⚠️ 깨진 커버 발견: [${game.title_en}] ${game.cover_image_url}`);
      brokenCover.push(game);
    }
  }

  console.log(`🔍 깨진 커버 이미지: ${brokenCover.length}건`);

  return { missingCover, brokenCover, missingTitleKo };
}

// ─────────────────────────────────────────────
// Steam Store API: 게임 검색 및 커버 이미지 URL 생성
// ─────────────────────────────────────────────

/**
 * Steam Store 검색 API로 게임의 AppID를 조회
 * @param titleEn 영문 게임 제목
 * @returns Steam AppID 또는 null (검색 실패 시)
 */
async function searchSteamAppId(titleEn: string): Promise<number | null> {
  try {
    const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
      titleEn
    )}&l=english&cc=US`;

    const response = await fetch(searchUrl, { headers: FETCH_HEADERS });
    if (!response.ok) {
      console.log(`  ❌ Steam 검색 API 응답 오류: HTTP ${response.status}`);
      return null;
    }

    const data: SteamSearchResponse = await response.json();

    // 검색 결과 첫 번째 항목의 AppID 반환
    if (data.items && data.items.length > 0) {
      return data.items[0].id;
    }

    return null;
  } catch (err) {
    console.log(`  ❌ Steam 검색 API 호출 실패: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Steam AppID로부터 CDN 커버 이미지(header.jpg) URL을 생성
 * @param appId Steam AppID
 * @returns Steam CDN 커버 이미지 URL
 */
function buildSteamCoverUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

// ─────────────────────────────────────────────
// 커버 이미지 보수 작업 실행
// ─────────────────────────────────────────────

/**
 * 커버 이미지가 누락/깨진 게임들에 대해 Steam 검색 후 업데이트 수행
 */
async function fixCoverImages(
  supabase: SupabaseClient,
  games: GameRow[],
  report: MaintenanceReport
): Promise<void> {
  if (games.length === 0) {
    console.log('✅ 커버 이미지 보수가 필요한 게임이 없습니다.');
    return;
  }

  console.log(`\n🖼️ 커버 이미지 보수 시작 (${games.length}건)...`);

  for (const game of games) {
    try {
      console.log(`  🔎 [${game.title_en}] Steam 검색 중...`);

      // Steam Store API로 AppID 검색
      const appId = await searchSteamAppId(game.title_en);

      if (!appId) {
        console.log(`  ❌ [${game.title_en}] Steam에서 찾을 수 없음`);
        report.coverFailed.push(game.title_en);
        await delay(); // 레이트 리밋 방지
        continue;
      }

      // CDN 커버 이미지 URL 생성
      const coverUrl = buildSteamCoverUrl(appId);
      console.log(`  ✅ [${game.title_en}] AppID: ${appId} → ${coverUrl}`);

      // Supabase 업데이트
      const { error } = await supabase
        .from('games')
        .update({ cover_image_url: coverUrl })
        .eq('id', game.id);

      if (error) {
        console.log(`  ❌ [${game.title_en}] DB 업데이트 실패: ${error.message}`);
        report.coverFailed.push(game.title_en);
      } else {
        console.log(`  ✅ [${game.title_en}] 커버 이미지 업데이트 완료`);
        report.coverUpdated.push(game.title_en);
      }
    } catch (err) {
      console.log(
        `  ❌ [${game.title_en}] 처리 중 오류: ${(err as Error).message}`
      );
      report.coverFailed.push(game.title_en);
    }

    // Steam API 레이트 리밋 방지 (1초 대기)
    await delay();
  }
}

// ─────────────────────────────────────────────
// 한국어 제목 보수 작업 실행
// ─────────────────────────────────────────────

/**
 * cover_image_url에서 Steam AppID를 추출하는 정규식
 * 예: https://cdn.cloudflare.steamstatic.com/steam/apps/1234567/header.jpg → 1234567
 */
function extractAppIdFromUrl(url: string | null): number | null {
  if (!url) return null;
  const match = url.match(/apps\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Steam AppDetails API를 사용하여 한국어 게임 이름을 조회
 * @param appId Steam AppID
 * @returns 한국어 게임명 또는 null
 */
async function fetchKoreanTitle(appId: number): Promise<string | null> {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=koreana`;
    const response = await fetch(url, { headers: FETCH_HEADERS });

    if (!response.ok) {
      console.log(`  ❌ Steam AppDetails API 응답 오류: HTTP ${response.status}`);
      return null;
    }

    const data: SteamAppDetailsResponse = await response.json();
    const appData = data[String(appId)];

    if (appData?.success && appData.data?.name) {
      return appData.data.name;
    }

    return null;
  } catch (err) {
    console.log(`  ❌ Steam AppDetails API 호출 실패: ${(err as Error).message}`);
    return null;
  }
}

/**
 * 한국어 제목이 누락된 게임들에 대해 Steam API로 조회 후 업데이트 수행
 */
async function fixKoreanTitles(
  supabase: SupabaseClient,
  games: GameRow[],
  report: MaintenanceReport
): Promise<void> {
  if (games.length === 0) {
    console.log('✅ 한국어 제목 보수가 필요한 게임이 없습니다.');
    return;
  }

  console.log(`\n🇰🇷 한국어 제목 보수 시작 (${games.length}건)...`);

  for (const game of games) {
    try {
      // 커버 이미지 URL에서 Steam AppID 추출 시도
      let appId = extractAppIdFromUrl(game.cover_image_url);

      // AppID를 URL에서 추출할 수 없으면, Steam 검색 API로 조회
      if (!appId) {
        console.log(
          `  🔎 [${game.title_en}] URL에서 AppID 추출 실패, Steam 검색 중...`
        );
        appId = await searchSteamAppId(game.title_en);
        await delay();
      }

      if (!appId) {
        console.log(`  ❌ [${game.title_en}] Steam AppID를 확인할 수 없음`);
        report.titleKoFailed.push(game.title_en);
        continue;
      }

      console.log(
        `  🔎 [${game.title_en}] AppID: ${appId} → 한국어 제목 조회 중...`
      );

      // Steam AppDetails API로 한국어 제목 조회
      const koreanTitle = await fetchKoreanTitle(appId);

      if (!koreanTitle) {
        console.log(`  ❌ [${game.title_en}] 한국어 제목을 찾을 수 없음`);
        report.titleKoFailed.push(game.title_en);
        await delay();
        continue;
      }

      // 한국어 제목이 영문 제목과 동일한 경우에도 일단 저장 (Steam에 한국어 제목이 없는 경우)
      console.log(`  ✅ [${game.title_en}] 한국어 제목: "${koreanTitle}"`);

      // Supabase 업데이트
      const { error } = await supabase
        .from('games')
        .update({ title_ko: koreanTitle })
        .eq('id', game.id);

      if (error) {
        console.log(`  ❌ [${game.title_en}] DB 업데이트 실패: ${error.message}`);
        report.titleKoFailed.push(game.title_en);
      } else {
        console.log(`  ✅ [${game.title_en}] 한국어 제목 업데이트 완료`);
        report.titleKoUpdated.push(game.title_en);
      }
    } catch (err) {
      console.log(
        `  ❌ [${game.title_en}] 처리 중 오류: ${(err as Error).message}`
      );
      report.titleKoFailed.push(game.title_en);
    }

    // Steam API 레이트 리밋 방지 (1초 대기)
    await delay();
  }
}

// ─────────────────────────────────────────────
// 요약 리포트 생성 및 출력
// ─────────────────────────────────────────────

/**
 * 유지보수 작업 결과를 콘솔에 출력하고, GitHub Actions Summary에 기록
 */
function generateReport(report: MaintenanceReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════');
  lines.push('  🔧 게임 커버 이미지 유지보수 리포트');
  lines.push('═══════════════════════════════════════════════');
  lines.push('');
  lines.push(`📊 총 스캔 게임 수: ${report.totalGames}`);
  lines.push('');

  // 커버 이미지 업데이트 결과
  lines.push(`🖼️ 커버 이미지 업데이트: ${report.coverUpdated.length}건`);
  if (report.coverUpdated.length > 0) {
    report.coverUpdated.forEach((name) => lines.push(`   ✅ ${name}`));
  }
  lines.push('');

  // 깨진 커버 발견 목록
  if (report.brokenCovers.length > 0) {
    lines.push(`⚠️ 깨진 커버 발견: ${report.brokenCovers.length}건`);
    report.brokenCovers.forEach((name) => lines.push(`   🔗 ${name}`));
    lines.push('');
  }

  // 한국어 제목 업데이트 결과
  lines.push(`🇰🇷 한국어 제목 업데이트: ${report.titleKoUpdated.length}건`);
  if (report.titleKoUpdated.length > 0) {
    report.titleKoUpdated.forEach((name) => lines.push(`   ✅ ${name}`));
  }
  lines.push('');

  // 실패 목록
  const totalFailed = report.coverFailed.length + report.titleKoFailed.length;
  if (totalFailed > 0) {
    lines.push(`❌ 실패 항목: ${totalFailed}건`);
    if (report.coverFailed.length > 0) {
      lines.push('   [커버 이미지 매칭 실패]');
      report.coverFailed.forEach((name) => lines.push(`   ❌ ${name}`));
    }
    if (report.titleKoFailed.length > 0) {
      lines.push('   [한국어 제목 조회 실패]');
      report.titleKoFailed.forEach((name) => lines.push(`   ❌ ${name}`));
    }
  } else {
    lines.push('✅ 실패 항목 없음');
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════');

  const reportText = lines.join('\n');

  // 콘솔 출력
  console.log(reportText);

  return reportText;
}

/**
 * GitHub Actions Job Summary에 리포트를 마크다운 형식으로 기록
 * $GITHUB_STEP_SUMMARY 환경변수가 설정된 경우에만 실행
 */
async function writeGitHubSummary(report: MaintenanceReport): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    console.log('ℹ️ GITHUB_STEP_SUMMARY 미설정 (로컬 실행 환경)');
    return;
  }

  const { writeFile } = await import('node:fs/promises');

  const md: string[] = [];
  md.push('## 🔧 게임 커버 이미지 유지보수 리포트');
  md.push('');
  md.push(`| 항목 | 수량 |`);
  md.push(`|------|------|`);
  md.push(`| 📊 총 스캔 게임 | ${report.totalGames} |`);
  md.push(`| 🖼️ 커버 이미지 업데이트 | ${report.coverUpdated.length} |`);
  md.push(`| 🇰🇷 한국어 제목 업데이트 | ${report.titleKoUpdated.length} |`);
  md.push(
    `| ❌ 실패 | ${report.coverFailed.length + report.titleKoFailed.length} |`
  );
  md.push('');

  if (report.coverUpdated.length > 0) {
    md.push('### ✅ 커버 이미지 업데이트 성공');
    md.push('');
    report.coverUpdated.forEach((name) => md.push(`- ${name}`));
    md.push('');
  }

  if (report.titleKoUpdated.length > 0) {
    md.push('### ✅ 한국어 제목 업데이트 성공');
    md.push('');
    report.titleKoUpdated.forEach((name) => md.push(`- ${name}`));
    md.push('');
  }

  if (report.coverFailed.length > 0) {
    md.push('### ❌ 커버 이미지 매칭 실패');
    md.push('');
    report.coverFailed.forEach((name) => md.push(`- ${name}`));
    md.push('');
  }

  if (report.titleKoFailed.length > 0) {
    md.push('### ❌ 한국어 제목 조회 실패');
    md.push('');
    report.titleKoFailed.forEach((name) => md.push(`- ${name}`));
    md.push('');
  }

  try {
    await writeFile(summaryPath, md.join('\n'), 'utf-8');
    console.log('📝 GitHub Actions Summary에 리포트가 기록되었습니다.');
  } catch (err) {
    console.log(
      `⚠️ GitHub Summary 기록 실패: ${(err as Error).message}`
    );
  }
}

// ─────────────────────────────────────────────
// 메인 실행 함수
// ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🚀 게임 커버 이미지 유지보수 스크립트 시작');
  console.log(`📅 실행 시각: ${new Date().toISOString()}`);
  console.log('');

  // Supabase 클라이언트 초기화
  const supabase = initSupabase();

  // 리포트 객체 초기화
  const report: MaintenanceReport = {
    totalGames: 0,
    coverUpdated: [],
    titleKoUpdated: [],
    coverFailed: [],
    titleKoFailed: [],
    brokenCovers: [],
  };

  // 1. 전체 게임 목록 조회 (페이지네이션)
  const allGames = await fetchAllGames(supabase);
  report.totalGames = allGames.length;

  if (allGames.length === 0) {
    console.log('⚠️ games 테이블에 데이터가 없습니다.');
    generateReport(report);
    return;
  }

  // 2. 문제 게임 식별 (누락 + 깨진 커버, 누락 한국어 제목)
  const problems = await identifyProblematicGames(allGames);

  // 깨진 커버 이름을 리포트에 기록
  report.brokenCovers = problems.brokenCover.map((g) => g.title_en);

  // 3. 커버 이미지 보수 (누락 + 깨진 것 합산)
  const coverFixTargets = [...problems.missingCover, ...problems.brokenCover];
  await fixCoverImages(supabase, coverFixTargets, report);

  // 4. 한국어 제목 보수
  await fixKoreanTitles(supabase, problems.missingTitleKo, report);

  // 5. 요약 리포트 생성 및 출력
  generateReport(report);

  // 6. GitHub Actions Summary 기록 (CI 환경에서만)
  await writeGitHubSummary(report);

  console.log('\n🏁 유지보수 스크립트 완료');
}

// ─────────────────────────────────────────────
// 스크립트 실행 진입점
// ─────────────────────────────────────────────
main().catch((err) => {
  console.error('💥 치명적 오류 발생:', err);
  process.exit(1);
});
