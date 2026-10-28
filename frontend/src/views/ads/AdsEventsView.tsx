import React, { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarCheck, Contact, Eye, MessageCircle, RefreshCw, ShoppingCart, UserPlus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { ErrorState } from '@/components/shared/ErrorState';
import { cn } from '@/lib/utils';
import { adsApi, errorMessage, formatDate, formatMoney, formatNumber, useAdsSetup, type AdEventRecord, type AdEventSummary } from './adsApi';
import { AdsPage, EmptyCard, cardCls, outlineBtnCls } from './AdsShared';

const EVENT_ICONS: Record<string, React.ElementType> = {
  Lead: UserPlus,
  Purchase: ShoppingCart,
  Contact: Contact,
  ViewContent: Eye,
  Schedule: CalendarCheck,
  ConversationStarted: MessageCircle,
};

export const AdsEventsView: React.FC = () => {
  const { setup } = useAdsSetup();
  const [events, setEvents] = useState<AdEventSummary[]>([]);
  const [recent, setRecent] = useState<AdEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adsApi.getEvents();
      setEvents(res.events);
      setRecent(res.recent);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load events'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasActivity = events.some((e) => e.count_30d > 0) || recent.length > 0;

  const columns: Column<AdEventRecord>[] = [
    {
      key: 'event_name',
      label: 'Event',
      render: (e) => {
        const Icon = EVENT_ICONS[e.event_name] || Zap;
        return (
          <span className="inline-flex items-center gap-2 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
            <Icon className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /> {e.event_name}
          </span>
        );
      },
    },
    { key: 'contact_name', label: 'Contact', render: (e) => e.contact_name || <span className="text-gray-400">—</span> },
    { key: 'campaign_name', label: 'Ad', render: (e) => e.campaign_name || <span className="text-gray-400">—</span> },
    {
      key: 'value',
      label: 'Value',
      align: 'right',
      render: (e) => (e.value ? formatMoney(e.value, e.currency || setup?.currency || 'INR') : <span className="text-gray-400">—</span>),
    },
    { key: 'created_at', label: 'When', align: 'right', render: (e) => <span className="text-gray-500 whitespace-nowrap">{formatDate(e.created_at, true)}</span> },
  ];

  return (
    <AdsPage
      title="Events"
      subtitle="Conversions your ads drive — leads, chats and purchases"
      icon={Activity}
      setup={setup}
      actions={
        <Button variant="outline" size="sm" className={outlineBtnCls} onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} /> Refresh
        </Button>
      }
    >
      {loadError ? (
        <div className={cardCls}>
          <ErrorState title="Couldn't load events" description={loadError} onRetry={load} />
        </div>
      ) : (
        <>
          {!loading && !hasActivity && (
            <EmptyCard
              icon={Activity}
              title="No events yet"
              description="Events arrive once your ads are running: every lead, WhatsApp conversation and purchase attributed to an ad is recorded here and shared with Meta to optimise delivery."
            />
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-bold">Standard events</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {loading && events.length === 0
                ? [0, 1, 2].map((i) => <div key={i} className={cn(cardCls, 'h-32 animate-pulse')} />)
                : events.map((e) => {
                    const Icon = EVENT_ICONS[e.name] || Zap;
                    const active = e.count_30d > 0;
                    return (
                      <article key={e.name} className={cn(cardCls, 'p-4')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                                active ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300' : 'bg-gray-100 text-gray-400 dark:bg-white/[0.06]'
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold">{e.name}</h3>
                              <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400 line-clamp-2">{e.description}</p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400'
                            )}
                          >
                            {active ? 'Receiving' : 'No data'}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-gray-50 py-1.5 dark:bg-white/[0.03]">
                            <p className="text-sm font-bold tabular-nums">{formatNumber(e.count_7d)}</p>
                            <p className="text-[10px] text-gray-400">7 days</p>
                          </div>
                          <div className="rounded-lg bg-gray-50 py-1.5 dark:bg-white/[0.03]">
                            <p className="text-sm font-bold tabular-nums">{formatNumber(e.count_30d)}</p>
                            <p className="text-[10px] text-gray-400">30 days</p>
                          </div>
                          <div className="rounded-lg bg-gray-50 py-1.5 dark:bg-white/[0.03]">
                            <p className="text-[11px] font-semibold leading-5 truncate px-1">{e.last_seen_at ? formatDate(e.last_seen_at) : '—'}</p>
                            <p className="text-[10px] text-gray-400">Last seen</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold">Recent events</h2>
            <DataTable
              items={recent}
              columns={columns}
              isLoading={loading}
              emptyIcon={Zap}
              emptyTitle="No recent events"
              emptyDescription="The latest conversions from your ads will be listed here."
            />
          </section>
        </>
      )}
    </AdsPage>
  );
};

export default AdsEventsView;
