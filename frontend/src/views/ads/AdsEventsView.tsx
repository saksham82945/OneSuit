import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  CalendarDays,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import { api } from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import {
  adsApi,
  errorMessage,
  formatDate,
  formatMoney,
  formatNumber,
  useAdsSetup,
  type AdEventDefinition,
  type AdEventRecord,
  type EventSource,
} from "./adsApi";
import {
  Field,
  inputCls,
  nativeSelectCls,
  outlineBtnCls,
  primaryBtnCls,
  textareaCls,
} from "./AdsShared";
import { AdsPage } from "./AdsPageShell";

const SOURCES: { value: EventSource; label: string }[] = [
  { value: "server", label: "Server (Conversions API)" },
  { value: "website", label: "Website" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "offline", label: "Offline / CRM" },
];
const sourceLabel = (s: string) =>
  SOURCES.find((x) => x.value === s)?.label || s;
const SUGGESTED = [
  "Lead",
  "Purchase",
  "AddToCart",
  "InitiateCheckout",
  "ConversationStarted",
];

/** Empty-state illustration built from icons (no image files). */
const EventsIllustration: React.FC<{ className?: string }> = ({
  className,
}) => (
  <div className={cn("relative mx-auto h-20 w-24", className)} aria-hidden>
    <div className="absolute left-1 top-3 flex h-14 w-16 rotate-[-8deg] items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <CalendarDays className="h-6 w-6 text-gray-300" />
    </div>
    <div className="absolute right-1 top-1 flex h-14 w-16 rotate-[6deg] items-center justify-center rounded-xl border border-teal-200 bg-spruce-light shadow-sm dark:border-teal-900 dark:bg-teal-950/50">
      <Activity className="h-6 w-6 text-spruce dark:text-teal-300" />
    </div>
    <div className="absolute -bottom-1 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-spruce-dark text-white shadow">
      <Sparkles className="h-3.5 w-3.5" />
    </div>
  </div>
);

type PaneTab = "overview" | "setup";

export const AdsEventsView: React.FC = () => {
  const { setup } = useAdsSetup();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission("campaigns", "write");

  const [events, setEvents] = useState<AdEventDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paneTab, setPaneTab] = useState<PaneTab>("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdEventDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adsApi.listEventDefinitions();
      setEvents(list);
      setSelectedId((cur) =>
        cur && list.some((e) => e.id === cur) ? cur : list[0]?.id || null,
      );
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, "Failed to load events"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? events.filter((e) => e.name.toLowerCase().includes(q)) : events;
  }, [events, search]);
  const selected = events.find((e) => e.id === selectedId) || null;

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await adsApi.deleteEventDefinition(toDelete.id);
      toast.success("Event deleted");
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete event"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdsPage
      title="Events"
      setup={setup}
      bodyClassName="flex flex-1 flex-col md:flex-row"
    >
      {/* List column */}
      <aside className="flex w-full shrink-0 flex-col border-b border-gray-200 bg-white dark:border-white/[0.08] dark:bg-[#0d1312] md:w-80 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-sm font-bold">Events</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Refresh events"
              onClick={load}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/[0.06]"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
            {canWrite && (
              <button
                type="button"
                aria-label="Create event"
                onClick={() => setCreateOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/[0.06]"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="relative px-4 pb-3 pt-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            className={cn(inputCls, "pl-8")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by event name"
            aria-label="Search by event name"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 md:max-h-[calc(100vh-11rem)]">
          {loadError ? (
            <ErrorState
              title="Couldn't load events"
              description={loadError}
              onRetry={load}
            />
          ) : loading && events.length === 0 ? (
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="mx-2 my-1.5 h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.06]"
              />
            ))
          ) : events.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <EventsIllustration />
              <p className="mt-4 text-sm font-semibold">No events yet</p>
              {canWrite && (
                <Button
                  size="sm"
                  className={cn(primaryBtnCls, "mt-3")}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Event
                </Button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-500">
              No events match “{search}”.
            </p>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedId(e.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  e.id === selectedId
                    ? "bg-spruce-light dark:bg-teal-950/40"
                    : "hover:bg-gray-50 dark:hover:bg-white/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    e.count_30d > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-400 dark:bg-white/[0.06]",
                  )}
                >
                  <Zap className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-gray-900 dark:text-white">
                    {e.name}
                  </span>
                  <span className="block truncate text-[11px] text-gray-400">
                    {sourceLabel(e.source)}
                  </span>
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-gray-500">
                  {formatNumber(e.count_7d)}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Detail pane */}
      <section className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <>
            <div className="border-b border-gray-200 bg-white px-5 py-4 dark:border-white/[0.08] dark:bg-[#0d1312]">
              <h2 className="text-lg font-bold text-gray-400">No Events</h2>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <EventsIllustration className="scale-125" />
              <p className="mt-6 text-base font-bold">No events yet</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Create your first event to start tracking events and
                conversions.
              </p>
              {canWrite && (
                <Button
                  size="sm"
                  className={cn(primaryBtnCls, "mt-4")}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Event
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-gray-200 bg-white px-5 pt-4 dark:border-white/[0.08] dark:bg-[#0d1312]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">
                    {selected.name}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selected.description || "No description"} ·{" "}
                    {sourceLabel(selected.source)} · Created{" "}
                    {formatDate(selected.created_at)}
                  </p>
                </div>
                {canWrite && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(outlineBtnCls, "hover:text-red-600")}
                    onClick={() => setToDelete(selected)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                )}
              </div>
              <div className="mt-3 flex gap-5" role="tablist">
                {(["overview", "setup"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={paneTab === t}
                    onClick={() => setPaneTab(t)}
                    className={cn(
                      "-mb-px border-b-2 pb-2.5 text-sm font-semibold capitalize",
                      paneTab === t
                        ? "border-spruce text-spruce-dark dark:border-teal-400 dark:text-teal-200"
                        : "border-transparent text-gray-500 hover:text-gray-800",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 space-y-4 p-5">
              {paneTab === "overview" ? (
                <EventOverview
                  event={selected}
                  currency={setup?.currency || "INR"}
                />
              ) : (
                <EventSetup
                  event={selected}
                  canWrite={canWrite}
                  onSent={load}
                />
              )}
            </div>
          </>
        )}
      </section>

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(e) => {
          setSelectedId(e.id);
          setPaneTab("setup");
          load();
        }}
      />
      <DeleteConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete event"
        itemName={toDelete?.name}
        isSubmitting={deleting}
        onConfirm={remove}
      />
    </AdsPage>
  );
};

const EventOverview: React.FC<{
  event: AdEventDefinition;
  currency: string;
}> = ({ event, currency }) => {
  const [recent, setRecent] = useState<AdEventRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    adsApi
      .getEvents({ event_name: event.name })
      .then((r) => alive && setRecent(r.recent.slice(0, 10)))
      .catch(() => alive && setRecent([]));
    return () => {
      alive = false;
    };
  }, [event.name, event.count_30d]);

  const stats = [
    { label: "Today", value: event.count_today },
    { label: "Last 7 days", value: event.count_7d },
    { label: "Last 30 days", value: event.count_30d },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]"
          >
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {s.label}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {formatNumber(s.value)}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Last received
          </p>
          <p className="mt-1.5 text-sm font-semibold">
            {event.last_seen_at
              ? formatDate(event.last_seen_at, true)
              : "Never"}
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
        <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-bold dark:border-white/[0.06]">
          Recent events
        </h3>
        {recent === null ? (
          <p className="flex items-center gap-1.5 px-4 py-6 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
            Nothing received yet. Open the Setup tab to see how to send this
            event.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold">
                    {r.contact_name || "Unknown contact"}
                  </span>
                  {r.campaign_name && (
                    <span className="text-gray-400"> · {r.campaign_name}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3 text-gray-500">
                  {r.value ? (
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {formatMoney(r.value, r.currency || currency)}
                    </span>
                  ) : null}
                  {formatDate(r.created_at, true)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

const EventSetup: React.FC<{
  event: AdEventDefinition;
  canWrite: boolean;
  onSent: () => void;
}> = ({ event, canWrite, onSent }) => {
  const [sending, setSending] = useState(false);
  const endpoint = useMemo(() => {
    try {
      return `${new URL(String(api.defaults.baseURL || "/api"), window.location.origin).toString().replace(/\/$/, "")}/ads/events`;
    } catch {
      return "/api/ads/events";
    }
  }, []);
  const payload = JSON.stringify(
    {
      event_name: event.name,
      value: 499,
      currency: "INR",
      contact_name: "Asha Verma",
    },
    null,
    2,
  );
  const curl = `curl -X POST '${endpoint}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-API-Key: <your API key>' \\\n  -d '${JSON.stringify({ event_name: event.name, value: 499, currency: "INR" })}'`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const sendTest = async () => {
    setSending(true);
    try {
      await api.post("/ads/events", {
        event_name: event.name,
        contact_name: "Test event",
      });
      toast.success("Test event recorded");
      onSent();
    } catch (err) {
      toast.error(errorMessage(err, "Could not send a test event"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <h3 className="text-sm font-bold">Send this event</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Fire{" "}
          <span className="font-semibold text-gray-800 dark:text-gray-200">
            {event.name}
          </span>{" "}
          from your website, server or CRM whenever it happens. Use an API key
          from Settings → API keys.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] dark:bg-white/[0.04]">
          <span className="rounded bg-spruce-dark px-1.5 py-0.5 font-sans text-[10px] font-bold text-white">
            POST
          </span>
          <span className="min-w-0 flex-1 truncate">{endpoint}</span>
          <button
            type="button"
            aria-label="Copy endpoint"
            onClick={() => copy(endpoint)}
            className="text-gray-400 hover:text-gray-700"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-3 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
          Example payload
        </p>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">
          {payload}
        </pre>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
            cURL
          </p>
          <button
            type="button"
            onClick={() => copy(curl)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-spruce-dark hover:underline dark:text-teal-300"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">
          {curl}
        </pre>
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            className={cn(outlineBtnCls, "mt-3")}
            onClick={sendTest}
            disabled={sending}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}{" "}
            Send test event
          </Button>
        )}
      </div>
      <div className="rounded-xl border border-teal-200/70 bg-spruce-light/60 p-4 text-xs leading-relaxed text-spruce-dark dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200">
        <p className="font-semibold">Conversions API (CAPI)</p>
        <p className="mt-1">
          Once Facebook is connected, recorded events are shared with Meta
          through the Conversions API so your ads optimise for people who
          actually convert. They count towards “Total CAPI Signals” in Ads
          Manager.
        </p>
      </div>
    </div>
  );
};

const CreateEventDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (e: AdEventDefinition) => void;
}> = ({ open, onOpenChange, onCreated }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<EventSource>("server");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName("");
      setDescription("");
      setSource("server");
      setError(null);
    }
  }

  const save = async () => {
    const n = name.trim();
    if (!n) return setError("Give the event a name.");
    if (!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(n))
      return setError(
        "Use letters, numbers and underscores only, starting with a letter (e.g. Booked_Demo).",
      );
    setSaving(true);
    setError(null);
    try {
      const created = await adsApi.createEventDefinition({
        name: n,
        description: description.trim(),
        source,
      });
      toast.success("Event created");
      onOpenChange(false);
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err, "Could not create the event"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md rounded-2xl">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base">Create event</DialogTitle>
          <DialogDescription className="text-xs">
            Track a conversion such as a purchase, booking or sign-up.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field
            label="Event name"
            htmlFor="ev-name"
            required
            hint="Letters, numbers and underscores. Standard names help Meta optimise."
          >
            <Input
              id="ev-name"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Purchase"
              maxLength={50}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setName(s)}
                className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-teal-300 hover:text-spruce-dark dark:border-white/10 dark:text-gray-300"
              >
                {s}
              </button>
            ))}
          </div>
          <Field label="Source" htmlFor="ev-source">
            <select
              id="ev-source"
              className={nativeSelectCls}
              value={source}
              onChange={(e) => setSource(e.target.value as EventSource)}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" htmlFor="ev-desc">
            <Textarea
              id="ev-desc"
              rows={2}
              className={textareaCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              maxLength={500}
            />
          </Field>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200"
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            className={outlineBtnCls}
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={primaryBtnCls}
            onClick={save}
            disabled={saving}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}{" "}
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdsEventsView;
