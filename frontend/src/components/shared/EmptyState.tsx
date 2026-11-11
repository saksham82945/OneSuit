import React from 'react';
import { Link } from 'react-router-dom';
import { Inbox, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateAction {
  label: string;
  /** Navigate here… */
  href?: string;
  /** …or run this. */
  onClick?: () => void;
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: EmptyStateAction;
  /** Extra controls under the action (e.g. a secondary link). */
  children?: React.ReactNode;
  /** `compact` for cards and table bodies. */
  size?: 'default' | 'compact';
  className?: string;
}

/** A friendly "nothing here yet" block with an optional next step. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  children,
  size = 'default',
  className,
}) => {
  const compact = size === 'compact';
  const ActionIcon = action?.icon;
  const actionContent = action && (
    <>
      {ActionIcon && <ActionIcon className="mr-1.5 h-4 w-4" />}
      {action.label}
    </>
  );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        compact ? 'py-8' : 'py-14',
        className
      )}
    >
      <div
        className={cn(
          'relative mb-4 flex items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-100/70 text-teal-700 ring-1 ring-inset ring-teal-600/10 dark:from-teal-500/15 dark:to-emerald-500/5 dark:text-teal-300 dark:ring-teal-400/15',
          compact ? 'h-11 w-11' : 'h-14 w-14'
        )}
        aria-hidden
      >
        <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
      </div>
      <h3 className={cn('font-semibold text-gray-900 dark:text-white', compact ? 'text-sm' : 'text-base')}>{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Button asChild size="sm">
              <Link to={action.href} className="text-primary-foreground">
                {actionContent}
              </Link>
            </Button>
          ) : (
            <Button size="sm" onClick={action.onClick}>
              {actionContent}
            </Button>
          )}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};
