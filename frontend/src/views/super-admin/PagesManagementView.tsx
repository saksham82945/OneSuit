import React, { useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { ErrorState } from '@/components/shared/ErrorState';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { superAdminService, formatDate, type CmsPage } from '@/services/superAdmin';
import { cardClass, fieldClass, errorMessage } from './shared';
import { cn } from '@/lib/utils';

const emptyPage = { title: '', slug: '', content: '', is_published: false };
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
      } else {
        const created = await superAdminService.createPage({ ...form, slug });
        setPages((list) => [created, ...(list ?? [])]);
        toast.success('Page created');
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

  const columns: Column<CmsPage>[] = [
    {
      key: 'title',
      label: 'Page',
      render: (p) => (
        <div>
          <p className="text-[13px] font-medium text-white light:text-gray-900">{p.title}</p>
          <code className="text-[11px] text-white/40 light:text-gray-500">/{p.slug}</code>
        </div>
      ),
    },
    {
      key: 'is_published',
      label: 'Status',
      render: (p) => (
        <Badge
          className={cn(
            'border-0 shadow-none text-[11px]',
            p.is_published ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.08] text-white/50 light:bg-gray-100 light:text-gray-500'
          )}
        >
          {p.is_published ? 'Published' : 'Draft'}
        </Badge>
      ),
    },
    { key: 'updated_at', label: 'Last updated', render: (p) => <span className="text-xs">{formatDate(p.updated_at)}</span> },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          <Switch checked={p.is_published} onCheckedChange={() => togglePublished(p)} aria-label={`Publish ${p.title}`} />
          <IconButton icon={Pencil} label="Edit page" onClick={() => openEdit(p)} />
          <IconButton icon={Trash2} label="Delete page" className="hover:text-rose-400" onClick={() => setToDelete(p)} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Pages Management"
        subtitle="Public pages like terms, privacy and refund policy"
        icon={FileText}
        iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
        actions={
          <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New page
          </Button>
        }
      />
      <div className="p-6">
        {error ? (
          <ErrorState title="Couldn't load pages" description={error} onRetry={load} />
        ) : (
          <Card className={cardClass}>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold">Pages</CardTitle>
              <CardDescription className="text-xs text-white/50 light:text-gray-500">Only published pages are visible to vendors and visitors.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <DataTable
                items={pages ?? []}
                columns={columns}
                isLoading={pages === null}
                emptyIcon={FileText}
                emptyTitle="No pages yet"
                emptyDescription="Create a page such as Terms of Service."
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.title}` : 'New page'}</DialogTitle>
              <DialogDescription>Write the page content. Markdown is supported.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
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
                  <Label className="text-xs">URL slug</Label>
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
              <div className="grid gap-1.5">
                <Label className="text-xs">Content</Label>
                <Textarea rows={12} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className={cn(fieldClass, 'font-mono text-xs')} />
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

      <DeleteConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Delete page" itemName={toDelete?.title} onConfirm={handleDelete} />
    </div>
  );
};

export default PagesManagementView;
