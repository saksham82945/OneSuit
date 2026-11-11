import React from 'react';
import { Bot, CheckCheck, Inbox, Megaphone, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import './auth-motion.css';

/** OneSuit's own benefit points, shown beside the auth forms on wide screens. */
const BENEFITS = [
  { icon: Inbox, title: 'One shared inbox', text: 'Your whole team answers WhatsApp chats from one place.' },
  { icon: Bot, title: 'Bots & automation', text: 'Reply instantly with bot flows, quick replies and auto-assign.' },
  { icon: Megaphone, title: 'Campaigns that land', text: 'Send approved templates to the right contacts and track reads.' },
  { icon: ShieldCheck, title: 'Official API, secure', text: 'Built on the WhatsApp Business API with role-based access.' },
];

/** A small looping WhatsApp-style conversation. Static under prefers-reduced-motion. */
export const ChatMock: React.FC<{ className?: string; businessName?: string }> = ({ className, businessName }) => (
  <div
    aria-hidden
    className={cn(
      'auth-chat w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1714]/90 shadow-2xl shadow-black/40 backdrop-blur light:border-emerald-100 light:bg-white/90 light:shadow-emerald-900/10',
      className
    )}
  >
    <div className="flex items-center gap-2.5 border-b border-white/[0.06] bg-emerald-600/90 px-4 py-2.5 text-white light:border-emerald-100">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
        {(businessName?.trim()[0] ?? 'A').toUpperCase()}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{businessName?.trim() || 'Acme Store'}</p>
        <p className="text-[10px] text-white/75">online</p>
      </div>
    </div>
    <div className="auth-chat-body space-y-2 bg-[radial-gradient(rgb(255_255_255/0.035)_1px,transparent_1px)] p-3.5 [background-size:16px_16px] light:bg-[#efeae2] light:bg-none">
      <div className="auth-chat-msg auth-chat-in" style={{ '--chat-i': 0 } as React.CSSProperties}>
        Hi! Is my order shipped yet? 📦
      </div>
      <div className="auth-chat-msg auth-chat-out" style={{ '--chat-i': 1 } as React.CSSProperties}>
        Yes! It left today and arrives Thursday.
        <span className="auth-chat-meta">
          Bot <CheckCheck className="h-3 w-3" />
        </span>
      </div>
      <div className="auth-chat-msg auth-chat-in" style={{ '--chat-i': 2 } as React.CSSProperties}>
        Great, can I also add a gift wrap?
      </div>
      <div className="auth-chat-msg auth-chat-out" style={{ '--chat-i': 3 } as React.CSSProperties}>
        Done 🎁 Priya from our team has added it.
        <span className="auth-chat-meta">
          Priya <CheckCheck className="h-3 w-3" />
        </span>
      </div>
      <div className="auth-chat-typing" style={{ '--chat-i': 4 } as React.CSSProperties}>
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
);

/** Product showcase for the left half of the split auth layout (hidden on phones). */
export const AuthShowcase: React.FC<{
  platformName: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}> = ({ platformName, title, subtitle, className }) => (
  <section className={cn('auth-stagger space-y-7', className)} style={{ '--auth-base-delay': '120ms' } as React.CSSProperties}>
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1 text-xs font-medium text-emerald-300 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 light:bg-emerald-500" />
        WhatsApp Business, made simple
      </span>
      <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl light:text-gray-900">
        {title ?? (
          <>
            Every customer chat,{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent light:from-emerald-600 light:via-teal-500 light:to-emerald-600">
              one workspace
            </span>
          </>
        )}
      </h2>
      <p className="mt-3 max-w-md text-white/55 light:text-gray-600">
        {subtitle ?? `${platformName} brings your team, bots and campaigns together on WhatsApp.`}
      </p>
    </div>
    <ChatMock />
    <ul className="grid max-w-lg gap-3 sm:grid-cols-2">
      {BENEFITS.map(({ icon: Icon, title: t, text }) => (
        <li key={t} className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 light:bg-emerald-50 light:text-emerald-600">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/90 light:text-gray-900">{t}</p>
            <p className="text-xs leading-relaxed text-white/50 light:text-gray-500">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

export default AuthShowcase;
