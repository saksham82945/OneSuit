import * as React from 'react';
import { getTagColorClass } from '@/lib/constants';
import { cn } from '@/lib/utils';

export interface TagBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
}

export function TagBadge({ color = 'gray', className, children, ...props }: TagBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium',
        getTagColorClass(color),
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
