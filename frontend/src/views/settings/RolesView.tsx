import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Check, Lock } from 'lucide-react';

export interface RoleItem {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions_count: number;
}

export const RolesView: React.FC = () => {
  const { t } = useTranslation();

  const [roles] = useState<RoleItem[]>([
    {
      id: 'role-1',
      name: 'Super Admin',
      description: 'Unrestricted access to all resources, API tokens, team billing and security logs',
      is_system: true,
      permissions_count: 24,
    },
    {
      id: 'role-2',
      name: 'Manager',
      description: 'Can manage agents, campaigns, message templates and review analytics reports',
      is_system: false,
      permissions_count: 18,
    },
    {
      id: 'role-3',
      name: 'Agent',
      description: 'Can reply to assigned customer conversations, use canned responses and view contacts',
      is_system: true,
      permissions_count: 8,
    },
  ]);

  const columns: Column<RoleItem>[] = [
    {
      key: 'name',
      label: 'Role Name',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white text-xs light:text-gray-900">{r.name}</span>
          {r.is_system && (
            <Badge variant="secondary" className="text-[10px] bg-white/[0.08] text-white/60 flex items-center gap-1 light:bg-gray-100 light:text-gray-600">
              <Lock className="h-2.5 w-2.5" /> SYSTEM
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Access Scope & Description',
      render: (r) => <span className="text-xs text-white/60 light:text-gray-600">{r.description}</span>,
    },
    {
      key: 'permissions',
      label: 'Permissions Count',
      render: (r) => (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-xs font-mono">
          {r.permissions_count} grants
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.roles') || 'Roles & Permissions'}
        subtitle="Granular RBAC access controls governing dashboard features and chat capabilities"
        icon={Shield}
        iconGradient="bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/20"
        backLink="/settings"
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Configured Roles</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Role permissions dictate resource access across Analytics, Chat, Templates, and Campaigns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable items={roles} columns={columns} emptyIcon={Shield} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default RolesView;
