import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dashCardClass, toneClasses, type Tone } from './tones';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  hint?: React.ReactNode;
  /**
   * compact: icon on the left, small label over a bold value ("Today at a Glance").
   * default: label and value on the left, icon tile on the right ("Overview").
   */
  variant?: 'default' | 'compact';
  /** Makes the whole card a link. */
  to?: string;
  /** Optional 0–100 progress bar under the value. */
  progress?: number;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  tone = 'teal',
  hint,
  variant = 'default',
  to,
  progress,
  className,
}) => {
  const body =
    variant === 'compact' ? (
      <div className="flex items-center gap-3">
        <span className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums leading-tight truncate">{value}</p>
          {hint && <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{hint}</p>}
        </div>
      </div>
    ) : (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums tracking-tight truncate">
              {value}
            </p>
          </div>
          <span className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
        {progress !== undefined && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div
              className={cn(
                'h-full rounded-full',
                progress >= 90 ? 'bg-rose-500' : progress >= 75 ? 'bg-amber-500' : 'bg-[#0f5c62] dark:bg-teal-400'
              )}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
        {hint && <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 truncate">{hint}</p>}
      </>
    );

  const classes = cn(
    dashCardClass,
    variant === 'compact' ? 'p-3.5' : 'p-4',
    to && 'block transition-shadow hover:shadow-md hover:border-[#0f5c62]/30 dark:hover:border-teal-400/30',
    className
  );

  return to ? (
    <Link to={to} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
};

/** Responsive grid: 1 column on phones, 2 on tablets, 4 on desktop. */
export const StatGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4', className)}>{children}</div>
);
