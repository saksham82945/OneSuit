import React, { useState } from 'react';
import {
  Phone,
  Search,
  PhoneCall,
  PhoneForwarded,
  Workflow,
  ChevronDown,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { cardClass } from './shared';

type CallSubStatus = 'active' | 'expired' | 'suspended';

interface CallSubscriber {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: 'admin' | 'user';
  planName: string;
  status: CallSubStatus;
  callLogs: boolean;
  ivrFlows: boolean;
  callTransfers: boolean;
  subscribedAt: string;
  expiresAt: string;
}

const statusConfig: Record<CallSubStatus, { label: string; color: string; icon: React.ElementType }> = {
  active:    { label: 'Active',    color: 'bg-emerald-500/15 text-emerald-400', icon: CheckCircle2 },
  expired:   { label: 'Expired',   color: 'bg-white/10 text-white/40 light:bg-gray-100 light:text-gray-400',          icon: XCircle },
  suspended: { label: 'Suspended', color: 'bg-rose-500/15 text-rose-400',       icon: XCircle },
};

// Mock data — replace with real API call to GET /api/super-admin/call-subscriptions
const MOCK_SUBSCRIBERS: CallSubscriber[] = [
  {
    id: 'u1',
    name: 'Rahul Sharma',
    email: 'rahul@acmecorp.com',
    organization: 'Acme Corp',
    role: 'admin',
    planName: 'Business Plus',
    status: 'active',
    callLogs: true,
    ivrFlows: true,
    callTransfers: true,
    subscribedAt: '2026-09-01',
    expiresAt: '2027-09-01',
  },
  {
    id: 'u2',
    name: 'Priya Mehta',
    email: 'priya@betaagency.com',
    organization: 'Beta Agency',
    role: 'admin',
    planName: 'Enterprise',
    status: 'active',
    callLogs: true,
    ivrFlows: true,
    callTransfers: false,
    subscribedAt: '2026-08-15',
    expiresAt: '2027-08-15',
  },
  {
    id: 'u3',
    name: 'Ahmed Khan',
    email: 'ahmed@deltapartners.com',
    organization: 'Delta Partners',
    role: 'user',
    planName: 'Starter',
    status: 'active',
    callLogs: true,
    ivrFlows: false,
    callTransfers: false,
    subscribedAt: '2026-10-01',
    expiresAt: '2026-11-01',
  },
  {
    id: 'u4',
    name: 'Sara Ali',
    email: 'sara@gammaltd.com',
    organization: 'Gamma Ltd',
    role: 'admin',
    planName: 'Business',
    status: 'expired',
    callLogs: true,
    ivrFlows: true,
    callTransfers: true,
    subscribedAt: '2025-10-01',
    expiresAt: '2026-10-01',
  },
  {
    id: 'u5',
    name: 'Tom Lee',
    email: 'tom@acmecorp.com',
    organization: 'Acme Corp',
    role: 'user',
    planName: 'Business Plus',
    status: 'suspended',
    callLogs: false,
    ivrFlows: false,
    callTransfers: false,
    subscribedAt: '2026-07-01',
    expiresAt: '2027-07-01',
  },
];

const FILTERS: { value: CallSubStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
];

const FeaturePill: React.FC<{ enabled: boolean; label: string }> = ({ enabled, label }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
      enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.05] text-white/25 line-through light:bg-gray-50 light:text-gray-300'
    )}
  >
    {enabled ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
    {label}
  </span>
);

export const AICallSetupView: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CallSubStatus | 'all'>('all');

  const filtered = MOCK_SUBSCRIBERS.filter((s) => {
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.organization.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: MOCK_SUBSCRIBERS.length,
    active: MOCK_SUBSCRIBERS.filter((s) => s.status === 'active').length,
    expired: MOCK_SUBSCRIBERS.filter((s) => s.status === 'expired').length,
    suspended: MOCK_SUBSCRIBERS.filter((s) => s.status === 'suspended').length,
  };

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2 light:text-gray-900">
            <Phone className="h-5 w-5 text-cyan-400" />
            AI Call Setup
          </h1>
          <p className="text-sm text-white/40 mt-0.5 light:text-gray-400">
            Admins and users with active calling subscriptions across all clients
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.06] light:border-gray-200 light:text-gray-600 light:hover:text-gray-900 light:hover:bg-gray-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Subscribers', value: stats.total, color: 'text-white light:text-gray-900', icon: PhoneCall },
          { label: 'Active', value: stats.active, color: 'text-emerald-400', icon: CheckCircle2 },
          { label: 'Expired', value: stats.expired, color: 'text-white/40 light:text-gray-400', icon: XCircle },
          { label: 'Suspended', value: stats.suspended, color: 'text-rose-400', icon: XCircle },
        ].map((s) => (
          <div key={s.label} className={cn('rounded-xl border p-4', cardClass)}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-white/40 light:text-gray-400">{s.label}</p>
                <p className={cn('text-2xl font-semibold mt-1 tabular-nums', s.color)}>{s.value}</p>
              </div>
              <s.icon className={cn('h-4 w-4 mt-1', s.color)} />
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 light:text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or organization…"
            className="pl-9 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 light:bg-gray-50 light:border-gray-200 light:text-gray-900 light:placeholder:text-gray-400"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CallSubStatus | 'all')}
            className="appearance-none h-9 pl-3 pr-8 rounded-md text-sm bg-white/[0.04] border border-white/[0.08] text-white/70 focus:outline-none focus:ring-1 focus:ring-cyan-500 light:bg-gray-50 light:border-gray-200 light:text-gray-600"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value} className="bg-[#141415] text-white light:bg-white light:text-gray-900">
                {f.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none light:text-gray-400" />
        </div>
      </div>

      {/* Table */}
      <div className={cn('rounded-xl border overflow-hidden', cardClass)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] light:border-gray-200">
                {['User / Org', 'Plan', 'Status', 'Features', 'Subscribed', 'Expires'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap light:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <PhoneCall className="h-8 w-8 text-white/20 mx-auto mb-3 light:text-gray-300" />
                    <p className="text-white/40 text-sm light:text-gray-400">No calling subscribers found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((sub, i) => {
                  const st = statusConfig[sub.status];
                  const StatusIcon = st.icon;
                  return (
                    <tr
                      key={sub.id}
                      className={cn(
                        'transition-colors hover:bg-white/[0.03] light:hover:bg-gray-100',
                        i !== filtered.length - 1 && 'border-b border-white/[0.04] light:border-gray-200'
                      )}
                    >
                      {/* User / Org */}
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-white light:text-gray-900">{sub.name}</p>
                        <p className="text-xs text-white/40 light:text-gray-400">{sub.email}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Building2 className="h-3 w-3 text-white/30 light:text-gray-400" />
                          <span className="text-xs text-white/40 light:text-gray-400">{sub.organization}</span>
                          <span className={cn(
                            'ml-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
                            sub.role === 'admin' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'
                          )}>
                            {sub.role}
                          </span>
                        </div>
                      </td>
                      {/* Plan */}
                      <td className="px-4 py-3.5 text-xs text-white/60 whitespace-nowrap light:text-gray-600">{sub.planName}</td>
                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', st.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {st.label}
                        </span>
                      </td>
                      {/* Features */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          <FeaturePill enabled={sub.callLogs} label="Call Logs" />
                          <FeaturePill enabled={sub.ivrFlows} label="IVR Flows" />
                          <FeaturePill enabled={sub.callTransfers} label="Transfers" />
                        </div>
                      </td>
                      {/* Dates */}
                      <td className="px-4 py-3.5 text-xs text-white/40 whitespace-nowrap light:text-gray-400">{sub.subscribedAt}</td>
                      <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                        <span className={sub.status === 'expired' ? 'text-rose-400' : 'text-white/40 light:text-gray-400'}>
                          {sub.expiresAt}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AICallSetupView;
