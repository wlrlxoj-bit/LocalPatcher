/** 관리자 지표 API와 리포트가 공유하는 직렬화 가능한 데이터 계약입니다. */
export interface AdminDashboardStats {
  totalGames: number;
  totalTrainers: number;
  totalDownloads: number;
}

export interface AdminTopGame {
  id: number;
  title_en: string;
  title_ko: string;
  slug: string;
  download_count: number;
}

interface AdminTopPage {
  path: string;
  views: number;
}

interface AdminPatchFunnel {
  flingClicks: number;
  fileSelectionAttempted: number;
  fileSelected: number;
  patchCompleted: number;
  downloadStarts: number;
  adGateOpened: number;
  popupBlocked: number;
  patchFailed: number;
  rates: {
    flingToFileSelectionAttempt: number | null;
    fileSelectionAttemptToValidation: number | null;
    fileSelectionToPatchCompleted: number | null;
    patchCompletedToDownload: number | null;
    downloadToAdGateOpened: number | null;
    popupBlockedRate: number | null;
    patchFailureRate: number | null;
  };
  failureBreakdown: Record<'invalid_type' | 'file_too_large' | 'not_pe' | 'unsupported_version' | 'processing_error', number> | null;
  failureBreakdownStatus: 'not_configured' | 'unavailable' | 'available';
  mainFailureCategory: 'invalid_type' | 'file_too_large' | 'not_pe' | 'unsupported_version' | 'processing_error' | null;
}

interface AdminPricePlacement {
  status: 'collecting' | 'keep_bottom' | 'consider_raise';
  measurementStartDate: string;
  daysCollected: number;
  minDays: number;
  cumulativeViews: number;
  minViews: number;
  recentViews: number;
  recentClicks: number;
  affiliateClicks: number;
  allMerchantClicks: number;
  recentPatcherViews: number;
  previousPatcherViews: number;
  clickThroughRate: number | null;
  fileSelected: number;
  previousFileSelected: number;
  patchCompleted: number;
  previousPatchCompleted: number;
  selectionRate: number | null;
  previousSelectionRate: number | null;
  completionRate: number | null;
  previousCompletionRate: number | null;
  funnelComparisonAvailable: boolean;
  reason: string;
  nextReviewDate: string | null;
}

export type AdminDashboardMetrics = {
  status: 'available';
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  totalActiveUsers: number;
  topPages: AdminTopPage[];
  previousMonthActiveUsers: number;
  downloadStarts: number;
  patchFunnel: AdminPatchFunnel;
  pricePlacement: AdminPricePlacement | null;
} | {
  status: 'unavailable';
  reason: string;
  dailyActiveUsers: null;
  weeklyActiveUsers: null;
  monthlyActiveUsers: null;
  totalActiveUsers: null;
  topPages: AdminTopPage[];
  previousMonthActiveUsers: null;
  downloadStarts: null;
  patchFunnel: null;
  pricePlacement: null;
};
