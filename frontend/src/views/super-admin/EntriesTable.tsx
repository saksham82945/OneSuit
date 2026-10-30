import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { cardClass } from './shared';

export interface EntryColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
}

export type SortDir = 'asc' | 'desc';

interface EntriesTableProps<T> {
  rows: T[];
  columns: EntryColumn<T>[];
  getId: (row: T) => string;
  /** Text the search box matches against. */
  searchText: (row: T) => string;
  defaultSort?: { key: string; dir: SortDir };
  emptyText?: string;
  loading?: boolean;
  /** Optional details shown under a row when its + is clicked. */
  renderDetails?: (row: T) => React.ReactNode;
  defaultPageSize?: number;
}

const PAGE_SIZES = [10, 25, 50, 100];

/** Table with "Show N entries", search, sortable columns and pages. */
export function EntriesTable<T>({
  rows,
  columns,
  getId,
  searchText,
  defaultSort,
  emptyText = 'No data available in table',
  loading,
  renderDetails,
  defaultPageSize = 25,
}: EntriesTableProps<T>) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : [...rows];
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sortValue) {
      const dir = sort!.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        const va = col.sortValue!(a);
        const vb = col.sortValue!(b);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir;
      });
    }
    return list;
  }, [rows, search, sort, columns, searchText]);

  useEffect(() => setPage(1), [search, pageSize, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const toggleOpen = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Page buttons: first, last and two around the current page.
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - current) <= 2
  );

  const th = 'px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-white/45 light:text-gray-500 whitespace-nowrap';

  return (
    <div className={cn('rounded-xl border', cardClass)}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <label className="flex items-center gap-2 text-sm text-white/60 light:text-gray-600">
          Show
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-8 rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm text-white light:border-gray-200 light:bg-white light:text-gray-900"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          entries
        </label>
        <label className="flex items-center gap-2 text-sm text-white/60 light:text-gray-600">
          Search:
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30 light:text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-56 pl-8" />
          </span>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-white/[0.06] light:border-gray-200 bg-white/[0.02] light:bg-gray-50/70">
            <tr>
              {columns.map((c, i) => {
                const active = sort?.key === c.key;
                const Arrow = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th key={c.key} className={cn(th, i === 0 && renderDetails && 'pl-10', c.className)}>
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-white light:hover:text-gray-900">
                        {c.label}
                        <Arrow className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] light:divide-gray-100">
            {loading ? (
              <tr><td colSpan={columns.length} className="p-8 text-center text-sm text-white/40 light:text-gray-400">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={columns.length} className="p-8 text-center text-sm text-white/40 light:text-gray-500 bg-white/[0.02] light:bg-gray-50">{search ? 'No matching records found' : emptyText}</td></tr>
            ) : (
              visible.map((row, ri) => {
                const id = getId(row);
                const isOpen = open.has(id);
                return (
                  <React.Fragment key={id}>
                    <tr className={cn('hover:bg-white/[0.02] light:hover:bg-gray-50', ri % 2 === 0 && 'bg-white/[0.01] light:bg-gray-50/40')}>
                      {columns.map((c, i) => (
                        <td key={c.key} className={cn('px-3 py-3 align-top', c.className)}>
                          {i === 0 && renderDetails ? (
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() => toggleOpen(id)}
                                aria-label={isOpen ? 'Hide details' : 'Show details'}
                                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                              >
                                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                              <div className="min-w-0">{c.render(row)}</div>
                            </div>
                          ) : (
                            c.render(row)
                          )}
                        </td>
                      ))}
                    </tr>
                    {isOpen && renderDetails && (
                      <tr className="bg-white/[0.02] light:bg-emerald-50/40">
                        <td colSpan={columns.length} className="px-10 py-3">{renderDetails(row)}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-white/50 light:text-gray-500">
        <span>
          Showing {filtered.length === 0 ? 0 : start + 1} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} entries
          {search && rows.length !== filtered.length && ` (filtered from ${rows.length} total entries)`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-50"
          >
            Previous
          </button>
          {pageNumbers.map((n, i) => (
            <React.Fragment key={n}>
              {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="px-1">…</span>}
              <button
                type="button"
                onClick={() => setPage(n)}
                className={cn(
                  'min-w-8 rounded-md px-2.5 py-1.5 text-xs',
                  n === current ? 'bg-emerald-600 text-white' : 'border border-white/10 hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-50'
                )}
              >
                {n}
              </button>
            </React.Fragment>
          ))}
          <button
            type="button"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Thursday 8th October 2026", like the reference screens. */
export const longDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })} ${day}${suffix} ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
};

/** Small solid status pill. */
export const StatusPill: React.FC<{ tone: 'green' | 'amber' | 'red' | 'gray' | 'blue'; children: React.ReactNode }> = ({ tone, children }) => {
  const tones = {
    green: 'bg-emerald-500 text-white',
    amber: 'bg-amber-500 text-white',
    red: 'bg-rose-500 text-white',
    gray: 'bg-gray-500 text-white',
    blue: 'bg-sky-500 text-white',
  };
  return <span className={cn('inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', tones[tone])}>{children}</span>;
};
