import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Info, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { dashCardClass, toneClasses, type Tone } from '@/components/dashboard';
import { cn } from '@/lib/utils';

/** Small "i" icon with an explanation on hover/focus. */
export const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface ChartCardProps {
  title: string;
  info?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Right side of the header: legend, link, badge… */
  action?: React.ReactNode;
  linkLabel?: string;
  linkTo?: string;
  /** Footer row of summary figures. */
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Titled dashboard card that holds one chart. */
export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  info,
  icon: Icon,
  tone = 'teal',
  action,
  linkLabel,
  linkTo,
  footer,
  className,
  children,
}) => (
  <section className={cn(dashCardClass, 'flex min-w-0 flex-col p-4 sm:p-5', className)}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && (
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {info && <InfoTip text={info} />}
      </div>
      <div className="flex items-center gap-3">
        {action}
        {linkLabel && linkTo && (
          <Link
            to={linkTo}
            className="flex items-center gap-1 text-xs font-semibold text-[#0f5c62] hover:underline dark:text-teal-300"
          >
            {linkLabel} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </header>
    <div className="mt-4 min-w-0 flex-1">{children}</div>
    {footer && (
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-4 dark:border-white/[0.06]">
        {footer}
      </div>
    )}
  </section>
);

/** One figure in a ChartCard footer. */
export const FooterStat: React.FC<{ label: string; value: React.ReactNode; className?: string }> = ({
  label,
  value,
  className,
}) => (
  <div className="min-w-0">
    <p className={cn('text-base font-bold tabular-nums text-gray-900 dark:text-white', className)}>{value}</p>
    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
  </div>
);

/** Shown inside a ChartCard when the period has no data. */
export const ChartEmpty: React.FC<{ message?: string; icon?: LucideIcon; height?: number }> = ({
  message = 'No data for this period',
  icon: Icon = BarChart3,
  height = 220,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ minHeight: height }}>
    <Icon className="h-6 w-6 text-gray-300 dark:text-gray-600" />
    <p className="text-xs text-gray-400 dark:text-gray-500">{message}</p>
  </div>
);

/** Legend dot + label. */
export const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </span>
);
