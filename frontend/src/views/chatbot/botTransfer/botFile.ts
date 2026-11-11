// The OneSuit bot file format: one JSON file holding any number of bots of
// any type (flow bots — simple / media / advanced — and keyword bots).
// The backend (backend/internal/handlers/bot_transfer.go) exports and
// imports it; this module holds the shared types, a sample file and the
// "create a bot with AI" prompt.

export const BOT_FILE_FORMAT = 1;

export type FlowType = 'simple' | 'media' | 'advanced';

export interface BotFileFlow {
  name: string;
  description?: string;
  flow_type: FlowType;
  trigger_keywords?: string[];
  enabled?: boolean;
  graph: {
    version: 2;
    entry_node: string;
    nodes: Array<{
      id: string;
      type: string;
      label?: string;
      position?: { x: number; y: number };
      config: Record<string, unknown>;
    }>;
    edges: Array<{ from: string; to: string; condition: string }>;
  } | null;
}

export interface BotFileKeyword {
  name?: string;
  keywords: string[];
  match_type?: 'contains' | 'exact' | 'starts_with' | 'regex';
  case_sensitive?: boolean;
  priority?: number;
  enabled?: boolean;
  response_type: 'text' | 'transfer' | 'flow';
  response_content?: { body?: string; [key: string]: unknown };
  active_from?: string;
  active_until?: string;
  /** Name of the flow a `flow` keyword bot starts. */
  flow_ref?: string;
}

export interface BotFile {
  onesuit_bot_format: number;
  exported_at?: string;
  flows?: BotFileFlow[];
  keyword_bots?: BotFileKeyword[];
}

/** One line of the import report (see BotImportItem in bot_transfer.go). */
export interface BotImportItem {
  index: number;
  name: string;
  final_name: string;
  action: 'create' | 'rename' | 'error';
  kind: string;
  steps?: number;
  keywords?: string[];
  flow_ref?: string;
  flow_resolved?: 'file' | 'existing';
  id?: string;
  errors: string[];
  warnings: string[];
}

export interface BotImportReport {
  preview: boolean;
  imported: boolean;
  valid: boolean;
  legacy_file?: boolean;
  errors: string[];
  warnings: string[];
  flows: BotImportItem[];
  keyword_bots: BotImportItem[];
  created: { flows: number; keyword_bots: number };
}

/** `onesuit-bots-YYYY-MM-DD.json` for the given day (local date). */
export function botFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `onesuit-bots-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Saves `data` as a pretty-printed JSON download. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Parses pasted / uploaded text. AI tools often wrap JSON in ``` fences; those are removed. */
export function parseBotFileText(text: string): { value: unknown } | { error: string } {
  let src = text.trim();
  const fenced = src.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
  if (fenced) src = fenced[1].trim();
  if (!src) return { error: 'The file is empty.' };
  try {
    const value: unknown = JSON.parse(src);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { error: 'A bot file must be a JSON object, starting with {' };
    }
    return { value };
  } catch (err) {
    return { error: `This isn't valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Counts the problems in a report. */
export function reportProblemCount(r: BotImportReport): number {
  return (
    r.errors.length +
    r.flows.reduce((n, f) => n + f.errors.length, 0) +
    r.keyword_bots.reduce((n, k) => n + k.errors.length, 0)
  );
}

// ─── Sample file ─────────────────────────────────────────────────────────────

const start = { id: '__start__', type: 'start', label: 'Inbound Message', position: { x: 250, y: 50 }, config: {} };

export const SAMPLE_BOT_FILE: BotFile = {
  onesuit_bot_format: BOT_FILE_FORMAT,
  exported_at: '2026-01-01T00:00:00Z',
  flows: [
    {
      name: 'Shop FAQ',
      description: 'Simple bot: a question with reply buttons',
      flow_type: 'simple',
      trigger_keywords: ['faq', 'help'],
      enabled: true,
      graph: {
        version: 2,
        entry_node: '__start__',
        nodes: [
          start,
          {
            id: 'ask', type: 'reply', label: 'Welcome', position: { x: 250, y: 200 },
            config: {
              body: 'Hi! What would you like to know?',
              interactive: 'buttons',
              buttons: [
                { id: 'prices', title: 'Prices' },
                { id: 'hours', title: 'Opening hours' },
              ],
            },
          },
          { id: 'prices_reply', type: 'reply', label: 'Prices', position: { x: 100, y: 380 }, config: { body: 'Our plans start at Rs 499 a month.' } },
          { id: 'hours_reply', type: 'reply', label: 'Hours', position: { x: 400, y: 380 }, config: { body: 'We are open 9am to 6pm, Monday to Saturday.' } },
        ],
        edges: [
          { from: '__start__', to: 'ask', condition: 'default' },
          { from: 'ask', to: 'prices_reply', condition: 'button:prices' },
          { from: 'ask', to: 'hours_reply', condition: 'button:hours' },
        ],
      },
    },
    {
      name: 'Menu card',
      description: 'Media bot: a reply with a picture and a list',
      flow_type: 'media',
      trigger_keywords: ['menu'],
      enabled: true,
      graph: {
        version: 2,
        entry_node: '__start__',
        nodes: [
          start,
          {
            id: 'menu', type: 'reply', label: 'Menu photo', position: { x: 250, y: 200 },
            config: {
              body: 'Here is today\'s menu. Pick a category:',
              header: { type: 'image', media_path: 'chatbot/REPLACE/menu.jpg', filename: 'menu.jpg' },
              interactive: 'none',
            },
          },
          {
            id: 'pick', type: 'reply', label: 'Categories', position: { x: 250, y: 380 },
            config: {
              body: 'What are you hungry for?',
              interactive: 'list',
              list: {
                button_text: 'See options',
                sections: [{ title: 'Food', rows: [
                  { id: 'veg', title: 'Veg', description: 'Fresh and green' },
                  { id: 'nonveg', title: 'Non-veg' },
                ] }],
              },
            },
          },
          { id: 'veg_reply', type: 'reply', label: 'Veg', position: { x: 100, y: 560 }, config: { body: 'Try our paneer tikka!' } },
          { id: 'nonveg_reply', type: 'reply', label: 'Non-veg', position: { x: 400, y: 560 }, config: { body: 'Try our butter chicken!' } },
        ],
        edges: [
          { from: '__start__', to: 'menu', condition: 'default' },
          { from: 'menu', to: 'pick', condition: 'default' },
          { from: 'pick', to: 'veg_reply', condition: 'button:veg' },
          { from: 'pick', to: 'nonveg_reply', condition: 'button:nonveg' },
        ],
      },
    },
    {
      name: 'Book a demo',
      description: 'Advanced bot: a link button and a hand-over to an agent',
      flow_type: 'advanced',
      trigger_keywords: ['demo'],
      enabled: true,
      graph: {
        version: 2,
        entry_node: '__start__',
        nodes: [
          start,
          {
            id: 'link', type: 'reply', label: 'Booking link', position: { x: 250, y: 200 },
            config: {
              body: 'Pick a time that suits you.',
              interactive: 'cta_url',
              cta: { display_text: 'Book now', url: 'https://example.com/book' },
            },
          },
          {
            id: 'agent', type: 'transfer', label: 'Talk to sales', position: { x: 250, y: 380 },
            config: { body: 'A teammate will join this chat shortly.', notes: 'Demo request' },
          },
        ],
        edges: [
          { from: '__start__', to: 'link', condition: 'default' },
          { from: 'link', to: 'agent', condition: 'default' },
        ],
      },
    },
  ],
  keyword_bots: [
    {
      name: 'Price reply',
      keywords: ['price', 'cost'],
      match_type: 'contains',
      priority: 10,
      enabled: true,
      response_type: 'text',
      response_content: { body: 'Our plans start at Rs 499 a month. Reply FAQ for more.' },
    },
    {
      name: 'Open the FAQ bot',
      keywords: ['start'],
      match_type: 'exact',
      priority: 20,
      enabled: true,
      response_type: 'flow',
      flow_ref: 'Shop FAQ',
    },
    {
      name: 'Human please',
      keywords: ['agent', 'human'],
      match_type: 'contains',
      priority: 30,
      enabled: true,
      response_type: 'transfer',
      response_content: { body: 'Connecting you to our team...' },
    },
  ],
};

// ─── "Create a bot with AI" prompt ───────────────────────────────────────────

export const AI_PROMPT_TEMPLATE = `You are building WhatsApp chatbots for OneSuit. Reply with ONE JSON object only (no explanation, no markdown) in the "OneSuit bot file" format below.

MY BOT: <describe what the bot should do, e.g. "a pizza shop bot that shows the menu, takes the size and hands over to an agent">

FORMAT
{
  "onesuit_bot_format": 1,
  "flows": [ FLOW, ... ],            // step-by-step bots (optional)
  "keyword_bots": [ KEYWORD_BOT, ... ] // one-shot keyword replies (optional)
}

FLOW = {
  "name": "unique name", "description": "...",
  "flow_type": "simple" | "media" | "advanced",
  "trigger_keywords": ["words that start it"], "enabled": true,
  "graph": { "version": 2, "entry_node": "__start__", "nodes": [NODE...], "edges": [EDGE...] }
}
- flow_type "simple": only reply steps with text, reply buttons or a list. NO links anywhere.
- flow_type "media": simple + an image/video/audio/document header. NO links.
- flow_type "advanced": everything, incl. link buttons (cta_url) and "transfer" steps (hand over to a human agent).
NODE = { "id": "unique_id", "type": "start" | "reply" | "transfer", "label": "short name", "position": {"x":250,"y":200}, "config": {...} }
- Always include exactly one start node: {"id":"__start__","type":"start","label":"Inbound Message","config":{}}
- reply config: { "body": "text (max 1024 chars with buttons/list)",
    "interactive": "none" | "buttons" | "list" | "cta_url",
    "buttons": [{"id":"b1","title":"max 20 chars"}]  (1-3 buttons, for "buttons"),
    "list": {"button_text":"See options","sections":[{"title":"...","rows":[{"id":"r1","title":"max 24 chars","description":"optional"}]}]} (max 10 rows, for "list"),
    "cta": {"display_text":"Open","url":"https://..."} (advanced only, for "cta_url"),
    "header": {"type":"image","media_path":"chatbot/REPLACE/file.jpg"} (media/advanced only; the user re-uploads the file after import),
    "footer": "optional" }
- transfer config (advanced only): { "body": "message before handing over", "notes": "note for the agent" }
EDGE = { "from": "node id", "to": "node id", "condition": "default" | "button:<button or row id>" }
- Connect "__start__" to the first reply with "default". After a reply with buttons/list, add one edge per option with "button:<id>". Otherwise use "default".

KEYWORD_BOT = { "name": "...", "keywords": ["price","cost"],
  "match_type": "contains" | "exact" | "starts_with" | "regex", "priority": 10, "enabled": true,
  "response_type": "text" | "transfer" | "flow",
  "response_content": {"body": "reply text"},   // for text and transfer
  "flow_ref": "name of a flow in this file" }    // for flow: starts that flow

EXAMPLE
${JSON.stringify(
  {
    onesuit_bot_format: 1,
    flows: [
      {
        name: 'Shop FAQ', flow_type: 'simple', trigger_keywords: ['faq'], enabled: true,
        graph: {
          version: 2, entry_node: '__start__',
          nodes: [
            { id: '__start__', type: 'start', label: 'Inbound Message', config: {} },
            { id: 'ask', type: 'reply', label: 'Welcome', config: { body: 'What would you like to know?', interactive: 'buttons', buttons: [{ id: 'prices', title: 'Prices' }, { id: 'hours', title: 'Hours' }] } },
            { id: 'p', type: 'reply', label: 'Prices', config: { body: 'Plans start at Rs 499.' } },
            { id: 'h', type: 'reply', label: 'Hours', config: { body: 'Open 9am to 6pm.' } },
          ],
          edges: [
            { from: '__start__', to: 'ask', condition: 'default' },
            { from: 'ask', to: 'p', condition: 'button:prices' },
            { from: 'ask', to: 'h', condition: 'button:hours' },
          ],
        },
      },
    ],
    keyword_bots: [
      { name: 'Price reply', keywords: ['price'], match_type: 'contains', response_type: 'text', response_content: { body: 'Plans start at Rs 499.' } },
      { name: 'Start FAQ', keywords: ['start'], match_type: 'exact', response_type: 'flow', flow_ref: 'Shop FAQ' },
    ],
  },
  null,
  1,
)}`;
