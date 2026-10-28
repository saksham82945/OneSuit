import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { flowsService, accountsService } from '@/services/api';
import { readData, readList } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Workflow, Plus, Trash2, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/** An item of GET /flows -> data: { flows: [...], total, page, limit } (FlowResponse in flows.go). */
export interface WhatsAppFlow {
  id: string;
  whatsapp_account: string; // the account's name
  meta_flow_id?: string;
  name: string;
  status: string; // DRAFT | PUBLISHED | DEPRECATED | BLOCKED
  category?: string;
  json_version?: string;
  preview_url?: string;
  has_local_changes?: boolean;
  created_at: string;
  updated_at?: string;
}

interface AccountOption {
  id: string;
  name: string;
}

/** The backend's `{ status: "error", message }` text, if there is one. */
const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export const FlowsView: React.FC = () => {
  const { t } = useTranslation();

  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [flowCategory, setFlowCategory] = useState('LEAD_GENERATION');
  const [flowAccount, setFlowAccount] = useState('');

  const [flowToDelete, setFlowToDelete] = useState<WhatsAppFlow | null>(null);

  const fetchFlows = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await flowsService.list({ search: searchQuery.trim() || undefined, limit: 100 });
      setFlows(readList<WhatsAppFlow>(res, 'flows'));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load WhatsApp Flows'));
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  // Server-side search; wait for typing to pause before refetching.
  useEffect(() => {
    const timer = setTimeout(fetchFlows, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchFlows, searchQuery]);

  useEffect(() => {
    accountsService
      .list()
      .then((res) => {
        const list = readList<AccountOption>(res, 'accounts');
        setAccounts(list);
        if (list.length > 0) setFlowAccount((current) => current || list[0].name);
      })
      .catch(() => setAccounts([]));
  }, []);

  const handleSync = async () => {
    // POST /flows/sync pulls flows from Meta for one account at a time.
    if (accounts.length === 0) {
      toast.error('Connect a WhatsApp account before syncing flows');
      return;
    }
    setIsSyncing(true);
    let synced = 0;
    const failed: string[] = [];
    for (const account of accounts) {
      try {
        const res = await flowsService.sync(account.name);
        synced += readData<{ synced?: number } | null>(res)?.synced ?? 0;
      } catch (err) {
        failed.push(`${account.name}: ${errorMessage(err, 'sync failed')}`);
      }
    }
    setIsSyncing(false);
    if (failed.length > 0) {
      toast.error(`Failed to sync flows (${failed.join('; ')})`);
    } else {
      toast.success(`Flows synced with Meta (${synced} flow${synced === 1 ? '' : 's'})`);
    }
    fetchFlows();
  };

  const handleDuplicate = async (flow: WhatsAppFlow) => {
    try {
      await flowsService.duplicate(flow.id);
      toast.success('Flow duplicated');
      fetchFlows();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to duplicate flow'));
    }
  };

  const handleCreateFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flowName.trim()) {
      toast.error('Flow name is required');
      return;
    }
    if (!flowAccount) {
      toast.error('Connect a WhatsApp account before creating a flow');
      return;
    }

    try {
      await flowsService.create({
        name: flowName.trim(),
        category: flowCategory,
        whatsapp_account: flowAccount,
        json_version: '6.0',
        screens: [
          {
            id: 'SCREEN_1',
            title: 'Welcome Screen',
            layout: {
              type: 'SingleColumnLayout',
              children: [
                { type: 'TextHeading', text: 'Welcome to our service' },
                { type: 'TextInput', name: 'user_name', label: 'Full Name' },
              ],
            },
          },
        ],
      });
      toast.success('WhatsApp Flow created');
      setCreateDialogOpen(false);
      setFlowName('');
      fetchFlows();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create flow'));
    }
  };

  const handleDelete = async () => {
    if (!flowToDelete) return;
    try {
      await flowsService.delete(flowToDelete.id);
      toast.success('Flow deleted');
      setFlowToDelete(null);
      fetchFlows();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete flow'));
    }
  };

  const columns: Column<WhatsAppFlow>[] = [
    {
      key: 'name',
      label: t('flows.name') || 'Flow Name',
      sortable: true,
      render: (f) => (
        <div className="flex flex-col">
          <span className="font-medium text-white light:text-gray-900">{f.name}</span>
          <span className="text-[11px] text-white/40 light:text-gray-400">{f.whatsapp_account}</span>
        </div>
      ),
    },
    {
      key: 'status',
      label: t('flows.status') || 'Status',
      sortable: true,
      render: (f) => (
        <Badge
          className={
            f.status === 'PUBLISHED'
              ? 'bg-emerald-500/20 text-emerald-400 border-0 text-[10px]'
              : 'bg-amber-500/20 text-amber-400 border-0 text-[10px]'
          }
        >
          {f.status}
        </Badge>
      ),
    },
    {
      key: 'category',
      label: t('flows.category') || 'Category',
      render: (f) => <span className="text-xs text-white/60 light:text-gray-600">{f.category || 'General'}</span>,
    },
    {
      key: 'created_at',
      label: t('flows.created') || 'Created',
      render: (f) => (
        <span className="text-xs text-white/40 light:text-gray-400">
          {new Date(f.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (f) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Copy} label="Duplicate" onClick={() => handleDuplicate(f)} />
          <IconButton
            icon={Trash2}
            label="Delete"
            className="hover:text-red-400"
            onClick={() => setFlowToDelete(f)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('flows.title') || 'WhatsApp Interactive Flows'}
        subtitle={t('flows.subtitle') || 'Design native in-app WhatsApp forms, menus and checkout flows'}
        icon={Workflow}
        iconGradient="bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/20"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isSyncing}
              onClick={handleSync}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Flows
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Flow
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Native Interactive Flows</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Deliver rich app-like interactive screen sequences within WhatsApp
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search flows..."
                className="w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              items={flows}
              columns={columns}
              isLoading={isLoading}
              emptyIcon={Workflow}
              emptyTitle="No flows found"
              emptyDescription="Create your first interactive form or survey flow"
              emptyAction={
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Flow
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreateFlow}>
            <DialogHeader>
              <DialogTitle>Create WhatsApp Flow</DialogTitle>
              <DialogDescription>
                Build multi-screen interactive form native to WhatsApp mobile app.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="fName" className="text-xs">Flow Name *</Label>
                <Input
                  id="fName"
                  placeholder="e.g. customer_lead_capture"
                  value={flowName}
                  onChange={(e) => setFlowName(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={flowCategory} onValueChange={setFlowCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LEAD_GENERATION">Lead Generation</SelectItem>
                    <SelectItem value="APPOINTMENT_BOOKING">Appointment Booking</SelectItem>
                    <SelectItem value="SURVEY">Customer Survey</SelectItem>
                    <SelectItem value="CONTACT_US">Contact Us</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">WhatsApp Account</Label>
                <Select value={flowAccount} onValueChange={setFlowAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id || a.name} value={a.name}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                Create Flow
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!flowToDelete}
        onOpenChange={(open) => !open && setFlowToDelete(null)}
        title="Delete Flow"
        itemName={flowToDelete?.name}
        onConfirm={handleDelete}
      />
    </div>
  );
};
export default FlowsView;
