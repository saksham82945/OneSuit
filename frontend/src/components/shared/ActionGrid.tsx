import React from 'react';
import { ExternalLink, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ActionCardItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  badgeVariant?: 'popular' | 'ai' | 'new';
  iconColorClass?: string;
  iconBgClass?: string;
  onClick?: () => void;
}

export interface QuickGuideLink {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ActionGridProps {
  guideTag?: string;
  guideTitle: string;
  guideDescription: string;
  guideLinks?: QuickGuideLink[];
  actionHeaderTitle?: string;
  actions: ActionCardItem[];
  className?: string;
}

export const ActionGrid: React.FC<ActionGridProps> = ({
  guideTag = 'QUICK GUIDE',
  guideTitle,
  guideDescription,
  guideLinks = [],
  actionHeaderTitle = 'What would you like to do next?',
  actions,
  className,
}) => {
  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-3 gap-5', className)}>
      {/* Left 1/3: Quick Guide Card */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-5 light:bg-white light:border-gray-200 dark:bg-[#141b1a] dark:border-[#1e2a28] shadow-sm flex flex-col justify-between">
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 light:text-teal-700 dark:text-teal-400">
            {guideTag}
          </span>
          <h3 className="text-base font-bold text-gray-900 light:text-gray-900 dark:text-white leading-tight">
            {guideTitle}
          </h3>
          <p className="text-xs text-gray-500 light:text-gray-500 dark:text-gray-400 leading-relaxed">
            {guideDescription}
          </p>
        </div>

        {guideLinks.length > 0 && (
          <div className="pt-4 mt-4 border-t border-gray-100 light:border-gray-100 dark:border-white/[0.06] space-y-2">
            {guideLinks.map((l, idx) => (
              <a
                key={idx}
                href={l.href || '#'}
                onClick={(e) => {
                  if (l.onClick) {
                    e.preventDefault();
                    l.onClick();
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 transition-colors"
              >
                <span>{l.label}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Right 2/3: 2x2 Action Cards */}
      <div className="lg:col-span-2 space-y-3">
        {actionHeaderTitle && (
          <h3 className="text-sm font-bold text-gray-900 light:text-gray-900 dark:text-white">
            {actionHeaderTitle}
          </h3>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <div
                key={act.id}
                onClick={act.onClick}
                className={cn(
                  'action-card cursor-pointer group flex items-start gap-3.5 p-3.5'
                )}
              >
                <div
                  className={cn(
                    'h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
                    act.iconBgClass || 'bg-teal-50 dark:bg-teal-950/40'
                  )}
                >
                  <Icon className={cn('h-5 w-5', act.iconColorClass || 'text-teal-600 dark:text-teal-400')} />
                </div>

                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-gray-900 light:text-gray-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors truncate">
                      {act.title}
                    </span>
                    {act.badge && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] uppercase px-1.5 py-0 font-bold border-0 tracking-wider',
                          act.badgeVariant === 'new' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
                          act.badgeVariant === 'ai' && 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
                          act.badgeVariant === 'popular' && 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
                          !act.badgeVariant && 'bg-gray-100 text-gray-700'
                        )}
                      >
                        {act.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 light:text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                    {act.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
