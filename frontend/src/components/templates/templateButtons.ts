// Helpers for WhatsApp template buttons (Meta rules).
// Stored/API shape (handlers.TemplateRequest.buttons):
//   QUICK_REPLY  { type, text }
//   URL          { type, text, url, example?: [fullExampleUrl] }   (example only when url ends with {{1}})
//   PHONE_NUMBER { type, text, phone_number }
//   COPY_CODE    { type, text: 'Copy offer code', example: 'CODE' }
// Other types synced from Meta (FLOW, VOICE_CALL, CATALOG, ...) are kept as-is.

export type StoredButton = Record<string, unknown> & { type?: string; text?: string };

export type EditableKind = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';

export interface EditableButton {
  key: string;
  type: string;
  text: string;
  url: string;
  /** Example value for the {{1}} suffix of a dynamic URL. */
  urlExample: string;
  phone: string;
  code: string;
  /** The original stored object, so unknown fields survive an edit. */
  raw: StoredButton;
}

export const BUTTON_LIMITS = {
  total: 10,
  url: 2,
  phone: 1,
  copyCode: 1,
  textLength: 25,
  urlLength: 2000,
  codeLength: 15,
};

export const COPY_CODE_LABEL = 'Copy offer code';
export const URL_VARIABLE = '{{1}}';

export const KIND_LABELS: Record<EditableKind, string> = {
  QUICK_REPLY: 'Quick reply',
  URL: 'Visit website',
  PHONE_NUMBER: 'Call phone number',
  COPY_CODE: 'Copy offer code',
};

export const isEditableKind = (type: string): type is EditableKind =>
  type === 'QUICK_REPLY' || type === 'URL' || type === 'PHONE_NUMBER' || type === 'COPY_CODE';

let keySeq = 0;
const nextKey = () => `btn-${Date.now().toString(36)}-${(keySeq += 1)}`;

function firstExample(example: unknown): string {
  if (typeof example === 'string') return example;
  if (Array.isArray(example) && typeof example[0] === 'string') return example[0];
  return '';
}

function urlPrefix(url: string): string {
  const idx = url.indexOf(URL_VARIABLE);
  return idx >= 0 ? url.slice(0, idx) : url;
}

export function fromStored(btn: StoredButton): EditableButton {
  const type = String(btn.type || '').toUpperCase();
  const text = typeof btn.text === 'string' ? btn.text : '';
  const url = typeof btn.url === 'string' ? btn.url : '';
  const example = firstExample(btn.example);
  let urlExample = '';
  if (type === 'URL' && url.includes(URL_VARIABLE) && example) {
    // Meta stores the full example URL; the editor only asks for the {{1}} part.
    const prefix = urlPrefix(url);
    urlExample = example.startsWith(prefix) ? example.slice(prefix.length) : example;
  }
  return {
    key: nextKey(),
    type,
    text,
    url,
    urlExample,
    phone: typeof btn.phone_number === 'string' ? btn.phone_number : '',
    code: type === 'COPY_CODE' ? example : '',
    raw: btn,
  };
}

export function newButton(kind: EditableKind): EditableButton {
  return {
    key: nextKey(),
    type: kind,
    text: kind === 'COPY_CODE' ? COPY_CODE_LABEL : '',
    url: kind === 'URL' ? 'https://' : '',
    urlExample: '',
    phone: '',
    code: '',
    raw: { type: kind },
  };
}

export const cleanPhone = (phone: string) => phone.replace(/[\s\-().]/g, '');

export function toStored(b: EditableButton): StoredButton {
  // Drop the fields this editor manages, keep anything else (e.g. ids from Meta).
  const rest: StoredButton = { ...b.raw };
  delete rest.text;
  delete rest.url;
  delete rest.example;
  delete rest.phone_number;
  switch (b.type) {
    case 'QUICK_REPLY':
      return { ...rest, type: 'QUICK_REPLY', text: b.text.trim() };
    case 'URL': {
      const url = b.url.trim();
      const out: StoredButton = { ...rest, type: 'URL', text: b.text.trim(), url };
      if (url.includes(URL_VARIABLE)) out.example = [urlPrefix(url) + b.urlExample.trim()];
      return out;
    }
    case 'PHONE_NUMBER':
      return { ...rest, type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: cleanPhone(b.phone.trim()) };
    case 'COPY_CODE':
      return { ...rest, type: 'COPY_CODE', text: COPY_CODE_LABEL, example: b.code.trim() };
    default:
      return b.raw;
  }
}

const isQuickReply = (b: { type: string }) => b.type === 'QUICK_REPLY';

/** Meta requires quick replies to be grouped together, before or after all call-to-action buttons. */
export function groupButtons<T extends { type: string }>(buttons: T[]): T[] {
  if (buttons.length === 0) return buttons;
  const quick = buttons.filter(isQuickReply);
  const cta = buttons.filter((b) => !isQuickReply(b));
  return isQuickReply(buttons[0]) ? [...quick, ...cta] : [...cta, ...quick];
}

export function isGrouped(buttons: { type: string }[]): boolean {
  const grouped = groupButtons(buttons);
  return grouped.every((b, i) => b === buttons[i]);
}

export function countButtons(buttons: EditableButton[]) {
  return {
    total: buttons.length,
    url: buttons.filter((b) => b.type === 'URL').length,
    phone: buttons.filter((b) => b.type === 'PHONE_NUMBER').length,
    copyCode: buttons.filter((b) => b.type === 'COPY_CODE').length,
  };
}

/** Why a button kind cannot be added right now, or null when it can. */
export function addDisabledReason(kind: EditableKind, buttons: EditableButton[], category: string): string | null {
  const c = countButtons(buttons);
  if (c.total >= BUTTON_LIMITS.total) return `Maximum of ${BUTTON_LIMITS.total} buttons reached`;
  if (kind === 'URL' && c.url >= BUTTON_LIMITS.url) return `Maximum of ${BUTTON_LIMITS.url} website buttons`;
  if (kind === 'PHONE_NUMBER' && c.phone >= BUTTON_LIMITS.phone) return 'Only 1 call button allowed';
  if (kind === 'COPY_CODE') {
    if (category !== 'MARKETING' && category !== 'UTILITY') return 'Only for marketing or utility templates';
    if (c.copyCode >= BUTTON_LIMITS.copyCode) return 'Only 1 copy code button allowed';
  }
  return null;
}

export interface ButtonFieldErrors {
  text?: string;
  url?: string;
  urlExample?: string;
  phone?: string;
  code?: string;
}

function urlError(raw: string): string | undefined {
  const url = raw.trim();
  if (!url || url === 'https://' || url === 'http://') return 'Enter a website URL';
  if (url.length > BUTTON_LIMITS.urlLength) return `URL must be at most ${BUTTON_LIMITS.urlLength} characters`;
  const vars = url.match(/\{\{[^}]*\}\}/g) || [];
  if (vars.length > 1 || (vars.length === 1 && (vars[0] !== URL_VARIABLE || !url.endsWith(URL_VARIABLE)))) {
    return 'Only one variable, {{1}}, is allowed and it must be at the end';
  }
  try {
    const parsed = new URL(url.replace(URL_VARIABLE, ''));
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error('bad');
  } catch {
    return 'Enter a valid link, e.g. https://example.com';
  }
  return undefined;
}

export function validateButton(b: EditableButton): ButtonFieldErrors {
  const errors: ButtonFieldErrors = {};
  if (!isEditableKind(b.type)) return errors;
  if (b.type !== 'COPY_CODE') {
    const text = b.text.trim();
    if (!text) errors.text = 'Button label is required';
    else if (text.length > BUTTON_LIMITS.textLength) errors.text = `Max ${BUTTON_LIMITS.textLength} characters`;
  }
  if (b.type === 'URL') {
    errors.url = urlError(b.url);
    if (!errors.url && b.url.includes(URL_VARIABLE) && !b.urlExample.trim()) {
      errors.urlExample = 'Meta needs an example value for {{1}}';
    }
  }
  if (b.type === 'PHONE_NUMBER') {
    const phone = cleanPhone(b.phone.trim());
    if (!phone) errors.phone = 'Enter a phone number';
    else if (!/^\+?[1-9]\d{6,14}$/.test(phone)) errors.phone = 'Use international format, e.g. +91 98765 43210';
  }
  if (b.type === 'COPY_CODE') {
    const code = b.code.trim();
    if (!code) errors.code = 'Enter an example offer code';
    else if (code.length > BUTTON_LIMITS.codeLength) errors.code = `Max ${BUTTON_LIMITS.codeLength} characters`;
  }
  (Object.keys(errors) as (keyof ButtonFieldErrors)[]).forEach((k) => errors[k] === undefined && delete errors[k]);
  return errors;
}

/** First problem with the button list, phrased for a toast, or null when valid. */
export function firstButtonError(buttons: EditableButton[], category: string): string | null {
  const c = countButtons(buttons);
  if (c.total > BUTTON_LIMITS.total) return `A template can have at most ${BUTTON_LIMITS.total} buttons`;
  if (c.url > BUTTON_LIMITS.url) return `A template can have at most ${BUTTON_LIMITS.url} website buttons`;
  if (c.phone > BUTTON_LIMITS.phone) return 'A template can have only 1 call button';
  if (c.copyCode > BUTTON_LIMITS.copyCode) return 'A template can have only 1 copy code button';
  if (c.copyCode > 0 && category !== 'MARKETING' && category !== 'UTILITY') {
    return 'Copy code buttons are only allowed on marketing or utility templates';
  }
  for (let i = 0; i < buttons.length; i += 1) {
    const errs = Object.values(validateButton(buttons[i]));
    if (errs.length) return `Button ${i + 1}: ${errs[0]}`;
  }
  return null;
}
