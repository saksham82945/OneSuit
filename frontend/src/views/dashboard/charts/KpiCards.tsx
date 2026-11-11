import React from 'react';
import {
  Bot,
  CheckCheck,
  Clock,
  Inbox,
  Megaphone,
  MessageCircle,
  Minus,
  Send,
  TrendingDown,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { dashCardClass, formatCount, formatDuration, toneClasses, type Tone } from '@/components/dashboard';
import type { DashboardCharts, DashboardKPIKey } from '@/services/dashboard';
import { cn } from '@/lib/utils';
import { InfoTip } from './ChartCard';
import { computeTrend } from './range';

interface KpiDef {
  key: DashboardKPIKey;
  label: string;
  info: string;
  icon: LucideIcon;
  tone: Tone;
  kind: 'count' | 'rate' | 'duration';
  /** For durations a drop is good news. */
  lowerIsBetter?: boolean;
  /** Snapshot figures have no previous period. */
  snapshot?: string;
}

const KPIS: KpiDef[] = [
  { key: 'messages_sent', label: 'Messages sent', icon: Send, tone: 'green', kind: 'count', info: 'Every outgoing WhatsApp message in the period: replies, templates, campaigns and bot messages.' },
  { key: 'messages_received', label: 'Messages received', icon: Inbox, tone: 'purple', kind: 'count', info: 'Messages your customers sent you in the period.' },
  { key: 'delivery_rate', label: 'Delivery rate', icon: CheckCheck, tone: 'teal', kind: 'rate', info: 'Share of messages accepted by WhatsApp that reached the customer’s phone. Read rate = share that was opened.' },
  { key: 'new_contacts', label: 'New contacts', icon: UserPlus, tone: 'blue', kind: 'count', info: 'Contacts added in the period (incoming chats, imports, forms and API).' },
  { key: 'open_conversations', label: 'Open conversations', icon: MessageCircle, tone: 'amber', kind: 'count', snapshot: 'Right now', info: 'Customers who wrote in the last 24 hours, i.e. their WhatsApp reply window is open.' },
  { key: 'campaign_messages', label: 'Campaign messages', icon: Megaphone, tone: 'orange', kind: 'count', info: 'Broadcast campaign messages sent in the period.' },
  { key: 'bot_sessions', label: 'Bot sessions', icon: Bot, tone: 'purple', kind: 'count', info: 'Chatbot conversations started in the period.' },
  { key: 'avg_first_response_seconds', label: 'Avg first response', icon: Clock, tone: 'red', kind: 'duration', lowerIsBetter: true, info: 'Average time from a chat being handed to an agent until their first reply.' },
];

const formatValue = (def: KpiDef, v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  if (def.kind === 'rate') return `${v.toFixed(1)}%`;
  if (def.kind === 'duration') return formatDuration(v);
  return formatCount(Math.round(v));
};

interface KpiCardsProps {
  data: DashboardCharts | null;
  loading: boolean;
  /** "vs previous 7 days" etc. */
  compareLabel: string;
}

/** Headline numbers for the selected range, each compared with the previous period of the same length. */
export const KpiCards: React.FC<KpiCardsProps> = ({ data, loading, compareLabel }) => {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: loading ? 8 : 0 }).map((_, i) => (
          <div key={i} className={cn(dashCardClass, 'h-[112px] animate-pulse')} />
        ))}
      </div>
    );
  }

  const shown = KPIS.filter((k) => data.kpis[k.key] !== undefined);
  if (shown.length === 0) return null;

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4', loading && 'opacity-60 transition-opacity')}>
      {shown.map((def) => {
        const kpi = data.kpis[def.key];
        const trend = computeTrend(kpi, def.kind);
        const good = def.lowerIsBetter ? trend.direction === 'down' : trend.direction === 'up';
        const bad = def.lowerIsBetter ? trend.direction === 'up' : trend.direction === 'down';
        const TrendIcon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
        const readRate = def.key === 'delivery_rate' ? data.kpis.read_rate?.current : undefined;

        return (
          <div key={def.key} className={cn(dashCardClass, 'flex min-w-0 flex-col justify-between p-3.5 sm:p-4')}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {def.label}
                </p>
                <InfoTip text={def.info} />
              </div>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneClasses[def.tone])}>
                <def.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-1 truncate text-xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-2xl dark:text-white">
              {formatValue(def, kpi?.current)}
            </p>
            <div className="mt-1.5 flex min-w-0 items-center gap-1 text-[11px]">
              {def.snapshot ? (
                <span className="truncate text-gray-400 dark:text-gray-500">{def.snapshot}</span>
              ) : trend.direction === 'none' ? (
                <span className="truncate text-gray-400 dark:text-gray-500">
                  {kpi?.current === null ? 'No data yet' : 'Nothing to compare'}
                </span>
              ) : (
                <>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 font-semibold',
                      good && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                      bad && 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
                      !good && !bad && 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                    )}
                  >
                    <TrendIcon className="h-3 w-3" />
                    {trend.text}
                  </span>
                  <span className="truncate text-gray-400 dark:text-gray-500">{compareLabel}</span>
                </>
              )}
            </div>
            {readRate !== undefined && (
              <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                Read rate {readRate === null ? '—' : `${readRate.toFixed(1)}%`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
