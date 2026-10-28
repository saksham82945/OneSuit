import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ActionErrorInfo } from './catalogApi';

/** Inline error for a failed create/update/delete/sync, with the likely cause. */
export const ActionErrorBox: React.FC<{ error: ActionErrorInfo | null; className?: string }> = ({ error, className }) => {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 light:border-red-200 light:bg-red-50 light:text-red-700',
        className
      )}
    >
      <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
      <div className="min-w-0">
        <p className="font-medium break-words">{error.message}</p>
        {error.hint && <p className="mt-0.5 text-red-300/80 light:text-red-600/90">{error.hint}</p>}
      </div>
    </div>
  );
};

/** Warning banner (e.g. account missing or not set up for Meta). */
export const WarningBanner: React.FC<{
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, children, action, className }) => (
  <div
    role="status"
    className={cn(
      'flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 light:border-amber-200 light:bg-amber-50',
      className
    )}
  >
    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 light:text-amber-600 hidden sm:block" />
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium text-amber-200 light:text-amber-800">{title}</p>
      {children && <div className="mt-0.5 text-[11px] text-amber-200/70 light:text-amber-700">{children}</div>}
    </div>
    {action}
  </div>
);

/** Link button to the WhatsApp accounts settings screen. */
export const ConnectAccountButton: React.FC<{ label?: string }> = ({ label = 'Connect an account' }) => (
  <Button asChild size="sm" variant="outline" className="border-white/10 light:border-gray-200 shrink-0">
    <Link to="/settings/accounts">{label}</Link>
  </Button>
);
