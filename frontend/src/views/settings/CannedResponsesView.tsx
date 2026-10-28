import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Textarea } from '@/components/ui/textarea';
import { MessageSquareText, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export interface CannedResponse {
  id: string;
  shortcut: string;
  content: string;
  category: string;
  created_at: string;
}

export const CannedResponsesView: React.FC = () => {
  const { t } = useTranslation();

  const [responses, setResponses] = useState<CannedResponse[]>([
    {
      id: 'cr-1',
      shortcut: 'greeting',
      content: 'Hello! Thank you for reaching out to onesuit support. How can I help you today?',
      category: 'General',
      created_at: new Date().toISOString(),
    },
    {
      id: 'cr-2',
      shortcut: 'pricing',
      content: 'Our standard pricing starts at $29/mo including unlimited contacts and team seats. You can view all features at onesuit.com/pricing.',
      category: 'Sales',
      created_at: new Date().toISOString(),
    },
    {
      id: 'cr-3',
      shortcut: 'closing',
      content: 'Is there anything else I can help you with today? If not, thank you for contacting us and have a wonderful day!',
      category: 'Support',
      created_at: new Date().toISOString(),
    },
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [shortcut, setShortcut] = useState('');
  const [category, setCategory] = useState('General');
  const [content, setContent] = useState('');
  const [itemToDelete, setItemToDelete] = useState<CannedResponse | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortcut.trim() || !content.trim()) {
      toast.error('Shortcut and content are required');
      return;
    }

    const newCR: CannedResponse = {
      id: `cr-${Date.now()}`,
      shortcut: shortcut.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      category: category.trim(),
      content: content.trim(),
      created_at: new Date().toISOString(),
    };

    setResponses([newCR, ...responses]);
    toast.success('Canned quick reply added');
    setCreateOpen(false);
    setShortcut('');
    setContent('');
  };

  const handleDelete = () => {
    if (!itemToDelete) return;
    setResponses(responses.filter((r) => r.id !== itemToDelete.id));
    toast.success('Canned response deleted');
    setItemToDelete(null);
  };

  const columns: Column<CannedResponse>[] = [
    {
      key: 'shortcut',
      label: 'Shortcut Keyword',
      sortable: true,
      render: (r) => (
        <code className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
          /{r.shortcut}
        </code>
      ),
    },
    {
      key: 'content',
      label: 'Message Snippet',
      render: (r) => (
        <p className="text-xs text-white/80 line-clamp-2 max-w-lg light:text-gray-800">{r.content}</p>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (r) => <Badge variant="secondary" className="text-xs bg-white/[0.06] text-white/70 light:bg-gray-100 light:text-gray-600">{r.category}</Badge>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end">
          <IconButton
            icon={Trash2}
            label="Delete"
            className="hover:text-red-400"
            onClick={() => setItemToDelete(r)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.cannedResponses') || 'Canned Quick Replies'}
        subtitle="Manage fast slash shortcuts (/greeting) for agents in live chat"
        icon={MessageSquareText}
        iconGradient="bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
        backLink="/settings"
        actions={
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Quick Reply
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Quick Reply Snippets</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Type / in any chat input to trigger auto-complete for these templates
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search shortcuts..."
                className="w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              items={responses.filter(
                (r) =>
                  r.shortcut.includes(searchQuery.toLowerCase()) ||
                  r.content.toLowerCase().includes(searchQuery.toLowerCase())
              )}
              columns={columns}
              emptyIcon={MessageSquareText}
              emptyTitle="No canned replies"
              emptyDescription="Add shortcuts like /pricing or /help to speed up agent workflows"
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Add Canned Response</DialogTitle>
              <DialogDescription>
                Define the trigger shortcut and the full message text.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="sc" className="text-xs">Shortcut (triggered with /) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-mono light:text-gray-400">/</span>
                  <Input
                    id="sc"
                    placeholder="e.g. greeting"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="pl-7 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="cat" className="text-xs">Category</Label>
                <Input
                  id="cat"
                  placeholder="e.g. Sales, Support, Onboarding"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="msg" className="text-xs">Message Text *</Label>
                <Textarea
                  id="msg"
                  rows={4}
                  placeholder="Type the response message..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                Save Reply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!itemToDelete}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title="Delete Quick Reply"
        itemName={itemToDelete ? `/${itemToDelete.shortcut}` : undefined}
        onConfirm={handleDelete}
      />
    </div>
  );
};
export default CannedResponsesView;
