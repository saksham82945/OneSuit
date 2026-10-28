import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneClasses, type Tone } from './tones';

interface SectionTitleProps {
  icon: LucideIcon;
  title: string;
  tone?: Tone;
  /** Optional content on the right (link, badge, ...). */
  action?: React.ReactNode;
  className?: string;
}

/** Small coloured icon + title + thin divider, as used between dashboard sections. */
export const SectionTitle: React.FC<SectionTitleProps> = ({ icon: Icon, title, tone = 'teal', action, className }) => (
  <div className={cn('flex items-center gap-3', className)}>
    <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', toneClasses[tone])}>
      <Icon className="h-4 w-4" />
    </span>
    <h2 className="text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">{title}</h2>
    <div className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
