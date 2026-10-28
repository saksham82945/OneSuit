import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardList, Eye, FileText, Loader2, Pencil, Plus, Send, Trash2, Undo2, X } from 'lucide-react';
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
  QUESTION_TYPES,
  adsApi,
  errorMessage,
  formatDate,
  formatNumber,
  questionTypeLabel,
  useAdsSetup,
  type FormQuestion,
  type LeadForm,
  type LeadFormInput,
  type QuestionType,
} from './adsApi';
import { AdsPage, EmptyCard, Field, StatusBadge, cardCls, inputCls, nativeSelectCls, outlineBtnCls, primaryBtnCls, textareaCls } from './AdsShared';

export const AdsFormsView: React.FC = () => {
  const { setup } = useAdsSetup();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');

  const [forms, setForms] = useState<LeadForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<LeadForm | null>(null);
  const [previewing, setPreviewing] = useState<LeadForm | null>(null);
  const [toDelete, setToDelete] = useState<LeadForm | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setForms(await adsApi.listForms());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load forms'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setBuilderOpen(true);
  };

  const togglePublish = async (f: LeadForm) => {
    const next = f.status === 'published' ? 'draft' : 'published';
    setTogglingId(f.id);
    try {
      await adsApi.updateForm(f.id, { status: next });
      setForms((fs) => fs.map((x) => (x.id === f.id ? { ...x, status: next } : x)));
      toast.success(next === 'published' ? 'Form published' : 'Form moved back to draft');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the form status'));
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await adsApi.deleteForm(toDelete.id);
      toast.success('Form deleted');
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete form'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdsPage
      title="Lead Forms"
      subtitle="Instant forms people fill in without leaving Facebook or Instagram"
      icon={ClipboardList}
      setup={setup}
      actions={
        canWrite && (
          <Button size="sm" className={primaryBtnCls} onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create form
          </Button>
        )
      }
    >
      {loadError ? (
        <div className={cardCls}>
          <ErrorState title="Couldn't load forms" description={loadError} onRetry={load} />
        </div>
      ) : loading && forms.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn(cardCls, 'h-44 animate-pulse')} />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <EmptyCard
          icon={ClipboardList}
          title="No lead forms yet"
          description="Build a form with the questions you need — name, phone, email, city or your own — and attach it to a Lead Form ad."
          action={
            canWrite && (
              <Button size="sm" className={primaryBtnCls} onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create form
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {forms.map((f) => (
            <article key={f.id} className={cn(cardCls, 'flex flex-col p-4')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">{f.name}</h3>
                    <p className="text-[11px] text-gray-400 truncate">{f.headline || 'No headline'}</p>
                  </div>
                </div>
                <StatusBadge status={f.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {f.questions.slice(0, 4).map((q) => (
                  <span key={q.key} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    {q.label}
                  </span>
                ))}
                {f.questions.length > 4 && <span className="text-[10px] text-gray-400">+{f.questions.length - 4} more</span>}
                {f.questions.length === 0 && <span className="text-[11px] text-gray-400">No questions yet</span>}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
                <span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatNumber(f.leads_count)}</span> leads
                </span>
                <span>Created {formatDate(f.created_at)}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
                {canWrite ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={togglingId === f.id}
                    onClick={() => togglePublish(f)}
                    className={cn(outlineBtnCls, 'h-8 text-[11px]')}
                  >
                    {togglingId === f.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : f.status === 'published' ? (
                      <Undo2 className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <Send className="h-3.5 w-3.5 mr-1" />
                    )}
                    {f.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-0.5">
                  <IconButton icon={Eye} label="Preview" className="text-gray-500 hover:text-gray-900 dark:hover:text-white" onClick={() => setPreviewing(f)} />
                  {canWrite && (
                    <IconButton
                      icon={Pencil}
                      label="Edit"
                      className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      onClick={() => {
                        setEditing(f);
                        setBuilderOpen(true);
                      }}
                    />
                  )}
                  {canWrite && (
                    <IconButton
                      icon={Trash2}
                      label="Delete"
                      className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      onClick={() => setToDelete(f)}
                    />
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <FormBuilderDialog open={builderOpen} onOpenChange={setBuilderOpen} form={editing} onSaved={load} />

      <Dialog open={Boolean(previewing)} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-sm rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">Preview · {previewing?.name}</DialogTitle>
            <DialogDescription className="text-xs">How people see this form on Facebook & Instagram</DialogDescription>
          </DialogHeader>
          {previewing && <FormPreview form={previewing} pageName={setup?.page_name} />}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete form"
        itemName={toDelete?.name}
        isSubmitting={deleting}
        onConfirm={remove}
      />
    </AdsPage>
  );
};

// ---------------------------------------------------------------------------

const FormPreview: React.FC<{ form: Pick<LeadForm, 'headline' | 'description' | 'questions' | 'privacy_url' | 'thank_you_message' | 'name'>; pageName?: string }> = ({
  form,
  pageName,
}) => {
  const [submitted, setSubmitted] = useState(false);
  const placeholder = (t: QuestionType) => QUESTION_TYPES.find((q) => q.value === t)?.placeholder || '';
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:bg-white/[0.03] dark:border-white/10">
      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-[#151c1b]">
        {submitted ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-2 text-sm font-bold">Thanks, you're all set!</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">
              {form.thank_you_message || 'We will get in touch with you soon.'}
            </p>
            <button type="button" onClick={() => setSubmitted(false)} className="mt-3 text-[11px] font-semibold text-spruce-dark hover:underline dark:text-teal-300">
              Back to form
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-spruce-dark text-xs font-bold text-white">
                {(pageName || 'B')[0].toUpperCase()}
              </div>
              <span className="text-xs font-semibold">{pageName || 'Your Business'}</span>
            </div>
            <h4 className="mt-3 text-sm font-bold">{form.headline || form.name || 'Form headline'}</h4>
            {form.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">{form.description}</p>}
            <div className="mt-3 space-y-2.5">
              {form.questions.length === 0 && <p className="text-xs text-gray-400">Add questions to see them here.</p>}
              {form.questions.map((q) => (
                <div key={q.key}>
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{q.label || questionTypeLabel(q.type)}</p>
                  <div className="mt-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-400 dark:border-white/10">{placeholder(q.type)}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-gray-400">
              By submitting, you agree to share your info with {pageName || 'this business'}
              {form.privacy_url ? (
                <>
                  {' '}— see their{' '}
                  <a href={form.privacy_url} target="_blank" rel="noreferrer" className="underline">
                    privacy policy
                  </a>
                </>
              ) : null}
              .
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              className="mt-3 w-full rounded-lg bg-[#1877F2] py-2 text-xs font-bold text-white hover:bg-[#166fe5]"
            >
              Submit
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const makeKey = (type: QuestionType, existing: FormQuestion[]) => {
  const base = type === 'short_text' ? 'question' : type;
  if (type !== 'short_text' && !existing.some((q) => q.key === base)) return base;
  let i = 1;
  while (existing.some((q) => q.key === `${base}_${i}`)) i++;
  return `${base}_${i}`;
};

const DEFAULT_QUESTIONS: FormQuestion[] = [
  { key: 'full_name', label: 'Full name', type: 'full_name' },
  { key: 'phone', label: 'Phone number', type: 'phone' },
];

const FormBuilderDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: LeadForm | null;
  onSaved: () => void;
}> = ({ open, onOpenChange, form, onSaved }) => {
  const [data, setData] = useState<LeadFormInput>({
    name: '',
    headline: '',
    description: '',
    questions: DEFAULT_QUESTIONS,
    privacy_url: '',
    thank_you_message: '',
    status: 'draft',
  });
  const [newType, setNewType] = useState<QuestionType>('email');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNewType('email');
    setData(
      form
        ? {
            name: form.name,
            headline: form.headline,
            description: form.description,
            questions: form.questions,
            privacy_url: form.privacy_url,
            thank_you_message: form.thank_you_message,
            status: form.status,
          }
        : {
            name: '',
            headline: '',
            description: '',
            questions: DEFAULT_QUESTIONS,
            privacy_url: '',
            thank_you_message: 'Thanks for your interest! Our team will reach out to you on WhatsApp shortly.',
            status: 'draft',
          }
    );
  }, [open, form]);

  const set = <K extends keyof LeadFormInput>(k: K, v: LeadFormInput[K]) => setData((d) => ({ ...d, [k]: v }));
  const setQ = (i: number, patch: Partial<FormQuestion>) =>
    setData((d) => ({ ...d, questions: d.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) }));
  const move = (i: number, dir: -1 | 1) =>
    setData((d) => {
      const qs = [...d.questions];
      const j = i + dir;
      if (j < 0 || j >= qs.length) return d;
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...d, questions: qs };
    });
  const addQuestion = () =>
    setData((d) => ({
      ...d,
      questions: [...d.questions, { key: makeKey(newType, d.questions), label: questionTypeLabel(newType), type: newType }],
    }));

  const save = async (publish?: boolean) => {
    if (!data.name.trim()) return setError('Give the form a name.');
    if (data.questions.some((q) => !q.label.trim())) return setError('Every question needs a label.');
    const status = publish ? 'published' : data.status;
    if (status === 'published' && !data.privacy_url.trim()) return setError('Add a privacy policy link before publishing.');
    setError(null);
    setSaving(true);
    const body = { ...data, status, questions: data.questions.map((q) => ({ ...q, label: q.label.trim() })) };
    try {
      if (form) await adsApi.updateForm(form.id, body);
      else await adsApi.createForm(body);
      toast.success(form ? 'Form saved' : publish ? 'Form published' : 'Form saved as draft');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the form'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0 rounded-2xl">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/[0.06] text-left">
          <DialogTitle className="text-base">{form ? 'Edit lead form' : 'Create lead form'}</DialogTitle>
          <DialogDescription className="text-xs">Keep it short — forms with 3–4 questions convert best.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4 min-w-0">
            <Field label="Form name" htmlFor="form-name" required hint="Only you see this name.">
              <Input id="form-name" className={inputCls} value={data.name} onChange={(e) => set('name', e.target.value)} placeholder="Free consultation form" />
            </Field>
            <Field label="Headline" htmlFor="form-headline">
              <Input id="form-headline" className={inputCls} value={data.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Get a free consultation" />
            </Field>
            <Field label="Description" htmlFor="form-desc">
              <Textarea id="form-desc" rows={2} className={textareaCls} value={data.description} onChange={(e) => set('description', e.target.value)} placeholder="Tell us a little about you and we'll call you back within a day." />
            </Field>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Questions</p>
              <div className="space-y-2">
                {data.questions.map((q, i) => (
                  <div key={q.key} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-2 dark:bg-white/[0.02] dark:border-white/10">
                    <span className="w-5 text-center text-[11px] font-bold text-gray-400">{i + 1}</span>
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_130px] min-w-0">
                      <Input aria-label={`Question ${i + 1} label`} className={cn(inputCls, 'h-8')} value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} />
                      <span className="flex h-8 items-center rounded-lg bg-gray-100 px-2.5 text-[11px] font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300" title="Answer type">
                        {questionTypeLabel(q.type)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <IconButton icon={ArrowUp} label="Move up" size="icon" className="h-7 w-7 text-gray-500 hover:text-gray-900" disabled={i === 0} onClick={() => move(i, -1)} />
                      <IconButton
                        icon={ArrowDown}
                        label="Move down"
                        size="icon"
                        className="h-7 w-7 text-gray-500 hover:text-gray-900"
                        disabled={i === data.questions.length - 1}
                        onClick={() => move(i, 1)}
                      />
                      <IconButton
                        icon={X}
                        label="Remove question"
                        size="icon"
                        className="h-7 w-7 text-gray-500 hover:text-red-600"
                        onClick={() => set('questions', data.questions.filter((_, idx) => idx !== i))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <select aria-label="Question type to add" className={cn(nativeSelectCls, 'max-w-[200px]')} value={newType} onChange={(e) => setNewType(e.target.value as QuestionType)}>
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" className={outlineBtnCls} onClick={addQuestion}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add question
                </Button>
              </div>
            </div>

            <Field label="Privacy policy URL" htmlFor="form-privacy" hint="Required by Meta before the form can be published.">
              <Input id="form-privacy" className={inputCls} value={data.privacy_url} onChange={(e) => set('privacy_url', e.target.value)} placeholder="https://example.com/privacy" />
            </Field>
            <Field label="Thank-you message" htmlFor="form-thanks">
              <Textarea id="form-thanks" rows={2} className={textareaCls} value={data.thank_you_message} onChange={(e) => set('thank_you_message', e.target.value)} />
            </Field>
            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200">
                {error}
              </p>
            )}
          </div>
          <div className="lg:sticky lg:top-0 self-start">
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-gray-400">Live preview</p>
            <FormPreview form={data} />
          </div>
        </div>
        <DialogFooter className="gap-2 px-5 sm:px-6 py-4 border-t border-gray-100 dark:border-white/[0.06]">
          <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {data.status === 'draft' && (
            <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => save(true)} disabled={saving}>
              <Send className="h-3.5 w-3.5 mr-1.5" /> Save & publish
            </Button>
          )}
          <Button size="sm" className={primaryBtnCls} onClick={() => save()} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {form ? 'Save changes' : 'Save as draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdsFormsView;
