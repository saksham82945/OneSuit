import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Bot,
  CheckCheck,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Megaphone,
  MessageSquare,
  MousePointerClick,
  Phone,
  Send,
  Sparkles,
  UserCheck,
  Users,
  Video,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInView, useLandingMotion } from './landingMotion';

// Illustrated, animated product mock-ups for the landing page. Pure HTML/CSS, no images.

const panel =
  'rounded-3xl border border-gray-200/80 bg-white shadow-xl shadow-emerald-900/[0.06] dark:border-white/10 dark:bg-[#0f1a20] dark:shadow-black/30';

const PanelHeader: React.FC<{ icon: LucideIcon; title: string; right?: React.ReactNode }> = ({ icon: Icon, title, right }) => (
  <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
    </div>
    {right}
  </div>
);

// --- Hero: phone with a live WhatsApp conversation ------------------------------------

type ChatLine =
  | { kind: 'in' | 'out'; text: string; time: string; bot?: boolean }
  | { kind: 'product' }
  | { kind: 'buttons'; items: string[] }
  | { kind: 'system'; text: string };

const SCRIPT: ChatLine[] = [
  { kind: 'in', text: 'Hi! Is the green kurta available in M?', time: '10:02' },
  { kind: 'out', text: 'Yes it is! Here it is 👇', time: '10:02', bot: true },
  { kind: 'product' },
  { kind: 'buttons', items: ['Buy now', 'Talk to a person'] },
  { kind: 'in', text: 'Talk to a person', time: '10:03' },
  { kind: 'system', text: 'Ananya from Sales joined' },
  { kind: 'out', text: 'Hi, I’m Ananya 🙂 I can hold one for you till evening.', time: '10:03' },
];

const Bubble: React.FC<{ line: ChatLine }> = ({ line }) => {
  if (line.kind === 'system')
    return (
      <div className="lp-bubble flex justify-center">
        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm dark:bg-[#1f2c33] dark:text-gray-300">
          {line.text}
        </span>
      </div>
    );
  if (line.kind === 'product')
    return (
      <div className="lp-bubble flex justify-end">
        <div className="w-[78%] overflow-hidden rounded-xl rounded-tr-sm bg-[#d9fdd3] shadow-sm dark:bg-[#005c4b]">
          <div className="relative h-20 bg-gradient-to-br from-emerald-300 via-teal-300 to-lime-200 dark:from-emerald-700 dark:via-teal-700 dark:to-lime-800">
            <span className="absolute inset-0 flex items-center justify-center text-3xl" aria-hidden>
              👘
            </span>
          </div>
          <div className="px-2.5 py-1.5">
            <p className="text-[11px] font-semibold text-gray-900 dark:text-white">Cotton kurta · Green</p>
            <p className="text-[11px] text-gray-600 dark:text-emerald-100/80">₹1,299 · Sizes S–XL</p>
          </div>
        </div>
      </div>
    );
  if (line.kind === 'buttons')
    return (
      <div className="lp-bubble ml-auto flex w-[78%] flex-col gap-1">
        {line.items.map((b) => (
          <span
            key={b}
            className="rounded-lg bg-white py-1.5 text-center text-[11px] font-semibold text-sky-600 shadow-sm dark:bg-[#1f2c33] dark:text-sky-300"
          >
            {b}
          </span>
        ))}
      </div>
    );
  const out = line.kind === 'out';
  return (
    <div className={cn('lp-bubble flex', out ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-xl px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 shadow-sm dark:text-gray-100',
          out ? 'rounded-tr-sm bg-[#d9fdd3] dark:bg-[#005c4b]' : 'rounded-tl-sm bg-white dark:bg-[#1f2c33]'
        )}
      >
        {line.bot && (
          <span className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <Bot className="h-2.5 w-2.5" /> Auto-reply
          </span>
        )}
        {line.text}
        <span className="ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[9px] text-gray-500 dark:text-gray-400">
          {line.time}
          {out && <CheckCheck className="h-3 w-3 text-sky-500" />}
        </span>
      </div>
    </div>
  );
};

export const HeroPhone: React.FC<{ businessName: string }> = ({ businessName }) => {
  const motion = useLandingMotion();
  const [ref, inView] = useInView<HTMLDivElement>(false, 0.2);
  const [shown, setShown] = useState(motion ? 1 : SCRIPT.length);

  useEffect(() => {
    if (!motion) {
      setShown(SCRIPT.length);
      return;
    }
    if (!inView) return;
    const done = shown >= SCRIPT.length;
    const t = setTimeout(() => setShown((s) => (s >= SCRIPT.length ? 1 : s + 1)), done ? 4200 : 1300);
    return () => clearTimeout(t);
  }, [shown, motion, inView]);

  const next = SCRIPT[shown];
  const typing = motion && next && next.kind === 'in';

  return (
    <div ref={ref} className="relative mx-auto w-[264px] sm:w-[290px]">
      <div className="relative rounded-[2.6rem] border-[9px] border-gray-900 bg-gray-900 shadow-2xl shadow-emerald-900/30 dark:border-[#1c262c] dark:bg-[#1c262c]">
        <div className="absolute left-1/2 top-1.5 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-gray-900 dark:bg-[#1c262c]" aria-hidden />
        <div className="overflow-hidden rounded-[2rem] bg-[#efeae2] dark:bg-[#0b141a]">
          <div className="flex items-center gap-2 bg-[#0f6b5c] px-3 pb-2.5 pt-6 text-white dark:bg-[#1f2c33]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-500 text-xs font-bold">
              {businessName.slice(0, 1).toUpperCase() || 'O'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-[13px] font-semibold">
                <span className="truncate">{businessName || 'Your Business'}</span>
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
              </p>
              <p className="text-[10px] text-white/70">{typing ? 'typing…' : 'online'}</p>
            </div>
            <Video className="h-4 w-4 opacity-80" />
            <Phone className="h-4 w-4 opacity-80" />
          </div>
          <div
            className="flex h-[380px] flex-col justify-end gap-1.5 overflow-hidden p-2.5 sm:h-[400px]"
            style={{
              backgroundImage: 'radial-gradient(rgba(16,185,129,0.10) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
            }}
            aria-label="Example WhatsApp conversation"
          >
            {SCRIPT.slice(0, shown).map((line, i) => (
              <Bubble key={i} line={line} />
            ))}
            {typing && (
              <div className="lp-bubble flex justify-start">
                <span className="lp-typing flex items-center gap-1 rounded-xl rounded-tl-sm bg-white px-3 py-2.5 text-gray-400 shadow-sm dark:bg-[#1f2c33]">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 bg-[#f0f2f5] px-2.5 py-2 dark:bg-[#1f2c33]">
            <span className="flex-1 rounded-full bg-white px-3 py-1.5 text-[11px] text-gray-400 dark:bg-[#2a3942]">Message</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Send className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Live Chat inbox ---------------------------------------------------------------------

const chats = [
  { name: 'Rohit Mehta', msg: 'Can I change my delivery address?', time: 'now', unread: 2, agent: 'Unassigned', tone: 'from-amber-300 to-orange-400' },
  { name: 'Sana Qureshi', msg: 'Payment done via UPI ✅', time: '2m', unread: 0, agent: 'Neha', tone: 'from-sky-300 to-blue-500' },
  { name: 'Arjun Nair', msg: 'Sending the brochure PDF…', time: '9m', unread: 1, agent: 'Vikram', tone: 'from-violet-300 to-fuchsia-500' },
  { name: 'Meera Iyer', msg: 'Thanks, that solved it!', time: '21m', unread: 0, agent: 'Bot', tone: 'from-emerald-300 to-teal-500' },
];

export const InboxMock: React.FC = () => {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={cn(panel, inView && 'is-in')}>
      <PanelHeader
        icon={MessageSquare}
        title="Live Chat"
        right={
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="lp-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            4 agents online
          </span>
        }
      />
      <div className="flex gap-1.5 px-4 pt-3 text-[11px] font-semibold">
        {['All 24', 'Mine 6', 'Unassigned 3'].map((t, i) => (
          <span
            key={t}
            className={cn(
              'rounded-full px-2.5 py-1',
              i === 0 ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <ul className="lp-stagger space-y-1 p-2.5">
        {chats.map((c, i) => (
          <li
            key={c.name}
            className={cn(
              'flex items-center gap-3 rounded-2xl px-2.5 py-2.5',
              i === 0 && 'bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/20'
            )}
          >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white', c.tone)}>
              {c.name
                .split(' ')
                .map((p) => p[0])
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{c.name}</p>
                <span className="shrink-0 text-[10px] text-gray-400">{c.time}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{c.msg}</p>
                {c.unread > 0 && (
                  <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                    {c.unread}
                  </span>
                )}
              </div>
            </div>
            <span
              className={cn(
                'hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline',
                c.agent === 'Unassigned'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                  : c.agent === 'Bot'
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'
              )}
            >
              {c.agent}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// --- Broadcast campaign -----------------------------------------------------------------------

const funnel = [
  { label: 'Sent', value: '2,400', w: '100%', bar: 'from-sky-400 to-sky-500' },
  { label: 'Delivered', value: '2,352', w: '98%', bar: 'from-teal-400 to-emerald-500' },
  { label: 'Read', value: '1,968', w: '82%', bar: 'from-emerald-400 to-emerald-600' },
  { label: 'Replied', value: '612', w: '26%', bar: 'from-amber-400 to-orange-500' },
];

export const CampaignMock: React.FC = () => {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={cn(panel, inView && 'is-in')}>
      <PanelHeader
        icon={Megaphone}
        title="Festive offer · Broadcast"
        right={<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Completed</span>}
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          {[
            { t: 'Group · Loyal customers', icon: Users },
            { t: 'List · Pune leads', icon: Users },
            { t: 'Template · offer_v2', icon: FileText },
          ].map(({ t, icon: Icon }) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300"
            >
              <Icon className="h-3 w-3" />
              {t}
            </span>
          ))}
        </div>
        <div className="space-y-3">
          {funnel.map((f, i) => (
            <div key={f.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-gray-600 dark:text-gray-300">{f.label}</span>
                <span className="font-bold tabular-nums text-gray-900 dark:text-white">{f.value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                <div
                  className={cn('lp-fill h-full rounded-full bg-gradient-to-r', f.bar)}
                  style={{ '--w': f.w, '--i': i } as React.CSSProperties}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">Sample numbers, for illustration</p>
      </div>
    </div>
  );
};

// --- Chatbot flows: simple / media / advanced ---------------------------------------------

type FlowNode = { icon: LucideIcon; title: string; text: string; tone: string };

const BOT_TYPES: { id: string; label: string; blurb: string; nodes: FlowNode[] }[] = [
  {
    id: 'simple',
    label: 'Simple',
    blurb: 'Keyword in, answer out, with quick-reply buttons.',
    nodes: [
      { icon: Zap, title: 'When someone says', text: '“hi”, “hello”, “menu”', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
      { icon: MessageSquare, title: 'Send a message', text: 'Welcome! What can we help with?', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
      { icon: MousePointerClick, title: 'Buttons', text: 'Prices · Order status · Support', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    blurb: 'Share images, videos and documents automatically.',
    nodes: [
      { icon: Zap, title: 'When someone says', text: '“catalogue”', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
      { icon: ImageIcon, title: 'Send an image', text: 'New arrivals, with a caption', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
      { icon: FileText, title: 'Send a document', text: 'price-list.pdf', tone: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'Ask questions, branch on answers and call your systems.',
    nodes: [
      { icon: MessageSquare, title: 'Ask a question', text: 'Which city are you in?', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
      { icon: GitBranch, title: 'Condition', text: 'city is Mumbai → Mumbai team', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
      { icon: Webhook, title: 'Webhook', text: 'Save the lead to your CRM', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
      { icon: UserCheck, title: 'Hand over', text: 'Assign to an agent', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    ],
  },
];

export const BotFlowMock: React.FC = () => {
  const motion = useLandingMotion();
  const [ref, inView] = useInView<HTMLDivElement>(false, 0.3);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!motion || pinned || !inView) return;
    const t = setInterval(() => setActive((a) => (a + 1) % BOT_TYPES.length), 3800);
    return () => clearInterval(t);
  }, [motion, pinned, inView]);

  const type = BOT_TYPES[active];
  return (
    <div ref={ref} className={cn(panel, 'is-in')}>
      <PanelHeader icon={Bot} title="Chatbot flow" right={<span className="text-[11px] text-gray-400">{type.nodes.length} steps</span>} />
      <div className="p-4">
        <div role="tablist" aria-label="Bot types" className="grid grid-cols-3 gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.06]">
          {BOT_TYPES.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => {
                setActive(i);
                setPinned(true);
              }}
              className={cn(
                'rounded-full py-1.5 text-xs font-semibold transition-all',
                i === active
                  ? 'bg-white text-emerald-700 shadow-sm dark:bg-emerald-500/20 dark:text-emerald-200'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">{type.blurb}</p>
        <div key={type.id} className="lp-stagger is-in mt-4 flex flex-col items-center">
          {type.nodes.map((n, i) => {
            const Icon = n.icon;
            return (
              <React.Fragment key={n.title}>
                {i > 0 && <span aria-hidden className="lp-flow-line h-5 w-0.5 text-emerald-400 dark:text-emerald-500/60" />}
                <div className="flex w-full max-w-[300px] items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', n.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{n.title}</p>
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{n.text}</p>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// --- Click-to-WhatsApp ads and lead forms -------------------------------------------------

const adSteps = [
  { icon: Megaphone, title: 'Ad clicked', text: 'Facebook / Instagram · “Free demo class”' },
  { icon: MessageSquare, title: 'Chat opens', text: 'Hi! I’d like to book the free class' },
  { icon: FileText, title: 'Lead form', text: 'Name · City · Preferred time' },
  { icon: UserCheck, title: 'Lead saved', text: 'Tagged with the ad and assigned' },
];

export const AdsMock: React.FC = () => {
  const motion = useLandingMotion();
  const [ref, inView] = useInView<HTMLDivElement>(false, 0.3);
  const [step, setStep] = useState(motion ? 0 : adSteps.length - 1);

  useEffect(() => {
    if (!motion || !inView) return;
    const t = setInterval(() => setStep((s) => (s + 1) % adSteps.length), 1600);
    return () => clearInterval(t);
  }, [motion, inView]);

  return (
    <div ref={ref} className={panel}>
      <PanelHeader icon={MousePointerClick} title="Click-to-WhatsApp Ads" />
      <ol className="space-y-2 p-4">
        {adSteps.map((s, i) => {
          const Icon = s.icon;
          const done = i <= step;
          return (
            <li
              key={s.title}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all duration-500',
                i === step
                  ? 'border-emerald-300 bg-emerald-50 shadow-md shadow-emerald-500/10 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                  : 'border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.02]',
                !done && 'opacity-50'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-500',
                  done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400 dark:bg-white/[0.06]'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.title}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{s.text}</p>
              </div>
              <span className="text-[10px] font-bold tabular-nums text-gray-400">0{i + 1}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

// --- Analytics and AI agent --------------------------------------------------------------

const week = [38, 52, 46, 70, 64, 88, 76];

export const InsightsMock: React.FC = () => {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={cn(panel, inView && 'is-in')}>
      <PanelHeader
        icon={Sparkles}
        title="This week"
        right={<span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">Sample data</span>}
      />
      <div className="grid grid-cols-2 gap-2.5 p-4">
        {[
          { k: 'Answered by AI agent', v: '61%', tone: 'text-violet-600 dark:text-violet-300' },
          { k: 'Avg. first reply', v: '42 sec', tone: 'text-emerald-600 dark:text-emerald-300' },
        ].map((t) => (
          <div key={t.k} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <p className={cn('text-xl font-extrabold tabular-nums font-ubuntu', t.tone)}>{t.v}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t.k}</p>
          </div>
        ))}
        <div className="col-span-2 rounded-2xl border border-gray-100 p-3 dark:border-white/[0.06]">
          <p className="mb-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400">Conversations per day</p>
          <div className="flex h-24 items-end gap-2">
            {week.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    'lp-bar w-full rounded-t-md bg-gradient-to-t',
                    i === 5 ? 'from-emerald-600 to-teal-400' : 'from-emerald-200 to-emerald-300 dark:from-emerald-500/30 dark:to-emerald-400/40'
                  )}
                  style={{ height: `${h}%`, '--i': i } as React.CSSProperties}
                />
                <span className="text-[9px] text-gray-400">{'MTWTFSS'[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Animated number -------------------------------------------------------------------------

export const Counter: React.FC<{ to: number; prefix?: string; suffix?: string; className?: string }> = ({
  to,
  prefix = '',
  suffix = '',
  className,
}) => {
  const motion = useLandingMotion();
  const [ref, inView] = useInView<HTMLSpanElement>(true, 0.5);
  const [n, setN] = useState(motion ? 0 : to);

  useEffect(() => {
    if (!motion) {
      setN(to);
      return;
    }
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1400);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, motion, to]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {prefix}
      {n.toLocaleString('en-IN')}
      {suffix}
    </span>
  );
};
