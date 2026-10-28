import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: LucideIcon;
  iconGradient?: string;
  backLink?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  description,
  icon: Icon,
  iconGradient,
  backLink,
  actions,
  children,
}) => {
  return (
    <header className="border-b border-white/[0.08] light:border-gray-200 bg-[#0a0a0b]/95 light:bg-white/95 backdrop-blur shrink-0">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center">
          {backLink && (
            <Link to={backLink}>
              <Button variant="ghost" size="icon" className="mr-3 text-white/70 hover:text-white light:text-gray-600 light:hover:text-gray-900">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          )}
          {Icon && (
            <div
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center mr-3 shadow-lg shrink-0',
                iconGradient || 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20'
              )}
            >
              <Icon className="h-4 w-4 text-white light:text-gray-900" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-white light:text-gray-900 leading-tight">
              {title}
            </h1>
            {(subtitle || description) && (
              <p className="text-xs text-white/50 light:text-gray-500">
                {subtitle || description}
              </p>
            )}
          </div>
        </div>
        {(actions || children) && (
          <div className="flex items-center gap-2">
            {actions}
            {children}
          </div>
        )}
      </div>
    </header>
  );
};
