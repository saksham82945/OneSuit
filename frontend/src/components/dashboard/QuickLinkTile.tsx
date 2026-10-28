import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dashCardClass, toneClasses, type Tone } from './tones';

interface QuickLinkTileProps {
  label: string;
  /** Small text on the right, e.g. "Manage" or a count. */
  meta?: React.ReactNode;
  to: string;
  icon: LucideIcon;
  tone?: Tone;
}

/** Small link tile, e.g. "Subscriptions → Manage". */
export const QuickLinkTile: React.FC<QuickLinkTileProps> = ({ label, meta, to, icon: Icon, tone = 'teal' }) => (
  <Link
    to={to}
    className={cn(
      dashCardClass,
      'group flex items-center gap-3 p-3 transition-shadow hover:shadow-md hover:border-[#0f5c62]/30 dark:hover:border-teal-400/30'
    )}
  >
    <span className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', toneClasses[tone])}>
      <Icon className="h-4 w-4" />
    </span>
    <span className="flex-1 min-w-0 text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-[#0f5c62] dark:group-hover:text-teal-300">
      {label}
    </span>
    {meta !== undefined && (
      <span className="text-[11px] font-semibold text-[#0f5c62] dark:text-teal-300 shrink-0">{meta}</span>
    )}
  </Link>
);
