// Conversion between the chatbot flow builder's canvas (React Flow nodes/edges)
// and the backend's v2 graph: { version, nodes, edges, entry_node }.
import type { Edge, Node } from '@xyflow/react';
import type { ChatEdge, ChatFlowGraph, ChatNode, ChatNodeType } from '@/services/api';

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

export const FLOW_BUTTON_TYPES: readonly FlowButtonType[] = [
  'quick_reply',
  'link',
  'callback_request',
  'call_number',
  'call_whatsapp',
  'complete_flow',
  'copy_code',
  'share_info',
];

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

// ─── Node Data ─────────────────────────────────────────────────────────────────
export type NodeConfig = Record<string, unknown>;

export interface BuilderNodeData extends Record<string, unknown> {
  label?: string;
  message?: string;
  question?: string;
  /** The buttons of a buttonsNode: what the canvas shows, the inspector edits and the save sends. */
  flowButtons?: FlowButton[];
  url?: string;
  queue?: string;
  config?: NodeConfig;
  backendType?: string;
}
export type BuilderNode = Node<BuilderNodeData>;

// The start node is the graph's entry point.
export const START_NODE_ID = '__start__';

export const startNode = (): BuilderNode => ({
  id: START_NODE_ID,
  type: 'startNode',
  position: { x: 250, y: 50 },
  data: { label: 'Inbound Message' },
  deletable: false,
});

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const asButtonDefs = (v: unknown): NodeConfig[] =>
  Array.isArray(v) ? v.filter((b): b is NodeConfig => !!b && typeof b === 'object') : [];

const isFlowButtonType = (v: unknown): v is FlowButtonType =>
  typeof v === 'string' && (FLOW_BUTTON_TYPES as readonly string[]).includes(v);

/** Reply-button id of button `index` on a buttons node; its edge's condition is `button:<id>`. */
export const buttonIdAt = (node: BuilderNode, index: number): string =>
  node.data.flowButtons?.[index]?.id || `btn_${node.id}_${index + 1}`;

/** A stored button (`{ id, title, type: reply|url|phone, ... }`) as the builder edits it. */
function toFlowButton(def: NodeConfig, index: number, nodeId: string): FlowButton {
  const backendType = str(def.type);
  const type: FlowButtonType = isFlowButtonType(def.builder_type)
    ? def.builder_type
    : backendType === 'url'
      ? 'link'
      : backendType === 'phone'
        ? 'call_number'
        : 'quick_reply';
  const btn: FlowButton = { id: str(def.id) || `btn_${nodeId}_${index + 1}`, type, title: str(def.title) };
  if (str(def.url)) btn.url = str(def.url);
  if (str(def.phone_number)) btn.phone = str(def.phone_number);
  if (str(def.code)) btn.code = str(def.code);
  if (str(def.info)) btn.info = str(def.info);
  return btn;
}

/**
 * A builder button in the shape the runner sends (sendAndSaveInteractiveButtons):
 * `url` and `phone` become CTA buttons, everything else is a reply button.
 * `builder_type` keeps the builder's own type so the inspector shows it again on load.
 */
function toBackendButton(btn: FlowButton, stored: NodeConfig | undefined): NodeConfig {
  const out: NodeConfig = { ...(stored || {}), id: btn.id, title: btn.title, builder_type: btn.type };
  delete out.url;
  delete out.phone_number;
  delete out.code;
  delete out.info;
  if (btn.type === 'link') {
    out.type = 'url';
    out.url = btn.url ?? '';
  } else if (btn.type === 'call_number' || btn.type === 'call_whatsapp') {
    out.type = 'phone';
    out.phone_number = btn.phone ?? '';
  } else {
    out.type = 'reply';
    if (btn.phone) out.phone_number = btn.phone;
  }
  if (btn.code) out.code = btn.code;
  if (btn.info) out.info = btn.info;
  return out;
}

export function toCanvasNode(n: ChatNode): BuilderNode {
  const config: NodeConfig = n.config || {};
  const base = { id: n.id, position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 } };
  const data: BuilderNodeData = { label: n.label || '', config };
  switch (n.type) {
    case 'start':
      return { ...base, type: 'startNode', deletable: false, data };
    case 'message':
      return { ...base, type: 'textNode', data: { ...data, message: str(config.message) || str(config.text) } };
    case 'buttons':
      return {
        ...base,
        type: 'buttonsNode',
        data: {
          ...data,
          question: str(config.body) || str(config.message) || str(config.text),
          flowButtons: asButtonDefs(config.buttons).map((b, i) => toFlowButton(b, i, n.id)),
        },
      };
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

export function graphToCanvas(graph: ChatFlowGraph | null | undefined): { nodes: BuilderNode[]; edges: Edge[]; entry: string } {
  if (!graph || graph.version !== 2 || !Array.isArray(graph.nodes)) {
    return { nodes: [startNode()], edges: [], entry: START_NODE_ID };
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

export function toBackendNode(node: BuilderNode): ChatNode {
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
      const stored = asButtonDefs(config.buttons);
      const byId = new Map(stored.map((b) => [str(b.id), b]));
      config.body = d.question ?? '';
      config.buttons = (d.flowButtons || []).map((btn) => toBackendButton(btn, byId.get(btn.id)));
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

export function canvasToGraph(nodes: BuilderNode[], edges: Edge[], loadedEntry: string): ChatFlowGraph {
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

/**
 * Edges after button `removed` of buttons node `nodeId` is deleted: that button's
 * edge goes, and edges of the buttons after it move up one handle with their button.
 */
export function edgesAfterButtonRemoved(edges: Edge[], nodeId: string, removed: number): Edge[] {
  return edges.flatMap((e) => {
    if (e.source !== nodeId) return [e];
    const handle = /^btn-(\d+)$/.exec(e.sourceHandle || '');
    if (!handle) return [e];
    const index = Number(handle[1]);
    if (index === removed) return [];
    return index > removed ? [{ ...e, sourceHandle: `btn-${index - 1}` }] : [e];
  });
}
