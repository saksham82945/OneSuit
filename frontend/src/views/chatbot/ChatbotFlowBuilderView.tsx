import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { chatbotService, type ChatEdge, type ChatFlowGraph, type ChatNode, type ChatNodeType } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Save,
  Play,
  MessageSquare,
  HelpCircle,
  Globe,
  UserX,
  X,
  Trash2,
  Link2,
  PhoneCall,
  Phone,
  MessageCircle,
  CheckCircle2,
  Copy,
  Share2,
  Zap,
  Plus,
  Upload,
  Download,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Button Types ─────────────────────────────────────────────────────────────
export type FlowButtonType =
  | 'quick_reply'
  | 'link'
  | 'callback_request'
  | 'call_number'
  | 'call_whatsapp'
  | 'complete_flow'
  | 'copy_code'
  | 'share_info';

export interface FlowButton {
  id: string;
  type: FlowButtonType;
  title: string;
  /** URL for link buttons */
  url?: string;
  /** Phone number for call_number / call_whatsapp */
  phone?: string;
  /** Code text for copy_code */
  code?: string;
  /** Info text / message for share_info */
  info?: string;
}

const BUTTON_TYPE_META: Record<FlowButtonType, { label: string; icon: LucideIcon; color: string; description: string; maxCount: number }> = {
  quick_reply:      { label: 'Quick Reply',       icon: Zap,          color: 'text-purple-400',  description: 'Simple text reply button',               maxCount: 3 },
  link:             { label: 'Link',              icon: Link2,        color: 'text-blue-400',    description: 'Opens a URL in the browser',               maxCount: 2 },
  callback_request: { label: 'Request Callback',  icon: PhoneCall,    color: 'text-emerald-400', description: 'Customer requests a phone callback',       maxCount: 1 },
  call_number:      { label: 'Call Number',       icon: Phone,        color: 'text-cyan-400',    description: 'Dials a phone number directly',            maxCount: 1 },
  call_whatsapp:    { label: 'Call on WhatsApp',  icon: MessageCircle,color: 'text-green-400',   description: 'Starts a WhatsApp voice call',             maxCount: 1 },
  complete_flow:    { label: 'Complete Flow',     icon: CheckCircle2, color: 'text-amber-400',   description: 'Marks the conversation flow as complete',  maxCount: 1 },
  copy_code:        { label: 'Copy Code',         icon: Copy,         color: 'text-orange-400',  description: 'Copies a promo/discount code',             maxCount: 1 },
  share_info:       { label: 'Share Info',        icon: Share2,       color: 'text-rose-400',    description: 'Shares an info card or message',           maxCount: 1 },
};

const MAX_BUTTONS = 10;

// ─── Node Data ─────────────────────────────────────────────────────────────────
type NodeConfig = Record<string, unknown>;

interface BuilderNodeData extends Record<string, unknown> {
  label?: string;
  message?: string;
  question?: string;
  /** Rich button definitions for buttonsNode */
  flowButtons?: FlowButton[];
  /** Legacy string array (used for backend compat) */
  buttons?: string[];
  url?: string;
  queue?: string;
  config?: NodeConfig;
  buttonDefs?: NodeConfig[];
  backendType?: string;
}
type BuilderNode = Node<BuilderNodeData>;

// ─── Canvas Node Components ───────────────────────────────────────────────────
const StartNode: React.FC<{ data: BuilderNodeData }> = ({ data }) => (
  <div className="rounded-xl border border-emerald-500/40 bg-[#16231a] px-4 py-2.5 shadow-xl min-w-[160px] text-white">
    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
      <Play className="h-3.5 w-3.5 fill-current" />
      <span>{data.label || 'Trigger / Start'}</span>
    </div>
    <div className="text-[10px] text-white/50 mt-1 light:text-gray-500">Inbound Message</div>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-emerald-500 border-2 border-white" />
  </div>
);

const TextNode: React.FC<{ data: BuilderNodeData }> = ({ data }) => (
  <div className="rounded-xl border border-white/[0.1] bg-[#1a1a1c] p-3 shadow-xl min-w-[200px] max-w-[260px] text-white light:border-gray-200">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-500 border-2 border-white" />
    <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 pb-1 border-b border-white/[0.08] light:border-gray-200">
      <MessageSquare className="h-3.5 w-3.5" />
      <span>Send Message</span>
    </div>
    <p className="text-xs text-white/80 mt-2 line-clamp-3 leading-relaxed light:text-gray-800">
      {data.message || 'Hello! How can we help you today?'}
    </p>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-500 border-2 border-white" />
  </div>
);

const ButtonsNode: React.FC<{ data: BuilderNodeData }> = ({ data }) => {
  const buttons: FlowButton[] = data.flowButtons || [];
  const legacyButtons: string[] = data.buttons || [];
  const displayButtons = buttons.length > 0 ? buttons : legacyButtons.map((t, i) => ({ id: `b${i}`, type: 'quick_reply' as FlowButtonType, title: t }));
  return (
    <div className="rounded-xl border border-purple-500/40 bg-[#21162b] p-3 shadow-xl min-w-[220px] text-white light:text-gray-900">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-purple-500 border-2 border-white" />
      <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 pb-1 border-b border-white/[0.08] light:border-gray-200">
        <HelpCircle className="h-3.5 w-3.5" />
        <span>Interactive Buttons</span>
        <span className="ml-auto text-[10px] text-white/30 light:text-gray-400">{displayButtons.length}/{MAX_BUTTONS}</span>
      </div>
      <p className="text-xs text-white/80 mt-2 mb-2 light:text-gray-800">{data.question || 'Please select an option:'}</p>
      <div className="space-y-1.5">
        {displayButtons.map((btn, i) => {
          const meta = BUTTON_TYPE_META[btn.type as FlowButtonType] || BUTTON_TYPE_META.quick_reply;
          const BtnIcon = meta.icon;
          return (
            <div key={btn.id || i} className="relative rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs text-white/90 flex items-center gap-2 light:bg-gray-100 light:text-gray-800">
              <BtnIcon className={cn('h-3 w-3 shrink-0', meta.color)} />
              <span className="truncate flex-1">{btn.title || meta.label}</span>
              <Handle
                id={`btn-${i}`}
                type="source"
                position={Position.Right}
                className="w-2.5 h-2.5 bg-purple-400 border border-white"
                style={{ top: '50%' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ApiNode: React.FC<{ data: BuilderNodeData }> = ({ data }) => (
  <div className="rounded-xl border border-amber-500/40 bg-[#261d12] p-3 shadow-xl min-w-[200px] text-white light:text-gray-900">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-amber-500 border-2 border-white" />
    <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 pb-1 border-b border-white/[0.08] light:border-gray-200">
      <Globe className="h-3.5 w-3.5" />
      <span>HTTP Webhook API</span>
    </div>
    <p className="text-[11px] font-mono text-white/70 mt-1 truncate light:text-gray-600">
      {data.url || 'https://api.crm.com/v1/lead'}
    </p>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-amber-500 border-2 border-white" />
  </div>
);

const TransferNode: React.FC<{ data: BuilderNodeData }> = ({ data }) => (
  <div className="rounded-xl border border-rose-500/40 bg-[#261217] p-3 shadow-xl min-w-[180px] text-white light:text-gray-900">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-rose-500 border-2 border-white" />
    <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
      <UserX className="h-3.5 w-3.5" />
      <span>Agent Handover</span>
    </div>
    <div className="text-[10px] text-white/50 mt-1 light:text-gray-500">Queue: {data.queue || 'Support Tier 1'}</div>
  </div>
);

// ─── Button Inspector Row ─────────────────────────────────────────────────────
const ButtonInspectorRow: React.FC<{
  btn: FlowButton;
  meta: typeof BUTTON_TYPE_META[FlowButtonType];
  BtnIcon: LucideIcon;
  onUpdate: (patch: Partial<FlowButton>) => void;
  onRemove: () => void;
}> = ({ btn, meta, BtnIcon, onUpdate, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden light:border-gray-200 light:bg-gray-50">
      {/* Row header */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <BtnIcon className={cn('h-3.5 w-3.5 shrink-0', meta.color)} />
        <Input
          value={btn.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder={meta.label}
          className="h-7 text-xs flex-1 bg-transparent border-transparent hover:border-white/10 focus:border-emerald-500 px-0"
        />
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-white/30 hover:text-white/70 transition-colors p-0.5 light:text-gray-400 light:hover:text-gray-900"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={onRemove}
          className="text-white/20 hover:text-rose-400 transition-colors p-0.5 light:text-gray-300"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {/* Expanded config fields */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-white/[0.06] space-y-2 light:border-gray-200">
          <p className="text-[10px] text-white/30 light:text-gray-400">{meta.description}</p>
          {(btn.type === 'link') && (
            <div>
              <Label className="text-[10px] text-white/50 light:text-gray-500">URL</Label>
              <Input
                value={btn.url || ''}
                onChange={(e) => onUpdate({ url: e.target.value })}
                placeholder="https://example.com"
                className="h-7 text-xs mt-0.5"
              />
            </div>
          )}
          {(btn.type === 'call_number' || btn.type === 'call_whatsapp' || btn.type === 'callback_request') && (
            <div>
              <Label className="text-[10px] text-white/50 light:text-gray-500">{btn.type === 'callback_request' ? 'Callback Number (optional)' : 'Phone Number'}</Label>
              <Input
                value={btn.phone || ''}
                onChange={(e) => onUpdate({ phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="h-7 text-xs mt-0.5"
              />
            </div>
          )}
          {btn.type === 'copy_code' && (
            <div>
              <Label className="text-[10px] text-white/50 light:text-gray-500">Code / Coupon</Label>
              <Input
                value={btn.code || ''}
                onChange={(e) => onUpdate({ code: e.target.value })}
                placeholder="SAVE20"
                className="h-7 text-xs mt-0.5"
              />
            </div>
          )}
          {btn.type === 'share_info' && (
            <div>
              <Label className="text-[10px] text-white/50 light:text-gray-500">Info / Message</Label>
              <Textarea
                rows={2}
                value={btn.info || ''}
                onChange={(e) => onUpdate({ info: e.target.value })}
                placeholder="Info to share with the user..."
                className="text-xs mt-0.5"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  startNode: StartNode,
  textNode: TextNode,
  buttonsNode: ButtonsNode,
  apiNode: ApiNode,
  transferNode: TransferNode,
};


// The start node is the graph's entry point.
const START_NODE_ID = '__start__';

// Starter canvas for a new flow. Everything here is saved as-is, so it holds no sample URLs or queues.
const initialNodes: BuilderNode[] = [
  {
    id: START_NODE_ID,
    type: 'startNode',
    position: { x: 250, y: 50 },
    data: { label: 'Inbound Message' },
    deletable: false,
  },
  {
    id: 'welcome',
    type: 'textNode',
    position: { x: 220, y: 160 },
    data: { message: 'Hello! Welcome to onesuit support. How can we help you today?' },
  },
];

const initialEdges: Edge[] = [
  { id: 'e-start-welcome', source: START_NODE_ID, target: 'welcome', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
];

// ---- Canvas <-> backend graph (v2: { version, nodes, edges, entry_node }) ----

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const asButtonDefs = (v: unknown): NodeConfig[] =>
  Array.isArray(v) ? v.filter((b): b is NodeConfig => !!b && typeof b === 'object') : [];

/** Reply-button id of button `index` on a buttons node; its edge's condition is `button:<id>`. */
const buttonIdAt = (node: BuilderNode, index: number): string =>
  str(node.data.buttonDefs?.[index]?.id) || `btn_${node.id}_${index + 1}`;

function toCanvasNode(n: ChatNode): BuilderNode {
  const config: NodeConfig = n.config || {};
  const base = { id: n.id, position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 } };
  const data: BuilderNodeData = { label: n.label || '', config };
  switch (n.type) {
    case 'start':
      return { ...base, type: 'startNode', deletable: false, data };
    case 'message':
      return { ...base, type: 'textNode', data: { ...data, message: str(config.message) || str(config.text) } };
    case 'buttons': {
      const defs = asButtonDefs(config.buttons);
      return {
        ...base,
        type: 'buttonsNode',
        data: {
          ...data,
          question: str(config.body) || str(config.message) || str(config.text),
          buttons: defs.map((b) => str(b.title)),
          buttonDefs: defs,
        },
      };
    }
    case 'api_call':
    case 'webhook':
      return { ...base, type: 'apiNode', data: { ...data, url: str(config.url), backendType: n.type } };
    case 'transfer':
      return { ...base, type: 'transferNode', data: { ...data, queue: str(config.queue) } };
    default:
      // No editor for this step type (prompt, condition, end, ...): show it as a plain node and save it back unchanged.
      return { ...base, type: 'default', data: { ...data, label: n.label || n.type, backendType: n.type } };
  }
}

function graphToCanvas(graph: ChatFlowGraph | null | undefined): { nodes: BuilderNode[]; edges: Edge[]; entry: string } {
  if (!graph || graph.version !== 2 || !Array.isArray(graph.nodes)) {
    return { nodes: [initialNodes[0]], edges: [], entry: START_NODE_ID };
  }
  const backendNodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges: Edge[] = (graph.edges || []).map((e, i) => {
    let condition = e.condition || 'default';
    let sourceHandle: string | undefined;
    const source = backendNodes.get(e.from);
    if (source?.type === 'buttons' && condition !== 'default') {
      // Older graphs stored the bare button id; the runner matches `button:<id>`.
      const buttonId = condition.startsWith('button:') ? condition.slice('button:'.length) : condition;
      condition = `button:${buttonId}`;
      const index = asButtonDefs(source.config?.buttons).findIndex((b) => str(b.id) === buttonId);
      if (index >= 0) sourceHandle = `btn-${index}`;
    }
    return {
      id: `e-${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      sourceHandle,
      animated: true,
      // Keeps branch conditions (http:2xx, true/false, ...) that have no handle on this canvas.
      data: { condition },
      label: !sourceHandle && condition !== 'default' ? condition : undefined,
    };
  });
  return { nodes: graph.nodes.map(toCanvasNode), edges, entry: graph.entry_node || '' };
}

function toBackendNode(node: BuilderNode): ChatNode {
  const d = node.data || {};
  const config: NodeConfig = { ...(d.config || {}) };
  let type: string;
  switch (node.type) {
    case 'startNode':
      type = 'start';
      break;
    case 'textNode':
      type = 'message';
      config.message = d.message ?? '';
      break;
    case 'buttonsNode': {
      type = 'buttons';
      const defs = d.buttonDefs || [];
      config.body = d.question ?? '';
      config.buttons = (d.buttons || []).map((title, i) => ({
        type: 'reply',
        ...(defs[i] || {}),
        id: buttonIdAt(node, i),
        title,
      }));
      break;
    }
    case 'apiNode':
      type = d.backendType === 'api_call' ? 'api_call' : 'webhook';
      config.url = d.url ?? '';
      // New webhook steps POST; a loaded step keeps whatever method it had.
      if (!d.config) config.method = 'POST';
      break;
    case 'transferNode':
      type = 'transfer';
      config.queue = d.queue ?? '';
      break;
    default:
      type = d.backendType || node.type || 'message';
  }
  return {
    id: node.id,
    type: type as ChatNodeType,
    label: d.label ?? '',
    position: { x: node.position.x, y: node.position.y },
    config,
  };
}

function canvasToGraph(nodes: BuilderNode[], edges: Edge[], loadedEntry: string): ChatFlowGraph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const graphEdges: ChatEdge[] = edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => {
      const source = byId.get(e.source) as BuilderNode;
      const handle = /^btn-(\d+)$/.exec(e.sourceHandle || '');
      const condition =
        handle && source.type === 'buttonsNode'
          ? `button:${buttonIdAt(source, Number(handle[1]))}`
          : str((e.data as { condition?: unknown } | undefined)?.condition) || 'default';
      return { from: e.source, to: e.target, condition };
    });
  const graphNodes = nodes.map(toBackendNode);
  const start = graphNodes.find((n) => n.type === 'start');
  const withIncoming = new Set(graphEdges.map((e) => e.to));
  const entry =
    start?.id ||
    (byId.has(loadedEntry) ? loadedEntry : '') ||
    graphNodes.find((n) => !withIncoming.has(n.id))?.id ||
    graphNodes[0]?.id ||
    '';
  return { version: 2, nodes: graphNodes, edges: graphEdges, entry_node: entry };
}

/** The backend's `{ status: 'error', message }` text, if the request got that far. */
const apiErrorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

// Fields of GET /api/chatbot/flows/:id this screen uses (the raw model: note `is_enabled`, `graph`).
interface ChatbotFlowDetail {
  id: string;
  name: string;
  trigger_keywords?: string[] | null;
  is_enabled?: boolean;
  graph?: ChatFlowGraph | null;
}

export const ChatbotFlowBuilderView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [flowName, setFlowName] = useState('New Customer Welcome Sequence');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>(id ? [] : initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(id ? [] : initialEdges);
  const [selectedNode, setSelectedNode] = useState<BuilderNode | null>(null);
  const [entryNodeId, setEntryNodeId] = useState(START_NODE_ID);
  const [isLoading, setIsLoading] = useState(!!id);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load the flow being edited. The canvas mounts only after this so fitView sees its nodes.
  useEffect(() => {
    if (!id) return;
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
        setNodes(canvas.nodes);
        setEdges(canvas.edges);
        setEntryNodeId(canvas.entry);
        setSelectedNode(null);
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

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const addNode = (type: string) => {
    const newId = `node-${Date.now()}`;
    const newNode: BuilderNode = {
      id: newId,
      type,
      position: { x: 300 + Math.random() * 50, y: 250 + Math.random() * 50 },
      data:
        type === 'textNode'
          ? { message: 'Type your message here...' }
          : type === 'buttonsNode'
          ? {
              question: 'Choose an option:',
              flowButtons: [
                { id: `btn_${newId}_0`, type: 'quick_reply', title: 'Option A' },
                { id: `btn_${newId}_1`, type: 'quick_reply', title: 'Option B' },
              ],
            }
          : type === 'apiNode'
          ? { url: 'https://api.service.com/endpoint' }
          : { queue: 'General Queue' },
    };
    setNodes((nds) => [...nds, newNode]);
    toast.success('Node added to canvas');
  };

  const onNodeClick = (_: React.MouseEvent, node: BuilderNode) => {
    setSelectedNode(node);
  };

  const updateSelectedNodeData = (key: keyof BuilderNodeData, value: BuilderNodeData[keyof BuilderNodeData]) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updated = { ...n, data: { ...n.data, [key]: value } };
          setSelectedNode(updated);
          return updated;
        }
        return n;
      })
    );
  };

  const handleSave = async () => {
    if (isLoading || loadFailed) {
      // Saving now would overwrite the stored graph with an empty canvas.
      toast.error('The flow has not loaded, so it cannot be saved');
      return;
    }
    if (!flowName.trim()) {
      toast.error('Flow name is required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: flowName.trim(),
        trigger_keywords: triggerKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        graph: canvasToGraph(nodes, edges, entryNodeId),
      };
      if (id) {
        await chatbotService.updateFlow(id, payload);
        toast.success('Flow saved successfully');
      } else {
        const res = await chatbotService.createFlow({ ...payload, enabled: true });
        const created = readData<{ id?: string }>(res);
        toast.success('Flow created');
        navigate(created?.id ? `/chatbot/flows/${created.id}/edit` : '/chatbot/flows', { replace: true });
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save flow'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJSON = () => {
    try {
      const graph = canvasToGraph(nodes, edges, entryNodeId);
      const exportData = {
        $schema: 'https://whatomate.com/schemas/flow-v1.json',
        version: 1,
        name: flowName.trim() || 'Untitled Flow',
        trigger_keywords: triggerKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        graph,
        exported_at: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = (flowName || 'flow').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      link.download = `${safeName}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Flow exported to JSON');
    } catch {
      toast.error('Failed to export flow');
    }
  };

  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON format');
        }
        if (parsed.name) setFlowName(parsed.name);
        if (Array.isArray(parsed.trigger_keywords)) {
          setTriggerKeywords(parsed.trigger_keywords.join(', '));
        }
        if (parsed.graph) {
          const canvas = graphToCanvas(parsed.graph);
          setNodes(canvas.nodes);
          setEdges(canvas.edges);
          setEntryNodeId(canvas.entry);
          setSelectedNode(null);
          toast.success(`Imported “${parsed.name || 'Flow'}” onto canvas`);
        } else {
          toast.warning('No graph definition found in JSON');
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to import JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleTestSimulate = () => {
    // There is no simulation endpoint in the backend yet.
    toast.info('Flow preview is not available yet. Save the flow and message a trigger keyword to try it.');
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      {/* Top Header */}
      <header className="h-14 border-b border-white/[0.08] bg-[#0a0a0b] px-4 flex items-center justify-between shrink-0 light:border-gray-200 light:bg-gray-50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/chatbot/flows')}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
          <div className="h-4 w-px bg-white/10 light:bg-gray-100" />
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            placeholder="Flow name"
            className="h-8 text-xs font-semibold bg-transparent border-transparent hover:border-white/10 focus:border-emerald-500 text-white w-64 light:text-gray-900"
          />
          <Input
            value={triggerKeywords}
            onChange={(e) => setTriggerKeywords(e.target.value)}
            placeholder="Trigger keywords (comma-separated)"
            className="h-8 text-xs bg-transparent border-white/10 hover:border-white/20 focus:border-emerald-500 text-white w-64 light:border-gray-200 light:text-gray-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportJSON(file);
              e.target.value = '';
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            title="Import AI-generated or exported bot JSON"
            className="text-xs border-white/10 hover:bg-white/[0.04] text-white light:border-gray-200 light:text-gray-700 light:hover:bg-gray-100"
          >
            <Upload className="h-3.5 w-3.5 mr-1 text-emerald-400" />
            Import JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            title="Download bot flow as JSON file"
            className="text-xs border-white/10 hover:bg-white/[0.04] text-white light:border-gray-200 light:text-gray-700 light:hover:bg-gray-100"
          >
            <Download className="h-3.5 w-3.5 mr-1 text-emerald-400" />
            Export JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleTestSimulate}>
            <Play className="h-3.5 w-3.5 mr-1 text-emerald-400" />
            Test Flow
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={handleSave}
            disabled={isSaving || isLoading || loadFailed}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {isSaving ? 'Saving...' : 'Save Flow'}
          </Button>
        </div>
      </header>

      {/* Main Studio Work Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Node Toolbar */}
        <aside className="w-56 border-r border-white/[0.08] bg-[#101012] p-3 flex flex-col gap-2 z-10 shrink-0 light:border-gray-200">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1 light:text-gray-400">
            Canvas Steps
          </span>
          <Button
            variant="outline"
            size="sm"
            className="justify-start text-xs border-white/[0.08] hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-100"
            onClick={() => addNode('textNode')}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-2 text-blue-400" />
            Send Message
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start text-xs border-white/[0.08] hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-100"
            onClick={() => addNode('buttonsNode')}
          >
            <HelpCircle className="h-3.5 w-3.5 mr-2 text-purple-400" />
            Buttons Menu
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start text-xs border-white/[0.08] hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-100"
            onClick={() => addNode('apiNode')}
          >
            <Globe className="h-3.5 w-3.5 mr-2 text-amber-400" />
            Webhook API
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start text-xs border-white/[0.08] hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-100"
            onClick={() => addNode('transferNode')}
          >
            <UserX className="h-3.5 w-3.5 mr-2 text-rose-400" />
            Agent Transfer
          </Button>
        </aside>

        {/* Center React Flow Canvas */}
        <div className="flex-1 h-full bg-[#0d0d0f] relative">
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
              onNodeClick={onNodeClick}
              fitView
            >
              <Background color="#2a2a2e" gap={18} variant={BackgroundVariant.Dots} />
              <Controls className="bg-[#141415] border border-white/10 rounded-lg text-white light:bg-white light:border-gray-200 light:text-gray-900" />
            </ReactFlow>
          )}
        </div>

        {/* Right Properties Inspector */}
        {selectedNode && (() => {
          const nodeData: BuilderNodeData = selectedNode.data || {};
          return (
          <aside className="w-80 border-l border-white/[0.08] bg-[#141416] p-4 flex flex-col gap-4 z-10 shrink-0 overflow-y-auto light:border-gray-200">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08] light:border-gray-200">
              <div>
                <span className="text-xs font-semibold text-white light:text-gray-900">Step Inspector</span>
                <p className="text-[10px] text-white/40 font-mono light:text-gray-400">{selectedNode.id}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedNode(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {selectedNode.type === 'textNode' && (
              <div className="space-y-2">
                <Label className="text-xs">Message Content</Label>
                <Textarea
                  rows={4}
                  value={nodeData.message || ''}
                  onChange={(e) => updateSelectedNodeData('message', e.target.value)}
                />
              </div>
            )}

            {selectedNode.type === 'buttonsNode' && (() => {
              const flowBtns: FlowButton[] = (nodeData.flowButtons as FlowButton[]) || [];

              const addButton = (type: FlowButtonType) => {
                const typeCount = flowBtns.filter(b => b.type === type).length;
                const maxForType = BUTTON_TYPE_META[type].maxCount;
                if (typeCount >= maxForType) {
                  toast.error(`Max ${maxForType} "${BUTTON_TYPE_META[type].label}" button${maxForType > 1 ? 's' : ''} allowed`);
                  return;
                }
                if (flowBtns.length >= MAX_BUTTONS) {
                  toast.error(`Maximum ${MAX_BUTTONS} buttons reached`);
                  return;
                }
                const newBtn: FlowButton = {
                  id: `btn_${selectedNode.id}_${Date.now()}`,
                  type,
                  title: BUTTON_TYPE_META[type].label,
                };
                updateSelectedNodeData('flowButtons', [...flowBtns, newBtn]);
              };

              const updateButton = (index: number, patch: Partial<FlowButton>) => {
                const updated = flowBtns.map((b, i) => i === index ? { ...b, ...patch } : b);
                updateSelectedNodeData('flowButtons', updated);
              };

              const removeButton = (index: number) => {
                updateSelectedNodeData('flowButtons', flowBtns.filter((_, i) => i !== index));
              };

              const canAdd = flowBtns.length < MAX_BUTTONS;

              return (
                <div className="space-y-4">
                  {/* Header question */}
                  <div className="space-y-1">
                    <Label className="text-xs">Header / Question Text</Label>
                    <Input
                      value={nodeData.question as string || ''}
                      onChange={(e) => updateSelectedNodeData('question', e.target.value)}
                      placeholder="Please select an option:"
                    />
                  </div>

                  {/* Existing buttons */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Buttons ({flowBtns.length}/{MAX_BUTTONS})</Label>
                      {!canAdd && (
                        <span className="text-[10px] text-amber-400 font-medium">Max reached</span>
                      )}
                    </div>

                    {flowBtns.length === 0 && (
                      <p className="text-xs text-white/30 py-3 text-center border border-white/[0.06] rounded-lg light:text-gray-400 light:border-gray-200">
                        Add buttons from the palette below
                      </p>
                    )}

                    {flowBtns.map((btn, i) => {
                      const meta = BUTTON_TYPE_META[btn.type];
                      const BtnIcon = meta.icon;
                      return (
                        <ButtonInspectorRow
                          key={btn.id}
                          btn={btn}
                          meta={meta}
                          BtnIcon={BtnIcon}
                          onUpdate={(patch) => updateButton(i, patch)}
                          onRemove={() => removeButton(i)}
                        />
                      );
                    })}
                  </div>

                  {/* Button type palette */}
                  {canAdd && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/50 light:text-gray-500">Add Button Type</Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(Object.keys(BUTTON_TYPE_META) as FlowButtonType[]).map((type) => {
                          const meta = BUTTON_TYPE_META[type];
                          const BtnIcon = meta.icon;
                          const typeCount = flowBtns.filter(b => b.type === type).length;
                          const disabled = typeCount >= meta.maxCount || flowBtns.length >= MAX_BUTTONS;
                          return (
                            <button
                              key={type}
                              disabled={disabled}
                              onClick={() => addButton(type)}
                              className={cn(
                                'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] text-left transition-all',
                                disabled
                                  ? 'border-white/[0.04] text-white/20 cursor-not-allowed light:border-gray-200 light:text-gray-300'
                                  : 'border-white/[0.08] hover:border-white/20 hover:bg-white/[0.04] text-white/70 cursor-pointer light:border-gray-200 light:hover:bg-gray-100 light:text-gray-600'
                              )}
                            >
                              <BtnIcon className={cn('h-3 w-3 shrink-0', disabled ? 'text-white/20 light:text-gray-300' : meta.color)} />
                              <span className="truncate">{meta.label}</span>
                              {typeCount > 0 && <span className="ml-auto text-white/30 light:text-gray-400">{typeCount}/{meta.maxCount}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {selectedNode.type === 'apiNode' && (
              <div className="space-y-2">
                <Label className="text-xs">Webhook Request URL</Label>
                <Input
                  value={nodeData.url as string || ''}
                  onChange={(e) => updateSelectedNodeData('url', e.target.value)}
                />
              </div>
            )}

            {selectedNode.type === 'transferNode' && (
              <div className="space-y-2">
                <Label className="text-xs">Routing Department / Queue</Label>
                <Input
                  value={nodeData.queue as string || ''}
                  onChange={(e) => updateSelectedNodeData('queue', e.target.value)}
                />
              </div>
            )}

            {selectedNode.type === 'default' && (
              <p className="text-xs text-white/50 light:text-gray-500">
                This step type ({nodeData.backendType as string}) can't be edited here yet. It is kept as-is when you save.
              </p>
            )}

            {selectedNode.type !== 'startNode' && (
              <Button
                variant="destructive"
                size="sm"
                className="mt-auto"
                onClick={() => {
                  setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                  setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                  setSelectedNode(null);
                  toast.success('Node removed');
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove Step
              </Button>
            )}
          </aside>
          );
        })()}
      </div>
    </div>
  );
};
export default ChatbotFlowBuilderView;
