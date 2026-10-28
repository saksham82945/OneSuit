import React, { useState } from 'react';
import { api } from '@/services/api';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link2, Plus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, getErrorMessage, roleBadgeClass, type InviteItem, type InviteStatus } from './shared';

const STATUS_STYLES: Record<InviteStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 light:text-emerald-700',
  expired: 'bg-white/[0.04] text-white/50 border-white/[0.12] light:bg-gray-100 light:text-gray-500 light:border-gray-200',
  used: 'bg-blue-500/15 text-blue-300 border-blue-500/30 light:text-blue-700',
};

const STATUS_LABELS: Record<InviteStatus, string> = { active: 'Active', expired: 'Expired', used: 'Used up' };

export interface InviteLinksCardProps {
  invites: InviteItem[];
  isLoading: boolean;
  error: string;
  onRetry: () => void;
  onRevoked: () => void;
  onCreate: () => void;
}

export const InviteLinksCard: React.FC<InviteLinksCardProps> = ({
  invites,
  isLoading,
  error,
  onRetry,
  onRevoked,
  onCreate,
}) => {
  const [inviteToRevoke, setInviteToRevoke] = useState<InviteItem | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const activeCount = invites.filter((i) => i.status === 'active').length;

  const handleRevoke = async () => {
    if (!inviteToRevoke) return;
    setIsRevoking(true);
    try {
      await api.delete(`/invites/${inviteToRevoke.id}`);
      toast.success('Invite link revoked');
      setInviteToRevoke(null);
      onRevoked();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to revoke invite link'));
    } finally {
      setIsRevoking(false);
    }
  };

  const columns: Column<InviteItem>[] = [
    {
      key: 'role',
      label: 'Role',
      render: (inv) => (
        <Badge variant="outline" className={cn('text-[10px] capitalize font-semibold', roleBadgeClass(inv.role_name))}>
          {inv.role_name || 'Unknown role'}
        </Badge>
      ),
    },
    {
      key: 'email',
      label: 'Restricted to',
      render: (inv) =>
        inv.email ? (
          <span className="text-xs text-white/80 light:text-gray-800">{inv.email}</span>
        ) : (
          <span className="text-xs text-white/40 light:text-gray-500">Anyone with the link</span>
        ),
    },
    {
      key: 'uses',
      label: 'Uses',
      render: (inv) => (
        <span className="text-xs font-mono text-white/70 light:text-gray-700">
          {inv.used_count} / {inv.max_uses === 0 ? '∞' : inv.max_uses}
        </span>
      ),
    },
    {
      key: 'expires',
      label: 'Expires',
      render: (inv) => (
        <span className="text-xs text-white/50 light:text-gray-500">
          {formatDateTime(inv.expires_at)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (inv) => (
        <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLES[inv.status] || STATUS_STYLES.expired)}>
          {STATUS_LABELS[inv.status] || inv.status}
        </Badge>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      render: (inv) => <span className="text-xs text-white/40 light:text-gray-500">{formatDate(inv.created_at)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (inv) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={() => setInviteToRevoke(inv)}
        >
          <Ban className="h-3.5 w-3.5 mr-1" />
          {inv.status === 'active' ? 'Revoke' : 'Remove'}
        </Button>
      ),
    },
  ];

  return (
    <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">Pending invite links</CardTitle>
              {!isLoading && !error && (
                <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">
                  {activeCount} active
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Links stop working when they expire, run out of uses, or are revoked. The link itself is
              only shown when it is created.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New link
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && !isLoading ? (
          <ErrorState title="Couldn't load invite links" description={error} onRetry={onRetry} className="py-8" />
        ) : (
          <DataTable
            items={invites}
            columns={columns}
            isLoading={isLoading}
            emptyIcon={Link2}
            emptyTitle="No invite links"
            emptyDescription="Create a link to let people join this organization without you setting a password for them."
          />
        )}
      </CardContent>

      <DeleteConfirmDialog
        open={!!inviteToRevoke}
        onOpenChange={(open) => !open && !isRevoking && setInviteToRevoke(null)}
        title="Revoke invite link"
        description={
          inviteToRevoke
            ? `The ${inviteToRevoke.role_name || ''} link${inviteToRevoke.email ? ` for ${inviteToRevoke.email}` : ''} will stop working immediately. People who already joined keep their accounts.`
            : undefined
        }
        confirmLabel="Revoke"
        isSubmitting={isRevoking}
        onConfirm={handleRevoke}
      />
    </Card>
  );
};
