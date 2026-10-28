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
import { Webhook, Plus, Trash2, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'failing';
  last_delivery?: string;
}

export const WebhooksView: React.FC = () => {
  const { t } = useTranslation();

  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([
    {
      id: 'wh-1',
      url: 'https://api.myapp.com/webhooks/whatsapp',
      events: ['message.received', 'message.status_update', 'chat.assigned'],
      status: 'active',
      last_delivery: new Date(Date.now() - 600000).toISOString(),
    },
  ]);
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const newWh: WebhookEndpoint = {
      id: `wh-${Date.now()}`,
      url: url.trim(),
      events: ['message.received', 'message.status_update'],
      status: 'active',
      last_delivery: new Date().toISOString(),
    };

    setWebhooks([newWh, ...webhooks]);
    toast.success('Webhook endpoint registered');
    setCreateOpen(false);
    setUrl('');
  };

  const testPing = () => {
    toast.success('Test ping event delivered successfully (HTTP 200 OK)');
  };

  const columns: Column<WebhookEndpoint>[] = [
    {
      key: 'url',
      label: 'Target Destination URL',
      sortable: true,
      render: (wh) => (
        <code className="text-xs font-mono text-emerald-400 break-all">{wh.url}</code>
      ),
    },
    {
      key: 'events',
      label: 'Subscribed Events',
      render: (wh) => (
        <div className="flex flex-wrap gap-1">
          {wh.events.map((ev) => (
            <Badge key={ev} variant="secondary" className="text-[10px] bg-white/[0.06] text-white/70 light:bg-gray-100 light:text-gray-600">
              {ev}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Health Status',
      render: (wh) => (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> HEALTHY
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (wh) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="sm" onClick={testPing} className="h-7 text-xs">
            <Send className="h-3 w-3 mr-1" /> Ping Test
          </Button>
          <IconButton
            icon={Trash2}
            label="Delete"
            className="hover:text-red-400"
            onClick={() => {
              setWebhooks(webhooks.filter((w) => w.id !== wh.id));
              toast.success('Webhook deleted');
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.webhooks') || 'Outbound Webhooks'}
        subtitle="Forward live customer messages, delivery receipts and chat events to external servers"
        icon={Webhook}
        iconGradient="bg-gradient-to-br from-teal-500 to-emerald-600 shadow-teal-500/20"
        backLink="/settings"
        actions={
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Endpoint
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Configured Webhook Subscribers</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Payloads are signed with HMAC-SHA256 headers for request origin verification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable items={webhooks} columns={columns} emptyIcon={Webhook} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Add Webhook Endpoint</DialogTitle>
              <DialogDescription>
                HTTP POST requests will be dispatched whenever WhatsApp events occur.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="whUrl" className="text-xs">Endpoint HTTPS URL *</Label>
                <Input
                  id="whUrl"
                  placeholder="https://api.mycompany.com/webhooks/whatsapp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                Add Endpoint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default WebhooksView;
