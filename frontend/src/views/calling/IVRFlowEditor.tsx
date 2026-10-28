/**
 * Step editor for one IVR flow (route /calling/ivr-flows/:id/edit).
 *
 * It edits the v2 flow graph:
 * nodes with a type/label/config, edges { from, to, condition } and an entry node.
 * Steps are listed on the left and each step's outputs are wired to the next step with dropdowns.
 * Node positions are kept (and new nodes get one) so a flow still lays out sensibly in canvas editors.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readData, readList } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowRight,
  Clock,
  ExternalLink,
  Flag,
  Globe,
  Grid3X3,
  Hash,
  Info,
  Loader2,
  type LucideIcon,
  Phone,
  PhoneOff,
  Plus,
  Save,
  Trash2,
  Type,
  Upload,
  Users,
  Volume2,
  Workflow,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  callingApi,
  formatDateTime,
  type IVREdge,
  type IVRFlow,
  type IVRFlowData,
  type IVRNode,
  type IVRNodeConfig,
  type IVRNodeType,
  type TeamRef,
} from './callingApi';

// ---- Node catalogue ------------------------------------------------------------

interface NodeTypeInfo {
  label: string;
  icon: LucideIcon;
  color: string;
  description: string;
}

const NODE_TYPES: Record<IVRNodeType, NodeTypeInfo> = {
  greeting: { label: 'Greeting', icon: Volume2, color: 'bg-green-600', description: 'Play a message, then continue.' },
  menu: { label: 'Menu', icon: Grid3X3, color: 'bg-purple-600', description: 'Play options and wait for a keypress.' },
  gather: { label: 'Gather', icon: Hash, color: 'bg-blue-600', description: 'Collect digits into a variable.' },
  http_callback: { label: 'HTTP', icon: Globe, color: 'bg-orange-600', description: 'Call your API and branch on the result.' },
  transfer: { label: 'Transfer', icon: Users, color: 'bg-amber-600', description: 'Hand the call to a team.' },
  goto_flow: { label: 'Goto Flow', icon: ExternalLink, color: 'bg-teal-600', description: 'Continue in another IVR flow.' },
  timing: { label: 'Timing', icon: Clock, color: 'bg-cyan-600', description: 'Branch on business hours.' },
  hangup: { label: 'Hangup', icon: PhoneOff, color: 'bg-red-600', description: 'Optionally play a message, then end the call.' },
};

const UNKNOWN_TYPE: NodeTypeInfo = { label: 'Step', icon: Workflow, color: 'bg-slate-600', description: 'A step type this editor does not know.' };
const typeInfo = (type: string): NodeTypeInfo => NODE_TYPES[type as IVRNodeType] || UNKNOWN_TYPE;

const NODE_ORDER: IVRNodeType[] = ['greeting', 'menu', 'gather', 'http_callback', 'transfer', 'goto_flow', 'timing', 'hangup'];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface ScheduleEntry {
  day: string;
  enabled: boolean;
  start_time: string;
  end_time: string;
}

const defaultSchedule = (): ScheduleEntry[] =>
  DAYS.map((day) => ({ day, enabled: !['saturday', 'sunday'].includes(day), start_time: '09:00', end_time: '17:00' }));

// Standard default node configurations.
const defaultConfig = (type: IVRNodeType): IVRNodeConfig => {
  switch (type) {
    case 'greeting':
      return { audio_file: '', interruptible: false };
    case 'menu':
      return { audio_file: '', timeout_seconds: 10, max_retries: 3, options: {} };
    case 'gather':
      return { audio_file: '', max_digits: 10, terminator: '#', timeout_seconds: 10, max_retries: 3, store_as: '' };
    case 'http_callback':
      return { url: '', method: 'GET', headers: {}, body_template: '', timeout_seconds: 10, response_store_as: '' };
    case 'transfer':
      return { team_id: '' };
    case 'goto_flow':
      return { flow_id: '' };
    case 'timing':
      return { schedule: defaultSchedule() };
    case 'hangup':
      return { audio_file: '' };
  }
};

interface OutputHandle {
  condition: string;
  label: string;
  hint?: string;
}

type MenuOptions = Record<string, { label?: string }>;

const menuOptionsOf = (config: IVRNodeConfig): MenuOptions =>
  config.options && typeof config.options === 'object' ? (config.options as MenuOptions) : {};

// Outputs each node type can branch on; these are the edge conditions the IVR engine resolves
// (internal/calling/ivr.go). goto_flow and hangup are terminal and have none.
function outputsFor(node: IVRNode): OutputHandle[] {
  switch (node.type) {
    case 'greeting':
      return [{ condition: 'default', label: 'Next' }];
    case 'menu': {
      const digits = Object.keys(menuOptionsOf(node.config)).sort((a, b) => a.localeCompare(b));
      return [
        ...digits.map((d) => ({
          condition: `digit:${d}`,
          label: `Key ${d}`,
          hint: menuOptionsOf(node.config)[d]?.label || undefined,
        })),
        { condition: 'timeout', label: 'No input', hint: 'Timed out' },
        { condition: 'max_retries', label: 'Too many tries', hint: 'Max retries reached' },
      ];
    }
    case 'gather':
      return [
        { condition: 'default', label: 'After input' },
        { condition: 'timeout', label: 'No input', hint: 'Timed out' },
        { condition: 'max_retries', label: 'Too many tries', hint: 'Max retries reached' },
      ];
    case 'http_callback':
      return [
        { condition: 'http:2xx', label: 'Success', hint: 'HTTP 2xx' },
        { condition: 'http:non2xx', label: 'Error', hint: 'Non-2xx or failed' },
      ];
    case 'transfer':
      return [
        { condition: 'completed', label: 'After the call', hint: 'Agent finished the call' },
        { condition: 'no_answer', label: 'No answer', hint: 'Nobody picked up' },
      ];
    case 'timing':
      return [
        { condition: 'in_hours', label: 'Open', hint: 'Within business hours' },
        { condition: 'out_of_hours', label: 'Closed', hint: 'Outside business hours' },
      ];
    default:
      return [];
  }
}

const isTerminal = (type: IVRNodeType) => type === 'goto_flow' || type === 'hangup';

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

function nodeSummary(node: IVRNode, teams: TeamRef[], flows: IVRFlow[]): string {
  const c = node.config;
  switch (node.type) {
    case 'greeting':
    case 'hangup': {
      const text = str(c.greeting_text);
      if (text) return text.length > 50 ? `${text.slice(0, 50)}…` : text;
      if (str(c.audio_file)) return str(c.audio_file);
      return node.type === 'hangup' ? 'End call' : 'No audio yet';
    }
    case 'menu': {
      const opts = Object.entries(menuOptionsOf(c));
      return opts.length ? opts.map(([d, o]) => `${d}: ${o?.label || '—'}`).join(' · ') : 'No options yet';
    }
    case 'gather':
      return [c.max_digits ? `${c.max_digits} digits` : '', str(c.store_as) ? `→ ${str(c.store_as)}` : '']
        .filter(Boolean)
        .join(', ') || 'Collect digits';
    case 'http_callback':
      return `${str(c.method) || 'GET'} ${str(c.url) || 'No URL'}`;
    case 'transfer':
      return teams.find((t) => t.id === c.team_id)?.name || (str(c.team_id) ? 'Unknown team' : 'No team');
    case 'goto_flow':
      return flows.find((f) => f.id === c.flow_id)?.name || (str(c.flow_id) ? 'Unknown flow' : 'No flow');
    case 'timing': {
      const sched = Array.isArray(c.schedule) ? (c.schedule as ScheduleEntry[]) : [];
      return `${sched.filter((s) => s.enabled).length}/7 days open`;
    }
  }
}

// ---- Small field components ----------------------------------------------------

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="grid gap-1.5">
    <Label className="text-xs text-white/70 light:text-gray-600">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-white/35 light:text-gray-400">{hint}</p>}
  </div>
);

/** A number config key; clearing it removes the key so the engine falls back to its default. */
const NumberField: React.FC<{
  label: string;
  value: unknown;
  placeholder: string;
  min?: number;
  max?: number;
  onChange: (v: number | undefined) => void;
}> = ({ label, value, placeholder, min, max, onChange }) => (
  <Field label={label}>
    <Input
      type="number"
      className="h-8 text-xs"
      value={num(value)}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        onChange(Number.isFinite(n) ? n : undefined);
      }}
    />
  </Field>
);

/** Header-style key/value pairs. Rows are kept locally so renaming a key doesn't reorder or drop focus. */
const KeyValueEditor: React.FC<{
  value: unknown;
  onChange: (v: Record<string, string>) => void;
}> = ({ value, onChange }) => {
  const [rows, setRows] = useState<[string, string][]>(() =>
    value && typeof value === 'object' ? Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, str(v)]) : []
  );

  const commit = (next: [string, string][]) => {
    setRows(next);
    onChange(Object.fromEntries(next.filter(([k]) => k.trim() !== '')));
  };

  return (
    <div className="space-y-1.5">
      {rows.map(([k, v], idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <Input
            className="h-7 text-[11px] font-mono"
            placeholder="Header"
            value={k}
            onChange={(e) => commit(rows.map((r, i) => (i === idx ? [e.target.value, r[1]] : r)))}
          />
          <Input
            className="h-7 text-[11px] font-mono"
            placeholder="Value"
            value={v}
            onChange={(e) => commit(rows.map((r, i) => (i === idx ? [r[0], e.target.value] : r)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-white/40 hover:text-red-400 light:text-gray-400"
            aria-label="Remove header"
            onClick={() => commit(rows.filter((_, i) => i !== idx))}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setRows([...rows, ['', '']])}>
        <Plus className="h-3 w-3 mr-1" /> Add header
      </Button>
    </div>
  );
};

/** Prompt audio: an uploaded clip or text-to-speech (the backend renders TTS to audio_file on save). */
const AudioField: React.FC<{
  config: IVRNodeConfig;
  onChange: (entries: IVRNodeConfig) => void;
}> = ({ config, onChange }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const audioFile = str(config.audio_file);
  const greetingText = str(config.greeting_text);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large (max 5 MB)');
      return;
    }
    setUploading(true);
    try {
      const res = await callingApi.uploadIVRAudio(file);
      const filename = readData<{ filename?: string }>(res)?.filename;
      if (!filename) throw new Error('missing filename');
      // A clip and TTS text are exclusive: drop the text so the backend doesn't regenerate over the clip.
      onChange({ audio_file: filename, greeting_text: undefined });
      toast.success('Audio uploaded');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field label="Audio prompt">
      <Tabs defaultValue={greetingText ? 'text' : 'audio'}>
        <TabsList className="h-8">
          <TabsTrigger value="audio" className="text-[11px] h-6 px-2">
            <Upload className="h-3 w-3 mr-1" /> Upload
          </TabsTrigger>
          <TabsTrigger value="text" className="text-[11px] h-6 px-2">
            <Type className="h-3 w-3 mr-1" /> Text to speech
          </TabsTrigger>
        </TabsList>
        <TabsContent value="audio" className="space-y-2">
          {audioFile ? (
            <div className="space-y-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] p-2 light:border-gray-200 light:bg-gray-50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-white/60 truncate light:text-gray-600">{audioFile}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-white/40 hover:text-red-400 light:text-gray-400"
                  aria-label="Remove audio"
                  onClick={() => onChange({ audio_file: '' })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <audio src={callingApi.ivrAudioUrl(audioFile)} controls preload="none" className="w-full h-8" />
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Upload audio (max 5 MB)
            </Button>
          )}
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleFile} />
        </TabsContent>
        <TabsContent value="text">
          <Textarea
            rows={3}
            maxLength={500}
            className="text-xs"
            placeholder="Text the caller hears, e.g. 'Thanks for calling. Press 1 for sales…'"
            value={greetingText}
            onChange={(e) =>
              onChange(e.target.value ? { greeting_text: e.target.value, audio_file: undefined } : { greeting_text: '' })
            }
          />
          <p className="text-[11px] text-white/35 mt-1 light:text-gray-400">Converted to audio when you save. Needs text-to-speech configured on the server.</p>
        </TabsContent>
      </Tabs>
    </Field>
  );
};

const CALLBACK_EVENTS: { key: 'on_waiting' | 'on_connect'; label: string }[] = [
  { key: 'on_waiting', label: 'When the caller starts waiting' },
  { key: 'on_connect', label: 'When an agent picks up' },
];

const TransferCallbacks: React.FC<{ config: IVRNodeConfig; onChange: (entries: IVRNodeConfig) => void }> = ({
  config,
  onChange,
}) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Field label="HTTP callbacks" hint="Notify your CRM at each stage. Variables: {{caller_phone}}, {{transfer_id}}, {{team_id}}, {{agent_name}} (on connect).">
      <div className="space-y-1.5">
        {CALLBACK_EVENTS.map(({ key, label }) => {
          const cb = (config[key] && typeof config[key] === 'object' ? config[key] : {}) as Record<string, unknown>;
          const set = (field: string, value: unknown) => onChange({ [key]: { ...cb, [field]: value } });
          const method = str(cb.method) || 'POST';
          return (
            <div key={key} className="rounded-md border border-white/[0.08] light:border-gray-200">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-white/80 hover:bg-white/[0.03] light:text-gray-800 light:hover:bg-gray-100"
                onClick={() => setOpen(open === key ? null : key)}
              >
                <span>{label}</span>
                {str(cb.url) && <span className="text-emerald-400 text-[10px]">Configured</span>}
              </button>
              {open === key && (
                <div className="px-3 pb-3 pt-2 space-y-2 border-t border-white/[0.06] light:border-gray-200">
                  <Input
                    className="h-7 text-[11px] font-mono"
                    placeholder="https://crm.example.com/api/call"
                    value={str(cb.url)}
                    onChange={(e) => set('url', e.target.value)}
                  />
                  <Select value={method} onValueChange={(v) => set('method', v)}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                  <KeyValueEditor value={cb.headers} onChange={(v) => set('headers', v)} />
                  {method === 'POST' && (
                    <Textarea
                      rows={2}
                      className="text-[11px] font-mono"
                      placeholder='{"phone": "{{caller_phone}}", "transfer_id": "{{transfer_id}}"}'
                      value={str(cb.body_template)}
                      onChange={(e) => set('body_template', e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Field>
  );
};

// ---- Node properties panel -----------------------------------------------------

interface NodePanelProps {
  node: IVRNode;
  nodes: IVRNode[];
  edges: IVREdge[];
  isEntry: boolean;
  teams: TeamRef[];
  otherFlows: IVRFlow[];
  onLabel: (label: string) => void;
  onConfig: (entries: IVRNodeConfig) => void;
  onConnect: (condition: string, to: string) => void;
  onMakeEntry: () => void;
  onDelete: () => void;
  onRemoveMenuOption: (digit: string) => void;
}

const NONE = '__none__';

const NodePanel: React.FC<NodePanelProps> = ({
  node,
  nodes,
  edges,
  isEntry,
  teams,
  otherFlows,
  onLabel,
  onConfig,
  onConnect,
  onMakeEntry,
  onDelete,
  onRemoveMenuOption,
}) => {
  const info = typeInfo(node.type);
  const c = node.config;
  const outputs = outputsFor(node);
  // Keep edges on conditions this editor doesn't list (e.g. "abandoned") visible rather than silently dropping them.
  const extraOutputs: OutputHandle[] = edges
    .filter((e) => e.from === node.id && !outputs.some((o) => o.condition === e.condition))
    .map((e) => ({ condition: e.condition, label: e.condition }));
  const targetOf = (condition: string) => edges.find((e) => e.from === node.id && e.condition === condition)?.to || NONE;
  const targets = nodes.filter((n) => n.id !== node.id);
  const options = menuOptionsOf(c);
  const schedule = Array.isArray(c.schedule) ? (c.schedule as ScheduleEntry[]) : defaultSchedule();

  const addMenuOption = () => {
    const digit = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'].find((d) => !(d in options));
    if (!digit) return;
    onConfig({ options: { ...options, [digit]: { label: '' } } });
  };

  return (
    <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`h-8 w-8 rounded-lg ${info.color} flex items-center justify-center shrink-0`}>
            <info.icon className="h-4 w-4 text-white light:text-gray-900" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {info.label} step
              {isEntry && <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px]">FIRST STEP</Badge>}
            </CardTitle>
            <p className="text-[11px] text-white/40 light:text-gray-400">{info.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isEntry && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={onMakeEntry}>
              <Flag className="h-3 w-3 mr-1" /> Make first step
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/50 hover:text-red-400 light:text-gray-500"
            aria-label="Delete step"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Step name">
          <Input className="h-8 text-xs" value={node.label} onChange={(e) => onLabel(e.target.value)} />
        </Field>

        {(node.type === 'greeting' || node.type === 'menu' || node.type === 'gather' || node.type === 'hangup') && (
          <AudioField key={node.id} config={c} onChange={onConfig} />
        )}

        {node.type === 'greeting' && (
          <label className="flex items-center justify-between gap-3 text-xs">
            <span>
              <span className="block text-white/80 light:text-gray-800">Interruptible</span>
              <span className="block text-[11px] text-white/35 light:text-gray-400">A keypress skips the rest of the message.</span>
            </span>
            <Switch checked={!!c.interruptible} onCheckedChange={(v) => onConfig({ interruptible: v })} />
          </label>
        )}

        {node.type === 'menu' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Timeout (seconds)" value={c.timeout_seconds} placeholder="10" min={1} max={60} onChange={(v) => onConfig({ timeout_seconds: v })} />
              <NumberField label="Max retries" value={c.max_retries} placeholder="3" min={1} max={10} onChange={(v) => onConfig({ max_retries: v })} />
            </div>
            <Field label="Keypad options">
              <div className="space-y-1.5">
                {Object.keys(options)
                  .sort((a, b) => a.localeCompare(b))
                  .map((digit) => (
                    <div key={digit} className="flex items-center gap-1.5">
                      <span className="h-7 w-7 rounded-md bg-purple-500/15 text-purple-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {digit}
                      </span>
                      <Input
                        className="h-7 text-xs"
                        placeholder="Option name, e.g. Sales"
                        value={str(options[digit]?.label)}
                        onChange={(e) => onConfig({ options: { ...options, [digit]: { ...options[digit], label: e.target.value } } })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-white/40 hover:text-red-400 light:text-gray-400"
                        aria-label={`Remove option ${digit}`}
                        onClick={() => onRemoveMenuOption(digit)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={addMenuOption} disabled={Object.keys(options).length >= 12}>
                  <Plus className="h-3 w-3 mr-1" /> Add option
                </Button>
              </div>
            </Field>
          </>
        )}

        {node.type === 'gather' && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Max digits" value={c.max_digits} placeholder="10" min={1} max={20} onChange={(v) => onConfig({ max_digits: v })} />
            <Field label="Finish key">
              <Input className="h-8 text-xs" maxLength={1} value={str(c.terminator)} placeholder="#" onChange={(e) => onConfig({ terminator: e.target.value })} />
            </Field>
            <NumberField label="Timeout (seconds)" value={c.timeout_seconds} placeholder="10" min={1} max={60} onChange={(v) => onConfig({ timeout_seconds: v })} />
            <NumberField label="Max retries" value={c.max_retries} placeholder="3" min={1} max={10} onChange={(v) => onConfig({ max_retries: v })} />
            <div className="col-span-2">
              <Field label="Save digits as variable" hint="Use it later as {{variable}} in HTTP steps.">
                <Input className="h-8 text-xs font-mono" placeholder="account_number" value={str(c.store_as)} onChange={(e) => onConfig({ store_as: e.target.value })} />
              </Field>
            </div>
          </div>
        )}

        {node.type === 'http_callback' && (
          <>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <Field label="Method">
                <Select value={str(c.method) || 'GET'} onValueChange={(v) => onConfig({ method: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="URL">
                <Input className="h-8 text-xs font-mono" placeholder="https://api.example.com/ivr" value={str(c.url)} onChange={(e) => onConfig({ url: e.target.value })} />
              </Field>
            </div>
            <Field label="Headers">
              <KeyValueEditor key={node.id} value={c.headers} onChange={(v) => onConfig({ headers: v })} />
            </Field>
            <Field label="Body template">
              <Textarea
                rows={3}
                className="text-[11px] font-mono"
                placeholder='{"phone": "{{caller_phone}}"}'
                value={str(c.body_template)}
                onChange={(e) => onConfig({ body_template: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Timeout (seconds)" value={c.timeout_seconds} placeholder="10" min={1} max={30} onChange={(v) => onConfig({ timeout_seconds: v })} />
              <Field label="Save response as">
                <Input className="h-8 text-xs font-mono" placeholder="api_response" value={str(c.response_store_as)} onChange={(e) => onConfig({ response_store_as: e.target.value })} />
              </Field>
            </div>
          </>
        )}

        {node.type === 'transfer' && (
          <>
            <Field label="Team" hint={teams.length === 0 ? 'No teams yet — create one under Settings › Teams.' : undefined}>
              <Select value={str(c.team_id) || NONE} onValueChange={(v) => onConfig({ team_id: v === NONE ? '' : v })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Select team…</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <TransferCallbacks key={node.id} config={c} onChange={onConfig} />
          </>
        )}

        {node.type === 'goto_flow' && (
          <Field label="Continue in flow" hint="The target flow must be enabled for the jump to work.">
            <Select value={str(c.flow_id) || NONE} onValueChange={(v) => onConfig({ flow_id: v === NONE ? '' : v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select flow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select flow…</SelectItem>
                {otherFlows.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                    {!f.is_active ? ' (disabled)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {node.type === 'timing' && (
          <Field label="Business hours" hint="Uses the server's local time.">
            <div className="space-y-1.5">
              {schedule.map((entry, idx) => {
                const setEntry = (patch: Partial<ScheduleEntry>) =>
                  onConfig({ schedule: schedule.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
                return (
                  <div key={entry.day} className="flex items-center gap-2 text-xs">
                    <span className="w-10 capitalize text-white/70 light:text-gray-600">{entry.day.slice(0, 3)}</span>
                    <Switch checked={entry.enabled} onCheckedChange={(v) => setEntry({ enabled: v })} aria-label={`Open on ${entry.day}`} />
                    {entry.enabled ? (
                      <>
                        <Input type="time" className="h-7 w-28 text-xs [color-scheme:dark] light:[color-scheme:light]" value={entry.start_time} onChange={(e) => setEntry({ start_time: e.target.value })} />
                        <span className="text-white/40 light:text-gray-400">–</span>
                        <Input type="time" className="h-7 w-28 text-xs [color-scheme:dark] light:[color-scheme:light]" value={entry.end_time} onChange={(e) => setEntry({ end_time: e.target.value })} />
                      </>
                    ) : (
                      <span className="text-white/35 light:text-gray-400">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
        )}

        <div className="border-t border-white/[0.06] pt-4 light:border-gray-200">
          <p className="text-xs font-medium text-white/80 mb-1 light:text-gray-800">Then go to</p>
          {isTerminal(node.type) ? (
            <p className="text-[11px] text-white/40 light:text-gray-400">
              {node.type === 'hangup' ? 'The call ends here.' : 'The call continues in the chosen flow.'}
            </p>
          ) : (
            <>
              {node.type === 'transfer' && (
                <p className="text-[11px] text-white/40 mb-2 light:text-gray-400">Leave both empty to end the IVR once the call is handed to the team.</p>
              )}
              {node.type === 'menu' && Object.keys(options).length === 0 && (
                <p className="text-[11px] text-white/40 mb-2 light:text-gray-400">Add keypad options above to route each key.</p>
              )}
              <div className="space-y-1.5">
                {[...outputs, ...extraOutputs].map((out) => (
                  <div key={out.condition} className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1.3fr)] items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-white/80 truncate light:text-gray-800">{out.label}</p>
                      {out.hint && <p className="text-[10px] text-white/35 truncate light:text-gray-400">{out.hint}</p>}
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-white/30 light:text-gray-400" />
                    <Select value={targetOf(out.condition)} onValueChange={(v) => onConnect(out.condition, v === NONE ? '' : v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Nothing (end)</SelectItem>
                        {targets.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label || typeInfo(t.type).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ---- Editor --------------------------------------------------------------------

interface FlowMeta {
  name: string;
  description: string;
  whatsapp_account: string;
  is_active: boolean;
  is_call_start: boolean;
  is_outgoing_end: boolean;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

const metaFrom = (flow: IVRFlow): FlowMeta => ({
  name: flow.name,
  description: flow.description || '',
  whatsapp_account: flow.whatsapp_account,
  is_active: flow.is_active,
  is_call_start: flow.is_call_start,
  is_outgoing_end: flow.is_outgoing_end,
  created_by: flow.created_by?.full_name,
  updated_by: flow.updated_by?.full_name,
  created_at: flow.created_at,
  updated_at: flow.updated_at,
});

const graphFrom = (menu: IVRFlow['menu']): { nodes: IVRNode[]; edges: IVREdge[]; entry: string } => {
  if (!menu || menu.version !== 2) return { nodes: [], edges: [], entry: '' };
  const nodes = (menu.nodes || []).map((n) => ({
    ...n,
    label: n.label || '',
    position: n.position || { x: 0, y: 0 },
    config: n.config || {},
  }));
  const edges = menu.edges || [];
  const entry = nodes.some((n) => n.id === menu.entry_node) ? menu.entry_node || '' : nodes[0]?.id || '';
  return { nodes, edges, entry };
};

let idCounter = 0;
const newNodeId = () => `node_${Date.now()}_${idCounter++}`;

export const IVRFlowEditor: React.FC<{ flowId: string }> = ({ flowId }) => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<FlowMeta | null>(null);
  const [nodes, setNodes] = useState<IVRNode[]>([]);
  const [edges, setEdges] = useState<IVREdge[]>([]);
  const [entry, setEntry] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<IVRNode | null>(null);

  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [otherFlows, setOtherFlows] = useState<IVRFlow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await callingApi.getIVRFlow(flowId);
      const flow = readData<IVRFlow>(res);
      if (!flow?.id) throw new Error('IVR flow not found');
      const graph = graphFrom(flow.menu);
      setMeta(metaFrom(flow));
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setEntry(graph.entry);
      setSelectedId(graph.entry || null);
      setDirty(false);
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'This IVR flow could not be loaded. It may have been deleted.'));
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => {
    load();
    callingApi
      .listTeams()
      .then((res) => setTeams(readList<TeamRef>(res, 'teams')))
      .catch(() => undefined);
    callingApi
      .listIVRFlows({ limit: 100 })
      .then((res) => setOtherFlows(readList<IVRFlow>(res, 'ivr_flows').filter((f) => f.id !== flowId)))
      .catch(() => undefined);
  }, [load, flowId]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId]);

  const incomingCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of edges) counts[e.to] = (counts[e.to] || 0) + 1;
    return counts;
  }, [edges]);

  const updateMeta = (patch: Partial<FlowMeta>) => {
    setMeta((m) => (m ? { ...m, ...patch } : m));
    setDirty(true);
  };

  const updateNode = (id: string, fn: (n: IVRNode) => IVRNode) => {
    setNodes((list) => list.map((n) => (n.id === id ? fn(n) : n)));
    setDirty(true);
  };

  const addNode = (type: IVRNodeType) => {
    const id = newNodeId();
    // Stack new steps below the lowest one so a canvas editor shows them in order.
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position?.y ?? 0), -150);
    const node: IVRNode = {
      id,
      type,
      label: NODE_TYPES[type].label,
      position: { x: 250, y: maxY + 150 },
      config: defaultConfig(type),
    };
    setNodes((list) => [...list, node]);
    if (!entry) setEntry(id);
    setSelectedId(id);
    setDirty(true);
  };

  const connect = (from: string, condition: string, to: string) => {
    setEdges((list) => {
      const rest = list.filter((e) => !(e.from === from && e.condition === condition));
      return to ? [...rest, { from, to, condition }] : rest;
    });
    setDirty(true);
  };

  const removeMenuOption = (node: IVRNode, digit: string) => {
    const options = { ...menuOptionsOf(node.config) };
    delete options[digit];
    updateNode(node.id, (n) => ({ ...n, config: { ...n.config, options } }));
    setEdges((list) => list.filter((e) => !(e.from === node.id && e.condition === `digit:${digit}`)));
  };

  const deleteNode = () => {
    if (!nodeToDelete) return;
    const id = nodeToDelete.id;
    const remaining = nodes.filter((n) => n.id !== id);
    setNodes(remaining);
    setEdges((list) => list.filter((e) => e.from !== id && e.to !== id));
    if (entry === id) setEntry(remaining[0]?.id || '');
    if (selectedId === id) setSelectedId(remaining[0]?.id || null);
    setNodeToDelete(null);
    setDirty(true);
  };

  const goBack = () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate('/calling/ivr-flows');
  };

  const save = async () => {
    if (!meta) return;
    if (!meta.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (nodes.length === 0) {
      toast.error('Add at least one step before saving');
      return;
    }
    const known = new Set(nodes.map((n) => n.id));
    const menu: IVRFlowData = {
      version: 2,
      nodes,
      edges: edges.filter((e) => known.has(e.from) && known.has(e.to)),
      entry_node: known.has(entry) ? entry : nodes[0].id,
    };
    setSaving(true);
    try {
      const res = await callingApi.updateIVRFlow(flowId, {
        name: meta.name.trim(),
        description: meta.description,
        is_active: meta.is_active,
        is_call_start: meta.is_call_start,
        is_outgoing_end: meta.is_outgoing_end,
        menu,
      });
      const updated = readData<IVRFlow>(res);
      if (updated?.id) {
        // Pick up server-side changes such as TTS audio_file names.
        const graph = graphFrom(updated.menu);
        setMeta(metaFrom(updated));
        if (graph.nodes.length) {
          setNodes(graph.nodes);
          setEdges(graph.edges);
          setEntry(graph.entry);
        }
      }
      setDirty(false);
      toast.success('IVR flow saved');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save IVR flow'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || loadError || !meta) {
    return (
      <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
        <PageHeader
          title="IVR Flow"
          icon={Workflow}
          iconGradient="bg-gradient-to-br from-indigo-500 to-blue-600 shadow-indigo-500/20"
          backLink="/calling/ivr-flows"
        />
        <div className="flex-1 flex items-center justify-center p-6">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/50 light:text-gray-500" />
          ) : (
            <ErrorState title="Couldn't load this IVR flow" description={loadError || undefined} onRetry={load} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <header className="border-b border-white/[0.08] light:border-gray-200 bg-[#0a0a0b]/95 light:bg-white/95 backdrop-blur shrink-0">
        <div className="flex h-16 items-center justify-between gap-4 px-6">
          <div className="flex items-center min-w-0">
            <Button variant="ghost" size="icon" className="mr-3 text-white/70 hover:text-white light:text-gray-600 light:hover:text-gray-900" aria-label="Back to IVR flows" onClick={goBack}>
              <ArrowRight className="h-5 w-5 rotate-180" />
            </Button>
            <div className="h-8 w-8 rounded-lg flex items-center justify-center mr-3 shadow-lg shrink-0 bg-gradient-to-br from-indigo-500 to-blue-600 shadow-indigo-500/20">
              <Workflow className="h-4 w-4 text-white light:text-gray-900" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-white light:text-gray-900 leading-tight truncate">{meta.name || 'Untitled flow'}</h1>
              <p className="text-xs text-white/50 truncate light:text-gray-500">
                {meta.whatsapp_account} · {nodes.length} step{nodes.length === 1 ? '' : 's'}
                {dirty ? ' · Unsaved changes' : meta.updated_at ? ` · Saved ${formatDateTime(meta.updated_at)}` : ''}
              </p>
            </div>
          </div>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardContent className="pt-6 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <Field label="Name">
              <Input className="h-9 text-xs" value={meta.name} onChange={(e) => updateMeta({ name: e.target.value })} />
            </Field>
            <Field label="Description">
              <Input className="h-9 text-xs" value={meta.description} placeholder="Optional" onChange={(e) => updateMeta({ description: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-end gap-5 pb-1.5">
              <label className="flex items-center gap-2 text-xs text-white/80 light:text-gray-800">
                <Switch checked={meta.is_active} onCheckedChange={(v) => updateMeta({ is_active: v })} /> Enabled
              </label>
              <label className="flex items-center gap-2 text-xs text-white/80 light:text-gray-800" title="Answer this account's incoming calls with this flow">
                <Switch checked={meta.is_call_start} disabled={!meta.is_active} onCheckedChange={(v) => updateMeta({ is_call_start: v })} />
                Incoming call start
              </label>
              <label className="flex items-center gap-2 text-xs text-white/80 light:text-gray-800" title="Run this flow after an agent ends an outgoing call">
                <Switch checked={meta.is_outgoing_end} disabled={!meta.is_active} onCheckedChange={(v) => updateMeta({ is_outgoing_end: v })} />
                Outgoing post-call
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2.5 text-xs text-blue-200/80">
          <Info className="h-4 w-4 shrink-0 text-blue-400 mt-px" />
          <span>
            This is a step-by-step editor: pick a step on the left, set it up on the right, and choose where each outcome goes next.
            A drag-and-drop canvas isn't available in this app yet; step positions are kept, so flows lay out the same in a canvas editor.
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] items-start">
          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {nodes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.12] p-6 text-center light:border-gray-200">
                  <Phone className="h-6 w-6 text-white/30 mx-auto mb-2 light:text-gray-400" />
                  <p className="text-xs text-white/70 light:text-gray-600">No steps yet</p>
                  <p className="text-[11px] text-white/40 mt-1 light:text-gray-400">Start with a Greeting or Menu below. The first step runs when the call is answered.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {nodes.map((node) => {
                    const info = typeInfo(node.type);
                    const unreachable = node.id !== entry && !incomingCount[node.id];
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedId(node.id)}
                        className={`w-full text-left flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
                          selectedId === node.id
                            ? 'border-emerald-500/50 bg-emerald-500/[0.06]'
                            : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] light:border-gray-200 light:bg-gray-50 light:hover:bg-gray-100'
                        }`}
                      >
                        <span className={`h-7 w-7 rounded-md ${info.color} flex items-center justify-center shrink-0`}>
                          <info.icon className="h-3.5 w-3.5 text-white light:text-gray-900" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-white truncate light:text-gray-900">{node.label || info.label}</span>
                            {node.id === entry && <Flag className="h-3 w-3 text-emerald-400 shrink-0" aria-label="First step" />}
                          </span>
                          <span className="block text-[11px] text-white/40 truncate light:text-gray-400">{nodeSummary(node, teams, otherFlows)}</span>
                          {unreachable && <span className="block text-[10px] text-amber-400/80">Not connected — nothing leads here</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/40 mb-2 light:text-gray-400">Add a step</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {NODE_ORDER.map((type) => {
                    const info = NODE_TYPES[type];
                    return (
                      <Button
                        key={type}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 justify-start text-[11px] border-white/[0.08] light:border-gray-200"
                        title={info.description}
                        onClick={() => addNode(type)}
                      >
                        <span className={`h-2 w-2 rounded-full ${info.color} mr-1.5`} />
                        <info.icon className="h-3 w-3 mr-1" />
                        {info.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {(meta.created_by || meta.created_at) && (
                <div className="border-t border-white/[0.06] pt-3 space-y-0.5 text-[11px] text-white/35 light:border-gray-200 light:text-gray-400">
                  {meta.created_at && (
                    <p>
                      Created {formatDateTime(meta.created_at)}
                      {meta.created_by ? ` by ${meta.created_by}` : ''}
                    </p>
                  )}
                  {meta.updated_at && (
                    <p>
                      Updated {formatDateTime(meta.updated_at)}
                      {meta.updated_by ? ` by ${meta.updated_by}` : ''}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {selected ? (
            <NodePanel
              key={selected.id}
              node={selected}
              nodes={nodes}
              edges={edges}
              isEntry={selected.id === entry}
              teams={teams}
              otherFlows={otherFlows}
              onLabel={(label) => updateNode(selected.id, (n) => ({ ...n, label }))}
              onConfig={(entries) => updateNode(selected.id, (n) => ({ ...n, config: { ...n.config, ...entries } }))}
              onConnect={(condition, to) => connect(selected.id, condition, to)}
              onMakeEntry={() => {
                setEntry(selected.id);
                setDirty(true);
              }}
              onDelete={() => setNodeToDelete(selected)}
              onRemoveMenuOption={(digit) => removeMenuOption(selected, digit)}
            />
          ) : (
            <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardContent className="py-16 text-center">
                <p className="text-sm text-white/70 light:text-gray-600">{nodes.length ? 'Select a step to edit it' : 'Add your first step'}</p>
                <p className="text-xs text-white/40 mt-1 light:text-gray-400">Its settings and where it leads will show here.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        open={!!nodeToDelete}
        onOpenChange={(open) => !open && setNodeToDelete(null)}
        title="Delete step"
        itemName={nodeToDelete?.label || (nodeToDelete ? typeInfo(nodeToDelete.type).label : undefined)}
        description={
          nodeToDelete
            ? `Delete "${nodeToDelete.label || typeInfo(nodeToDelete.type).label}" and its connections? This takes effect when you save.`
            : undefined
        }
        onConfirm={deleteNode}
      />
    </div>
  );
};

export default IVRFlowEditor;
