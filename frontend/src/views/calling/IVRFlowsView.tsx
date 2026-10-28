import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { readData, readList, readTotal } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { ErrorState } from '@/components/shared/ErrorState';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Pencil, Plus, RefreshCw, Trash2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage, callingApi, emptyFlowData, formatDateTime, type IVRFlow } from './callingApi';
import { IVRFlowEditor } from './IVRFlowEditor';

const PAGE_SIZE = 50;

interface CreateForm {
  name: string;
  description: string;
  whatsapp_account: string;
  is_active: boolean;
  is_call_start: boolean;
  is_outgoing_end: boolean;
}

const blankForm = (account = ''): CreateForm => ({
  name: '',
  description: '',
  whatsapp_account: account,
  is_active: true,
  is_call_start: false,
  is_outgoing_end: false,
});

const IVRFlowsList: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [flows, setFlows] = useState<IVRFlow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [accountFilter, setAccountFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{ name: string }[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(blankForm());
  const [creating, setCreating] = useState(false);

  const [flowToDelete, setFlowToDelete] = useState<IVRFlow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFlows = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await callingApi.listIVRFlows({
        page,
        limit: PAGE_SIZE,
        account: accountFilter !== 'all' ? accountFilter : undefined,
      });
      setFlows(readList<IVRFlow>(res, 'ivr_flows'));
      setTotal(readTotal(res, 'ivr_flows'));
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Failed to load IVR flows.'));
    } finally {
      setIsLoading(false);
    }
  }, [page, accountFilter]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  useEffect(() => {
    callingApi
      .listAccounts()
      .then((res) => setAccounts(readList<{ name: string }>(res, 'accounts')))
      .catch(() => undefined)
      .finally(() => setAccountsLoaded(true));
  }, []);

  const openCreate = () => {
    setForm(blankForm(accounts[0]?.name || ''));
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!form.whatsapp_account) {
      toast.error('Choose a WhatsApp account');
      return;
    }
    setCreating(true);
    try {
      const res = await callingApi.createIVRFlow({
        name: form.name.trim(),
        description: form.description.trim(),
        whatsapp_account: form.whatsapp_account,
        is_active: form.is_active,
        is_call_start: form.is_active && form.is_call_start,
        is_outgoing_end: form.is_active && form.is_outgoing_end,
        menu: emptyFlowData(),
      });
      const created = readData<IVRFlow>(res);
      toast.success('IVR flow created');
      setCreateOpen(false);
      if (created?.id) navigate(`/calling/ivr-flows/${created.id}/edit`);
      else fetchFlows();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create IVR flow'));
    } finally {
      setCreating(false);
    }
  };

  // PUT always writes all three flags, so send the current values with the one being changed.
  const updateFlags = async (
    flow: IVRFlow,
    patch: Partial<Pick<IVRFlow, 'is_active' | 'is_call_start' | 'is_outgoing_end'>>,
    successMessage: string
  ) => {
    setTogglingId(flow.id);
    try {
      await callingApi.updateIVRFlow(flow.id, {
        is_active: flow.is_active,
        is_call_start: flow.is_call_start,
        is_outgoing_end: flow.is_outgoing_end,
        ...patch,
      });
      toast.success(successMessage);
      // Setting a call-start / post-call flow clears the flag on the account's other flows, so reload.
      await fetchFlows();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update IVR flow'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!flowToDelete) return;
    setDeleting(true);
    try {
      await callingApi.deleteIVRFlow(flowToDelete.id);
      toast.success('IVR flow deleted');
      setFlowToDelete(null);
      if (flows.length === 1 && page > 1) setPage(page - 1);
      else fetchFlows();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to delete IVR flow'));
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<IVRFlow>[] = [
    {
      key: 'name',
      label: 'Flow',
      render: (flow) => (
        <Link to={`/calling/ivr-flows/${flow.id}/edit`} className="block min-w-0 group">
          <p className="font-medium text-white text-xs group-hover:underline light:text-gray-900">{flow.name}</p>
          {flow.description && <p className="text-[11px] text-white/40 truncate max-w-xs light:text-gray-400">{flow.description}</p>}
        </Link>
      ),
    },
    {
      key: 'whatsapp_account',
      label: 'Account',
      render: (flow) => <span className="text-xs text-white/60 light:text-gray-600">{flow.whatsapp_account}</span>,
    },
    {
      key: 'is_active',
      label: 'Enabled',
      render: (flow) => (
        <Switch
          checked={flow.is_active}
          disabled={togglingId === flow.id}
          aria-label={`${flow.is_active ? 'Disable' : 'Enable'} ${flow.name}`}
          onCheckedChange={(v) => updateFlags(flow, { is_active: v }, v ? 'Flow enabled' : 'Flow disabled')}
        />
      ),
    },
    {
      key: 'is_call_start',
      label: 'Incoming Call Start',
      render: (flow) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={flow.is_call_start}
            disabled={!flow.is_active || togglingId === flow.id}
            aria-label={`Use ${flow.name} as the incoming call start`}
            onCheckedChange={(v) =>
              updateFlags(
                flow,
                { is_call_start: v },
                v ? `${flow.name} now answers incoming calls on ${flow.whatsapp_account}` : 'Removed as call start'
              )
            }
          />
          {flow.is_active && flow.is_call_start && (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px]">CALL START</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'is_outgoing_end',
      label: 'Outgoing Post-Call',
      render: (flow) => (
        <Switch
          checked={flow.is_outgoing_end}
          disabled={!flow.is_active || togglingId === flow.id}
          aria-label={`Run ${flow.name} after outgoing calls`}
          onCheckedChange={(v) =>
            updateFlags(flow, { is_outgoing_end: v }, v ? 'Set as outgoing post-call flow' : 'Removed as outgoing post-call flow')
          }
        />
      ),
    },
    {
      key: 'nodes',
      label: 'Steps',
      render: (flow) => <span className="text-xs font-mono text-white/60 light:text-gray-600">{flow.menu?.nodes?.length || 0}</span>,
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (flow) => <span className="text-xs text-white/40 whitespace-nowrap light:text-gray-400">{formatDateTime(flow.updated_at)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (flow) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Pencil} label={`Edit ${flow.name}`} onClick={() => navigate(`/calling/ivr-flows/${flow.id}/edit`)} />
          <IconButton icon={Trash2} label={`Delete ${flow.name}`} className="hover:text-red-400" onClick={() => setFlowToDelete(flow)} />
        </div>
      ),
    },
  ];

  const noAccounts = accountsLoaded && accounts.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.ivrFlows') || 'IVR Flows'}
        subtitle="Voice menus that answer WhatsApp calls: greetings, keypad options, transfers and business hours"
        icon={Workflow}
        iconGradient="bg-gradient-to-br from-indigo-500 to-blue-600 shadow-indigo-500/20"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={fetchFlows} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Flow
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Voice Flows</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Each account uses one enabled "call start" flow for incoming calls and, optionally, one post-call flow for outgoing calls.
                </CardDescription>
              </div>
              {accounts.length > 1 && (
                <Select
                  value={accountFilter}
                  onValueChange={(v) => {
                    setAccountFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-48" aria-label="Filter by account">
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.name} value={a.name}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadError && !isLoading ? (
              <ErrorState title="Couldn't load IVR flows" description={loadError} onRetry={fetchFlows} />
            ) : (
              <DataTable
                items={flows}
                columns={columns}
                isLoading={isLoading}
                currentPage={page}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                emptyIcon={Workflow}
                emptyTitle="No IVR flows yet"
                emptyDescription="Create a flow to greet callers, offer keypad options and route them to the right team."
                emptyAction={
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create your first flow
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px] text-white light:text-gray-900">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create IVR Flow</DialogTitle>
              <DialogDescription>Name the flow and pick the WhatsApp account it answers. You'll add its steps next.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ivr-name" className="text-xs">
                  Name *
                </Label>
                <Input
                  id="ivr-name"
                  placeholder="e.g. Main menu"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">WhatsApp account *</Label>
                {noAccounts ? (
                  <p className="text-xs text-amber-300/80 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                    No WhatsApp accounts yet.{' '}
                    <Link to="/settings/accounts" className="underline hover:text-amber-200">
                      Add an account
                    </Link>{' '}
                    first, then create its IVR flow.
                  </p>
                ) : (
                  <Select value={form.whatsapp_account} onValueChange={(v) => setForm((f) => ({ ...f, whatsapp_account: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ivr-desc" className="text-xs">
                  Description
                </Label>
                <Textarea
                  id="ivr-desc"
                  rows={2}
                  placeholder="What this flow is for"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="space-y-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 light:border-gray-200 light:bg-gray-50">
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>
                    <span className="block text-white light:text-gray-900">Enabled</span>
                    <span className="block text-[11px] text-white/40 light:text-gray-400">Disabled flows never run.</span>
                  </span>
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>
                    <span className="block text-white light:text-gray-900">Incoming call start</span>
                    <span className="block text-[11px] text-white/40 light:text-gray-400">Answer this account's incoming calls with this flow (replaces the current one).</span>
                  </span>
                  <Switch
                    checked={form.is_active && form.is_call_start}
                    disabled={!form.is_active}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_call_start: v }))}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>
                    <span className="block text-white light:text-gray-900">Outgoing post-call</span>
                    <span className="block text-[11px] text-white/40 light:text-gray-400">Run this flow when an agent ends an outgoing call.</span>
                  </span>
                  <Switch
                    checked={form.is_active && form.is_outgoing_end}
                    disabled={!form.is_active}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_outgoing_end: v }))}
                  />
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || noAccounts} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create & add steps
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!flowToDelete}
        onOpenChange={(open) => !open && setFlowToDelete(null)}
        title="Delete IVR Flow"
        itemName={flowToDelete?.name}
        description={
          flowToDelete?.is_call_start
            ? `"${flowToDelete.name}" answers incoming calls on ${flowToDelete.whatsapp_account}. After deleting it, calls on that account won't get an IVR until another flow is set as call start.`
            : undefined
        }
        isSubmitting={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
};

/** /calling/ivr-flows lists flows; /calling/ivr-flows/:id/edit opens the step editor. */
export const IVRFlowsView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return id ? <IVRFlowEditor key={id} flowId={id} /> : <IVRFlowsList />;
};

export default IVRFlowsView;
