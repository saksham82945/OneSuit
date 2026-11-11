import React from 'react';
import { cn } from '@/lib/utils';

/** A shimmering placeholder block; size it with className (e.g. "h-4 w-32"). */
export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div aria-hidden className={cn('skeleton-shimmer rounded-md', className)} {...props} />
);

/** A few lines of placeholder text; the last line is shorter. */
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className }) => (
  <div className={cn('space-y-2', className)} aria-hidden>
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className={cn('h-3', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')} />
    ))}
  </div>
);

/** Placeholder for a stat card while its numbers load. */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div
    role="status"
    aria-label="Loading"
    className={cn(
      'rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm dark:border-[#1e2a28] dark:bg-[#141b1a]',
      className
    )}
  >
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-10 rounded-xl" />
    </div>
    <Skeleton className="mt-4 h-7 w-20" />
    <Skeleton className="mt-2 h-3 w-28" />
  </div>
);

/** Placeholder rows for a list (avatar + two lines). */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({ rows = 4, className }) => (
  <div role="status" aria-label="Loading" className={cn('space-y-4', className)}>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-3 w-10" />
      </div>
    ))}
  </div>
);
