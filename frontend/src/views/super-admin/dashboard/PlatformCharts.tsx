import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { formatCount } from '@/components/dashboard';
import { cn } from '@/lib/utils';
import type { SuperAdminCharts } from '@/services/superAdminCharts';
import { ChartCard } from './DashboardParts';
import { timeSeriesOptions, tooltipOptions, useChartColors, type ChartColors } from './chartTheme';
import { bucketLabel, toISODate } from './range';

type Money = (n: number) => string;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Bars: thin, rounded at the data end, anchored to the baseline. */
const barStyle = { borderRadius: 4, borderSkipped: 'start' as const, maxBarThickness: 28, categoryPercentage: 0.8, barPercentage: 0.9 };

/** Fixed colour slot per client status, so a status keeps its colour whatever else is shown. */
const STATUS_SLOT: Record<string, number> = { active: 2, pending_payment: 0, expired: 3, idle: 6, trial: 4, suspended: 7 };

const lineDataset = (label: string, data: number[], color: string, fill = false) => ({
  label,
  data,
  borderColor: color,
  backgroundColor: fill ? `${color}26` : color,
  fill,
  tension: 0.3,
  borderWidth: 2,
  pointRadius: data.length > 40 ? 0 : 2,
  pointHoverRadius: 5,
});

/** A row of horizontal bars drawn in HTML, so long client names stay readable on phones. */
const BarList: React.FC<{
  rows: { key: string; label: string; value: number; sub?: string; to?: string }[];
  color: string;
  format?: (n: number) => string;
}> = ({ rows, color, format = formatCount }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="space-y-2.5 h-full overflow-y-auto pr-1">
      {rows.map((r, i) => (
        <li key={r.key} className="text-xs" title={`${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ''}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-right tabular-nums text-gray-400 dark:text-white/40">{i + 1}</span>
              {r.to ? (
                <Link to={r.to} className="truncate font-medium text-gray-800 hover:underline dark:text-gray-100">
                  {r.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-gray-800 dark:text-gray-100">{r.label}</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-gray-600 dark:text-white/70">
              {format(r.value)}
              {r.sub && <span className="ml-1 text-gray-400 dark:text-white/40">{r.sub}</span>}
            </span>
          </div>
          <div className="ml-6 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
};

const horizontalBarOptions = (c: ChartColors, format: (n: number) => string): ChartOptions<'bar'> => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { ...tooltipOptions(c), callbacks: { label: (ctx) => ` ${format(Number(ctx.parsed.x ?? 0))}` } },
  },
  scales: {
    x: { beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.muted, precision: 0, font: { size: 10 }, maxTicksLimit: 5 } },
    y: { grid: { display: false }, border: { color: c.grid }, ticks: { color: c.text, font: { size: 11 } } },
  },
});

export const PlatformCharts: React.FC<{ data: SuperAdminCharts; money: Money }> = ({ data, money }) => {
  const c = useChartColors();
  const gran = data.granularity;
  const labels = useMemo(() => data.signups.map((p) => bucketLabel(p.bucket, gran)), [data.signups, gran]);
  const periodWord = gran === 'month' ? 'month' : 'day';

  // --- Revenue -----------------------------------------------------------
  const revenueSeries = [
    { key: 'razorpay', label: 'Razorpay', slot: 0 },
    { key: 'upi', label: 'UPI', slot: 2 },
    { key: 'manual', label: 'Manual invoices', slot: 6 },
    { key: 'ad_credit', label: 'Ad credit', slot: 3 },
  ] as const;
  const revenueTotal = sum(data.revenue.map((r) => r.razorpay + r.upi + r.manual + r.ad_credit));
  const revenueData: ChartData<'bar'> = {
    labels,
    datasets: revenueSeries
      .filter((s) => data.revenue.some((r) => r[s.key] > 0))
      .map((s) => ({
        label: s.label,
        data: data.revenue.map((r) => r[s.key]),
        backgroundColor: c.series[s.slot],
        borderColor: c.surface,
        borderWidth: { top: 2 },
        ...barStyle,
      })),
  };

  // --- MRR trend ---------------------------------------------------------
  const mrrHasData = data.mrr_trend.some((p) => p.mrr > 0);
  const mrrData: ChartData<'line'> = {
    labels,
    datasets: [lineDataset('MRR', data.mrr_trend.map((p) => p.mrr), c.series[6], true)],
  };

  // --- Sign-ups ------------------------------------------------------------
  const signupTotal = sum(data.signups.map((p) => p.count));
  const signupData: ChartData<'bar'> = {
    labels,
    datasets: [{ label: 'New sign-ups', data: data.signups.map((p) => p.count), backgroundColor: c.series[0], ...barStyle }],
  };

  // --- Clients by status (donut) ----------------------------------------------
  const statusTotal = sum(data.clients_by_status.map((s) => s.count));
  const statusColors = data.clients_by_status.map((s) => c.series[STATUS_SLOT[s.key] ?? 6]);
  const statusData: ChartData<'doughnut'> = {
    labels: data.clients_by_status.map((s) => s.label),
    datasets: [
      {
        data: data.clients_by_status.map((s) => s.count),
        backgroundColor: statusColors,
        borderColor: c.surface,
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };
  const donutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipOptions(c),
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${formatCount(Number(ctx.parsed))} (${Math.round((Number(ctx.parsed) / Math.max(1, statusTotal)) * 100)}%)`,
        },
      },
    },
  };

  // --- Clients by plan ---------------------------------------------------------
  const planRows = data.clients_by_plan.slice(0, 8);
  const planData: ChartData<'bar'> = {
    labels: planRows.map((p) => p.label),
    datasets: [{ label: 'Clients', data: planRows.map((p) => p.count), backgroundColor: c.series[0], ...barStyle, borderSkipped: 'start' }],
  };

  // --- Renewals next 30 days (every day shown) ------------------------------------
  const renewals = useMemo(() => {
    const byDay = new Map(data.renewals_next_30.map((r) => [r.date, r]));
    const days: { date: string; count: number; amount: number }[] = [];
    const d = new Date();
    for (let i = 0; i < 30; i++) {
      const key = toISODate(d);
      days.push(byDay.get(key) ?? { date: key, count: 0, amount: 0 });
      d.setDate(d.getDate() + 1);
    }
    return { days, total: sum(data.renewals_next_30.map((r) => r.count)), amount: sum(data.renewals_next_30.map((r) => r.amount)) };
  }, [data.renewals_next_30]);
  const renewalData: ChartData<'bar'> = {
    labels: renewals.days.map((r) => bucketLabel(r.date, 'day')),
    datasets: [{ label: 'Renewals due', data: renewals.days.map((r) => r.count), backgroundColor: c.series[3], ...barStyle }],
  };
  const renewalOptions = timeSeriesOptions(c, { legend: false }) as ChartOptions<'bar'>;
  renewalOptions.plugins = {
    ...renewalOptions.plugins,
    tooltip: {
      ...tooltipOptions(c),
      callbacks: {
        label: (ctx) => {
          const r = renewals.days[ctx.dataIndex];
          return ` ${formatCount(r.count)} renewal${r.count === 1 ? '' : 's'} · ${money(r.amount)}`;
        },
      },
    },
  };

  // --- Messages --------------------------------------------------------------------
  const msgTotal = sum(data.messages.map((m) => m.sent + m.received));
  const msgData: ChartData<'line'> = {
    labels,
    datasets: [
      lineDataset('Sent', data.messages.map((m) => m.sent), c.series[0]),
      lineDataset('Received', data.messages.map((m) => m.received), c.series[1]),
    ],
  };

  // --- Tickets -----------------------------------------------------------------------
  const ticketsOpened = sum(data.tickets.map((t) => t.opened));
  const ticketsSolved = sum(data.tickets.map((t) => t.solved));
  const ticketData: ChartData<'bar'> = {
    labels,
    datasets: [
      { label: 'Opened', data: data.tickets.map((t) => t.opened), backgroundColor: c.series[1], ...barStyle },
      { label: 'Solved', data: data.tickets.map((t) => t.solved), backgroundColor: c.series[2], ...barStyle },
    ],
  };

  // --- Payment funnel -------------------------------------------------------------------
  const f = data.payment_funnel;
  const funnelSteps = [
    { key: 'started', label: 'Checkouts started', value: f.started, color: c.series[0] },
    { key: 'created', label: 'Not paid yet', value: f.created, color: c.series[6] },
    { key: 'pending', label: 'UPI awaiting approval', value: f.pending_verification, color: c.series[3] },
    { key: 'paid', label: 'Paid', value: f.paid, color: c.series[2] },
    { key: 'failed', label: 'Failed', value: f.failed, color: c.series[7] },
    { key: 'rejected', label: 'Rejected', value: f.rejected, color: c.series[4] },
  ];

  const rangeNote = `${bucketLabel(data.from, 'day')} – ${bucketLabel(data.to, 'day')}`;

  return (
    <div className="space-y-4">
      {/* Money */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue collected"
          headline={money(revenueTotal)}
          info={`Money received ${rangeNote}, per ${periodWord}. Counts paid invoices (labelled by the Razorpay/UPI payment behind them) plus paid payments that have no invoice, so nothing is counted twice. "Manual invoices" were raised by the platform team without an online payment.`}
          empty={revenueTotal === 0}
          emptyText="No payments collected in this period."
          linkTo="/super-admin/payments"
          linkLabel="Payments"
        >
          <Bar data={revenueData} options={timeSeriesOptions(c, { stacked: true, money }) as ChartOptions<'bar'>} />
        </ChartCard>
        <ChartCard
          title="Payments funnel"
          headline={`${formatCount(f.paid)} paid of ${formatCount(f.started)}`}
          info="Every checkout started in this period, by where it ended up: still unpaid, UPI reference waiting for your approval, paid, failed or rejected."
          empty={f.started === 0}
          emptyText="No checkouts started in this period."
        >
          <ul className="space-y-3 h-full">
            {funnelSteps.map((s, i) => (
              <li key={s.key} className={cn('text-xs', i > 0 && 'pl-3 border-l-2 border-gray-100 dark:border-white/[0.06]')}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{s.label}</span>
                  <span className="tabular-nums text-gray-600 dark:text-white/70">
                    {formatCount(s.value)}
                    {i > 0 && f.started > 0 && (
                      <span className="ml-1 text-gray-400 dark:text-white/40">{Math.round((s.value / f.started) * 100)}%</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(s.value / Math.max(1, f.started)) * 100}%`, background: s.color }} />
                </div>
              </li>
            ))}
            {f.paid_amount > 0 && <li className="pt-1 text-[11px] text-gray-500 dark:text-white/50">Paid checkouts: {money(f.paid_amount)}</li>}
          </ul>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="MRR trend"
          headline={money(data.kpis.mrr.value)}
          info="Monthly recurring revenue at the end of each period, rebuilt from paid subscription invoices (each one adds its amount ÷ months covered while its period runs). The headline is today's MRR from active subscriptions."
          empty={!mrrHasData}
          emptyText="No paid subscription invoices cover this period."
        >
          <Line data={mrrData} options={timeSeriesOptions(c, { money, legend: false }) as ChartOptions<'line'>} />
        </ChartCard>
        <ChartCard
          title="Renewals due (next 30 days)"
          headline={`${formatCount(renewals.total)} · ${money(renewals.amount)}`}
          info="Active clients whose plan renews in the next 30 days, per day, with what their billing cycle costs. Always the next 30 days, whatever range is picked."
          empty={renewals.total === 0}
          emptyText="No renewals due in the next 30 days."
          linkTo="/super-admin/subscriptions"
          linkLabel="Subscriptions"
        >
          <Bar data={renewalData} options={renewalOptions} />
        </ChartCard>
      </div>

      {/* Clients */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="New sign-ups"
          headline={formatCount(signupTotal)}
          info={`Workspaces created ${rangeNote}, per ${periodWord} (demo workspace excluded).`}
          empty={signupTotal === 0}
          emptyText="No sign-ups in this period."
        >
          <Bar data={signupData} options={timeSeriesOptions(c, { legend: false }) as ChartOptions<'bar'>} />
        </ChartCard>
        <ChartCard
          title="Clients by status"
          headline={formatCount(statusTotal)}
          info="Every client right now: active (paid plan running), awaiting first payment, expired (renewal date passed), no plan, legacy trial or suspended."
          empty={statusTotal === 0}
          emptyText="No clients yet."
          linkTo="/super-admin/clients"
          linkLabel="Clients"
        >
          <div className="flex h-full items-center gap-4">
            <div className="relative h-full aspect-square max-w-[50%]">
              <Doughnut data={statusData} options={donutOptions} />
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
              {data.clients_by_status.map((s, i) => (
                <li key={s.key} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusColors[i] }} />
                    <span className="truncate text-gray-700 dark:text-white/80">{s.label}</span>
                  </span>
                  <span className="tabular-nums font-medium text-gray-900 dark:text-white">{formatCount(s.count)}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
        <ChartCard
          title="Clients by plan"
          info="Clients on each plan right now (suspended clients left out). Hover a bar for its count."
          empty={planRows.length === 0}
          emptyText="No clients yet."
          linkTo="/super-admin/plans"
          linkLabel="Plans"
        >
          <Bar data={planData} options={horizontalBarOptions(c, formatCount)} />
        </ChartCard>
      </div>

      {/* Usage & support */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Messages platform-wide"
          headline={formatCount(msgTotal)}
          info={`WhatsApp messages sent and received by all clients ${rangeNote}, per ${periodWord} (demo workspace excluded).`}
          empty={msgTotal === 0}
          emptyText="No messages in this period."
        >
          <Line data={msgData} options={timeSeriesOptions(c) as ChartOptions<'line'>} />
        </ChartCard>
        <ChartCard
          title="Top clients by messages"
          info="The 10 clients that sent and received the most messages in this period."
          empty={data.top_clients.length === 0}
          emptyText="No messages in this period."
        >
          <BarList
            color={c.series[0]}
            rows={data.top_clients.map((t) => ({
              key: t.id,
              label: t.name,
              value: t.messages,
              sub: `${formatCount(t.sent)} sent`,
            }))}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Support tickets"
        headline={`${formatCount(ticketsOpened)} opened · ${formatCount(ticketsSolved)} solved`}
        info={`Tickets clients opened and tickets your team solved ${rangeNote}, per ${periodWord}.`}
        empty={ticketsOpened === 0 && ticketsSolved === 0}
        emptyText="No tickets opened or solved in this period."
        linkTo="/super-admin/tickets"
        linkLabel="Tickets"
        height={220}
      >
        <Bar data={ticketData} options={timeSeriesOptions(c) as ChartOptions<'bar'>} />
      </ChartCard>
    </div>
  );
};

export default PlatformCharts;
