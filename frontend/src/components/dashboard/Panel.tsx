import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dashCardClass, toneClasses, type Tone } from './tones';

interface PanelProps {
  title: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Header link, e.g. "All invoices". */
  linkLabel?: string;
  linkTo?: string;
  children: React.ReactNode;
  className?: string;
}

/** A titled card used for the "Action Needed" lists. */
export const Panel: React.FC<PanelProps> = ({ title, icon: Icon, tone = 'red', linkLabel, linkTo, children, className }) => (
  <div className={cn(dashCardClass, 'p-4 flex flex-col', className)}>
    <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-white/[0.06]">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && (
          <span className={cn('h-6 w-6 rounded-md flex items-center justify-center shrink-0', toneClasses[tone])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
      </div>
      {linkLabel && linkTo && (
        <Link
          to={linkTo}
          className="text-xs font-semibold text-[#0f5c62] hover:underline dark:text-teal-300 flex items-center gap-1 shrink-0"
        >
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
    <div className="pt-2 flex-1">{children}</div>
  </div>
);

interface PanelRowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  to?: string;
}

export const PanelRow: React.FC<PanelRowProps> = ({ title, subtitle, right, to }) => {
  const inner = (
    <>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </>
  );
  const cls =
    'flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04]';
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
};

export const PanelEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">{children}</p>
);
