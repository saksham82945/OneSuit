import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Download,
  Globe,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
  Upload,
  UserX,
  X,
  Zap,
  Link2,
  PhoneCall,
  Phone,
  MessageCircle,
  CheckCircle2,
  Copy,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { chatbotService, type ChatFlowGraph } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { usePlanModules } from '@/lib/planModules';
import {
  START_NODE_ID,
  canvasToGraph,
  edgesAfterButtonRemoved,
  edgesAfterReplyChanged,
  graphToCanvas,
  startNode,
  type BuilderNode,
  type BuilderNodeData,
  type FlowButton,
  type FlowButtonType,
} from './chatbotFlowGraph';
import {
  CHAT_FLOW_TYPE_INFO,
  REPLY_KIND_LABEL,
  asChatFlowType,
  newOptionId,
  newReply,
  replyKindsFor,
  validateReply,
  type BotReply,
  type ChatFlowType,
  type ReplyKind,
} from './chatbotFlowTypes';
import { BotReplyEditor } from './BotReplyEditor';
import { FlowTypeBadge, FlowTypePicker } from './FlowTypePicker';
import { FlowBuilderContext, type FlowBuilderActions } from './flowBuilderContext';
import { ApiNode, ButtonsNode, OtherNode, ReplyNode, StartNode, TextNode, TransferNode } from './FlowCanvasNodes';

const nodeTypes = {
  startNode: StartNode,
  replyNode: ReplyNode,
  textNode: TextNode,
  buttonsNode: ButtonsNode,
  apiNode: ApiNode,
  transferNode: TransferNode,
  default: OtherNode,
};

const EDGE_STYLE = { stroke: '#10b981', strokeWidth: 2 };
const styleEdge = (e: Edge): Edge => ({ ...e, type: 'default', animated: false, style: EDGE_STYLE });

/** The backend's `{ status: 'error', message }` text, if the request got that far. */
const apiErrorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const parseKeywords = (s: string) =>
  s
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

// Fields of GET /api/chatbot/flows/:id this screen uses (the raw model: note `is_enabled`, `graph`).
interface ChatbotFlowDetail {
  id: string;
  name: string;
  trigger_keywords?: string[] | null;
  is_enabled?: boolean;
  flow_type?: string;
  graph?: ChatFlowGraph | null;
}

/** Steps only Advanced bots may hold. */
const ADVANCED_ONLY_NODES = new Set(['apiNode', 'transferNode', 'default']);

// ─── New flow: choose the bot type, then name + keywords ──────────────────────

const starterGraph = (): ChatFlowGraph => {
  const welcome: BuilderNode = {
    id: 'welcome',
    type: 'replyNode',
    position: { x: 320, y: 80 },
    data: { label: 'Welcome', reply: newReply('text') },
  };
  const start = { ...startNode(), position: { x: 0, y: 100 } };
  return canvasToGraph([start, welcome], [{ id: 'e0', source: START_NODE_ID, target: 'welcome' }], START_NODE_ID);
};

const NewFlowSetup: React.FC = () => {
  const navigate = useNavigate();
  const [flowType, setFlowType] = useState<ChatFlowType | null>(null);
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!flowType) return;
    if (!name.trim()) {
      toast.error('Give the bot a name');
      return;
    }
    setCreating(true);
    try {
      const res = await chatbotService.createFlow({
        name: name.trim(),
        trigger_keywords: parseKeywords(keywords),
        flow_type: flowType,
        enabled: true,
        graph: starterGraph(),
      });
      const created = readData<{ id?: string }>(res);
      toast.success(`${CHAT_FLOW_TYPE_INFO[flowType].title} created`);
      navigate(created?.id ? `/chatbot/flows/${created.id}/edit` : '/chatbot/flows', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create flow'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0b] light:bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <button
          onClick={() => navigate('/chatbot/flows')}
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white light:text-gray-500 light:hover:text-gray-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Bot Flows
        </button>
        <h1 className="text-xl font-bold text-white light:text-gray-900 sm:text-2xl">Create a bot flow</h1>
        <p className="mt-1 text-sm text-white/50 light:text-gray-500">
          Pick what this bot may send. You can build it on the canvas right after.
        </p>

        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">1 · Bot type</div>
          <FlowTypePicker value={flowType} onChange={setFlowType} />
        </div>

        <div className={cn('mt-8 transition-opacity', !flowType && 'pointer-events-none opacity-40')}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">2 · Name & trigger</div>
          <div className="grid gap-4 rounded-2xl border border-white/[0.08] bg-[#141416] p-4 sm:grid-cols-2 light:border-gray-200 light:bg-white">
            <div className="space-y-1.5">
              <Label className="text-xs">Bot name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Store assistant" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Trigger keywords</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="hi, hello, menu" />
              <p className="text-[11px] text-white/40 light:text-gray-500">Comma-separated. The bot starts when a customer sends one.</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500" disabled={!flowType || creating} onClick={create}>
              {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
              Create & open builder
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Classic step inspector (message / buttons / webhook / transfer) ─────────

const BUTTON_TYPE_META: Record<FlowButtonType, { label: string; icon: LucideIcon; link: boolean }> = {
  quick_reply: { label: 'Quick Reply', icon: Zap, link: false },
  link: { label: 'Link', icon: Link2, link: true },
  callback_request: { label: 'Request Callback', icon: PhoneCall, link: false },
  call_number: { label: 'Call Number', icon: Phone, link: true },
  call_whatsapp: { label: 'Call on WhatsApp', icon: MessageCircle, link: true },
  complete_flow: { label: 'Complete Flow', icon: CheckCircle2, link: false },
  copy_code: { label: 'Copy Code', icon: Copy, link: false },
  share_info: { label: 'Share Info', icon: Share2, link: false },
};

const ClassicInspector: React.FC<{
  node: BuilderNode;
  flowType: ChatFlowType;
  onChange: (data: Partial<BuilderNodeData>) => void;
  onButtonRemoved: (index: number) => void;
  onClose: () => void;
}> = ({ node, flowType, onChange, onButtonRemoved, onClose }) => {
  const d = node.data;
  const buttons = d.flowButtons || [];
  const allowedTypes = (Object.keys(BUTTON_TYPE_META) as FlowButtonType[]).filter(
    (t) => flowType === 'advanced' || !BUTTON_TYPE_META[t].link
  );
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full flex-col gap-4 overflow-y-auto border-l border-white/[0.08] bg-[#141416] p-4 sm:w-80 light:border-gray-200 light:bg-white">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 light:border-gray-200">
        <span className="text-xs font-semibold text-white light:text-gray-900">Edit step</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Step name</Label>
        <Input value={d.label || ''} onChange={(e) => onChange({ label: e.target.value })} />
      </div>
      {node.type === 'textNode' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Message</Label>
          <Textarea rows={5} value={d.message || ''} onChange={(e) => onChange({ message: e.target.value })} />
        </div>
      )}
      {node.type === 'buttonsNode' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Question</Label>
            <Input value={d.question || ''} onChange={(e) => onChange({ question: e.target.value })} />
          </div>
          {buttons.map((b, i) => {
            const meta = BUTTON_TYPE_META[b.type] || BUTTON_TYPE_META.quick_reply;
            return (
              <div key={b.id} className="space-y-1.5 rounded-lg border border-white/[0.08] p-2 light:border-gray-200">
                <div className="flex items-center gap-2">
                  <meta.icon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <Input
                    value={b.title}
                    onChange={(e) => onChange({ flowButtons: buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                    className="h-7 text-xs"
                  />
                  <button
                    className="text-white/30 hover:text-rose-400 light:text-gray-400"
                    onClick={() => {
                      onChange({ flowButtons: buttons.filter((_, j) => j !== i) });
                      onButtonRemoved(i);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {b.type === 'link' && (
                  <Input
                    value={b.url || ''}
                    placeholder="https://"
                    onChange={(e) => onChange({ flowButtons: buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
                    className="h-7 text-xs"
                  />
                )}
                {(b.type === 'call_number' || b.type === 'call_whatsapp') && (
                  <Input
                    value={b.phone || ''}
                    placeholder="+91 98765 43210"
                    onChange={(e) => onChange({ flowButtons: buttons.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)) })}
                    className="h-7 text-xs"
                  />
                )}
              </div>
            );
          })}
          {buttons.length < 10 && (
            <div className="grid grid-cols-2 gap-1.5">
              {allowedTypes.map((t) => {
                const meta = BUTTON_TYPE_META[t];
                return (
                  <button
                    key={t}
                    onClick={() =>
                      onChange({ flowButtons: [...buttons, { id: `btn_${node.id}_${Date.now()}`, type: t, title: meta.label } as FlowButton] })
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/[0.04] light:border-gray-200 light:text-gray-600 light:hover:bg-gray-50"
                  >
                    <meta.icon className="h-3 w-3 text-emerald-400" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {node.type === 'apiNode' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Request URL</Label>
          <Input value={d.url || ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://api.example.com/hook" />
          <p className="text-[11px] text-white/40 light:text-gray-500">Sends a POST with the conversation data, then continues.</p>
        </div>
      )}
      {node.type === 'transferNode' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Queue / department</Label>
          <Input value={d.queue || ''} onChange={(e) => onChange({ queue: e.target.value })} />
          <p className="text-[11px] text-white/40 light:text-gray-500">Ends the bot and hands the chat to an agent.</p>
        </div>
      )}
    </aside>
  );
};

// ─── Flow editor ──────────────────────────────────────────────────────────────

const FlowEditor: React.FC<{ id: string }> = ({ id }) => {
  const planModules = usePlanModules();
  const navigate = useNavigate();
  const [flowName, setFlowName] = useState('');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [flowType, setFlowType] = useState<ChatFlowType>('advanced');
  const [enabled, setEnabled] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [entryNodeId, setEntryNodeId] = useState(START_NODE_ID);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadFailed(false);
    chatbotService
      .getFlow(id)
      .then((res) => {
        if (cancelled) return;
        const flow = readData<ChatbotFlowDetail>(res);
        const canvas = graphToCanvas(flow?.graph);
        setFlowName(flow?.name || '');
        setTriggerKeywords((flow?.trigger_keywords || []).join(', '));
        setFlowType(asChatFlowType(flow?.flow_type));
        setEnabled(flow?.is_enabled ?? true);
        setNodes(canvas.nodes);
        setEdges(canvas.edges.map(styleEdge));
        setEntryNodeId(canvas.entry);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error('Failed to load flow');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, setNodes, setEdges]);

  const keywords = useMemo(() => parseKeywords(triggerKeywords), [triggerKeywords]);

  const onConnect = useCallback(
    (params: Connection) =>
      // Each output (button, list row, or a reply's single "next") leads to one step.
      setEdges((eds) =>
        addEdge(
          { ...params, type: 'default', style: EDGE_STYLE },
          eds.filter((e) => !(e.source === params.source && (e.sourceHandle ?? null) === (params.sourceHandle ?? null)))
        )
      ),
    [setEdges]
  );

  const nextPosition = useCallback(() => {
    const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), 0);
    return { x: maxX + 320, y: 80 + Math.random() * 120 };
  }, [nodes]);

  const addReply = (kind: ReplyKind) => {
    const newId = `reply-${Date.now().toString(36)}`;
    const node: BuilderNode = {
      id: newId,
      type: 'replyNode',
      position: nextPosition(),
      data: { label: REPLY_KIND_LABEL[kind], reply: newReply(kind) },
    };
    setNodes((nds) => [...nds, node]);
    setEditingReplyId(newId);
  };

  // The super admin can switch API call / webhook steps off for workspaces.
  const apiWebhookAllowed = planModules.isOn('bot_api_webhook');
  const addAdvancedStep = (type: 'apiNode' | 'transferNode') => {
    const newId = `${type === 'apiNode' ? 'webhook' : 'transfer'}-${Date.now().toString(36)}`;
    const node: BuilderNode = {
      id: newId,
      type,
      position: nextPosition(),
      data: type === 'apiNode' ? { label: 'Webhook', url: 'https://', backendType: 'webhook' } : { label: 'Transfer to agent', queue: '' },
    };
    setNodes((nds) => [...nds, node]);
    setInspectorId(newId);
  };

  const actions: FlowBuilderActions = useMemo(
    () => ({
      flowType,
      keywords,
      onEdit: (nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (node.type === 'replyNode') setEditingReplyId(nodeId);
        else if (node.type !== 'default' && node.type !== 'startNode') setInspectorId(nodeId);
      },
      onDelete: (nodeId) => {
        if (nodeId === START_NODE_ID) return;
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setInspectorId((cur) => (cur === nodeId ? null : cur));
      },
      onDuplicate: (nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || node.type === 'startNode') return;
        const copyId = `${node.type === 'replyNode' ? 'reply' : 'step'}-${Date.now().toString(36)}`;
        const data: BuilderNodeData = structuredClone(node.data);
        data.label = `${node.data.label || 'Step'} (copy)`;
        if (data.reply) {
          // Fresh option ids so the copy's branches are its own.
          data.reply.buttons = data.reply.buttons.map((b) => ({ ...b, id: newOptionId('btn') }));
          data.reply.list.sections = data.reply.list.sections.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, id: newOptionId('row') })) }));
        }
        setNodes((nds) => [
          ...nds.map((n) => ({ ...n, selected: false })),
          { id: copyId, type: node.type, position: { x: node.position.x + 40, y: node.position.y + 60 }, data, selected: true },
        ]);
        toast.success('Step duplicated');
      },
    }),
    [flowType, keywords, nodes, setNodes, setEdges]
  );

  const editingNode = nodes.find((n) => n.id === editingReplyId);
  const inspectorNode = nodes.find((n) => n.id === inspectorId);

  const saveReply = (title: string, reply: BotReply) => {
    if (!editingNode) return;
    const before = editingNode.data.reply;
    setNodes((nds) => nds.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, label: title, reply } } : n)));
    if (before) setEdges((eds) => edgesAfterReplyChanged(eds, editingNode.id, before, reply));
    setEditingReplyId(null);
  };

  const updateInspected = (patch: Partial<BuilderNodeData>) => {
    if (!inspectorNode) return;
    setNodes((nds) => nds.map((n) => (n.id === inspectorNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const toggleEnabled = async (value: boolean) => {
    setEnabled(value);
    try {
      await chatbotService.updateFlow(id, { enabled: value });
      toast.success(value ? 'Bot is live' : 'Bot paused');
    } catch (err) {
      setEnabled(!value);
      toast.error(apiErrorMessage(err, 'Failed to update status'));
    }
  };

  /** First problem that would stop the save, or ''. */
  const findProblem = (): string => {
    for (const n of nodes) {
      if (flowType !== 'advanced' && ADVANCED_ONLY_NODES.has(n.type || '')) {
        return `“${n.data.label || n.type}” needs an Advanced bot. Remove it to save this ${CHAT_FLOW_TYPE_INFO[flowType].title}.`;
      }
      if (n.type === 'replyNode' && n.data.reply) {
        const errs = validateReply(n.data.reply, flowType);
        if (errs.length) return `“${n.data.label || 'Bot reply'}”: ${errs[0]}`;
      }
    }
    return '';
  };

  const handleSave = async () => {
    if (isLoading || loadFailed) {
      toast.error('The flow has not loaded, so it cannot be saved');
      return;
    }
    if (!flowName.trim()) {
      toast.error('Flow name is required');
      return;
    }
    const problem = findProblem();
    if (problem) {
      toast.error(problem);
      return;
    }
    setIsSaving(true);
    try {
      await chatbotService.updateFlow(id, {
        name: flowName.trim(),
        trigger_keywords: keywords,
        flow_type: flowType,
        graph: canvasToGraph(nodes, edges, entryNodeId),
      });
      toast.success('Flow saved');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save flow'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJSON = () => {
    const exportData = {
      $schema: 'https://whatomate.com/schemas/flow-v1.json',
      version: 1,
      name: flowName.trim() || 'Untitled Flow',
      flow_type: flowType,
      trigger_keywords: keywords,
      graph: canvasToGraph(nodes, edges, entryNodeId),
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(flowName || 'flow').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Flow exported to JSON');
  };

  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result));
        if (!parsed?.graph) {
          toast.warning('No graph definition found in JSON');
          return;
        }
        const canvas = graphToCanvas(parsed.graph);
        setNodes(canvas.nodes);
        setEdges(canvas.edges.map(styleEdge));
        setEntryNodeId(canvas.entry);
        if (Array.isArray(parsed.trigger_keywords)) setTriggerKeywords(parsed.trigger_keywords.join(', '));
        toast.success('Imported onto the canvas. Save to keep it.');
      } catch {
        toast.error('Failed to import JSON file');
      }
    };
    reader.readAsText(file);
  };

  const replyKinds = replyKindsFor(flowType);
  const ghostBtn =
    'border-white/10 text-white hover:bg-white/[0.04] light:border-gray-200 light:text-gray-700 light:hover:bg-gray-100';

  return (
    <FlowBuilderContext.Provider value={actions}>
      <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0b] light:bg-gray-50">
        {/* Top bar */}
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#0f0f11] px-3 py-2 light:border-gray-200 light:bg-white">
          <Button variant="ghost" size="sm" className="px-2 text-xs" onClick={() => navigate('/chatbot/flows')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Back to Bot Flows</span>
          </Button>
          <div className="hidden h-5 w-px bg-white/10 sm:block light:bg-gray-200" />
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            placeholder="Flow name"
            className="h-8 w-40 border-transparent bg-transparent text-sm font-semibold text-white hover:border-white/10 focus:border-emerald-500 sm:w-56 light:text-gray-900 light:hover:border-gray-200"
          />
          <FlowTypeBadge type={flowType} className="hidden md:inline-flex" />
          <Input
            value={triggerKeywords}
            onChange={(e) => setTriggerKeywords(e.target.value)}
            placeholder="Trigger keywords: hi, menu"
            className="order-last h-8 w-full border-white/10 text-xs text-white md:order-none md:w-56 light:border-gray-200 light:text-gray-900"
          />

          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 light:border-gray-200 light:text-gray-600">
              <span className="hidden sm:inline">Status</span>
              <Switch checked={enabled} onCheckedChange={toggleEnabled} disabled={isLoading || loadFailed} />
            </label>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className={cn('text-xs', ghostBtn)} disabled={isLoading || loadFailed}>
                  <Plus className="mr-1 h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Add New Bot Reply</span>
                  <span className="sm:hidden">Add</span>
                  <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide opacity-60">Bot replies</DropdownMenuLabel>
                {replyKinds.map((k) => (
                  <DropdownMenuItem key={k} onClick={() => addReply(k)}>
                    {REPLY_KIND_LABEL[k]}
                  </DropdownMenuItem>
                ))}
                {flowType === 'advanced' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide opacity-60">Advanced steps</DropdownMenuLabel>
                    {apiWebhookAllowed && (
                      <DropdownMenuItem onClick={() => addAdvancedStep('apiNode')}>
                        <Globe className="mr-2 h-3.5 w-3.5 text-amber-400" /> Webhook / API call
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => addAdvancedStep('transferNode')}>
                      <UserX className="mr-2 h-3.5 w-3.5 text-rose-400" /> Transfer to agent
                    </DropdownMenuItem>
                  </>
                )}
                {flowType !== 'advanced' && (
                  <div className="px-2 py-1.5 text-[10px] text-white/40 light:text-gray-500">
                    {flowType === 'simple' ? 'Media, links and API steps' : 'Links and API steps'} need an Advanced bot.
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportJSON(f);
                e.target.value = '';
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className={cn('px-2', ghostBtn)} aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-3.5 w-3.5" /> Import JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportJSON}>
                  <Download className="mr-2 h-3.5 w-3.5" /> Export JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={handleSave}
              disabled={isSaving || isLoading || loadFailed}
            >
              {isSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </header>

        {/* Canvas */}
        <div className="relative flex-1 overflow-hidden bg-[#0d0d0f] light:bg-gray-100">
          {isLoading || loadFailed ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40 light:text-gray-400">
              {loadFailed ? 'Could not load this flow.' : 'Loading flow...'}
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeDoubleClick={(_, n) => actions.onEdit(n.id)}
              defaultEdgeOptions={{ type: 'default', style: EDGE_STYLE }}
              connectionLineStyle={EDGE_STYLE}
              deleteKeyCode={['Delete', 'Backspace']}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
              colorMode={document.documentElement.classList.contains('light') ? 'light' : 'dark'}
            >
              <Background gap={20} variant={BackgroundVariant.Dots} className="!bg-transparent" color="#3f3f46" />
              <Controls className="!border !border-white/10 !shadow-none light:!border-gray-200" />
              <MiniMap pannable zoomable className="!hidden md:!block !bg-[#141416] light:!bg-white" maskColor="rgba(0,0,0,0.35)" nodeColor="#10b981" />
            </ReactFlow>
          )}

          {nodes.length <= 1 && !isLoading && !loadFailed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
              <div className="rounded-full border border-white/10 bg-[#141416] px-4 py-2 text-xs text-white/60 light:border-gray-200 light:bg-white light:text-gray-600">
                Use <span className="font-semibold text-emerald-400">Add New Bot Reply</span> and drag from each output to the next reply.
              </div>
            </div>
          )}

          {inspectorNode && (
            <ClassicInspector
              node={inspectorNode}
              flowType={flowType}
              onChange={updateInspected}
              onButtonRemoved={(i) => setEdges((eds) => edgesAfterButtonRemoved(eds, inspectorNode.id, i))}
              onClose={() => setInspectorId(null)}
            />
          )}
        </div>

        {editingNode?.data.reply && (
          <BotReplyEditor
            open
            flowType={flowType}
            title={editingNode.data.label || ''}
            reply={editingNode.data.reply}
            onClose={() => setEditingReplyId(null)}
            onSave={saveReply}
          />
        )}
      </div>
    </FlowBuilderContext.Provider>
  );
};

export const ChatbotFlowBuilderView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return id ? <FlowEditor key={id} id={id} /> : <NewFlowSetup />;
};

export default ChatbotFlowBuilderView;
