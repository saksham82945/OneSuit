import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatbotService } from '@/services/api';
import { readData, readList, readTotal } from '@/services/response';
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
import { Workflow, Plus, Pencil, Trash2, Upload, Download, FileCode, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// Item shape of GET /api/chatbot/flows -> data: { flows: [...], total, page, limit }.
// The list doesn't include the graph, so there is no step count to show.
export interface ChatbotFlow {
  id: string;
  name: string;
  description?: string;
  trigger_keywords?: string[] | null;
  steps_count?: number;
  enabled: boolean;
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

  // JSON Import State
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    name: string;
    description?: string;
    trigger_keywords?: string[];
    graph?: any;
    nodeCount: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleExportFlow = async (flow: ChatbotFlow) => {
    try {
      const res = await chatbotService.getFlow(flow.id);
      const detail = readData<any>(res);
      const exportData = {
        $schema: 'https://whatomate.com/schemas/flow-v1.json',
        version: 1,
        name: detail?.name || flow.name,
        description: detail?.description || flow.description || '',
        trigger_keywords: detail?.trigger_keywords || flow.trigger_keywords || [],
        graph: detail?.graph || null,
        exported_at: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = (flow.name || 'flow').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      link.download = `${safeName}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported “${flow.name}” to JSON`);
    } catch {
      toast.error('Failed to export flow');
    }
  };

  const handleFileSelect = (file: File) => {
    setImportFile(file);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON format: root must be an object');
        }
        const name = parsed.name || file.name.replace(/\.[^/.]+$/, '');
        const graph = parsed.graph || null;
        const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
        setImportPreview({
          name,
          description: parsed.description || '',
          trigger_keywords: Array.isArray(parsed.trigger_keywords) ? parsed.trigger_keywords : [],
          graph,
          nodeCount: nodes.length,
        });
      } catch (err) {
        setImportPreview(null);
        setImportError(err instanceof Error ? err.message : 'Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setIsImporting(true);
    try {
      await chatbotService.createFlow({
        name: importPreview.name,
        trigger_keywords: importPreview.trigger_keywords,
        graph: importPreview.graph,
        enabled: true,
      });
      toast.success(`Flow “${importPreview.name}” imported successfully`);
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      fetchFlows();
    } catch {
      toast.error('Failed to import flow');
    } finally {
      setIsImporting(false);
    }
  };

  const columns: Column<ChatbotFlow>[] = [
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
          <span className="text-xs text-white/40 truncate max-w-[280px] light:text-gray-400">
            {flow.description || 'No description provided'}
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
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 hover:bg-white/[0.04] text-white light:border-gray-200 light:text-gray-700 light:hover:bg-gray-100"
              onClick={() => {
                setImportFile(null);
                setImportPreview(null);
                setImportError(null);
                setImportOpen(true);
              }}
            >
              <Upload className="h-4 w-4 mr-1.5 text-emerald-400" />
              Import Flow (JSON)
            </Button>
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

      {/* Import Flow from JSON Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md bg-[#141415] border-white/10 text-white light:bg-white light:text-gray-900 light:border-gray-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-emerald-400" />
              Import Flow from JSON
            </DialogTitle>
            <DialogDescription className="text-xs text-white/50 light:text-gray-500">
              Upload an exported bot configuration or AI-generated flow JSON file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!importFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/15 hover:border-emerald-500/50 rounded-xl p-6 text-center cursor-pointer transition-all hover:bg-white/[0.02] light:border-gray-300 light:hover:border-emerald-500"
              >
                <Upload className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-white light:text-gray-800">
                  Click to select JSON file
                </p>
                <p className="text-[11px] text-white/40 light:text-gray-400 mt-1">
                  Supports exported flow .json or AI-generated schemas
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10 light:bg-gray-50 light:border-gray-200">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileCode className="h-5 w-5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-medium truncate">{importFile.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-white/50 hover:text-white"
                    onClick={() => {
                      setImportFile(null);
                      setImportPreview(null);
                      setImportError(null);
                    }}
                  >
                    Change
                  </Button>
                </div>

                {importError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                    {importError}
                  </div>
                )}

                {importPreview && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Valid Flow Definition
                    </div>
                    <div className="text-xs space-y-1">
                      <div>
                        <span className="text-white/50 light:text-gray-500">Flow Name:</span>{' '}
                        <span className="font-semibold">{importPreview.name}</span>
                      </div>
                      <div>
                        <span className="text-white/50 light:text-gray-500">Steps / Nodes:</span>{' '}
                        <Badge variant="outline" className="text-[10px] ml-1">
                          {importPreview.nodeCount} steps
                        </Badge>
                      </div>
                      {importPreview.trigger_keywords && importPreview.trigger_keywords.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-1">
                          <span className="text-white/50 light:text-gray-500">Keywords:</span>
                          {importPreview.trigger_keywords.map((kw) => (
                            <Badge key={kw} variant="secondary" className="text-[10px]">
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(false)}
              className="border-white/10 text-xs light:border-gray-200"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!importPreview || isImporting}
              onClick={handleConfirmImport}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
            >
              {isImporting ? 'Importing...' : 'Confirm & Import Flow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default ChatbotFlowsView;
