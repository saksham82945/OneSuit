// Bot flow types and the "bot reply" step they are built from. The backend
// (internal/handlers/chatbot_bot_reply.go) enforces the same rules on save.

export type ChatFlowType = 'simple' | 'media' | 'advanced';

export const CHAT_FLOW_TYPES: readonly ChatFlowType[] = ['simple', 'media', 'advanced'];

export const asChatFlowType = (v: unknown): ChatFlowType =>
  v === 'simple' || v === 'media' ? v : 'advanced';

export interface ChatFlowTypeInfo {
  title: string;
  tagline: string;
  allows: string[];
  blocks: string[];
}

export const CHAT_FLOW_TYPE_INFO: Record<ChatFlowType, ChatFlowTypeInfo> = {
  simple: {
    title: 'Simple Bot',
    tagline: 'Question → answer replies with buttons or a menu list.',
    allows: ['Text replies with variables', 'Reply buttons (up to 3)', 'List menus (up to 10 rows)'],
    blocks: ['Media', 'Links & CTA URL buttons', 'API / agent steps'],
  },
  media: {
    title: 'Media Bot',
    tagline: 'Everything in Simple plus images, video, audio and files.',
    allows: ['Everything in Simple', 'Image, video, audio & document', 'Media header on buttons'],
    blocks: ['Links in any text', 'CTA URL buttons', 'API / agent steps'],
  },
  advanced: {
    title: 'Advanced Bot',
    tagline: 'No limits: links, media, CTA buttons, APIs and agent handover.',
    allows: ['Everything in Media', 'Links & CTA URL buttons', 'Webhook / API calls', 'Transfer to agent'],
    blocks: [],
  },
};

// ─── Bot reply ────────────────────────────────────────────────────────────────

export type ReplyHeaderType = 'none' | 'text' | 'image' | 'video' | 'audio' | 'document';
export type ReplyInteractive = 'none' | 'buttons' | 'list' | 'cta_url';

export interface ReplyHeader {
  type: ReplyHeaderType;
  text?: string;
  /** Storage reference returned by POST /chatbot/flows/media (chatbot/<org>/<file>). */
  media_path?: string;
  filename?: string;
  mime_type?: string;
}

export interface ReplyButton {
  id: string;
  title: string;
}

export interface ReplyListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ReplyListSection {
  title?: string;
  rows: ReplyListRow[];
}

export interface BotReply {
  body: string;
  footer?: string;
  header: ReplyHeader;
  interactive: ReplyInteractive;
  buttons: ReplyButton[];
  list: { button_text: string; sections: ReplyListSection[] };
  cta: { display_text: string; url: string };
  /** Optional second link button (Advanced bots), sent as its own message. */
  cta2?: { display_text: string; url: string };
}

/** What the "Add New Bot Reply" menu creates. */
export type ReplyKind = 'text' | 'media' | 'buttons' | 'list' | 'cta_url';

export const LIMITS = {
  body: 1024,
  text: 4096,
  footer: 60,
  header: 60,
  buttons: 3,
  buttonTitle: 20,
  rows: 10,
  rowTitle: 24,
  rowDescription: 72,
  sectionTitle: 24,
  listButton: 20,
  ctaText: 20,
} as const;

export const CONTACT_VARIABLES = [
  'first_name',
  'last_name',
  'full_name',
  'phone_number',
  'email',
  'country',
  'language_code',
] as const;

export const MEDIA_HEADER_TYPES: readonly ReplyHeaderType[] = ['image', 'video', 'audio', 'document'];
export const isMediaHeader = (t: ReplyHeaderType) => MEDIA_HEADER_TYPES.includes(t);

export const MEDIA_ACCEPT: Record<string, string> = {
  image: 'image/jpeg,image/png',
  video: 'video/mp4,video/3gpp',
  audio: 'audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,.mp3,.m4a,.aac,.amr,.ogg',
  document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
};

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newOptionId = (prefix = 'opt') => uid(prefix);

export function emptyReply(): BotReply {
  return {
    body: '',
    footer: '',
    header: { type: 'none' },
    interactive: 'none',
    buttons: [],
    list: { button_text: 'Menu', sections: [{ title: '', rows: [] }] },
    cta: { display_text: '', url: '' },
  };
}

export function newReply(kind: ReplyKind): BotReply {
  const r = emptyReply();
  switch (kind) {
    case 'text':
      r.body = 'Hi {first_name}! How can we help you today?';
      break;
    case 'media':
      r.header = { type: 'image' };
      r.body = 'Here you go!';
      break;
    case 'buttons':
      r.interactive = 'buttons';
      r.body = 'Please choose an option:';
      r.buttons = [
        { id: newOptionId('btn'), title: 'Option 1' },
        { id: newOptionId('btn'), title: 'Option 2' },
      ];
      break;
    case 'list':
      r.interactive = 'list';
      r.body = 'Please select from the menu below:';
      r.list = {
        button_text: 'View options',
        sections: [{ title: '', rows: [{ id: newOptionId('row'), title: 'Option 1', description: '' }] }],
      };
      break;
    case 'cta_url':
      r.interactive = 'cta_url';
      r.body = 'Tap below to visit our website.';
      r.cta = { display_text: 'Visit website', url: 'https://' };
      break;
  }
  return r;
}

export const REPLY_KIND_LABEL: Record<ReplyKind, string> = {
  text: 'Text reply',
  media: 'Media reply',
  buttons: 'Reply buttons',
  list: 'List message',
  cta_url: 'CTA URL button',
};

/** Reply kinds a flow type may add. */
export function replyKindsFor(flowType: ChatFlowType): ReplyKind[] {
  if (flowType === 'simple') return ['text', 'buttons', 'list'];
  if (flowType === 'media') return ['text', 'media', 'buttons', 'list'];
  return ['text', 'media', 'buttons', 'list', 'cta_url'];
}

export const canUseMedia = (t: ChatFlowType) => t !== 'simple';
export const canUseLinks = (t: ChatFlowType) => t === 'advanced';

/** The selectable options of a reply, in handle order (`opt-<index>`). */
export function replyOptions(r: BotReply): ReplyButton[] {
  if (r.interactive === 'buttons') return r.buttons;
  if (r.interactive === 'list') return r.list.sections.flatMap((s) => s.rows.map((row) => ({ id: row.id, title: row.title })));
  return [];
}

export const replyWaits = (r: BotReply) => r.interactive === 'buttons' || r.interactive === 'list';

// ─── Links ────────────────────────────────────────────────────────────────────

const LINK_PATTERN =
  /(https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:com|net|org|in|io|co|info|biz|me|app|dev|xyz|online|site|store|shop|ly|gl|link|ai|us|uk|tech|club|live|pro|page|to|cc|tv|ws|gov|edu|ru|de|fr|au|ca|eu|ae|sg|pk|bd|lk|np)\b(?:\/\S*)?)/i;

/** The first link-looking token in `s` (URL, www. host or domain), or ''. */
export const findLink = (s: string | undefined): string => (s ? LINK_PATTERN.exec(s)?.[0] ?? '' : '');

// ─── Validation ───────────────────────────────────────────────────────────────

const len = (s: string | undefined) => [...(s ?? '')].length;

/** Problems with a reply for this flow type; empty when it can be saved. */
export function validateReply(r: BotReply, flowType: ChatFlowType): string[] {
  const errs: string[] = [];
  const kind = CHAT_FLOW_TYPE_INFO[flowType].title + 's';
  const noLinks = !canUseLinks(flowType);
  const link = (field: string, value: string | undefined) => {
    if (!noLinks) return;
    const found = findLink(value);
    if (found) errs.push(`${kind} can't contain links: remove “${found}” from the ${field}.`);
  };
  const interactive = r.interactive !== 'none';
  const media = isMediaHeader(r.header.type);

  if (flowType === 'simple' && media) errs.push('Simple Bots can’t send media.');
  if (noLinks && r.interactive === 'cta_url') errs.push(`${kind} can’t have a CTA URL button.`);

  if (!r.body.trim() && (interactive || !media)) errs.push('Reply text is required.');
  const maxBody = interactive || media ? LIMITS.body : LIMITS.text;
  if (len(r.body) > maxBody) errs.push(`Reply text is ${len(r.body)} characters; WhatsApp allows ${maxBody}.`);
  link('reply text', r.body);
  if (len(r.footer) > LIMITS.footer) errs.push(`Footer can be at most ${LIMITS.footer} characters.`);
  link('footer', r.footer);

  if (r.header.type === 'text') {
    if (!r.header.text?.trim()) errs.push('Header text is empty.');
    if (len(r.header.text) > LIMITS.header) errs.push(`Header can be at most ${LIMITS.header} characters.`);
    link('header', r.header.text);
  }
  if (media && !r.header.media_path) errs.push(`Upload a ${r.header.type} file.`);
  if (media && r.interactive === 'list') errs.push('List messages can only have a text header.');

  if (r.interactive === 'buttons') {
    if (r.buttons.length < 1 || r.buttons.length > LIMITS.buttons) errs.push('Add 1 to 3 reply buttons.');
    const titles = new Set<string>();
    r.buttons.forEach((b, i) => {
      if (!b.title.trim()) errs.push(`Button ${i + 1} needs a label.`);
      if (len(b.title) > LIMITS.buttonTitle) errs.push(`Button “${b.title}” is over ${LIMITS.buttonTitle} characters.`);
      if (titles.has(b.title.trim().toLowerCase())) errs.push(`Two buttons are labelled “${b.title}”.`);
      titles.add(b.title.trim().toLowerCase());
      link(`button “${b.title}”`, b.title);
    });
  }
  if (r.interactive === 'list') {
    if (!r.list.button_text.trim()) errs.push('List button text is required.');
    if (len(r.list.button_text) > LIMITS.listButton) errs.push(`List button text can be at most ${LIMITS.listButton} characters.`);
    link('list button', r.list.button_text);
    const rows = r.list.sections.flatMap((s) => s.rows);
    if (rows.length < 1 || rows.length > LIMITS.rows) errs.push(`Add 1 to ${LIMITS.rows} rows (now ${rows.length}).`);
    const ids = new Set<string>();
    r.list.sections.forEach((s) => {
      if (len(s.title) > LIMITS.sectionTitle) errs.push(`Section “${s.title}” is over ${LIMITS.sectionTitle} characters.`);
      link('section title', s.title);
    });
    rows.forEach((row, i) => {
      if (!row.title.trim()) errs.push(`Row ${i + 1} needs a title.`);
      if (len(row.title) > LIMITS.rowTitle) errs.push(`Row “${row.title}” is over ${LIMITS.rowTitle} characters.`);
      if (len(row.description) > LIMITS.rowDescription)
        errs.push(`Description of “${row.title}” is over ${LIMITS.rowDescription} characters.`);
      if (!row.id.trim() || ids.has(row.id)) errs.push(`Row ${i + 1} needs a unique Row ID.`);
      ids.add(row.id);
      link(`row “${row.title}”`, `${row.title} ${row.description ?? ''}`);
    });
  }
  if (r.interactive === 'cta_url') {
    if (!r.cta.display_text.trim()) errs.push('CTA button label is required.');
    if (len(r.cta.display_text) > LIMITS.ctaText) errs.push(`CTA button label can be at most ${LIMITS.ctaText} characters.`);
    if (!/^https?:\/\/\S+\.\S+/i.test(r.cta.url.trim())) errs.push('CTA URL must start with https://');
    const c2 = r.cta2;
    if (c2 && (c2.display_text.trim() || c2.url.trim())) {
      if (!c2.display_text.trim()) errs.push('Second link button needs a label.');
      if (len(c2.display_text) > LIMITS.ctaText) errs.push(`Second link button label can be at most ${LIMITS.ctaText} characters.`);
      if (!/^https?:\/\/\S+\.\S+/i.test(c2.url.trim())) errs.push('Second link URL must start with https://');
    }
  }
  return errs;
}

/** A stored reply config, normalized (older/partial configs load safely). */
export function toBotReply(config: Record<string, unknown> | undefined): BotReply {
  const c = config || {};
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const header = obj(c.header);
  const headerTypes: ReplyHeaderType[] = ['none', 'text', 'image', 'video', 'audio', 'document'];
  const interactives: ReplyInteractive[] = ['none', 'buttons', 'list', 'cta_url'];
  const list = obj(c.list);
  const cta = obj(c.cta);
  const sections = arr(list.sections).map((sec) => ({
    title: s(sec.title),
    rows: arr(sec.rows).map((row) => ({ id: s(row.id), title: s(row.title), description: s(row.description) })),
  }));
  return {
    body: s(c.body) || s(c.message) || s(c.text),
    footer: s(c.footer),
    header: {
      type: headerTypes.includes(header.type as ReplyHeaderType) ? (header.type as ReplyHeaderType) : 'none',
      text: s(header.text),
      media_path: s(header.media_path),
      filename: s(header.filename),
      mime_type: s(header.mime_type),
    },
    interactive: interactives.includes(c.interactive as ReplyInteractive) ? (c.interactive as ReplyInteractive) : 'none',
    buttons: arr(c.buttons).map((b) => ({ id: s(b.id), title: s(b.title) })),
    list: { button_text: s(list.button_text), sections: sections.length ? sections : [{ title: '', rows: [] }] },
    cta: { display_text: s(cta.display_text), url: s(cta.url) },
    cta2: { display_text: s(obj(c.cta2).display_text), url: s(obj(c.cta2).url) },
  };
}

/** The reply as the runner reads it; unused parts are dropped. */
export function fromBotReply(r: BotReply): Record<string, unknown> {
  const out: Record<string, unknown> = { body: r.body, interactive: r.interactive };
  if (r.footer && r.interactive !== 'none') out.footer = r.footer;
  if (r.header.type !== 'none') {
    out.header =
      r.header.type === 'text'
        ? { type: 'text', text: r.header.text ?? '' }
        : {
            type: r.header.type,
            media_path: r.header.media_path ?? '',
            filename: r.header.filename ?? '',
            mime_type: r.header.mime_type ?? '',
          };
  }
  if (r.interactive === 'buttons') out.buttons = r.buttons;
  if (r.interactive === 'list')
    out.list = {
      button_text: r.list.button_text,
      sections: r.list.sections.map((sec) => ({
        ...(sec.title ? { title: sec.title } : {}),
        rows: sec.rows.map((row) => ({ id: row.id, title: row.title, ...(row.description ? { description: row.description } : {}) })),
      })),
    };
  if (r.interactive === 'cta_url') {
    out.cta = r.cta;
    if (r.cta2 && (r.cta2.display_text.trim() || r.cta2.url.trim())) out.cta2 = r.cta2;
  }
  return out;
}

/** Short summary of a reply's kind for node cards. */
export function replyKindOf(r: BotReply): ReplyKind {
  if (r.interactive === 'buttons') return 'buttons';
  if (r.interactive === 'list') return 'list';
  if (r.interactive === 'cta_url') return 'cta_url';
  return isMediaHeader(r.header.type) ? 'media' : 'text';
}
