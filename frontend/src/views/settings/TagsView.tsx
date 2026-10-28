import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tags, Plus, Trash2, Edit2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { tagsService, contactsService, type Tag } from '@/services/api';
import { readList } from '@/services/response';
import { cn } from '@/lib/utils';

export const TAG_COLOR_OPTIONS = [
  { id: 'green', label: 'Green', hex: '#10b981' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'purple', label: 'Purple', hex: '#8b5cf6' },
  { id: 'yellow', label: 'Yellow', hex: '#f59e0b' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'gray', label: 'Gray', hex: '#6b7280' },
];

export const getColorHex = (colorName?: string): string => {
  if (!colorName) return '#6b7280';
  if (colorName.startsWith('#')) return colorName;
  const match = TAG_COLOR_OPTIONS.find((c) => c.id === colorName.toLowerCase());
  return match ? match.hex : '#6b7280';
};

const getErrorMessage = (err: unknown, fallback: string) =>
  (axios.isAxiosError(err) && (err.response?.data as { message?: string } | undefined)?.message) ||
  fallback;

export const TagsView: React.FC = () => {
  const { t } = useTranslation();

  const [tags, setTags] = useState<Tag[]>([]);
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [tagName, setTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState('green');
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

  const fetchTags = async () => {
    setIsLoading(true);
    try {
      const [tagsRes, contactsRes] = await Promise.allSettled([
        tagsService.list({ search: searchQuery.trim() || undefined, limit: 100 }),
        contactsService.list({ limit: 1000 }),
      ]);

      if (tagsRes.status === 'fulfilled') {
        const loadedTags = readList<Tag>(tagsRes.value, 'tags');
        setTags(loadedTags);
      } else {
        toast.error(getErrorMessage(tagsRes.reason, 'Failed to load tags'));
      }

      if (contactsRes.status === 'fulfilled') {
        const contacts = readList<{ tags?: string[] }>(contactsRes.value, 'contacts');
        const counts: Record<string, number> = {};
        contacts.forEach((c) => {
          (c.tags || []).forEach((tagItem) => {
            counts[tagItem] = (counts[tagItem] || 0) + 1;
          });
        });
        setContactCounts(counts);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, [searchQuery]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) {
      toast.error('Tag name is required');
      return;
    }

    setIsSaving(true);
    try {
      await tagsService.create({
        name: tagName.trim(),
        color: selectedColor,
      });
      toast.success(`Tag "${tagName.trim()}" created successfully`);
      setCreateOpen(false);
      setTagName('');
      setSelectedColor('green');
      await fetchTags();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create tag'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTag || !tagName.trim()) return;

    setIsSaving(true);
    try {
      await tagsService.update(editTag.name, {
        name: tagName.trim(),
        color: selectedColor,
      });
      toast.success('Tag updated successfully');
      setEditTag(null);
      setTagName('');
      await fetchTags();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update tag'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tagToDelete) return;
    try {
      await tagsService.delete(tagToDelete.name);
      toast.success(`Tag "${tagToDelete.name}" deleted`);
      setTagToDelete(null);
      await fetchTags();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete tag'));
    }
  };

  const columns: Column<Tag>[] = [
    {
      key: 'name',
      label: 'Tag Name',
      sortable: true,
      render: (t) => {
        const hex = getColorHex(t.color);
        return (
          <div className="flex items-center gap-2.5">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs ring-2 ring-white/10"
              style={{ backgroundColor: hex }}
            />
            <span className="font-semibold text-white text-xs light:text-gray-900">{t.name}</span>
          </div>
        );
      },
    },
    {
      key: 'color',
      label: 'Color Theme',
      render: (t) => {
        const hex = getColorHex(t.color);
        const colorOpt = TAG_COLOR_OPTIONS.find((c) => c.id === t.color?.toLowerCase());
        return (
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border"
              style={{
                backgroundColor: `${hex}18`,
                borderColor: `${hex}40`,
                color: hex,
              }}
            >
              {colorOpt ? colorOpt.label : t.color || 'Default'}
            </span>
            <code className="font-mono text-[11px] text-white/40 light:text-gray-400">{hex}</code>
          </div>
        );
      },
    },
    {
      key: 'count',
      label: 'Assigned Contacts',
      render: (t) => {
        const count = contactCounts[t.name] || 0;
        return (
          <Badge
            variant="outline"
            className="text-xs font-mono border-white/10 light:border-gray-200 text-gray-300 light:text-gray-700"
          >
            {count} {count === 1 ? 'contact' : 'contacts'}
          </Badge>
        );
      },
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (t) => (
        <span className="text-xs text-white/50 light:text-gray-500 font-mono">
          {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (t) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Edit2}
            label="Edit Tag"
            className="hover:text-teal-400"
            onClick={() => {
              setEditTag(t);
              setTagName(t.name);
              setSelectedColor(t.color || 'green');
            }}
          />
          <IconButton
            icon={Trash2}
            label="Delete Tag"
            className="hover:text-red-400"
            onClick={() => setTagToDelete(t)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.tags') || 'Contact Tags'}
        subtitle="Organize audience segments and customers with color-coded tags"
        icon={Tags}
        iconGradient="bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
        backLink="/settings"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTags}
              disabled={isLoading}
              className="text-xs border-white/[0.08] hover:bg-white/[0.04]"
              title="Refresh tags"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => {
                setTagName('');
                setSelectedColor('green');
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Tag
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Audience Tags</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Labels used to filter broadcasts and segment WhatsApp chat conversations
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search tags..."
                className="w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && tags.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-white/50 text-xs">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                <span>Loading tags from server...</span>
              </div>
            ) : (
              <DataTable
                items={tags}
                columns={columns}
                emptyIcon={Tags}
                emptyTitle="No tags created"
                emptyDescription="Create tags to categorize your customers"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create Tag</DialogTitle>
              <DialogDescription>
                Provide a tag name and pick an accent color.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="tName" className="text-xs">
                  Tag Label *
                </Label>
                <Input
                  id="tName"
                  placeholder="e.g. VIP Customer"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  maxLength={50}
                  required
                  autoFocus
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Color Theme</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TAG_COLOR_OPTIONS.map((opt) => {
                    const isSelected = selectedColor === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedColor(opt.id)}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all cursor-pointer',
                          isSelected
                            ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40 text-white font-medium'
                            : 'border-white/[0.08] bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200'
                        )}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: opt.hex }}
                        />
                        <span className="text-xs">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !tagName.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Tag
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTag} onOpenChange={(open) => !open && setEditTag(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Edit Tag</DialogTitle>
              <DialogDescription>
                Update tag name or change its theme color.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="editName" className="text-xs">
                  Tag Label *
                </Label>
                <Input
                  id="editName"
                  placeholder="e.g. VIP Customer"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Color Theme</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TAG_COLOR_OPTIONS.map((opt) => {
                    const isSelected = selectedColor === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedColor(opt.id)}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all cursor-pointer',
                          isSelected
                            ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40 text-white font-medium'
                            : 'border-white/[0.08] bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200'
                        )}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: opt.hex }}
                        />
                        <span className="text-xs">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTag(null)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !tagName.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Update Tag
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={!!tagToDelete}
        onOpenChange={(open) => !open && setTagToDelete(null)}
        title="Delete Tag"
        itemName={tagToDelete?.name}
        onConfirm={handleDelete}
      />
    </div>
  );
};
export default TagsView;
