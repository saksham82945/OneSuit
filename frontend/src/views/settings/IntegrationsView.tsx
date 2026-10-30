import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Cable, Check, Copy, ExternalLink, Plug, RefreshCw, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';
import {
  integrationsService,
  type IntegrationConnection,
  type IntegrationDefinition,
  type IntegrationLead,
} from '@/services/integrations';
import { cn } from '@/lib/utils';

const card = 'rounded-2xl border border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900';
const field = 'bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900';

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Copyable lead URL. */
const LeadUrl: React.FC<{ url: string }> = ({ url }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} className={cn(field, 'h-8 font-mono text-[11px]')} onFocus={(e) => e.target.select()} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 border-white/10 light:border-gray-200"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error('Copy failed; select the link and copy it');
          }
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
};

/** Settings → Integrations: connect lead sources such as IndiaMART and JustDial. */
export const IntegrationsView: React.FC = () => {
  const canWrite = useAuthStore((s) => s.hasPermission('contacts', 'write'));
  const [defs, setDefs] = useState<IntegrationDefinition[] | null>(null);
  const [conns, setConns] = useState<IntegrationConnection[]>([]);
  const [leads, setLeads] = useState<IntegrationLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<IntegrationDefinition | null>(null);
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<IntegrationConnection | null>(null);
  const [filter, setFilter] = useState('all');

  const load = () => {
    setError(null);
    Promise.all([integrationsService.list(), integrationsService.leads()])
      .then(([d, l]) => {
        setDefs(d.integrations);
        setConns(d.connections);
        setLeads(l);
      })
      .catch((e) => setError(errorText(e, 'Could not load integrations')));
  };
  useEffect(load, []);

  const defByKey = useMemo(() => new Map((defs ?? []).map((d) => [d.key, d])), [defs]);
  const replace = (c: IntegrationConnection) => setConns((list) => list.map((x) => (x.id === c.id ? c : x)));

  const connect = async () => {
    if (!connecting) return;
    setBusy(true);
    try {
      const c = await integrationsService.connect({ definition_key: connecting.key, tag: tag.trim() });
      setConns((list) => [...list, c]);
      setConnecting(null);
      toast.success(`${connecting.name} connected. Copy your lead URL into ${connecting.name}.`);
    } catch (err) {
      toast.error(errorText(err, 'Could not connect'));
    } finally {
      setBusy(false);
    }
  };

  const update = async (c: IntegrationConnection, data: Parameters<typeof integrationsService.update>[1], msg: string) => {
    try {
      replace(await integrationsService.update(c.id, data));
      toast.success(msg);
    } catch (err) {
      toast.error(errorText(err, 'Could not save'));
    }
  };

  const disconnect = async () => {
    if (!toRemove) return;
    try {
      await integrationsService.disconnect(toRemove.id);
      setConns((list) => list.filter((c) => c.id !== toRemove.id));
      toast.success('Disconnected');
    } catch (err) {
      toast.error(errorText(err, 'Could not disconnect'));
    } finally {
      setToRemove(null);
    }
  };

  const shownLeads = filter === 'all' ? leads : leads.filter((l) => l.connection_id === filter);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Integrations"
        subtitle="Bring leads from IndiaMART, JustDial, your website and more straight into your contacts"
        icon={Cable}
        iconGradient="bg-gradient-to-br from-orange-500 to-rose-500 shadow-orange-500/20"
        actions={
          <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        }
      />
      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load integrations" description={error} onRetry={load} /></div>
      ) : !defs ? (
        <div className="p-12 text-center text-sm text-white/40 light:text-gray-400">Loading…</div>
      ) : (
        <div className="p-4 sm:p-6 space-y-8 max-w-6xl w-full">
          {/* Connected */}
          {conns.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Connected</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {conns.map((c) => {
                  const d = defByKey.get(c.definition_key);
                  return (
                    <div key={c.id} className={cn(card, 'p-5 space-y-3')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: d?.color || '#455a64' }}>
                            {initials(d?.name ?? c.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{c.name}</p>
                            <p className="text-[11px] text-white/50 light:text-gray-500">
                              {c.lead_count} leads{c.last_lead_at && ` · last ${new Date(c.last_lead_at).toLocaleString()}`}
                            </p>
                          </div>
                        </div>
                        <Badge className={cn('border-0 shadow-none text-[10px]', c.is_active ? 'bg-emerald-500/15 text-emerald-400 light:text-emerald-700' : 'bg-amber-500/15 text-amber-400 light:text-amber-700')}>
                          {c.is_active ? 'Receiving leads' : 'Paused'}
                        </Badge>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[11px] text-white/60 light:text-gray-600">Your lead URL — paste this in {d?.name ?? 'the lead source'}</Label>
                        <LeadUrl url={c.lead_url} />
                      </div>
                      {d?.setup_steps && (
                        <ol className="list-decimal list-inside text-[11px] text-white/50 light:text-gray-500 space-y-0.5">
                          {d.setup_steps.split('\n').filter(Boolean).map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ol>
                      )}
                      <p className="text-[11px] text-white/50 light:text-gray-500">New leads are added to Contacts with the tag <strong>{c.tag || d?.name}</strong>.</p>
                      {canWrite && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <label className="flex items-center gap-2 text-xs">
                            <Switch checked={c.is_active} onCheckedChange={(v) => update(c, { is_active: v }, v ? 'Receiving leads again' : 'Paused')} />
                            Active
                          </label>
                          <Button size="sm" variant="outline" className="h-7 text-xs border-white/10 light:border-gray-200 ml-auto" onClick={() => update(c, { rotate_link: true }, 'New lead URL made. Update it in the lead source.')}>
                            <RefreshCw className="h-3 w-3 mr-1" /> New URL
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs border-white/10 light:border-gray-200 hover:text-rose-400" onClick={() => setToRemove(c)}>
                            <Trash2 className="h-3 w-3 mr-1" /> Disconnect
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Available */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Available integrations</h2>
            {defs.length === 0 ? (
              <p className="text-sm text-white/50 light:text-gray-500">No integrations are available yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {defs.map((d) => {
                  const count = conns.filter((c) => c.definition_key === d.key).length;
                  return (
                    <div key={d.key} className={cn(card, 'group p-5 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all')}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white shadow" style={{ background: d.color || '#455a64' }}>
                          {initials(d.name)}
                        </span>
                        <div>
                          <p className="font-semibold">{d.name}</p>
                          <p className="text-[11px] text-white/40 light:text-gray-500">{d.category}</p>
                        </div>
                      </div>
                      <p className="text-xs text-white/60 light:text-gray-600 flex-1">{d.description}</p>
                      <div className="flex items-center gap-2">
                        {canWrite && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-500 text-white"
                            onClick={() => {
                              setConnecting(d);
                              setTag(d.name);
                            }}
                          >
                            <Plug className="h-3.5 w-3.5 mr-1.5" /> {count > 0 ? 'Connect another' : 'Connect'}
                          </Button>
                        )}
                        {d.docs_url && (
                          <a href={d.docs_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline light:text-sky-700">
                            Website <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Leads */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Latest leads</h2>
              {conns.length > 1 && (
                <select value={filter} onChange={(e) => setFilter(e.target.value)} className={cn(field, 'h-8 rounded-md border px-2 text-xs')}>
                  <option value="all">All integrations</option>
                  {conns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className={cn(card, 'overflow-x-auto')}>
              <table className="w-full text-sm">
                <thead className="border-b border-white/[0.06] light:border-gray-200 text-[11px] uppercase tracking-wider text-white/45 light:text-gray-500">
                  <tr>
                    {['Received', 'Source', 'Name', 'Phone', 'Email', 'City', 'Product / message'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] light:divide-gray-100">
                  {shownLeads.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-xs text-white/40 light:text-gray-500">No leads yet. They show up here as soon as a connected source sends one.</td></tr>
                  ) : (
                    shownLeads.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-xs">{defByKey.get(l.definition_key)?.name ?? l.definition_key}</td>
                        <td className="px-3 py-2.5 text-xs font-medium">{l.name || '—'}</td>
                        <td className="px-3 py-2.5 text-xs tabular-nums">{l.phone ? `+${l.phone}` : '—'}</td>
                        <td className="px-3 py-2.5 text-xs break-all">{l.email || '—'}</td>
                        <td className="px-3 py-2.5 text-xs">{l.city || '—'}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[320px]">
                          {l.subject && <p className="font-medium">{l.subject}</p>}
                          {l.message && <p className="text-white/50 light:text-gray-500 line-clamp-2">{l.message}</p>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <Dialog open={!!connecting} onOpenChange={(o) => !o && setConnecting(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Connect {connecting?.name}</DialogTitle>
            <DialogDescription>You'll get a private lead URL to paste into {connecting?.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label className="text-xs">Tag for these contacts</Label>
            <Input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={50} className={field} />
            <p className="text-[11px] text-white/40 light:text-gray-500">Every lead from here is added to Contacts with this tag.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConnecting(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={busy} onClick={connect}>
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Disconnect integration"
        itemName={toRemove?.name}
        onConfirm={disconnect}
      />
    </div>
  );
};

export default IntegrationsView;
