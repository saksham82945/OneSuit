import React from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Activity,
  Bot,
  Clock3,
  FileText,
  Filter,
  Headphones,
  Megaphone,
  MessagesSquare,
  MessageSquare,
  UsersRound,
} from 'lucide-react';
import { formatCount, formatDuration } from '@/components/dashboard';
import { useTheme } from '@/hooks/useTheme';
import type { DashboardCharts } from '@/services/dashboard';
import { cn } from '@/lib/utils';
import { ChartCard, ChartEmpty, FooterStat, LegendDot } from './ChartCard';
import { barOptions, doughnutOptions, lineOptions } from './chartSetup';
import { chartPalette, withAlpha, type ChartPalette } from './palette';
import { bucketLabel } from './range';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const share = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const shortName = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s || 'Untitled');

/** Vertical gradient for area fills. */
const areaFill = (color: string) => (ctx: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
  const area = ctx.chart.chartArea;
  if (!area) return withAlpha(color, 0.15);
  const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, withAlpha(color, 0.28));
  g.addColorStop(1, withAlpha(color, 0.02));
  return g;
};

interface SectionProps {
  data: DashboardCharts;
  p: ChartPalette;
}

const MessagesOverTime: React.FC<SectionProps> = ({ data, p }) => {
  const series = data.messages ?? [];
  const sent = sum(series.map((s) => s.sent));
  const received = sum(series.map((s) => s.received));
  const sentOK = data.funnel?.sent ?? 0;
  return (
    <ChartCard
      title="Messages over time"
      info="Outgoing vs incoming WhatsApp messages per hour, day or week of the selected range (your workspace time zone)."
      icon={MessageSquare}
      tone="green"
      className="lg:col-span-2"
      action={
        <div className="flex items-center gap-3">
          <LegendDot color={p.sent} label="Sent" />
          <LegendDot color={p.received} label="Received" />
        </div>
      }
      footer={
        <>
          <FooterStat label="Total sent" value={formatCount(sent)} />
          <FooterStat label="Total received" value={formatCount(received)} />
          <FooterStat label="Delivery rate" value={share(data.funnel?.delivered ?? 0, sentOK)} />
          <FooterStat label="Read rate" value={share(data.funnel?.read ?? 0, sentOK)} />
        </>
      }
    >
      {sent + received === 0 ? (
        <ChartEmpty message="No messages in this period" icon={MessageSquare} height={240} />
      ) : (
        <div className="h-[240px]">
          <Line
            options={lineOptions(p)}
            data={{
              labels: series.map((s) => bucketLabel(s.date, data.granularity)),
              datasets: [
                { label: 'Sent', data: series.map((s) => s.sent), borderColor: p.sent, backgroundColor: areaFill(p.sent), fill: true },
                { label: 'Received', data: series.map((s) => s.received), borderColor: p.received, backgroundColor: areaFill(p.received), fill: true },
              ],
            }}
          />
        </div>
      )}
    </ChartCard>
  );
};

const DeliveryFunnel: React.FC<SectionProps> = ({ data, p }) => {
  const f = data.funnel!;
  const steps = [
    { label: 'Sent', value: f.total, color: p.sent, hint: 'All outgoing' },
    { label: 'Accepted', value: f.sent, color: p.sent, hint: 'Accepted by WhatsApp' },
    { label: 'Delivered', value: f.delivered, color: p.delivered, hint: share(f.delivered, f.sent) },
    { label: 'Read', value: f.read, color: p.read, hint: share(f.read, f.sent) },
    { label: 'Failed', value: f.failed, color: p.failed, hint: share(f.failed, f.total) },
  ];
  return (
    <ChartCard
      title="Delivery funnel"
      info="What happened to the messages you sent in this period. Delivered includes read; percentages are of messages accepted by WhatsApp (failed: of all sent)."
      icon={Filter}
      tone="teal"
    >
      {f.total === 0 ? (
        <ChartEmpty message="Nothing sent in this period" icon={Filter} />
      ) : (
        <ul className="space-y-3.5">
          {steps.map((s) => (
            <li key={s.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-gray-700 dark:text-gray-200">{s.label}</span>
                <span className="tabular-nums text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-white">{formatCount(s.value)}</span>
                  <span className="ml-1.5">{s.hint}</span>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: p.track }}>
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(s.value > 0 ? 2 : 0, (s.value / f.total) * 100)}%`, backgroundColor: s.color }}
                />
              </div>
            </li>
          ))}
          {f.pending > 0 && (
            <li className="text-[11px] text-gray-400 dark:text-gray-500">{formatCount(f.pending)} still waiting for a status from WhatsApp</li>
          )}
        </ul>
      )}
    </ChartCard>
  );
};

const Conversations: React.FC<SectionProps> = ({ data, p }) => {
  const c = data.conversations!;
  const slices = [
    { label: 'Open · assigned', value: c.open_assigned, color: p.assigned },
    { label: 'Open · unassigned', value: c.open_unassigned, color: p.unassigned },
    { label: 'Resolved', value: c.resolved, color: p.resolved, note: 'in period' },
    { label: 'Expired', value: c.expired, color: p.expired, note: 'in period' },
  ];
  const total = sum(slices.map((s) => s.value));
  const open = c.open_assigned + c.open_unassigned;
  return (
    <ChartCard
      title="Conversations"
      info="Chats handed to your team. Open = waiting in the agent queue right now (assigned or not). Resolved / expired = closed during the selected range."
      icon={MessagesSquare}
      tone="purple"
      linkLabel="Queue"
      linkTo="/chatbot/transfers"
    >
      {total === 0 ? (
        <ChartEmpty message="No agent conversations yet" icon={MessagesSquare} />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
          <div className="relative h-[160px] w-[160px] shrink-0">
            <Doughnut
              options={doughnutOptions(p)}
              data={{
                labels: slices.map((s) => s.label),
                datasets: [{ data: slices.map((s) => s.value), backgroundColor: slices.map((s) => s.color) }],
              }}
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{formatCount(open)}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">open now</span>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-2">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate">
                    {s.label}
                    {s.note && <span className="ml-1 text-gray-400 dark:text-gray-500">· {s.note}</span>}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{formatCount(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
};

const BusiestHours: React.FC<SectionProps> = ({ data, p }) => {
  const hours = data.hourly ?? [];
  const total = sum(hours);
  const peak = hours.indexOf(Math.max(...hours));
  const hourName = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <ChartCard
      title="Busiest hours"
      info="When customers message you: incoming messages by hour of day across the selected range. Staff up around the peak."
      icon={Clock3}
      tone="amber"
      className="lg:col-span-2"
      action={
        total > 0 ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            Peak {hourName(peak)}–{hourName((peak + 1) % 24)}
          </span>
        ) : undefined
      }
    >
      {total === 0 ? (
        <ChartEmpty message="No incoming messages in this period" icon={Clock3} />
      ) : (
        <div className="h-[220px]">
          <Bar
            options={barOptions(p)}
            data={{
              labels: hours.map((_, h) => hourName(h)),
              datasets: [
                {
                  label: 'Incoming messages',
                  data: hours,
                  backgroundColor: hours.map((_, h) => (h === peak ? p.unassigned : withAlpha(p.unassigned, 0.45))),
                },
              ],
            }}
          />
        </div>
      )}
    </ChartCard>
  );
};

const ContactsGrowth: React.FC<SectionProps> = ({ data, p }) => {
  const series = data.contacts ?? [];
  const added = sum(series.map((s) => s.new));
  const total = series.length ? series[series.length - 1].total : 0;
  return (
    <ChartCard
      title="Contacts growth"
      info="Total contacts at the end of each bucket, with new contacts added during the selected range."
      icon={UsersRound}
      tone="blue"
      className="lg:col-span-2"
      linkLabel="Contacts"
      linkTo="/contacts"
      footer={
        <>
          <FooterStat label="Total contacts" value={formatCount(total)} />
          <FooterStat
            label="New in period"
            value={`+${formatCount(added)}`}
            className={added > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined}
          />
        </>
      }
    >
      {total === 0 ? (
        <ChartEmpty message="No contacts yet" icon={UsersRound} height={200} />
      ) : (
        <div className="h-[200px]">
          <Line
            options={lineOptions(p)}
            data={{
              labels: series.map((s) => bucketLabel(s.date, data.granularity)),
              datasets: [
                { label: 'Total contacts', data: series.map((s) => s.total), borderColor: p.contacts, backgroundColor: areaFill(p.contacts), fill: true },
              ],
            }}
          />
        </div>
      )}
    </ChartCard>
  );
};

const TopTemplates: React.FC<SectionProps> = ({ data, p }) => {
  const rows = data.templates ?? [];
  return (
    <ChartCard
      title="Top templates"
      info="Approved message templates you sent most in this period (any source: chat, campaigns, bots, API)."
      icon={FileText}
      tone="teal"
      linkLabel="Templates"
      linkTo="/templates"
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No template messages in this period" icon={FileText} />
      ) : (
        <div style={{ height: Math.max(140, rows.length * 34) }}>
          <Bar
            options={barOptions(p, { horizontal: true })}
            data={{
              labels: rows.map((r) => shortName(r.name, 20)),
              datasets: [
                { label: 'Sends', data: rows.map((r) => r.sends), backgroundColor: p.sent },
                { label: 'Read', data: rows.map((r) => r.read), backgroundColor: p.read },
              ],
            }}
          />
        </div>
      )}
    </ChartCard>
  );
};

const TopCampaigns: React.FC<SectionProps> = ({ data, p }) => {
  const rows = data.campaigns ?? [];
  return (
    <ChartCard
      title="Top campaigns"
      info="Broadcast campaigns with the most messages in this period, split by outcome: read, delivered (not yet read), sent (no delivery receipt yet) and failed."
      icon={Megaphone}
      tone="orange"
      className="lg:col-span-2"
      linkLabel="Campaigns"
      linkTo="/campaigns"
      action={
        rows.length > 0 ? (
          <div className="hidden flex-wrap items-center gap-3 sm:flex">
            <LegendDot color={p.read} label="Read" />
            <LegendDot color={p.delivered} label="Delivered" />
            <LegendDot color={p.sent} label="Sent" />
            <LegendDot color={p.failed} label="Failed" />
          </div>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No campaign messages in this period" icon={Megaphone} />
      ) : (
        <div style={{ height: Math.max(160, rows.length * 40) }}>
          <Bar
            options={barOptions(p, { horizontal: true, stacked: true })}
            data={{
              labels: rows.map((r) => shortName(r.name)),
              datasets: [
                { label: 'Read', data: rows.map((r) => r.read), backgroundColor: p.read },
                { label: 'Delivered', data: rows.map((r) => r.delivered - r.read), backgroundColor: p.delivered },
                { label: 'Sent', data: rows.map((r) => r.sent - r.delivered), backgroundColor: withAlpha(p.sent, 0.55) },
                { label: 'Failed', data: rows.map((r) => r.failed), backgroundColor: p.failed },
              ],
            }}
          />
        </div>
      )}
    </ChartCard>
  );
};

const BotUsage: React.FC<SectionProps> = ({ data, p }) => {
  const b = data.bot!;
  const statuses = [
    { label: 'Completed', value: b.completed, color: p.delivered },
    { label: 'Active', value: b.active, color: p.bot },
    { label: 'Timed out', value: b.timeout, color: p.pending },
    { label: 'Cancelled', value: b.cancelled, color: p.expired },
  ];
  const maxFlow = Math.max(1, ...b.top_flows.map((f) => f.sessions));
  return (
    <ChartCard
      title="Chatbot & flows"
      info="Chatbot sessions started in this period, how they ended, and the flows customers used most."
      icon={Bot}
      tone="purple"
      linkLabel="Flows"
      linkTo="/chatbot/flows"
    >
      {b.sessions === 0 ? (
        <ChartEmpty message="No bot sessions in this period" icon={Bot} />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: p.track }}>
              {statuses.map((s) =>
                s.value > 0 ? (
                  <div key={s.label} style={{ width: `${(s.value / b.sessions) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${s.value}`} />
                ) : null
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {statuses.map((s) => (
                <span key={s.label} className="flex items-center justify-between gap-2 text-[11px]">
                  <LegendDot color={s.color} label={s.label} />
                  <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{formatCount(s.value)}</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Top flows</p>
            {b.top_flows.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">Sessions weren't linked to a flow.</p>
            ) : (
              <ul className="space-y-2">
                {b.top_flows.map((f) => (
                  <li key={f.id}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-gray-700 dark:text-gray-200">{f.name}</span>
                      <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-gray-900 dark:text-white">{formatCount(f.sessions)}</span> · {share(f.completed, f.sessions)} done
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: p.track }}>
                      <div className="h-full rounded-full" style={{ width: `${(f.sessions / maxFlow) * 100}%`, backgroundColor: p.bot }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
};

const AgentPerformance: React.FC<SectionProps> = ({ data, p }) => {
  const rows = data.agents ?? [];
  const self = data.agent_scope === 'self';
  return (
    <ChartCard
      title={self ? 'My performance' : 'Agent performance'}
      info="Chats handed to each agent in this period, how many they resolved, and their average time to first reply."
      icon={Headphones}
      tone="green"
      className="lg:col-span-3"
      linkLabel={self ? undefined : 'Agent analytics'}
      linkTo={self ? undefined : '/analytics/agents'}
      action={
        rows.length > 0 ? (
          <div className="flex items-center gap-3">
            <LegendDot color={p.assigned} label="Handled" />
            <LegendDot color={p.resolved} label="Resolved" />
          </div>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No chats were handed to agents in this period" icon={Headphones} height={160} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3" style={{ height: Math.max(150, rows.length * 38) }}>
            <Bar
              options={barOptions(p, { horizontal: true })}
              data={{
                labels: rows.map((r) => shortName(r.name || 'Unknown agent', 18)),
                datasets: [
                  { label: 'Handled', data: rows.map((r) => r.handled), backgroundColor: p.assigned },
                  { label: 'Resolved', data: rows.map((r) => r.resolved), backgroundColor: p.resolved },
                ],
              }}
            />
          </div>
          <div className="min-w-0 overflow-x-auto lg:col-span-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-white/[0.06] dark:text-gray-400">
                  <th className="py-2 pr-2">Agent</th>
                  <th className="px-2 py-2 text-right">Handled</th>
                  <th className="px-2 py-2 text-right">Resolved</th>
                  <th className="py-2 pl-2 text-right">Avg reply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="max-w-[140px] truncate py-2 pr-2 font-medium text-gray-800 dark:text-gray-200">{r.name || 'Unknown agent'}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatCount(r.handled)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatCount(r.resolved)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatDuration(r.avg_first_response_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ChartCard>
  );
};

interface DashboardChartsGridProps {
  data: DashboardCharts;
  loading?: boolean;
}

/**
 * All dashboard charts for one date range. Each card only renders when the
 * caller's role may read that data (the server leaves the section out).
 * Loaded lazily so chart.js stays out of the main bundle.
 */
const DashboardChartsGrid: React.FC<DashboardChartsGridProps> = ({ data, loading }) => {
  const { isDark } = useTheme();
  const p = chartPalette(isDark);
  const props = { data, p };

  const cards = [
    data.messages && <MessagesOverTime key="messages" {...props} />,
    data.funnel && <DeliveryFunnel key="funnel" {...props} />,
    data.hourly && <BusiestHours key="hourly" {...props} />,
    data.conversations && <Conversations key="conversations" {...props} />,
    data.contacts && <ContactsGrowth key="contacts" {...props} />,
    data.templates && <TopTemplates key="templates" {...props} />,
    data.campaigns && <TopCampaigns key="campaigns" {...props} />,
    data.bot && <BotUsage key="bot" {...props} />,
    data.agents && <AgentPerformance key="agents" {...props} />,
  ].filter(Boolean);

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
        <Activity className="mx-auto mb-2 h-5 w-5 text-gray-300 dark:text-gray-600" />
        Your role doesn't include analytics. Ask an admin if you need these charts.
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-3', loading && 'opacity-60 transition-opacity')}>{cards}</div>
  );
};

export default DashboardChartsGrid;
