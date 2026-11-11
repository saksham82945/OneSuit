import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Workflow, Plus, Pencil, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { FlowTypeBadge } from './FlowTypePicker';
import { asChatFlowType } from './chatbotFlowTypes';
import { BotTransferControl } from './botTransfer/BotTransferControl';
import { RowSelect } from './botTransfer/RowSelect';
import { useRowSelection } from './botTransfer/useRowSelection';
import { downloadJson } from './botTransfer/botFile';

// Item shape of GET /api/chatbot/flows -> data: { flows: [...], total, page, limit }.
// The list doesn't include the graph, so there is no step count to show.
export interface ChatbotFlow {
  id: string;
  name: string;
  description?: string;
  trigger_keywords?: string[] | null;
  steps_count?: number;
  enabled: boolean;
  flow_type?: string;
  created_at: string;
}

const PAGE_SIZE = 50;

export const ChatbotFlowsView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [flows, setFlows] = useState<ChatbotFlow[]>([]);
  const [totalFlows, setTotalFlows] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [flowToDelete, setFlowToDelete] = useState<ChatbotFlow | null>(null);

  // Picked rows, for "Export selected".
  const selection = useRowSelection();

  const fetchFlows = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await chatbotService.listFlows({
        search: searchQuery || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setFlows(readList<ChatbotFlow>(res, 'flows'));
      setTotalFlows(readTotal(res, 'flows'));
    } catch {
      toast.error('Failed to load flows');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, page]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const toggleFlow = async (flow: ChatbotFlow) => {
    try {
      await chatbotService.updateFlow(flow.id, { enabled: !flow.enabled });
      setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, enabled: !flow.enabled } : f)));
      toast.success(flow.enabled ? 'Flow paused' : 'Flow activated');
    } catch {
      toast.error('Failed to update flow status');
    }
  };

  const handleDelete = async () => {
    if (!flowToDelete) return;
    try {
      await chatbotService.deleteFlow(flowToDelete.id);
      toast.success('Flow deleted');
      setFlowToDelete(null);
      // Step back if that was the last flow on this page; the page change refetches.
      if (flows.length === 1 && page > 1) setPage(page - 1);
      else fetchFlows();
    } catch {
      toast.error('Failed to delete flow');
    }
  };

  // One flow as a OneSuit bot file (old single-flow files still import).
  const handleExportFlow = async (flow: ChatbotFlow) => {
    try {
      const res = await chatbotService.exportBots({ flows: flow.id });
      const safeName = (flow.name || 'flow').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      downloadJson(res.data, `${safeName}.json`);
      toast.success(`Exported “${flow.name}” to JSON`);
    } catch {
      toast.error('Failed to export flow');
    }
  };

  const columns: Column<ChatbotFlow>[] = [
    {
      key: 'select',
      label: '',
      render: (flow) => (
        <RowSelect checked={selection.isSelected(flow.id)} onChange={() => selection.toggle(flow.id)} label={`Select ${flow.name}`} />
      ),
    },
    {
      key: 'name',
      label: t('chatbotFlows.name') || 'Flow Name',
      sortable: true,
      render: (flow) => (
        <div className="flex flex-col">
          <button
            onClick={() => navigate(`/chatbot/flows/${flow.id}/edit`)}
            className="font-medium text-white hover:text-purple-400 text-left transition-colors light:text-gray-900"
          >
            {flow.name}
          </button>
          <span className="flex items-center gap-2 text-xs text-white/40 truncate max-w-[280px] light:text-gray-400">
            <FlowTypeBadge type={asChatFlowType(flow.flow_type)} />
            {flow.description || ''}
          </span>
        </div>
      ),
    },
    {
      key: 'keywords',
      label: t('chatbotFlows.keywords') || 'Trigger Keywords',
      render: (flow) => (
        <div className="flex flex-wrap gap-1">
          {(flow.trigger_keywords || []).map((kw) => (
            <Badge key={kw} variant="secondary" className="text-xs bg-white/[0.06] text-white/80 light:bg-gray-100 light:text-gray-800">
              {kw}
            </Badge>
          ))}
          {(!flow.trigger_keywords || flow.trigger_keywords.length === 0) && (
            <span className="text-xs text-white/30 italic light:text-gray-400">None (API trigger)</span>
          )}
        </div>
      ),
    },
    {
      key: 'steps',
      label: t('chatbotFlows.steps') || 'Steps',
      render: (flow) => (
        flow.steps_count != null ? (
          <Badge variant="outline" className="text-xs border-white/10 font-mono light:border-gray-200">
            {flow.steps_count} steps
          </Badge>
        ) : (
          <span className="text-xs text-white/30 light:text-gray-400">—</span>
        )
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (flow) => (
        <div className="flex items-center gap-2">
          <Switch checked={flow.enabled} onCheckedChange={() => toggleFlow(flow)} />
          <span className="text-xs text-white/50 light:text-gray-500">{flow.enabled ? 'Active' : 'Paused'}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (flow) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Download}
            label="Export JSON"
            className="hover:text-emerald-400"
            onClick={() => handleExportFlow(flow)}
          />
          <IconButton
            icon={Pencil}
            label="Edit Visual Canvas"
            onClick={() => navigate(`/chatbot/flows/${flow.id}/edit`)}
          />
          <IconButton
            icon={Trash2}
            label="Delete"
            className="hover:text-red-400"
            onClick={() => setFlowToDelete(flow)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('chatbotFlows.title') || 'Visual Chatbot Flows'}
        subtitle="Build drag-and-drop conversational decision trees with branches and webhooks"
        icon={Workflow}
        iconGradient="bg-gradient-to-br from-purple-500 to-pink-600 shadow-purple-500/20"
        backLink="/chatbot"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BotTransferControl kind="flows" selectedIds={selection.selected} onImported={fetchFlows} />
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => navigate('/chatbot/flows/new')}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Create Flow
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Conversational Flows</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Interactive multi-step automated dialogue diagrams
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search flows..."
                className="w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              items={flows}
              columns={columns}
              isLoading={isLoading}
              currentPage={page}
              totalItems={totalFlows}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              emptyIcon={Workflow}
              emptyTitle="No chatbot flows"
              emptyDescription="Create your first visual flow diagram using the node builder"
              emptyAction={
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={() => navigate('/chatbot/flows/new')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Flow
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>

      <DeleteConfirmDialog
        open={!!flowToDelete}
        onOpenChange={(open) => !open && setFlowToDelete(null)}
        title="Delete Flow"
        itemName={flowToDelete?.name}
        onConfirm={handleDelete}
      />

    </div>
  );
};
export default ChatbotFlowsView;
