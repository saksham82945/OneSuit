import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
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
import { Sparkles, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';

export interface AIContext {
  id: string;
  name: string;
  description: string;
  content: string;
  status: 'active' | 'draft';
  token_count: number;
  created_at: string;
}

export const AIContextsView: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  // Guard: only super admins can access this page
  if (!user?.is_super_admin) {
    return <Navigate to="/chatbot" replace />;
  }

  const [contexts, setContexts] = useState<AIContext[]>([
    {
      id: 'ai-1',
      name: 'Product Knowledge Base & FAQ',
      description: 'Covers pricing tiers, refund policy, technical integrations and setup guides',
      content: 'Antigravity onesuit offers plans starting from $29/mo with full WhatsApp API support...',
      status: 'active',
      token_count: 3420,
      created_at: new Date().toISOString(),
    },
    {
      id: 'ai-2',
      name: 'Customer Support Tone & Persona',
      description: 'Polite, empathetic, solutions-oriented customer representative persona',
      content: 'Always greet customers warmly. If an issue requires dev investigation, inform them calmly.',
      status: 'active',
      token_count: 850,
      created_at: new Date().toISOString(),
    },
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [contextToDelete, setContextToDelete] = useState<AIContext | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      toast.error('Name and context content are required');
      return;
    }

    const newCtx: AIContext = {
      id: `ai-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      content: content.trim(),
      status: 'active',
      token_count: Math.round(content.length / 4),
      created_at: new Date().toISOString(),
    };

    setContexts([newCtx, ...contexts]);
    toast.success('AI Context document created');
    setCreateOpen(false);
    setName('');
    setDescription('');
    setContent('');
  };

  const handleDelete = () => {
    if (!contextToDelete) return;
    setContexts(contexts.filter((c) => c.id !== contextToDelete.id));
    toast.success('AI Context removed');
    setContextToDelete(null);
  };

  const columns: Column<AIContext>[] = [
    {
      key: 'name',
      label: 'Knowledge Document',
      render: (ctx) => (
        <div className="flex flex-col">
          <span className="font-medium text-white light:text-gray-900">{ctx.name}</span>
          <span className="text-xs text-white/40 light:text-gray-400">{ctx.description}</span>
        </div>
      ),
    },
    {
      key: 'tokens',
      label: 'Size / Tokens',
      render: (ctx) => (
        <Badge variant="outline" className="text-xs font-mono border-white/10 light:border-gray-200">
          ~{ctx.token_count.toLocaleString()} tokens
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (ctx) => (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> ACTIVE IN PROMPT
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (ctx) => (
        <div className="flex items-center justify-end">
          <IconButton
            icon={Trash2}
            label="Delete"
            className="hover:text-red-400"
            onClick={() => setContextToDelete(ctx)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('chatbot.aiContexts') || 'AI Knowledge Base'}
        subtitle="Upload prompt rules, FAQs and domain documents for GPT-4 customer support replies"
        icon={Sparkles}
        iconGradient="bg-gradient-to-br from-orange-500 to-amber-600 shadow-orange-500/20"
        backLink="/chatbot"
        actions={
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Knowledge Doc
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Prompt Context Library</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Included in dynamic context retrieval when AI replies to customer WhatsApp messages
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search documents..."
                className="w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              items={contexts.filter((c) =>
                c.name.toLowerCase().includes(searchQuery.toLowerCase())
              )}
              columns={columns}
              emptyIcon={Sparkles}
              emptyTitle="No knowledge documents"
              emptyDescription="Add reference documents to train your AI support agent"
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Add AI Knowledge Document</DialogTitle>
              <DialogDescription>
                Provide documentation, business rules, or tone guidelines for AI assistance.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="docName" className="text-xs">Document Title *</Label>
                <Input
                  id="docName"
                  placeholder="e.g. Shipping Policies & Return Window"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="docDesc" className="text-xs">Short Summary</Label>
                <Input
                  id="docDesc"
                  placeholder="e.g. Guidelines for international orders"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="docContent" className="text-xs">Context Content / Markdown *</Label>
                <Textarea
                  id="docContent"
                  rows={6}
                  placeholder="Paste FAQ text, pricing breakdown, or operating rules here..."
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
                Save Document
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!contextToDelete}
        onOpenChange={(open) => !open && setContextToDelete(null)}
        title="Delete Knowledge Doc"
        itemName={contextToDelete?.name}
        onConfirm={handleDelete}
      />
    </div>
  );
};
export default AIContextsView;
