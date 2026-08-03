'use client';

import React, { useState } from 'react';
import { Copy, Check, Bot } from 'lucide-react';

interface AiReportButtonProps {
  stats: any;
  metrics: any;
  topGames: any[];
}

export default function AiReportButton({ stats, metrics, topGames }: AiReportButtonProps) {
  const [copied, setCopied] = useState(false);

  const generateReport = () => {
    const today = new Date().toISOString().slice(0, 10);
    
    let report = `# LocalPatcher Analytics Report (${today})\n\n`;
    
    report += `## 1. Overview\n`;
    report += `- Total Games: ${stats?.totalGames || 0}\n`;
    report += `- Total Trainers: ${stats?.totalTrainers || 0}\n`;
    report += `- Total Downloads (Supabase): ${stats?.totalDownloads?.toLocaleString() || 0}\n\n`;
    
    if (metrics) {
      report += `## 2. Visitors (GA4)\n`;
      report += `- Daily Active Users: ${metrics.dailyActiveUsers || 0}\n`;
      report += `- Weekly Active Users: ${metrics.weeklyActiveUsers || 0}\n`;
      report += `- Monthly Active Users: ${metrics.monthlyActiveUsers || 0}\n`;
      report += `- Total Active Users (since tracking): ${metrics.totalActiveUsers || 0}\n\n`;
      
      if (metrics.topPages && metrics.topPages.length > 0) {
        report += `## 3. Top Pages (Last 29 Days)\n`;
        metrics.topPages.slice(0, 10).forEach((page: any, i: number) => {
          report += `${i + 1}. ${page.path} - ${page.views} views\n`;
        });
        report += `\n`;
      }
      
      if (metrics.patchFunnel) {
        report += `## 4. User Funnel (Last 29 Days)\n`;
        report += `- FLiNG Clicks: ${metrics.patchFunnel.flingClicks || 0}\n`;
        report += `- File Selected: ${metrics.patchFunnel.fileSelected || 0}\n`;
        report += `- Patch Completed: ${metrics.patchFunnel.patchCompleted || 0}\n`;
        report += `- Download Starts: ${metrics.patchFunnel.downloadStarts || 0}\n\n`;
      }
      
      if (metrics.pricePlacement) {
        report += `## 5. Price Widget Metrics (Since ${metrics.pricePlacement.measurementStartDate})\n`;
        report += `- Widget Views: ${metrics.pricePlacement.recentViews || 0}\n`;
        report += `- Clicks (Merchant/Affiliate): ${metrics.pricePlacement.allMerchantClicks || 0} / ${metrics.pricePlacement.affiliateClicks || 0}\n`;
        report += `- Click Through Rate: ${metrics.pricePlacement.clickThroughRate?.toFixed(2)}%\n`;
      }
    }
    
    report += `\n**[Request for AI]**\n`;
    report += `Please analyze this data. Which games are trending? Are the funnel conversions healthy? Are the price clicks performing well? What actions should I take this week?`;
    
    return report;
  };

  const handleCopy = async () => {
    const report = generateReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold text-sm transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] border border-indigo-400/30"
    >
      <Bot className="w-4 h-4 mr-2" />
      {copied ? 'Copied to Clipboard!' : 'AI 분석 리포트 복사'}
      {copied ? <Check className="w-4 h-4 ml-2" /> : <Copy className="w-4 h-4 ml-2" />}
    </button>
  );
}
