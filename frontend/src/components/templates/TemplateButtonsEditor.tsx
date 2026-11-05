import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Info, List, Phone, Plus, Reply, Trash2, MousePointerClick } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BUTTON_LIMITS,
  COPY_CODE_LABEL,
  KIND_LABELS,
  URL_VARIABLE,
  addDisabledReason,
  countButtons,
  isEditableKind,
  isGrouped,
  newButton,
  validateButton,
  type EditableButton,
  type EditableKind,
} from './templateButtons';

const KIND_ICONS: Record<EditableKind, React.ComponentType<{ className?: string }>> = {
  QUICK_REPLY: Reply,
  URL: ExternalLink,
  PHONE_NUMBER: Phone,
  COPY_CODE: Copy,
};

const ADD_ORDER: EditableKind[] = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE'];

const iconFor = (type: string) => (isEditableKind(type) ? KIND_ICONS[type] : MousePointerClick);

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[10px] text-red-400 light:text-red-600">{message}</p>;
}

interface EditorProps {
  buttons: EditableButton[];
  onChange: (buttons: EditableButton[]) => void;
  category: string;
  /** Show "required" errors on empty fields (set after a save attempt). */
  showErrors: boolean;
}

export const TemplateButtonsEditor: React.FC<EditorProps> = ({ buttons, onChange, category, showErrors }) => {
  const counts = countButtons(buttons);
  const grouped = isGrouped(buttons);

  const update = (key: string, patch: Partial<EditableButton>) =>
    onChange(buttons.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const remove = (key: string) => onChange(buttons.filter((b) => b.key !== key));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= buttons.length) return;
    const next = [...buttons];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = (kind: EditableKind) => {
    if (addDisabledReason(kind, buttons, category)) return;
    onChange([...buttons, newButton(kind)]);
  };

  const counterClass = (used: number, max: number) =>
    used >= max
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 light:bg-amber-50 light:text-amber-700 light:border-amber-200'
      : 'bg-white/[0.04] text-white/60 border-white/10 light:bg-gray-50 light:text-gray-600 light:border-gray-200';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">Buttons (Optional)</Label>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className={`px-1.5 py-0.5 rounded border ${counterClass(counts.total, BUTTON_LIMITS.total)}`}>
            {counts.total}/{BUTTON_LIMITS.total} buttons
          </span>
          <span className={`px-1.5 py-0.5 rounded border ${counterClass(counts.url, BUTTON_LIMITS.url)}`}>
            {counts.url}/{BUTTON_LIMITS.url} links
          </span>
          <span className={`px-1.5 py-0.5 rounded border ${counterClass(counts.phone, BUTTON_LIMITS.phone)}`}>
            {counts.phone}/{BUTTON_LIMITS.phone} call
          </span>
          <span className={`px-1.5 py-0.5 rounded border ${counterClass(counts.copyCode, BUTTON_LIMITS.copyCode)}`}>
            {counts.copyCode}/{BUTTON_LIMITS.copyCode} code
          </span>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-white/45 light:text-gray-500">
        <Info className="h-3 w-3 mt-px shrink-0" />
        <span>
          Up to {BUTTON_LIMITS.total} buttons: quick replies, up to {BUTTON_LIMITS.url} website links, 1 call button and 1 copy code.
          Meta requires quick replies to sit together, so they are grouped before or after the other buttons when you save.
        </span>
      </p>

      {!grouped && (
        <p className="text-[10px] rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-300 light:border-amber-200 light:bg-amber-50 light:text-amber-700">
          Quick replies are split up by other buttons. They will be grouped together when you save.
        </p>
      )}

      {buttons.length > 0 && (
        <ol className="space-y-2">
          {buttons.map((b, index) => {
            const Icon = iconFor(b.type);
            const editable = isEditableKind(b.type);
            const errors = validateButton(b);
            const show = (field: keyof typeof errors, value: string) =>
              showErrors || value.trim() ? errors[field] : undefined;
            const kindLabel = editable ? KIND_LABELS[b.type as EditableKind] : b.type.replace(/_/g, ' ').toLowerCase();
            const textLength = b.text.trim().length;
            return (
              <li
                key={b.key}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-2 light:border-gray-200 light:bg-gray-50/60"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400 light:bg-emerald-50 light:text-emerald-700">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/80 light:text-gray-700">
                    Button {index + 1} · <span className="capitalize">{kindLabel}</span>
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move button ${index + 1} up`}
                      className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent light:text-gray-500 light:hover:bg-gray-200 light:hover:text-gray-900"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === buttons.length - 1}
                      aria-label={`Move button ${index + 1} down`}
                      className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent light:text-gray-500 light:hover:bg-gray-200 light:hover:text-gray-900"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(b.key)}
                      aria-label={`Delete button ${index + 1}`}
                      className="rounded p-1 text-white/50 hover:bg-red-500/10 hover:text-red-400 light:text-gray-500 light:hover:bg-red-50 light:hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {!editable && (
                  <p className="text-[10px] text-white/45 light:text-gray-500">
                    "{b.text || b.type}" was created in Meta and is kept as-is. You can reorder or delete it.
                  </p>
                )}

                {editable && b.type !== 'COPY_CODE' && (
                  <div className="grid gap-1">
                    <div className="relative">
                      <Input
                        value={b.text}
                        maxLength={BUTTON_LIMITS.textLength}
                        placeholder={b.type === 'QUICK_REPLY' ? 'e.g. Yes, confirm' : b.type === 'URL' ? 'e.g. Shop now' : 'e.g. Call us'}
                        onChange={(e) => update(b.key, { text: e.target.value })}
                        aria-label={`Button ${index + 1} label`}
                        className="pr-12"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/35 light:text-gray-400">
                        {textLength}/{BUTTON_LIMITS.textLength}
                      </span>
                    </div>
                    <FieldError message={show('text', b.text)} />
                  </div>
                )}

                {b.type === 'URL' && (
                  <div className="grid gap-1">
                    <div className="flex gap-2">
                      <Input
                        type="url"
                        value={b.url}
                        placeholder="https://example.com/offers"
                        onChange={(e) => update(b.key, { url: e.target.value })}
                        aria-label={`Button ${index + 1} website URL`}
                        className="min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          update(b.key, b.url.includes(URL_VARIABLE)
                            ? { url: b.url.replace(URL_VARIABLE, ''), urlExample: '' }
                            : { url: b.url.trim() + URL_VARIABLE })}
                        title="A dynamic suffix lets each message open a different link, e.g. an order page"
                        className={`shrink-0 rounded-md border px-2 text-[10px] font-medium transition-colors ${
                          b.url.includes(URL_VARIABLE)
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 light:bg-emerald-50 light:text-emerald-700'
                            : 'border-white/10 text-white/60 hover:bg-white/[0.04] light:border-gray-200 light:text-gray-600 light:hover:bg-gray-100'
                        }`}
                      >
                        {b.url.includes(URL_VARIABLE) ? 'Dynamic ✓' : `+ ${URL_VARIABLE}`}
                      </button>
                    </div>
                    <FieldError message={show('url', b.url.replace(/^https?:\/\/$/, ''))} />
                    {b.url.includes(URL_VARIABLE) && (
                      <>
                        <Input
                          value={b.urlExample}
                          placeholder="Example for {{1}}, e.g. order/1029"
                          onChange={(e) => update(b.key, { urlExample: e.target.value })}
                          aria-label={`Button ${index + 1} example URL value`}
                        />
                        <p className="text-[10px] text-white/40 light:text-gray-400 break-all">
                          Sample link for Meta review: {b.url.replace(URL_VARIABLE, b.urlExample.trim() || '…')}
                        </p>
                        <FieldError message={show('urlExample', b.urlExample)} />
                      </>
                    )}
                  </div>
                )}

                {b.type === 'PHONE_NUMBER' && (
                  <div className="grid gap-1">
                    <Input
                      type="tel"
                      value={b.phone}
                      placeholder="+91 98765 43210"
                      onChange={(e) => update(b.key, { phone: e.target.value })}
                      aria-label={`Button ${index + 1} phone number`}
                    />
                    <FieldError message={show('phone', b.phone)} />
                  </div>
                )}

                {b.type === 'COPY_CODE' && (
                  <div className="grid gap-1">
                    <Input
                      value={b.code}
                      maxLength={BUTTON_LIMITS.codeLength}
                      placeholder="Example code, e.g. SAVE20"
                      onChange={(e) => update(b.key, { code: e.target.value.replace(/\s/g, '') })}
                      aria-label={`Button ${index + 1} example offer code`}
                    />
                    <p className="text-[10px] text-white/40 light:text-gray-400">
                      WhatsApp shows the fixed label "{COPY_CODE_LABEL}". The real code is set per campaign.
                    </p>
                    <FieldError message={show('code', b.code)} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ADD_ORDER.map((kind) => {
          const reason = addDisabledReason(kind, buttons, category);
          const Icon = KIND_ICONS[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => add(kind)}
              disabled={!!reason}
              title={reason || `Add a ${KIND_LABELS[kind].toLowerCase()} button`}
              className="flex flex-col items-start gap-0.5 rounded-lg border border-dashed border-white/15 px-2.5 py-2 text-left transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/[0.06] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:bg-transparent light:border-gray-300 light:hover:bg-emerald-50 light:disabled:hover:border-gray-300"
            >
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 light:text-emerald-700">
                <Plus className="h-3 w-3" />
                <Icon className="h-3 w-3" />
                {KIND_LABELS[kind]}
              </span>
              <span className="text-[9px] leading-tight text-white/40 light:text-gray-500">
                {reason || (kind === 'URL' ? `${BUTTON_LIMITS.url - countButtons(buttons).url} left` : kind === 'QUICK_REPLY' ? 'Up to 25 characters' : '1 allowed')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface PreviewButton {
  key: string;
  type: string;
  text: string;
}

/** WhatsApp-style button rows shown under the message bubble text. */
export const TemplateButtonsPreview: React.FC<{ buttons: PreviewButton[] }> = ({ buttons }) => {
  const [expanded, setExpanded] = useState(false);
  if (buttons.length === 0) return null;
  // WhatsApp shows up to 3 buttons; beyond that the first 2 plus "See all options".
  const collapsed = buttons.length > 3 && !expanded;
  const visible = collapsed ? buttons.slice(0, 2) : buttons;
  const rowClass =
    'flex w-full items-center justify-center gap-1.5 border-t border-white/[0.08] py-2 text-xs font-medium text-[#53bdeb] light:border-gray-200 light:text-[#027eb5]';
  return (
    <div className="-mx-3 -mb-1">
      {visible.map((b) => {
        const Icon = iconFor(b.type);
        return (
          <div key={b.key} className={rowClass}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{b.text || (b.type === 'COPY_CODE' ? COPY_CODE_LABEL : 'Button')}</span>
          </div>
        );
      })}
      {buttons.length > 3 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className={rowClass}>
          <List className="h-3.5 w-3.5 shrink-0" />
          {expanded ? 'Show fewer' : 'See all options'}
        </button>
      )}
    </div>
  );
};
