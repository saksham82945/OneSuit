import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { chatbotService } from '@/services/api';
import { readList, readTotal } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Key, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type MatchType = 'exact' | 'contains' | 'starts_with' | 'regex';

// Item shape of GET /api/chatbot/keywords -> data: { rules: [...], total, page, limit }
export interface KeywordRule {
  id: string;
  name: string;
  keywords: string[] | null;
  match_type: MatchType;
  response_type: 'text' | 'template' | 'media' | 'flow' | 'script' | 'transfer';
  // Text/transfer rules carry { body } (the message to send); text rules may also have buttons.
  response_content: { body?: string; buttons?: unknown[] } | null;
  priority: number;
  enabled: boolean;
  created_at: string;
}

const PAGE_SIZE = 50;

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  text: 'Auto Text',
  transfer: 'Agent Transfer',
  template: 'Template',
  media: 'Media',
  flow: 'Flow',
  script: 'Script',
};

/** The backend's `{ status: 'error', message }` text, if the request got that far. */
const apiErrorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export const KeywordsView: React.FC = () => {
  const { t } = useTranslation();

  const [rules, setRules] = useState<KeywordRule[]>([]);
  const [totalRules, setTotalRules] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ruleToDelete, setRuleToDelete] = useState<KeywordRule | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('contains');
  const [responseType, setResponseType] = useState<'text' | 'transfer' | 'flow'>('text');
  const [responseText, setResponseText] = useState('');
  const [priority, setPriority] = useState(10);
  const [availableFlows, setAvailableFlows] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');

  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await chatbotService.listKeywords({
        search: searchQuery || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRules(readList<KeywordRule>(res, 'rules'));
      setTotalRules(readTotal(res, 'rules'));
    } catch {
      toast.error('Failed to load keyword rules');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, page]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    chatbotService
      .listFlows({ limit: 100 })
      .then((res) => {
        const list = readList<{ id: string; name: string }>(res, 'flows');
        setAvailableFlows(list);
        if (list.length > 0) setSelectedFlowId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordsInput.trim()) {
      toast.error('Keywords are required');
      return;
    }

    if (responseType === 'flow' && !selectedFlowId) {
      toast.error('Please select a flow bot to launch');
      return;
    }

    try {
      // Non-regex matching is case-insensitive on the backend; lowercasing a regex would change it (e.g. \D -> \d).
      const kwList = keywordsInput
        .split(',')
        .map((k) => (matchType === 'regex' ? k.trim() : k.trim().toLowerCase()))
        .filter(Boolean);

      const selectedFlow = availableFlows.find((f) => f.id === selectedFlowId);
      const responseContent =
        responseType === 'flow'
          ? { flow_id: selectedFlowId, flow_name: selectedFlow?.name || 'Bot Flow' }
          : responseType === 'text'
          ? { body: responseText }
          : {};

      await chatbotService.createKeyword({
        keywords: kwList,
        match_type: matchType,
        response_type: responseType,
        response_content: responseContent,
        priority: Number(priority) || 10,
        enabled: true,
      });
      toast.success('Keyword rule created');
      setCreateDialogOpen(false);
      setKeywordsInput('');
      setResponseText('');
      fetchRules();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create keyword rule'));
    }
  };

  const toggleRule = async (rule: KeywordRule) => {
    try {
      await chatbotService.updateKeyword(rule.id, { enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !rule.enabled } : r)));
      toast.success(rule.enabled ? 'Rule disabled' : 'Rule enabled');
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const handleDelete = async () => {
    if (!ruleToDelete) return;
    try {
      await chatbotService.deleteKeyword(ruleToDelete.id);
      toast.success('Keyword rule deleted');
      setRuleToDelete(null);
      // Step back if that was the last rule on this page; the page change refetches.
      if (rules.length === 1 && page > 1) setPage(page - 1);
      else fetchRules();
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const columns: Column<KeywordRule>[] = [
    {
      key: 'keywords',
      label: t('keywords.keywordsColumn') || 'Keywords & Phrases',
      render: (rule) => (
        <div className="flex flex-wrap gap-1">
          {(rule.keywords || []).map((kw) => (
            <Badge key={kw} variant="secondary" className="text-xs bg-white/[0.06] text-white/80 light:bg-gray-100 light:text-gray-800">
              {kw}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'match_type',
      label: t('keywords.matchType') || 'Match Type',
      render: (rule) => (
        <Badge className="bg-blue-500/20 text-blue-400 border-0 text-[10px] uppercase">
          {(rule.match_type || 'contains').replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'response_type',
      label: t('keywords.response') || 'Response Action',
      render: (rule) => {
        const flowName = (rule.response_content as any)?.flow_name;
        return (
          <div className="flex flex-col gap-0.5">
            <Badge
              className={
                rule.response_type === 'transfer'
                  ? 'bg-red-500/20 text-red-400 border-0 text-[10px]'
                  : rule.response_type === 'flow'
                  ? 'bg-emerald-500/20 text-emerald-400 border-0 text-[10px]'
                  : 'bg-purple-500/20 text-purple-400 border-0 text-[10px]'
              }
            >
              {RESPONSE_TYPE_LABELS[rule.response_type] || rule.response_type}
            </Badge>
            {rule.response_type === 'flow' && flowName && (
              <span className="text-[11px] text-white/50 light:text-gray-500 truncate max-w-[150px]">
                &rarr; {flowName}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (rule) => <span className="text-xs font-mono text-white/60 light:text-gray-600">{rule.priority}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (rule) => (
        <div className="flex items-center gap-2">
          <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule)} />
          <span className="text-xs text-white/50 light:text-gray-500">{rule.enabled ? 'Active' : 'Paused'}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (rule) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Trash2}
            label="Delete"
            className="hover:text-red-400"
            onClick={() => setRuleToDelete(rule)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('keywords.title') || 'Keyword Auto-Replies'}
        subtitle="Match specific incoming phrases to trigger automated replies and actions"
        icon={Key}
        iconGradient="bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-500/20"
        backLink="/flows"
        actions={
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Keyword Rule
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Active Keyword Triggers</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Rules are evaluated in order of priority (higher number evaluated first)
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search keywords..."
                className="w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              items={rules}
              columns={columns}
              isLoading={isLoading}
              currentPage={page}
              totalItems={totalRules}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              emptyIcon={Key}
              emptyTitle="No keyword rules"
              emptyDescription="Add rules to automatically respond when customers text specific terms"
              emptyAction={
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Keyword Rule
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreateRule}>
            <DialogHeader>
              <DialogTitle>Add Keyword Rule</DialogTitle>
              <DialogDescription>
                Define the trigger keywords and the automated reply response.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="kw" className="text-xs">Keywords (comma-separated) *</Label>
                <Input
                  id="kw"
                  placeholder="e.g. price, cost, quote, catalog"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Match Condition</Label>
                  <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Match" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Message Contains</SelectItem>
                      <SelectItem value="exact">Exact Match</SelectItem>
                      <SelectItem value="starts_with">Starts With</SelectItem>
                      <SelectItem value="regex">RegEx Pattern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs">Response Action</Label>
                  <Select value={responseType} onValueChange={(v) => setResponseType(v as 'text' | 'transfer' | 'flow')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Send Text Message</SelectItem>
                      <SelectItem value="transfer">Transfer to Live Agent</SelectItem>
                      <SelectItem value="flow">Launch Flow Bot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {responseType === 'flow' && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">Select Flow Bot to Launch *</Label>
                  {availableFlows.length === 0 ? (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                      No active flows found. Please create a flow in the Flows section first.
                    </div>
                  ) : (
                    <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a flow bot" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFlows.map((flow) => (
                          <SelectItem key={flow.id} value={flow.id}>
                            {flow.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {responseType === 'text' && (
                <div className="grid gap-1.5">
                  <Label htmlFor="rText" className="text-xs">Response Message Text *</Label>
                  <Textarea
                    id="rText"
                    rows={3}
                    placeholder="Type the message to send automatically..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="prio" className="text-xs">Priority Order</Label>
                <Input
                  id="prio"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                Save Rule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!ruleToDelete}
        onOpenChange={(open) => !open && setRuleToDelete(null)}
        title="Delete Keyword Rule"
        itemName={(ruleToDelete?.keywords || []).join(', ') || ruleToDelete?.name}
        onConfirm={handleDelete}
      />
    </div>
  );
};
export default KeywordsView;
