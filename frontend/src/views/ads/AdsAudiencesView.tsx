import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Contact, Facebook, Loader2, Pencil, Plus, RefreshCw, Tags, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchInput } from '@/components/shared/SearchInput';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { useBranding } from '@/services/branding';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import {
  AUDIENCE_SOURCES,
  AUDIENCE_TYPES,
  adsApi,
  audienceSourceLabel,
  audienceTypeLabel,
  errorMessage,
  formatDate,
  formatNumber,
  useAdsSetup,
  type Audience,
  type AudienceInput,
  type AudienceSource,
  type AudienceType,
  type FetchedList,
} from './adsApi';
import { Field, TablePager, UnderlineTabs, cardCls, inputCls, outlineBtnCls, primaryBtnCls, tdCls, textareaCls, thCls } from './AdsShared';
import { AdsPage } from './AdsPageShell';
import { AdsQuickGuide } from './AdsQuickGuide';

const SOURCE_ICONS: Record<AudienceSource, React.ElementType> = {
  all_contacts: Contact,
  contacts_tag: Tags,
  leads: UserPlus,
};

type Tab = 'ours' | 'fetched';
type TypeFilter = 'all' | AudienceType;

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [{ value: 'all', label: 'All' }, ...AUDIENCE_TYPES.map((t) => ({ value: t.value, label: t.label }))];

export const AdsAudiencesView: React.FC = () => {
  const { setup } = useAdsSetup();
  const { platform_name } = useBranding();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');

  const [tab, setTab] = useState<Tab>('ours');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [fetched, setFetched] = useState<FetchedList<Audience> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Audience | null>(null);
  const [toDelete, setToDelete] = useState<Audience | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAudiences(
        await adsApi.listAudiences({ type: typeFilter === 'all' ? undefined : typeFilter, search: debouncedSearch || undefined })
      );
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load audiences'));
    } finally {
      setLoading(false);
    }
  }, [typeFilter, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'fetched' || fetched) return;
    adsApi
      .listFetchedAudiences()
      .then(setFetched)
      .catch((err) => toast.error(errorMessage(err, 'Failed to load fetched audiences')));
  }, [tab, fetched]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await adsApi.sync();
      toast.success('Audiences synced from Meta');
      setFetched(null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not sync with Meta'));
    } finally {
      setSyncing(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await adsApi.deleteAudience(toDelete.id);
      toast.success('Audience deleted');
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete audience'));
    } finally {
      setDeleting(false);
    }
  };

  const rows = tab === 'fetched' ? (fetched?.items || []).filter((a) => typeFilter === 'all' || a.type === typeFilter) : audiences;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);
  const showActions = tab === 'ours' && canWrite;
  const colCount = showActions ? 6 : 5;

  return (
    <AdsPage
      title="Audiences"
      setup={setup}
      showCredits={false}
      actions={
        canWrite && (
          <Button size="sm" className={primaryBtnCls} onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Audience
          </Button>
        )
      }
    >
      <AdsQuickGuide />

      <section className={cn(cardCls, 'overflow-hidden')}>
        <div className="space-y-4 px-4 pt-4 sm:px-5">
          <UnderlineTabs
            value={tab}
            onChange={(v) => {
              setTab(v);
              setPage(1);
            }}
            options={[
              { value: 'ours', label: `${platform_name} Audiences` },
              { value: 'fetched', label: 'Fetched Audiences' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]" role="radiogroup" aria-label="Audience type">
              {TYPE_FILTERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={typeFilter === t.value}
                  onClick={() => {
                    setTypeFilter(t.value);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    typeFilter === t.value ? 'bg-white text-spruce-dark shadow-sm dark:bg-white/10 dark:text-teal-200' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className={outlineBtnCls} onClick={sync} disabled={syncing || !canWrite}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', syncing && 'animate-spin')} /> Sync
            </Button>
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by audience name"
              className="w-full sm:ml-auto sm:w-60"
            />
          </div>
        </div>

        {loadError && tab === 'ours' ? (
          <ErrorState title="Couldn't load audiences" description={loadError} onRetry={load} />
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] border-t border-gray-100 dark:border-white/[0.06]">
                <thead className="bg-gray-50/80 dark:bg-white/[0.03]">
                  <tr>
                    <th className={thCls}>Audience Name</th>
                    <th className={thCls}>Type</th>
                    <th className={thCls}>Source</th>
                    <th className={cn(thCls, 'text-right')}>Size</th>
                    <th className={thCls}>Created</th>
                    {showActions && <th className={cn(thCls, 'text-right')}>Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                  {loading && tab === 'ours' && audiences.length === 0 ? (
                    [0, 1, 2].map((i) => (
                      <tr key={i}>
                        <td colSpan={colCount} className="px-4 py-3">
                          <div className="h-5 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
                        </td>
                      </tr>
                    ))
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={colCount} className="px-4 py-12 text-center">
                        <UsersRound className="mx-auto h-8 w-8 text-gray-300" />
                        <p className="mt-2 text-sm font-semibold">
                          {tab === 'fetched' && fetched && !fetched.meta_connected
                            ? 'Facebook is not connected'
                            : debouncedSearch || typeFilter !== 'all'
                              ? 'No audiences match your filters'
                              : 'No audiences yet'}
                        </p>
                        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
                          {tab === 'fetched'
                            ? fetched?.message || 'Audiences from your Meta ad account appear here.'
                            : 'Target your contacts, contacts with specific tags, or people who became leads — Meta finds similar people too.'}
                        </p>
                        <div className="mt-3 flex justify-center">
                          {tab === 'fetched' && fetched && !fetched.meta_connected ? (
                            <Link to="/ads/setup">
                              <Button size="sm" className="h-9 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-semibold px-4">
                                <Facebook className="h-3.5 w-3.5 mr-1.5" /> Connect Facebook
                              </Button>
                            </Link>
                          ) : (
                            tab === 'ours' &&
                            canWrite &&
                            !debouncedSearch && (
                              <Button size="sm" className={primaryBtnCls} onClick={openCreate}>
                                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Audience
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paged.map((a) => {
                      const Icon = SOURCE_ICONS[a.source] || UsersRound;
                      return (
                        <tr key={a.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
                          <td className={tdCls}>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-spruce-light text-spruce-dark dark:bg-teal-950/50 dark:text-teal-300">
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="max-w-[240px] truncate font-semibold text-gray-900 dark:text-white">{a.name}</p>
                                {a.source === 'contacts_tag' && a.tags.length > 0 ? (
                                  <p className="max-w-[240px] truncate text-[11px] text-gray-400">{a.tags.join(', ')}</p>
                                ) : (
                                  a.description && <p className="max-w-[240px] truncate text-[11px] text-gray-400">{a.description}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={tdCls}>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
                              {audienceTypeLabel(a.type)}
                            </span>
                          </td>
                          <td className={tdCls}>{audienceSourceLabel(a.source)}</td>
                          <td className={cn(tdCls, 'text-right tabular-nums font-semibold')}>{formatNumber(a.size)}</td>
                          <td className={cn(tdCls, 'whitespace-nowrap text-gray-500')}>{formatDate(a.created_at)}</td>
                          {showActions && (
                            <td className={cn(tdCls, 'text-right')}>
                              <div className="flex items-center justify-end gap-0.5">
                                <IconButton
                                  icon={Pencil}
                                  label="Edit"
                                  className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
                                  onClick={() => {
                                    setEditing(a);
                                    setDialogOpen(true);
                                  }}
                                />
                                <IconButton
                                  icon={Trash2}
                                  label="Delete"
                                  className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                  onClick={() => setToDelete(a)}
                                />
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <TablePager
              page={page}
              pageSize={pageSize}
              total={rows.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              sizes={[10, 25, 50]}
            />
          </>
        )}
      </section>

      <AudienceDialog open={dialogOpen} onOpenChange={setDialogOpen} audience={editing} onSaved={load} />

      <DeleteConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete audience"
        itemName={toDelete?.name}
        isSubmitting={deleting}
        onConfirm={remove}
      />
    </AdsPage>
  );
};

const AudienceDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  audience: Audience | null;
  onSaved: () => void;
}> = ({ open, onOpenChange, audience, onSaved }) => {
  const [data, setData] = useState<AudienceInput>({ name: '', source: 'all_contacts', type: 'custom', tags: [], description: '' });
  const [allTags, setAllTags] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setData(
      audience
        ? { name: audience.name, source: audience.source, type: audience.type || 'custom', tags: audience.tags || [], description: audience.description || '' }
        : { name: '', source: 'all_contacts', type: 'custom', tags: [], description: '' }
    );
    setAllTags(null);
    adsApi
      .listTagNames()
      .then(setAllTags)
      .catch(() => setAllTags([]));
  }, [open, audience]);

  const toggleTag = (t: string) =>
    setData((d) => ({ ...d, tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] }));

  const save = async () => {
    if (!data.name.trim()) return setError('Give the audience a name.');
    if (data.source === 'contacts_tag' && data.tags.length === 0) return setError('Pick at least one tag.');
    setError(null);
    setSaving(true);
    const body: AudienceInput = {
      name: data.name.trim(),
      source: data.source,
      type: data.type || 'custom',
      tags: data.source === 'contacts_tag' ? data.tags : [],
      description: data.description.trim(),
    };
    try {
      if (audience) await adsApi.updateAudience(audience.id, body);
      else await adsApi.createAudience(body);
      toast.success(audience ? 'Audience updated' : 'Audience created');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the audience'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base">{audience ? 'Edit audience' : 'Create audience'}</DialogTitle>
          <DialogDescription className="text-xs">Choose who should see ads that use this audience.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Audience name" htmlFor="aud-name" required>
            <Input id="aud-name" className={inputCls} value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Repeat customers" />
          </Field>
          <Field label="Audience type" htmlFor="aud-type">
            <select
              id="aud-type"
              className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-100"
              value={data.type || 'custom'}
              onChange={(e) => setData({ ...data, type: e.target.value as AudienceType })}
            >
              {AUDIENCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.description}
                </option>
              ))}
            </select>
          </Field>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Source</p>
            <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Audience source">
              {AUDIENCE_SOURCES.map((s) => {
                const Icon = SOURCE_ICONS[s.value];
                const active = data.source === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setData({ ...data, source: s.value })}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                      active ? 'border-teal-600 bg-spruce-light ring-1 ring-teal-600 dark:bg-teal-950/40' : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-spruce-dark dark:text-teal-300' : 'text-gray-400')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">{s.label}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400">{s.description}</span>
                    </span>
                    {active && <Check className="h-4 w-4 text-teal-700 dark:text-teal-300" />}
                  </button>
                );
              })}
            </div>
          </div>
          {data.source === 'contacts_tag' && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Tags <span className="font-normal text-gray-400">({data.tags.length} selected)</span>
              </p>
              {allTags === null ? (
                <p className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tags…
                </p>
              ) : allTags.length === 0 && data.tags.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No tags yet.{' '}
                  <Link to="/settings/tags" className="font-semibold text-spruce-dark hover:underline dark:text-teal-300">
                    Create tags
                  </Link>
                </p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-white/10">
                  {Array.from(new Set([...allTags, ...data.tags])).map((t) => {
                    const on = data.tags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(t)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                          on
                            ? 'border-spruce-dark bg-spruce-dark text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-teal-300 dark:bg-transparent dark:border-white/10 dark:text-gray-300'
                        )}
                      >
                        {on && <Check className="h-3 w-3" />} {t}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <Field label="Description" htmlFor="aud-desc">
            <Textarea id="aud-desc" rows={2} className={textareaCls} value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} placeholder="Optional note for your team" />
          </Field>
          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className={primaryBtnCls} onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} {audience ? 'Save changes' : 'Create audience'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdsAudiencesView;
