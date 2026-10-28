import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Eye, Loader2, MessageSquare, Plus, Trash2, UserCheck, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import {
  LEAD_SOURCES,
  adsApi,
  downloadCsv,
  errorMessage,
  formatDate,
  formatNumber,
  leadSourceLabel,
  useAdsSetup,
  type Lead,
  type LeadForm,
} from './adsApi';
import { AdsPage, Field, cardCls, inputCls, nativeSelectCls, outlineBtnCls, primaryBtnCls } from './AdsShared';

const sourceStyles: Record<string, string> = {
  lead_form: 'bg-blue-50 text-blue-800 border-blue-200/60 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900',
  click_to_whatsapp: 'bg-emerald-50 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
  manual: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:border-white/10',
};

export const AdsLeadsView: React.FC = () => {
  const { setup } = useAdsSetup();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forms, setForms] = useState<LeadForm[]>([]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [source, setSource] = useState('');
  const [formId, setFormId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [addOpen, setAddOpen] = useState(false);
  const [viewing, setViewing] = useState<Lead | null>(null);
  const [toDelete, setToDelete] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    adsApi.listForms().then(setForms).catch(() => setForms([]));
  }, []);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const res = await adsApi.listLeads({
        search: debouncedSearch || undefined,
        source: source || undefined,
        form_id: formId || undefined,
        page,
        limit: pageSize,
      });
      if (id !== seq.current) return;
      setLeads(res.leads);
      setTotal(res.total);
      setLoadError(null);
    } catch (err) {
      if (id === seq.current) setLoadError(errorMessage(err, 'Failed to load leads'));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [debouncedSearch, source, formId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = Boolean(debouncedSearch || source || formId);

  const toContact = async (lead: Lead) => {
    setConvertingId(lead.id);
    try {
      const { contact_id } = await adsApi.leadToContact(lead.id);
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, contact_id } : l)));
      toast.success(`${lead.name || lead.phone} added to contacts`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add this lead to contacts'));
    } finally {
      setConvertingId(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await adsApi.deleteLead(toDelete.id);
      toast.success('Lead deleted');
      setToDelete(null);
      if (leads.length === 1 && page > 1) setPage(page - 1);
      else load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete lead'));
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = () => {
    if (leads.length === 0) {
      toast.info('No leads to export on this page');
      return;
    }
    const answerKeys = Array.from(new Set(leads.flatMap((l) => Object.keys(l.answers || {}))));
    downloadCsv(
      `ad-leads-page-${page}.csv`,
      ['Name', 'Phone', 'Email', 'Source', 'Campaign', 'Form', 'In contacts', 'Created', ...answerKeys],
      leads.map((l) => [
        l.name,
        l.phone,
        l.email,
        leadSourceLabel(l.source),
        l.campaign_name,
        l.form_name,
        l.contact_id ? 'Yes' : 'No',
        l.created_at,
        ...answerKeys.map((k) => l.answers?.[k] ?? ''),
      ])
    );
  };

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      label: 'Lead',
      render: (l) => (
        <div className="flex flex-col min-w-[160px]">
          <button
            type="button"
            onClick={() => setViewing(l)}
            className="text-left font-semibold text-gray-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-300 truncate max-w-[220px]"
          >
            {l.name || 'Unnamed lead'}
          </button>
          <span className="text-[11px] text-gray-400 truncate max-w-[220px]">{[l.phone && `+${l.phone}`, l.email].filter(Boolean).join(' · ') || '—'}</span>
        </div>
      ),
    },
    {
      key: 'source',
      label: 'Source',
      render: (l) => (
        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', sourceStyles[l.source] || sourceStyles.manual)}>
          {leadSourceLabel(l.source)}
        </span>
      ),
    },
    {
      key: 'origin',
      label: 'Campaign / Form',
      render: (l) => (
        <div className="text-[11px] leading-relaxed">
          <div className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{l.campaign_name || '—'}</div>
          {l.form_name && <div className="text-gray-400 truncate max-w-[200px]">{l.form_name}</div>}
        </div>
      ),
    },
    { key: 'created_at', label: 'Received', render: (l) => <span className="text-gray-500 whitespace-nowrap">{formatDate(l.created_at, true)}</span> },
    {
      key: 'contact',
      label: 'Contact',
      render: (l) =>
        l.contact_id ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
            <UserCheck className="h-3.5 w-3.5" /> In contacts
          </span>
        ) : canWrite ? (
          <Button
            size="sm"
            variant="outline"
            disabled={convertingId === l.id || !l.phone}
            title={!l.phone ? 'This lead has no phone number' : undefined}
            onClick={() => toContact(l)}
            className="h-7 rounded-lg border-teal-200 bg-white px-2 text-[11px] font-semibold text-spruce-dark hover:bg-spruce-light dark:bg-transparent dark:border-teal-900 dark:text-teal-300"
          >
            {convertingId === l.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <UserPlus className="h-3 w-3 mr-1" />}
            Add to contacts
          </Button>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (l) => (
        <div className="flex items-center justify-end gap-1">
          {l.contact_id && (
            <Link to={`/chat/${l.contact_id}`}>
              <IconButton icon={MessageSquare} label="Open chat" className="text-gray-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40" />
            </Link>
          )}
          <IconButton icon={Eye} label="View details" className="text-gray-500 hover:text-gray-900 dark:hover:text-white" onClick={() => setViewing(l)} />
          {canWrite && (
            <IconButton
              icon={Trash2}
              label="Delete"
              className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => setToDelete(l)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <AdsPage
      title="Leads"
      subtitle="People who responded to your ads"
      icon={Users}
      setup={setup}
      actions={
        <>
          <Button variant="outline" size="sm" className={outlineBtnCls} onClick={exportCsv} disabled={loading}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
          {canWrite && (
            <Button size="sm" className={primaryBtnCls} onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add lead
            </Button>
          )}
        </>
      }
    >
      <div className={cn(cardCls, 'p-4 sm:p-5 space-y-4')}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="shrink-0">
            <h2 className="text-sm font-bold">All leads</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatNumber(total)} leads{filtered ? ' match your filters' : ''}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,240px)_minmax(0,170px)_minmax(0,170px)]">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone, email…" />
            <select
              aria-label="Filter by source"
              className={nativeSelectCls}
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sources</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by form"
              className={nativeSelectCls}
              value={formId}
              onChange={(e) => {
                setFormId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All forms</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadError ? (
          <ErrorState title="Couldn't load leads" description={loadError} onRetry={load} />
        ) : (
          <DataTable
            items={leads}
            columns={columns}
            isLoading={loading}
            emptyIcon={Users}
            emptyTitle={filtered ? 'No leads match your filters' : 'No leads yet'}
            emptyDescription={
              filtered
                ? 'Try clearing the search or filters.'
                : 'Leads from Lead Form and Click-to-WhatsApp ads appear here automatically. You can also add one by hand.'
            }
            emptyAction={
              canWrite && !filtered ? (
                <Button size="sm" className={primaryBtnCls} onClick={() => setAddOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add lead
                </Button>
              ) : undefined
            }
            currentPage={page}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}
      </div>

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} forms={forms} onSaved={() => (page === 1 ? load() : setPage(1))} />

      <LeadDetailsDialog lead={viewing} forms={forms} onClose={() => setViewing(null)} />

      <DeleteConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete lead"
        itemName={toDelete?.name || toDelete?.phone}
        isSubmitting={deleting}
        onConfirm={remove}
      />
    </AdsPage>
  );
};

// ---------------------------------------------------------------------------

const AddLeadDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  forms: LeadForm[];
  onSaved: () => void;
}> = ({ open, onOpenChange, forms, onSaved }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [formId, setFormId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setEmail('');
    setFormId('');
    setAnswers({});
    setError(null);
  }, [open]);

  const extraQuestions = useMemo(
    () => (forms.find((f) => f.id === formId)?.questions || []).filter((q) => q.type === 'city' || q.type === 'short_text'),
    [forms, formId]
  );

  const submit = async () => {
    if (!name.trim() && !phone.trim()) {
      setError('Enter a name or a phone number.');
      return;
    }
    setSaving(true);
    setError(null);
    const cleanAnswers = Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim()));
    try {
      await adsApi.createLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        source: 'manual',
        form_id: formId || undefined,
        answers: Object.keys(cleanAnswers).length ? cleanAnswers : undefined,
      });
      toast.success('Lead added');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not add the lead'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base">Add lead</DialogTitle>
          <DialogDescription className="text-xs">Record a lead you received outside of ads (e.g. a call or walk-in).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Full name" htmlFor="lead-name">
            <Input id="lead-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" />
          </Field>
          <Field label="Phone number" htmlFor="lead-phone" hint="Include the country code, e.g. 919876543210.">
            <Input id="lead-phone" type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="919876543210" />
          </Field>
          <Field label="Email" htmlFor="lead-email">
            <Input id="lead-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@example.com" />
          </Field>
          <Field label="Lead form (optional)" htmlFor="lead-form">
            <select id="lead-form" className={nativeSelectCls} value={formId} onChange={(e) => setFormId(e.target.value)}>
              <option value="">None</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          {extraQuestions.map((q) => (
            <Field key={q.key} label={q.label} htmlFor={`lead-q-${q.key}`}>
              <Input
                id={`lead-q-${q.key}`}
                className={inputCls}
                value={answers[q.key] || ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
              />
            </Field>
          ))}
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
          <Button size="sm" className={primaryBtnCls} onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Add lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LeadDetailsDialog: React.FC<{ lead: Lead | null; forms: LeadForm[]; onClose: () => void }> = ({ lead, forms, onClose }) => {
  const labelFor = (key: string) => {
    for (const f of forms) {
      const q = f.questions.find((x) => x.key === key);
      if (q) return q.label;
    }
    return key.replace(/_/g, ' ');
  };
  const rows: [string, React.ReactNode][] = lead
    ? [
        ['Phone', lead.phone ? `+${lead.phone}` : '—'],
        ['Email', lead.email || '—'],
        ['Source', leadSourceLabel(lead.source)],
        ['Campaign', lead.campaign_name || '—'],
        ['Form', lead.form_name || '—'],
        ['Received', formatDate(lead.created_at, true)],
        ...Object.entries(lead.answers || {}).map(([k, v]) => [labelFor(k), String(v)] as [string, React.ReactNode]),
      ]
    : [];
  return (
    <Dialog open={Boolean(lead)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md rounded-2xl">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base">{lead?.name || 'Unnamed lead'}</DialogTitle>
          <DialogDescription className="text-xs">Lead details and form answers</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-white/[0.06] dark:border-white/10">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-3 py-2 text-xs">
              <dt className="capitalize text-gray-500 dark:text-gray-400">{k}</dt>
              <dd className="font-medium break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
};

export default AdsLeadsView;
