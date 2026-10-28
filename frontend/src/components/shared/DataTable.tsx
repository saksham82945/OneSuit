import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (item: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  items: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  rowKey?: (item: T, index: number) => string;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  currentPage?: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  items,
  columns,
  isLoading,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  rowKey = (_item, idx) => _item.id || `row-${idx}`,
  sortKey,
  sortDirection = 'desc',
  onSort,
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  className,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const showPagination = totalItems > pageSize && onPageChange;

  const handleHeaderClick = (col: Column<T>) => {
    if (!col.sortable || !onSort) return;
    const nextDir = sortKey === col.key && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(col.key, nextDir);
  };

  return (
    <div className={cn('w-full space-y-4', className)}>
      <div className="rounded-xl border border-gray-200/90 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[#141b1a] shadow-xs">
        <Table>
          <TableHeader className="bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200/80 dark:border-white/[0.06]">
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    'py-3.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider',
                    col.width,
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.sortable && 'cursor-pointer select-none hover:text-gray-900 dark:hover:text-white transition-colors'
                  )}
                  onClick={() => handleHeaderClick(col)}
                >
                  <div
                    className={cn(
                      'flex items-center gap-1.5',
                      col.align === 'right' && 'justify-end',
                      col.align === 'center' && 'justify-center'
                    )}
                  >
                    <span>{col.label}</span>
                    {col.sortable && (
                      <span className="shrink-0 text-gray-400">
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-teal-600 dark:text-emerald-400" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-teal-600 dark:text-emerald-400" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100 transition-opacity" />
                        )}
                      </span>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, rIdx) => (
                <TableRow key={`skeleton-${rIdx}`}>
                  {columns.map((col) => (
                    <TableCell key={`sk-${rIdx}-${col.key}`} className="py-4">
                      <div className="h-4 bg-gray-100 dark:bg-white/[0.08] rounded-md animate-pulse w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-52 text-center">
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    {EmptyIcon && (
                      <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 shadow-inner">
                        <EmptyIcon className="h-6 w-6" />
                      </div>
                    )}
                    {emptyTitle && (
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{emptyTitle}</p>
                    )}
                    {emptyDescription && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm leading-relaxed">
                        {emptyDescription}
                      </p>
                    )}
                    {emptyAction && <div className="mt-4">{emptyAction}</div>}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, idx) => (
                <TableRow
                  key={rowKey(item, idx)}
                  className="hover:bg-teal-50/30 dark:hover:bg-white/[0.03] transition-colors group"
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        'py-3.5 text-xs text-gray-700 dark:text-gray-300 font-medium',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center'
                      )}
                    >
                      {col.render ? col.render(item, idx) : item[col.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between px-2 text-xs text-gray-500 dark:text-gray-400">
          <div>
            Showing <span className="font-semibold text-gray-700 dark:text-gray-300">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-300">{Math.min(currentPage * pageSize, totalItems)}</span> of{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-300">{totalItems}</span> entries
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="h-8 px-2.5 text-xs rounded-lg border-gray-200 dark:border-white/10"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
            </Button>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-gray-200">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="h-8 px-2.5 text-xs rounded-lg border-gray-200 dark:border-white/10"
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
