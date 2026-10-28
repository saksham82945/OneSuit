import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export interface CustomActionItem {
  id: string;
  name: string;
  method: 'GET' | 'POST';
  url: string;
  description: string;
}

export const CustomActionsView: React.FC = () => {
  const { t } = useTranslation();

  const [actions, setActions] = useState<CustomActionItem[]>([
    {
      id: 'ca-1',
      name: 'Fetch Customer Balance & Invoices',
      method: 'GET',
      url: 'https://billing.company.com/api/v2/customer/{{contact.phone}}',
      description: 'Used by agents in live chat drawer to instantly look up account billing status',
    },
    {
      id: 'ca-2',
      name: 'Trigger Shipment Dispatch Alert',
      method: 'POST',
      url: 'https://warehouse.company.com/api/dispatch',
      description: 'Invoked by chatbot flows when customer confirms delivery address',
    },
  ]);

  const columns: Column<CustomActionItem>[] = [
    {
      key: 'name',
      label: 'Action Name',
      sortable: true,
      render: (a) => (
        <div className="flex flex-col">
          <span className="font-semibold text-white text-xs light:text-gray-900">{a.name}</span>
          <span className="text-xs text-white/40 light:text-gray-400">{a.description}</span>
        </div>
      ),
    },
    {
      key: 'method',
      label: 'HTTP',
      render: (a) => (
        <Badge
          className={
            a.method === 'POST'
              ? 'bg-amber-500/20 text-amber-400 border-0 text-[10px]'
              : 'bg-blue-500/20 text-blue-400 border-0 text-[10px]'
          }
        >
          {a.method}
        </Badge>
      ),
    },
    {
      key: 'url',
      label: 'Endpoint Template',
      render: (a) => <code className="text-xs font-mono text-white/70 break-all light:text-gray-600">{a.url}</code>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (a) => (
        <IconButton
          icon={Trash2}
          label="Delete"
          className="hover:text-red-400"
          onClick={() => {
            setActions(actions.filter((item) => item.id !== a.id));
            toast.success('Action removed');
          }}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.customActions') || 'Custom HTTP Actions'}
        subtitle="Define REST API webhooks triggered manually by agents in chat or automatically by bot nodes"
        icon={Zap}
        iconGradient="bg-gradient-to-br from-amber-500 to-yellow-600 shadow-amber-500/20"
        backLink="/settings"
        actions={
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => toast.info('Creating custom HTTP action...')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Action
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Configured Actions</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Interpolate dynamic variables like {`{{contact.phone}}`} or {`{{contact.name}}`} in URLs & request bodies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable items={actions} columns={columns} emptyIcon={Zap} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default CustomActionsView;
