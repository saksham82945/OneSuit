import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  Copy,
  FileText,
  Film,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Link2,
  List,
  MessageSquare,
  MessageSquareText,
  Mic,
  MousePointerClick,
  Pencil,
  Play,
  Trash2,
  UserX,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BuilderNode } from './chatbotFlowGraph';
import { CHAT_FLOW_TYPE_INFO, REPLY_KIND_LABEL, replyKindOf, replyOptions, validateReply, type ReplyKind } from './chatbotFlowTypes';
import { useFlowBuilder } from './flowBuilderContext';

const handleIn = '!h-3 !w-3 !border-2 !border-[#141415] !bg-emerald-500 light:!border-white';
const handleOut = '!h-3 !w-3 !border-2 !border-[#141415] !bg-emerald-400 light:!border-white';

const KIND_ICON: Record<ReplyKind, LucideIcon> = {
  text: MessageSquareText,
  media: ImageIcon,
  buttons: MousePointerClick,
  list: List,
  cta_url: Link2,
};

const MEDIA_ICON: Record<string, LucideIcon> = { image: ImageIcon, video: Film, audio: Mic, document: FileText };

/** Highlights {variables} in node text. */
const withVariables = (text: string) =>
  text.split(/(\{\{?[a-z_]+\}?\})/g).map((p, i) =>
    /^\{\{?[a-z_]+\}?\}$/.test(p) ? (
      <span key={i} className="rounded bg-emerald-500/15 px-0.5 font-mono text-[10px] text-emerald-300 light:text-emerald-700">
        {p}
      </span>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );

const NodeActions: React.FC<{ id: string; editable?: boolean }> = ({ id, editable = true }) => {
  const { onEdit, onDelete, onDuplicate } = useFlowBuilder();
  const btn =
    'nodrag inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors text-white/60 hover:bg-white/[0.08] hover:text-white light:text-gray-500 light:hover:bg-gray-100 light:hover:text-gray-900';
  return (
    <div className="flex items-center gap-0.5 border-t border-white/[0.06] px-1.5 py-1 light:border-gray-100">
      {editable && (
        <button type="button" className={btn} onClick={(e) => { e.stopPropagation(); onEdit(id); }}>
          <Pencil className="h-3 w-3" /> Edit
        </button>
      )}
      <button type="button" className={btn} onClick={(e) => { e.stopPropagation(); onDuplicate(id); }}>
        <Copy className="h-3 w-3" /> Duplicate
      </button>
      <button
        type="button"
        className={cn(btn, 'ml-auto hover:!bg-rose-500/10 hover:!text-rose-400')}
        onClick={(e) => { e.stopPropagation(); onDelete(id); }}
      >
        <Trash2 className="h-3 w-3" /> Delete
      </button>
    </div>
  );
};

const Card: React.FC<{
  selected?: boolean;
  accent: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
  warn?: string;
  children?: React.ReactNode;
  className?: string;
}> = ({ selected, accent, icon: Icon, kicker, title, warn, children, className }) => (
  <div
    className={cn(
      'w-[260px] rounded-xl border bg-[#18181b] shadow-xl shadow-black/30 text-white light:bg-white light:text-gray-900 light:shadow-gray-200/70',
      selected ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-white/[0.1] light:border-gray-200',
      className
    )}
  >
    <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', accent)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40 light:text-gray-400">{kicker}</div>
        <div className="truncate text-xs font-semibold">{title}</div>
      </div>
      {warn && (
        <span title={warn} className="text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
    {children}
  </div>
);

export const StartNode: React.FC<NodeProps<BuilderNode>> = ({ selected }) => {
  const { keywords, flowType } = useFlowBuilder();
  return (
    <div
      className={cn(
        'w-[220px] rounded-xl border bg-gradient-to-br from-emerald-600 to-teal-700 p-3 text-white shadow-xl shadow-emerald-900/30',
        selected ? 'border-white/60' : 'border-emerald-400/40'
      )}
    >
      <div className="flex items-center gap-2 text-xs font-bold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
          <Play className="h-3 w-3 fill-current" />
        </span>
        Start
        <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
          {CHAT_FLOW_TYPE_INFO[flowType].title}
        </span>
      </div>
      <div className="mt-2 text-[10px] text-white/70">When a customer sends</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {keywords.length ? (
          keywords.map((k) => (
            <span key={k} className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">
              {k}
            </span>
          ))
        ) : (
          <span className="text-[10px] italic text-white/60">no keywords yet</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className={handleOut} />
    </div>
  );
};

export const ReplyNode: React.FC<NodeProps<BuilderNode>> = ({ id, data, selected }) => {
  const { flowType } = useFlowBuilder();
  const reply = data.reply;
  if (!reply) return null;
  const kind = replyKindOf(reply);
  const options = replyOptions(reply);
  const errors = validateReply(reply, flowType);
  const MediaIcon = MEDIA_ICON[reply.header.type];

  return (
    <Card
      selected={selected}
      accent="bg-emerald-500/15 text-emerald-400 light:text-emerald-600"
      icon={KIND_ICON[kind]}
      kicker={REPLY_KIND_LABEL[kind]}
      title={data.label || 'Bot reply'}
      warn={errors[0]}
    >
      <Handle type="target" position={Position.Left} className={handleIn} />
      <div className="px-3 pb-2 space-y-1.5">
        {reply.header.type === 'text' && reply.header.text && (
          <div className="truncate text-[11px] font-semibold">{reply.header.text}</div>
        )}
        {MediaIcon && (
          <div className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-white/60 light:bg-gray-50 light:text-gray-600">
            <MediaIcon className="h-3 w-3 shrink-0 text-teal-400" />
            <span className="truncate">{reply.header.filename || `${reply.header.type} (not uploaded)`}</span>
          </div>
        )}
        <p className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-white/75 light:text-gray-700">
          {reply.body ? withVariables(reply.body) : <span className="italic text-white/30 light:text-gray-400">No text</span>}
        </p>
        {reply.interactive === 'cta_url' && (
          <div className="flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 light:text-sky-700">
            <Link2 className="h-3 w-3" />
            <span className="truncate">{reply.cta.display_text || 'Link'}</span>
          </div>
        )}
      </div>
      {options.length > 0 && (
        <div className="space-y-1 px-3 pb-2">
          {reply.interactive === 'list' && (
            <div className="text-[9px] font-semibold uppercase tracking-wider text-white/35 light:text-gray-400">
              {reply.list.button_text || 'Menu'}
            </div>
          )}
          {options.map((o, i) => (
            <div
              key={o.id || i}
              className="relative flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[11px] light:border-gray-200 light:bg-gray-50"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="truncate">{o.title || 'Option'}</span>
              <Handle id={`opt-${i}`} type="source" position={Position.Right} className={cn(handleOut, '!-right-[19px]')} />
            </div>
          ))}
        </div>
      )}
      {options.length === 0 && <Handle type="source" position={Position.Right} className={handleOut} />}
      <NodeActions id={id} />
    </Card>
  );
};

const LegacyNode: React.FC<{
  id: string;
  selected?: boolean;
  icon: LucideIcon;
  kicker: string;
  title: string;
  accent: string;
  body?: React.ReactNode;
  terminal?: boolean;
  editable?: boolean;
  children?: React.ReactNode;
}> = ({ id, selected, icon, kicker, title, accent, body, terminal, editable, children }) => (
  <Card selected={selected} accent={accent} icon={icon} kicker={kicker} title={title}>
    <Handle type="target" position={Position.Left} className={handleIn} />
    {body && <div className="px-3 pb-2 text-[11px] text-white/70 light:text-gray-600">{body}</div>}
    {children}
    {!terminal && !children && <Handle type="source" position={Position.Right} className={handleOut} />}
    <NodeActions id={id} editable={editable} />
  </Card>
);

export const TextNode: React.FC<NodeProps<BuilderNode>> = ({ id, data, selected }) => (
  <LegacyNode
    id={id}
    selected={selected}
    icon={MessageSquare}
    kicker="Message (classic)"
    title={data.label || 'Send message'}
    accent="bg-sky-500/15 text-sky-400"
    body={<p className="line-clamp-3">{data.message || '—'}</p>}
    editable
  />
);

export const ButtonsNode: React.FC<NodeProps<BuilderNode>> = ({ id, data, selected }) => (
  <LegacyNode
    id={id}
    selected={selected}
    icon={HelpCircle}
    kicker="Buttons (classic)"
    title={data.label || 'Buttons'}
    accent="bg-purple-500/15 text-purple-400"
    body={<p className="line-clamp-2">{data.question || '—'}</p>}
    editable
  >
    <div className="space-y-1 px-3 pb-2">
      {(data.flowButtons || []).map((b, i) => (
        <div
          key={b.id || i}
          className="relative rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[11px] light:border-gray-200 light:bg-gray-50"
        >
          <span className="truncate block">{b.title || b.type}</span>
          <Handle id={`btn-${i}`} type="source" position={Position.Right} className={cn(handleOut, '!-right-[19px]')} />
        </div>
      ))}
    </div>
  </LegacyNode>
);

export const ApiNode: React.FC<NodeProps<BuilderNode>> = ({ id, data, selected }) => (
  <LegacyNode
    id={id}
    selected={selected}
    icon={Globe}
    kicker={data.backendType === 'api_call' ? 'API call' : 'Webhook'}
    title={data.label || 'HTTP request'}
    accent="bg-amber-500/15 text-amber-400"
    body={<p className="truncate font-mono text-[10px]">{data.url || 'https://'}</p>}
    editable
  />
);

export const TransferNode: React.FC<NodeProps<BuilderNode>> = ({ id, data, selected }) => (
  <LegacyNode
    id={id}
    selected={selected}
    icon={UserX}
    kicker="Transfer to agent"
    title={data.label || 'Agent handover'}
    accent="bg-rose-500/15 text-rose-400"
    body={<p>Queue: {data.queue || 'General'}</p>}
    terminal
    editable
  />
);

export const OtherNode: React.FC<NodeProps<BuilderNode>> = ({ id, data, selected }) => (
  <LegacyNode
    id={id}
    selected={selected}
    icon={Workflow}
    kicker={`${data.backendType || 'step'} step`}
    title={data.label || String(data.backendType || 'Step')}
    accent="bg-white/10 text-white/70 light:bg-gray-100 light:text-gray-600"
    body={<p className="text-[10px]">Kept as-is when you save.</p>}
  />
);
