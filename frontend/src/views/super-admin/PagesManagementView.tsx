import React, { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Plus, Pencil, Trash2, ExternalLink, Heading2, List, Bold, Eye, Info } from 'lucide-react';
import { EntriesTable, type EntryColumn } from './EntriesTable';
import { RichText } from '@/views/public/site/SiteKit';
import { refreshSiteContent } from '@/services/siteContent';
import { toast } from 'sonner';
import { superAdminService, formatDate, type CmsPage } from '@/services/superAdmin';
import { fieldClass, errorMessage } from './shared';
import { cn } from '@/lib/utils';

const emptyPage = { title: '', slug: '', content: '', is_published: false };
/** Starting text for common pages; the super admin edits it to fit. */
const TEMPLATES: { title: string; slug: string; content: string }[] = [
  { title: 'About Us', slug: 'about-us', content: '## Who we are\nTell visitors about your company.\n\n## What we do\n- Point one\n- Point two\n\n## Our mission\nWhy you do what you do.' },
  { title: 'Privacy Policy', slug: 'privacy-policy', content: '## Information we collect\nWhat you collect and why.\n\n## How we use it\nHow the data is used.\n\n## Security\nHow the data is protected.\n\n## Contact\nHow to reach you about privacy.' },
  { title: 'Terms & Conditions', slug: 'terms-and-conditions', content: '## Using the service\nRules for using the service.\n\n## Your account\nAccount responsibilities.\n\n## Billing\nHow billing works.\n\n## Liability\nLimits of liability.' },
  { title: 'Refund & Cancellation Policy', slug: 'refund-policy', content: '## Cancellation\nHow to cancel.\n\n## Refunds\nWhen refunds are given.' },
  { title: 'Contact Us', slug: 'contact-us', content: '## Get in touch\nAddress, phone and email.\n\n## Business hours\nMonday – Saturday, 9:00 AM – 7:00 PM' },
];

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const PagesManagementView: React.FC = () => {
  const [pages, setPages] = useState<CmsPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const [form, setForm] = useState(emptyPage);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<CmsPage | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [details, setDetails] = useState<CmsPage | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  /** Insert formatting at the cursor (or around the selected text). */
  const insert = (before: string, after = '', placeholder = '') => {
    const el = editorRef.current;
    const start = el?.selectionStart ?? form.content.length;
    const end = el?.selectionEnd ?? form.content.length;
    const selected = form.content.slice(start, end) || placeholder;
    const next = form.content.slice(0, start) + before + selected + after + form.content.slice(end);
    setForm({ ...form, content: next });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + before.length;
      el?.setSelectionRange(pos, pos + selected.length);
    });
  };

  const load = () => {
    setError(null);
    superAdminService.listPages().then(setPages).catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const replacePage = (updated: CmsPage) => setPages((list) => (list ?? []).map((p) => (p.id === updated.id ? updated : p)));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPage);
    setSlugTouched(false);
    setDialogOpen(true);
  };

  const openEdit = (p: CmsPage) => {
    setEditing(p);
    setForm({ title: p.title, slug: p.slug, content: p.content, is_published: p.is_published });
    setSlugTouched(true);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = slugify(form.slug || form.title);
    if ((pages ?? []).some((p) => p.slug === slug && p.id !== editing?.id)) {
      toast.error(`Another page already uses /${slug}`);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        replacePage(await superAdminService.updatePage(editing.id, { ...form, slug }));
        toast.success('Page saved');
        void refreshSiteContent();
      } else {
        const created = await superAdminService.createPage({ ...form, slug });
        setPages((list) => [created, ...(list ?? [])]);
        toast.success('Page created');
        void refreshSiteContent();
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save page'));
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (p: CmsPage) => {
    try {
      replacePage(await superAdminService.updatePage(p.id, { is_published: !p.is_published }));
      void refreshSiteContent();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await superAdminService.deletePage(toDelete.id);
      setPages((list) => (list ?? []).filter((p) => p.id !== toDelete.id));
      toast.success('Page deleted');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setToDelete(null);
    }
  };

  /** Plain text start of the page, for the Description column. */
  const snippet = (text: string) => {
    const plain = text.replace(/[#*>-]/g, '').replace(/\s+/g, ' ').trim();
    return plain.length > 28 ? plain.slice(0, 28) + '…' : plain || '—';
  };

  const columns: EntryColumn<CmsPage>[] = [
    {
      key: 'title',
      label: 'Title',
      sortValue: (p) => p.title,
      render: (p) => (
        <a
          href={`/p/${p.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-emerald-400 hover:underline light:text-emerald-600"
          title={p.is_published ? 'Open on the website' : 'Not published yet'}
        >
          {p.title} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ),
    },
    { key: 'slug', label: 'Slug', sortValue: (p) => p.slug, render: (p) => <span className="text-xs">{p.slug}</span> },
    { key: 'description', label: 'Description', render: (p) => <span className="text-xs text-white/60 light:text-gray-600">{snippet(p.content)}</span> },
    {
      key: 'status',
      label: 'Status',
      sortValue: (p) => (p.is_published ? 1 : 0),
      render: (p) => (
        <button
          type="button"
          onClick={() => togglePublished(p)}
          title={p.is_published ? 'Click to make inactive' : 'Click to publish'}
          className={cn('text-xs font-medium hover:underline', p.is_published ? 'text-emerald-400 light:text-emerald-600' : 'text-white/40 light:text-gray-400')}
        >
          {p.is_published ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      render: (p) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" className="h-7 px-2.5 text-xs bg-slate-800 hover:bg-slate-700 text-white" onClick={() => setDetails(p)}>
            <Info className="h-3 w-3 mr-1" /> Details
          </Button>
          <Button size="sm" className="h-7 px-2.5 text-xs bg-sky-700 hover:bg-sky-600 text-white" onClick={() => openEdit(p)}>
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </Button>
          <Button size="sm" className="h-7 px-2.5 text-xs bg-rose-600 hover:bg-rose-500 text-white" onClick={() => setToDelete(p)}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Website Pages"
        subtitle="About us, privacy policy, terms, refund policy and any other page. Published pages are linked in the website menu and footer."
        icon={FileText}
        iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
        actions={
          <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add new page
          </Button>
        }
      />
      <div className="p-6">
        {error ? (
          <ErrorState title="Couldn't load pages" description={error} onRetry={load} />
        ) : (
          <EntriesTable
            rows={pages ?? []}
            columns={columns}
            getId={(p) => p.id}
            searchText={(p) => [p.title, p.slug, p.content].join(' ')}
            loading={pages === null}
            emptyText="No pages yet. Add a page such as Terms of Service."
            defaultPageSize={10}
          />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[1100px] max-h-[92vh] overflow-y-auto">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.title}` : 'New page'}</DialogTitle>
              <DialogDescription>
                Use the buttons for headings, bullet lists and bold text. The preview shows how visitors will see it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              {!editing && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-white/40 light:text-gray-500">Start from:</span>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, title: t.title, slug: t.slug, content: t.content });
                        setSlugTouched(true);
                      }}
                      className="rounded-full border border-white/10 px-3 py-1 text-[11px] hover:bg-white/[0.06] light:border-gray-200 light:hover:bg-gray-50"
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Title *</Label>
                  <Input
                    required
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })
                    }
                    className={fieldClass}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Page address</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setForm({ ...form, slug: e.target.value });
                    }}
                    className={cn(fieldClass, 'font-mono')}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-8 border-white/10 light:border-gray-200" onClick={() => insert('\n## ', '\n', 'Heading')}>
                    <Heading2 className="h-3.5 w-3.5 mr-1" /> Heading
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 border-white/10 light:border-gray-200" onClick={() => insert('\n- ', '', 'List item')}>
                    <List className="h-3.5 w-3.5 mr-1" /> List
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 border-white/10 light:border-gray-200" onClick={() => insert('**', '**', 'bold text')}>
                    <Bold className="h-3.5 w-3.5 mr-1" /> Bold
                  </Button>
                </div>
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setShowPreview(!showPreview)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> {showPreview ? 'Hide preview' : 'Show preview'}
                </Button>
              </div>
              <div className={cn('grid gap-3', showPreview && 'lg:grid-cols-2')}>
                <Textarea
                  ref={editorRef}
                  rows={18}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder={'## Heading\nA paragraph of text.\n\n- A list item\n- Another item'}
                  className={cn(fieldClass, 'font-mono text-xs leading-relaxed')}
                />
                {showPreview && (
                  <div className="max-h-[440px] overflow-y-auto rounded-md border border-white/10 bg-white dark:bg-[#080d11] p-5 text-gray-900 dark:text-white light:border-gray-200">
                    <h1 className="text-2xl font-extrabold">{form.title || 'Page title'}</h1>
                    {form.content.trim() ? (
                      <RichText text={form.content} className="mt-2 text-sm" />
                    ) : (
                      <p className="mt-2 text-sm text-gray-400">Start typing to see the page.</p>
                    )}
                  </div>
                )}
              </div>
              <label className="flex items-center justify-between text-xs">
                Published
                <Switch checked={form.is_published} onCheckedChange={(is_published) => setForm({ ...form, is_published })} />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-violet-600 hover:bg-violet-500 text-white">
                {saving ? 'Saving…' : editing ? 'Save page' : 'Create page'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="sm:max-w-[720px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{details?.title}</DialogTitle>
            <DialogDescription>
              /p/{details?.slug} · {details?.is_published ? 'Active' : 'Inactive'} · Last updated {details ? formatDate(details.updated_at) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-white/10 bg-white dark:bg-[#080d11] p-5 text-gray-900 dark:text-white light:border-gray-200">
            {details && <RichText text={details.content} className="text-sm" />}
          </div>
          <DialogFooter>
            {details?.is_published && (
              <Button variant="outline" className="border-white/10 light:border-gray-200" asChild>
                <a href={`/p/${details.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-2" /> Open on website</a>
              </Button>
            )}
            <Button
              className="bg-sky-700 hover:bg-sky-600 text-white"
              onClick={() => {
                if (details) openEdit(details);
                setDetails(null);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Delete page" itemName={toDelete?.title} onConfirm={handleDelete} />
    </div>
  );
};

export default PagesManagementView;
