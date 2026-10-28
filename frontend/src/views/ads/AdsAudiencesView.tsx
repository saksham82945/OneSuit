import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Contact, Loader2, Pencil, Plus, Tags, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import {
  AUDIENCE_SOURCES,
  adsApi,
  audienceSourceLabel,
  errorMessage,
  formatDate,
  formatNumber,
  useAdsSetup,
  type Audience,
  type AudienceInput,
  type AudienceSource,
} from './adsApi';
import { AdsPage, EmptyCard, Field, cardCls, inputCls, outlineBtnCls, primaryBtnCls, textareaCls } from './AdsShared';

const SOURCE_ICONS: Record<AudienceSource, React.ElementType> = {
  all_contacts: Contact,
  contacts_tag: Tags,
  leads: UserPlus,
};

export const AdsAudiencesView: React.FC = () => {
  const { setup } = useAdsSetup();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Audience | null>(null);
  const [toDelete, setToDelete] = useState<Audience | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAudiences(await adsApi.listAudiences());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load audiences'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
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

  return (
    <AdsPage
      title="Audiences"
      subtitle="Saved groups of people to target with your ads"
      icon={UsersRound}
      setup={setup}
      actions={
        canWrite && (
          <Button size="sm" className={primaryBtnCls} onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create audience
          </Button>
        )
      }
    >
      {loadError ? (
        <div className={cardCls}>
          <ErrorState title="Couldn't load audiences" description={loadError} onRetry={load} />
        </div>
      ) : loading && audiences.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn(cardCls, 'h-40 animate-pulse')} />
          ))}
        </div>
      ) : audiences.length === 0 ? (
        <EmptyCard
          icon={UsersRound}
          title="No audiences yet"
          description="Target your existing contacts, contacts with specific tags, or people who already became leads — Meta finds similar people too."
          action={
            canWrite && (
              <Button size="sm" className={primaryBtnCls} onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create audience
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {audiences.map((a) => {
            const Icon = SOURCE_ICONS[a.source] || UsersRound;
            return (
              <article key={a.id} className={cn(cardCls, 'flex flex-col p-4')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold truncate">{a.name}</h3>
                      <p className="text-[11px] text-gray-400">{audienceSourceLabel(a.source)}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold tabular-nums leading-tight">{formatNumber(a.size)}</p>
                    <p className="text-[10px] text-gray-400">people</p>
                  </div>
                </div>
                {a.description && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{a.description}</p>}
                {a.source === 'contacts_tag' && a.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {a.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-teal-200/60 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-800 dark:bg-teal-950/50 dark:border-teal-900 dark:text-teal-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 pt-3 mt-4 dark:border-white/[0.06]">
                  <span className="text-[11px] text-gray-400">Created {formatDate(a.created_at)}</span>
                  {canWrite && (
                    <div className="flex items-center gap-0.5">
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
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

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
  const [data, setData] = useState<AudienceInput>({ name: '', source: 'all_contacts', tags: [], description: '' });
  const [allTags, setAllTags] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setData(
      audience
        ? { name: audience.name, source: audience.source, tags: audience.tags || [], description: audience.description || '' }
        : { name: '', source: 'all_contacts', tags: [], description: '' }
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
