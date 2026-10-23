import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../components/AiReportButton.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

/** 실제 버튼의 클릭 핸들러를 실행하되 React 렌더링과 클립보드만 격리합니다. */
async function copyReport(metrics) {
  const exports = {};
  const copied = [];
  const states = [];
  const timers = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: () => [false, (value) => states.push(value)],
  };
  vm.runInNewContext(compiled, {
    exports,
    navigator: { clipboard: { writeText: async (value) => copied.push(value) } },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    console,
    require(name) {
      if (name === 'react') return { __esModule: true, default: react, useState: react.useState };
      if (name === 'lucide-react') return { Copy() {}, Check() {}, Bot() {} };
      throw new Error(`예상하지 못한 리포트 런타임 의존성: ${name}`);
    },
  });
  const button = exports.default({
    stats: { totalGames: 3, totalTrainers: 7, totalDownloads: 1234 },
    metrics,
    topGames: [],
  });
  await button.props.onClick();
  assert.equal(copied.length, 1);
  assert.deepEqual(states, [true]);
  assert.equal(timers[0].delay, 2000);
  timers[0].callback();
  assert.deepEqual(states, [true, false]);
  return copied[0].replace(/^# LocalPatcher Analytics Report \(\d{4}-\d{2}-\d{2}\)/, '# LocalPatcher Analytics Report (DATE)');
}

const request = '\n**[Request for AI]**\nPlease analyze this data. Which games are trending? Are the funnel conversions healthy? Are the price clicks performing well? What actions should I take this week?';
const overview = '# LocalPatcher Analytics Report (DATE)\n\n## 1. Overview\n- Total Games: 3\n- Total Trainers: 7\n- Total Downloads (Supabase): 1,234\n\n';
const available = {
  status: 'available',
  dailyActiveUsers: 1,
  weeklyActiveUsers: 2,
  monthlyActiveUsers: 3,
  totalActiveUsers: 4,
  previousMonthActiveUsers: 0,
  downloadStarts: 0,
  topPages: [{ path: '/ko/patcher/example', views: 123 }],
  patchFunnel: {
    flingClicks: 5, fileSelectionAttempted: 5, fileSelected: 4, patchCompleted: 3,
    downloadStarts: 2, adGateOpened: 0, popupBlocked: 0, patchFailed: 0,
    rates: {
      flingToFileSelectionAttempt: 100, fileSelectionAttemptToValidation: 80,
      fileSelectionToPatchCompleted: 75, patchCompletedToDownload: 66.67,
      downloadToAdGateOpened: 0, popupBlockedRate: 0, patchFailureRate: 0,
    },
    failureBreakdown: null, failureBreakdownStatus: 'not_configured', mainFailureCategory: null,
  },
  pricePlacement: {
    status: 'collecting', measurementStartDate: '2026-10-01', daysCollected: 1,
    minDays: 28, cumulativeViews: 10, minViews: 500, recentViews: 10,
    recentClicks: 1, affiliateClicks: 1, allMerchantClicks: 2,
    recentPatcherViews: 10, previousPatcherViews: 0, clickThroughRate: 10,
    fileSelected: 4, previousFileSelected: 0, patchCompleted: 3, previousPatchCompleted: 0,
    selectionRate: 40, previousSelectionRate: null, completionRate: 75,
    previousCompletionRate: null, funnelComparisonAvailable: false, reason: 'collecting', nextReviewDate: null,
  },
};

test('정상 지표는 실제 클립보드에 기존 보고서 문자열을 복사한다', async () => {
  assert.equal(await copyReport(available), overview
    + '## 2. Visitors (GA4)\n- Daily Active Users: 1\n- Weekly Active Users: 2\n- Monthly Active Users: 3\n- Total Active Users (since tracking): 4\n\n'
    + '## 3. Top Pages (Last 29 Days)\n1. /ko/patcher/example - 123 views\n\n'
    + '## 4. User Funnel (Last 29 Days)\n- FLiNG Clicks: 5\n- File Selected: 4\n- Patch Completed: 3\n- Download Starts: 2\n\n'
    + '## 5. Price Widget Metrics (Since 2026-10-01)\n- Widget Views: 10\n- Clicks (Merchant/Affiliate): 2 / 1\n- Click Through Rate: 10.00%\n'
    + request);
});

test('unavailable와 아직 없는 지표를 방문자 0으로 표현하지 않는다', async () => {
  const unavailable = {
    status: 'unavailable', reason: 'not configured', dailyActiveUsers: null,
    weeklyActiveUsers: null, monthlyActiveUsers: null, totalActiveUsers: null,
    previousMonthActiveUsers: null, downloadStarts: null, topPages: [], patchFunnel: null, pricePlacement: null,
  };
  for (const metrics of [unavailable, null]) {
    const report = await copyReport(metrics);
    assert.equal(report, overview + '## 2. Visitors (GA4)\n- 측정 불가\n\n' + request);
    assert.doesNotMatch(report, /Active Users: 0|undefined|User Funnel|Price Widget/);
  }
});

test('실제 0과 null 클릭률을 구분하고 빈 페이지 목록은 생략한다', async () => {
  const metrics = {
    ...available, dailyActiveUsers: 0, weeklyActiveUsers: 0, monthlyActiveUsers: 0, totalActiveUsers: 0,
    topPages: [], pricePlacement: { ...available.pricePlacement, clickThroughRate: null },
  };
  const report = await copyReport(metrics);
  assert.match(report, /- Daily Active Users: 0\n/);
  assert.match(report, /- Weekly Active Users: 0\n/);
  assert.match(report, /- Monthly Active Users: 0\n/);
  assert.match(report, /- Total Active Users \(since tracking\): 0\n/);
  assert.match(report, /- Click Through Rate: 측정 불가\n/);
  assert.doesNotMatch(report, /Top Pages|undefined%/);
  assert.match(await copyReport({ ...metrics, pricePlacement: { ...metrics.pricePlacement, clickThroughRate: 0 } }), /- Click Through Rate: 0\.00%\n/);
});

test('페이지 경로와 조회수를 그대로 쓰며 상위 10개까지만 출력한다', async () => {
  const report = await copyReport({
    ...available,
    topPages: Array.from({ length: 12 }, (_, i) => ({ path: `/ko/page-${i + 1}`, views: 100 - i })),
  });
  assert.match(report, /1\. \/ko\/page-1 - 100 views\n/);
  assert.match(report, /10\. \/ko\/page-10 - 91 views\n/);
  assert.doesNotMatch(report, /\/ko\/page-11|\/ko\/page-12/);
});

test('공유 타입과 서버 생산자 타입을 클라이언트 런타임에 불러오지 않는다', () => {
  assert.doesNotMatch(compiled, /admin-dashboard-types|server-only|node:crypto|supabase/);
});
