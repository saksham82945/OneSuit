import React from 'react';
import { Check, Images, MessagesSquare, Sparkles, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHAT_FLOW_TYPES, CHAT_FLOW_TYPE_INFO, type ChatFlowType } from './chatbotFlowTypes';

const TYPE_STYLE: Record<ChatFlowType, { icon: LucideIcon; gradient: string; ring: string }> = {
  simple: { icon: MessagesSquare, gradient: 'from-emerald-500 to-emerald-700', ring: 'ring-emerald-500' },
  media: { icon: Images, gradient: 'from-teal-500 to-cyan-700', ring: 'ring-teal-500' },
  advanced: { icon: Sparkles, gradient: 'from-emerald-500 via-teal-500 to-sky-600', ring: 'ring-sky-500' },
};

export const FlowTypeBadge: React.FC<{ type: ChatFlowType; className?: string }> = ({ type, className }) => {
  const Icon = TYPE_STYLE[type].icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        type === 'simple' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 light:text-emerald-700',
        type === 'media' && 'border-teal-500/30 bg-teal-500/10 text-teal-300 light:text-teal-700',
        type === 'advanced' && 'border-sky-500/30 bg-sky-500/10 text-sky-300 light:text-sky-700',
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {CHAT_FLOW_TYPE_INFO[type].title}
    </span>
  );
};

export const FlowTypePicker: React.FC<{ value: ChatFlowType | null; onChange: (t: ChatFlowType) => void }> = ({ value, onChange }) => (
  <div className="grid gap-3 md:grid-cols-3">
    {CHAT_FLOW_TYPES.map((t) => {
      const info = CHAT_FLOW_TYPE_INFO[t];
      const style = TYPE_STYLE[t];
      const active = value === t;
      return (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            'group relative flex flex-col rounded-2xl border p-4 text-left transition-all',
            'border-white/[0.08] bg-[#141416] hover:border-white/20 hover:-translate-y-0.5',
            'light:border-gray-200 light:bg-white light:hover:border-gray-300 light:hover:shadow-md',
            active && cn('ring-2 border-transparent', style.ring)
          )}
        >
          {active && (
            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3 w-3" />
            </span>
          )}
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg', style.gradient)}>
            <style.icon className="h-5 w-5" />
          </span>
          <span className="mt-3 text-sm font-bold text-white light:text-gray-900">{info.title}</span>
          <span className="mt-1 text-xs text-white/55 light:text-gray-500">{info.tagline}</span>
          <ul className="mt-3 space-y-1">
            {info.allows.map((a) => (
              <li key={a} className="flex items-start gap-1.5 text-[11px] text-white/80 light:text-gray-700">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                {a}
              </li>
            ))}
            {info.blocks.map((b) => (
              <li key={b} className="flex items-start gap-1.5 text-[11px] text-white/40 light:text-gray-400">
                <X className="mt-0.5 h-3 w-3 shrink-0 text-rose-400/70" />
                {b}
              </li>
            ))}
          </ul>
        </button>
      );
    })}
  </div>
);
