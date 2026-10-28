import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
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
import { Key, Plus, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';

export interface APIKeyItem {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at?: string;
}

export const APIKeysView: React.FC = () => {
  const { t } = useTranslation();

  const [keys, setKeys] = useState<APIKeyItem[]>([
    {
      id: 'k-1',
      name: 'Zapier Lead Ingestion Webhook Key',
      prefix: 'whm_live_9a8f2...',
      created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
      last_used_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'k-2',
      name: 'Backend CRM Integration Token',
      prefix: 'whm_live_7c1d4...',
      created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      last_used_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
  ]);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    const generated = `whm_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const newKeyItem: APIKeyItem = {
      id: `k-${Date.now()}`,
      name: keyName.trim(),
      prefix: `${generated.slice(0, 14)}...`,
      created_at: new Date().toISOString(),
    };

    setKeys([newKeyItem, ...keys]);
    setNewlyCreatedKey(generated);
    setKeyName('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied API key to clipboard');
  };

  const columns: Column<APIKeyItem>[] = [
    {
      key: 'name',
      label: 'Token Label',
      sortable: true,
      render: (k) => (
        <div className="flex flex-col">
          <span className="font-semibold text-white text-xs light:text-gray-900">{k.name}</span>
          <span className="text-[11px] font-mono text-emerald-400 mt-0.5">{k.prefix}</span>
        </div>
      ),
    },
    {
      key: 'created',
      label: 'Created Date',
      render: (k) => <span className="text-xs text-white/50 light:text-gray-500">{new Date(k.created_at).toLocaleDateString()}</span>,
    },
    {
      key: 'last_used',
      label: 'Last Used',
      render: (k) => (
        <span className="text-xs text-white/50 light:text-gray-500">
          {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (k) => (
        <IconButton
          icon={Trash2}
          label="Revoke Key"
          className="hover:text-red-400"
          onClick={() => {
            setKeys(keys.filter((item) => item.id !== k.id));
            toast.success('API key revoked');
          }}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.apiKeys') || 'Developer API Keys'}
        subtitle="Manage secret API tokens for REST integrations and automated message ingestion"
        icon={Key}
        iconGradient="bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/20"
        backLink="/settings"
        actions={
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => {
              setNewlyCreatedKey(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Generate New Token
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Active Developer Tokens</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              API tokens carry full programmatic privileges. Store them securely in environment secrets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable items={keys} columns={columns} emptyIcon={Key} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          {newlyCreatedKey ? (
            <div>
              <DialogHeader>
                <DialogTitle className="text-emerald-400">API Key Generated</DialogTitle>
                <DialogDescription>
                  Make sure to copy your secret key now. You will not be able to see it again!
                </DialogDescription>
              </DialogHeader>

              <div className="my-4 p-3 rounded-lg bg-black/60 border border-emerald-500/30 flex items-center justify-between">
                <code className="text-xs font-mono text-emerald-400 break-all select-all">
                  {newlyCreatedKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 ml-2"
                  onClick={() => copyToClipboard(newlyCreatedKey)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <DialogFooter>
                <Button onClick={() => setCreateOpen(false)} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Generate API Key</DialogTitle>
                <DialogDescription>
                  Provide a descriptive name to identify where this key is deployed.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 py-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="kName" className="text-xs">Key Name *</Label>
                  <Input
                    id="kName"
                    placeholder="e.g. Production Shopify Webhook Token"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  Generate Key
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default APIKeysView;
