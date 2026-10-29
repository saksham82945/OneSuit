import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, CheckCircle2, ShieldCheck, Zap, LifeBuoy } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { ConnectWhatsAppButton } from '@/components/whatsapp/ConnectWhatsAppButton';

interface TopStatusBarProps {
  className?: string;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({ className }) => {
  const { user } = useAuthStore();
  const isSuperAdmin = Boolean(user?.is_super_admin);

  if (isSuperAdmin) {
    return (
      <div
        className={cn(
          'h-12 border-b border-gray-200/80 dark:border-[#1c2725] bg-white/90 dark:bg-[#111817]/90 backdrop-blur-sm px-6 flex items-center justify-between text-xs shrink-0 z-10',
          className
        )}
      >
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-400 font-semibold">
          <ShieldCheck className="h-4 w-4" />
          <span>Platform Operator Mode (Super Administrator)</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="telemetry-pill">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Cluster Status: Healthy</span>
          </div>
          <div className="telemetry-pill">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">API Gateway: Online</span>
          </div>
          <Link
            to="/super-admin/tickets"
            className="telemetry-pill hover:bg-violet-100/70 dark:hover:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-300/70 dark:border-violet-700/50 transition-all flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold shadow-xs hover:shadow-sm"
            title="Manage platform support tickets"
          >
            <LifeBuoy className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            <span>Support Tickets</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'h-12 border-b border-gray-200/80 dark:border-[#1c2725] bg-white/90 dark:bg-[#111817]/90 backdrop-blur-sm px-6 flex items-center justify-between text-xs shrink-0 z-10 overflow-x-auto no-scrollbar',
        className
      )}
    >
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
        <ConnectWhatsAppButton size="sm" />
        <span className="hidden sm:inline font-medium text-gray-700 dark:text-gray-200">WhatsApp Official Business Line</span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Quality Rating */}
        <div className="telemetry-pill" title="Meta Cloud API Quality Rating">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Quality Rating:</span>
          <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full text-[10px]">
            <CheckCircle2 className="h-3 w-3" /> High
          </span>
        </div>

        {/* Messaging Tier */}
        <div className="telemetry-pill" title="Current 24-hour limit tier">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Template Tier:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300 text-[11px]">Tier 3 (100K/24h)</span>
        </div>

        {/* Remaining Quota */}
        <div className="telemetry-pill" title="Daily remaining message credits">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Remaining Quota:</span>
          <span className="font-semibold text-teal-700 dark:text-teal-400 text-[11px] flex items-center gap-1">
            100,000 <Sparkles className="h-3 w-3 text-teal-500" />
          </span>
        </div>

        {/* Support Helpdesk */}
        <Link
          to="/support"
          className="telemetry-pill hover:bg-teal-100/70 dark:hover:bg-teal-950/50 text-teal-800 dark:text-teal-300 border border-teal-300/70 dark:border-teal-700/50 transition-all flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold shadow-xs hover:shadow-sm"
          title="Open Helpdesk & Support"
        >
          <LifeBuoy className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          <span>Support</span>
        </Link>
      </div>
    </div>
  );
};

export default TopStatusBar;
