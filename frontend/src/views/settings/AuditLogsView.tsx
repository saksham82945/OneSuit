import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollText, ShieldAlert, CheckCircle2 } from 'lucide-react';

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  ip_address: string;
  status: 'success' | 'failure';
  created_at: string;
}

export const AuditLogsView: React.FC = () => {
  const { t } = useTranslation();

  const [logs] = useState<AuditLogRecord[]>([
    {
      id: 'log-1',
      actor: 'admin@admin.com',
      action: 'LOGIN_SUCCESS',
      resource_type: 'auth.session',
      ip_address: '127.0.0.1',
      status: 'success',
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: 'log-2',
      actor: 'admin@admin.com',
      action: 'UPDATE_SETTINGS',
      resource_type: 'settings.general',
      ip_address: '127.0.0.1',
      status: 'success',
      created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
      id: 'log-3',
      actor: 'admin@admin.com',
      action: 'CREATE_CAMPAIGN',
      resource_type: 'campaign',
      resource_id: 'camp-1',
      ip_address: '127.0.0.1',
      status: 'success',
      created_at: new Date(Date.now() - 1000 * 3600 * 2).toISOString(),
    },
    {
      id: 'log-4',
      actor: 'system',
      action: 'SYNC_TEMPLATES',
      resource_type: 'templates',
      ip_address: 'internal',
      status: 'success',
      created_at: new Date(Date.now() - 1000 * 3600 * 6).toISOString(),
    },
  ]);
  const [searchQuery, setSearchQuery] = useState('');

  const columns: Column<AuditLogRecord>[] = [
    {
      key: 'actor',
      label: 'Actor / User',
      sortable: true,
      render: (log) => <span className="font-medium text-white text-xs light:text-gray-900">{log.actor}</span>,
    },
    {
      key: 'action',
      label: 'Action Performed',
      render: (log) => (
        <code className="text-xs font-mono px-2 py-0.5 rounded bg-white/[0.04] text-white/90 light:bg-gray-50 light:text-gray-800">
          {log.action}
        </code>
      ),
    },
    {
      key: 'resource',
      label: 'Resource Target',
      render: (log) => <span className="text-xs text-white/60 light:text-gray-600">{log.resource_type}</span>,
    },
    {
      key: 'ip',
      label: 'IP Address',
      render: (log) => <code className="text-[11px] font-mono text-white/40 light:text-gray-400">{log.ip_address}</code>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (log) => (
        <Badge
          className={
            log.status === 'success'
              ? 'bg-emerald-500/20 text-emerald-400 border-0 text-[10px]'
              : 'bg-red-500/20 text-red-400 border-0 text-[10px]'
          }
        >
          {log.status.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'timestamp',
      label: 'Timestamp',
      render: (log) => (
        <span className="text-xs text-white/40 light:text-gray-400">
          {new Date(log.created_at).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.auditLogs') || 'Security & Audit Logs'}
        subtitle="Immutable security trail of administrative actions, user logins and data modifications"
        icon={ScrollText}
        iconGradient="bg-gradient-to-br from-zinc-500 to-slate-600 shadow-zinc-500/20"
        backLink="/settings"
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Audit Records</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Logs are retained for 365 days for regulatory and compliance requirements
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search actor or action..."
                className="w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              items={logs.filter(
                (l) =>
                  l.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  l.action.toLowerCase().includes(searchQuery.toLowerCase())
              )}
              columns={columns}
              emptyIcon={ScrollText}
              emptyTitle="No audit logs found"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default AuditLogsView;
