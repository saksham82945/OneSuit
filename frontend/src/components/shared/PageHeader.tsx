import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageBreadcrumb {
  label: string;
  /** Omit for the current page. */
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: LucideIcon;
  iconGradient?: string;
  backLink?: string;
  /** Optional trail shown above the title, e.g. Settings › Tags. */
  breadcrumbs?: PageBreadcrumb[];
  /** Stick to the top while the page scrolls (default true). */
  sticky?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  description,
  icon: Icon,
  iconGradient,
  backLink,
  breadcrumbs,
  sticky = true,
  actions,
  children,
  className,
}) => {
  const sub = subtitle || description;
  return (
    <header
      className={cn(
        'shrink-0 border-b border-gray-200/80 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75 dark:border-[#1c2725] dark:bg-[#0d1312]/90 dark:supports-[backdrop-filter]:bg-[#0d1312]/75',
        sticky && 'sticky top-0 z-20',
        className
      )}
    >
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center">
          {backLink && (
            <Link
              to={backLink}
              aria-label="Back"
              className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          {Icon && (
            <div
              className={cn(
                'relative mr-3 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-md ring-1 ring-inset ring-white/20',
                iconGradient || 'bg-gradient-to-br from-teal-500 to-emerald-600 shadow-emerald-500/25'
              )}
            >
              {/* soft highlight for depth */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" aria-hidden />
              <Icon className="relative h-4 w-4 text-white" />
            </div>
          )}
          <div className="min-w-0">
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="mb-0.5">
                <ol className="flex min-w-0 items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {breadcrumbs.map((b, i) => (
                    <li key={`${b.label}-${i}`} className="flex min-w-0 items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
                      {b.href ? (
                        <Link to={b.href} className="truncate font-normal text-gray-500 hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-300">
                          {b.label}
                        </Link>
                      ) : (
                        <span className="truncate" aria-current="page">{b.label}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <h1 className="truncate text-lg font-semibold leading-tight text-gray-900 sm:text-xl dark:text-white">{title}</h1>
            {sub && <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
          </div>
        </div>
        {(actions || children) && (
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {actions}
            {children}
          </div>
        )}
      </div>
    </header>
  );
};
