import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface HeroBannerProps {
  title?: string;
  description?: string;
  badge?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  title = 'Meet Campaign Agent, your AI campaign manager',
  description = 'Describe your goal once, AI writes and optimizes every message for maximum response rate.',
  badge = 'NEW',
  actionText = 'Try Campaign Agent',
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#3e2ae0] via-[#6f3bf5] to-[#924ced] p-4 sm:p-5 text-white shadow-md shadow-indigo-500/10 border border-white/10 light:border-gray-200',
        className
      )}
    >
      {/* Decorative ambient background sparkles */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl pointer-events-none light:bg-gray-100" />
      <div className="absolute left-1/3 -bottom-8 h-24 w-24 rounded-full bg-purple-400/20 blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="h-10 w-10 shrink-0 rounded-full bg-white/20 p-2 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner light:bg-gray-50 light:border-gray-200">
            <Sparkles className="h-5 w-5 text-white animate-pulse light:text-gray-900" />
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm tracking-tight text-white light:text-gray-900">{title}</span>
              {badge && (
                <Badge className="bg-white/25 hover:bg-white/30 text-white border-0 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider light:bg-gray-50 light:hover:bg-gray-100 light:text-gray-900">
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-white/80 leading-relaxed max-w-xl light:text-gray-800">{description}</p>
          </div>
        </div>

        {actionText && (
          <Button
            type="button"
            size="sm"
            onClick={onAction}
            className="self-start sm:self-auto bg-white text-indigo-700 hover:bg-white/95 text-xs font-semibold rounded-full px-4 h-8 shrink-0 shadow-sm transition-transform active:scale-95 light:hover:bg-gray-100"
          >
            {actionText} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
