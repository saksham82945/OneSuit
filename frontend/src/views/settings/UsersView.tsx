import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, usersService } from '@/services/api';
import { readData, readList, readTotal } from '@/services/response';
import { useAuthStore } from '@/stores/auth';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Pencil, Trash2, UserMinus, Link2, ShieldCheck, Shield, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  formatDate,
  getErrorMessage,
  roleBadgeClass,
  useDebouncedValue,
  type InviteItem,
  type RoleItem,
  type UserItem,
} from './users/shared';
import { UserFormDialog } from './users/UserFormDialog';
import { InviteDialog } from './users/InviteDialog';
import { InviteLinksCard } from './users/InviteLinksCard';

export type { UserItem } from './users/shared';

const PAGE_SIZE = 20;
// Radix <SelectItem> can't use value="", so "all roles" gets a sentinel.
const ALL_ROLES = '__all';

const roleIcon = (name?: string) =>
  ({ admin: ShieldCheck, manager: Shield })[(name || '').toLowerCase()] || UserCog;

export const UsersView: React.FC = () => {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const organizationId = useAuthStore((s) => s.organizationId);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canRead = hasPermission('users', 'read');
  const canWrite = hasPermission('users', 'write');
  const canDelete = hasPermission('users', 'delete');
  const isSuperAdmin = !!currentUser?.is_super_admin;

  // Users list
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);
  const requestSeq = useRef(0);

  // Roles (for the filter and the forms)
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Invites
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState('');

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserItem | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await usersService.list({
        search: debouncedSearch || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
        role_id: roleFilter === ALL_ROLES ? undefined : roleFilter,
        online_only: onlineOnly || undefined,
      });
      if (seq !== requestSeq.current) return; // a newer search is in flight
      setUsers(readList<UserItem>(res, 'users'));
      setTotalItems(readTotal(res, 'users'));
      setOnlineCount(Number(readData<{ online_count?: number }>(res)?.online_count) || 0);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setLoadError(getErrorMessage(err, 'Failed to load users'));
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [canRead, debouncedSearch, currentPage, roleFilter, onlineOnly]);

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const res = await api.get('/roles', { params: { limit: 100 } });
      setRoles(readList<RoleItem>(res, 'roles'));
    } catch {
      // Without roles:read the filter and role pickers stay empty; the API then
      // falls back to the default role.
      setRoles([]);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const showInvites = canWrite && canRead;

  const fetchInvites = useCallback(async () => {
    if (!showInvites) return;
    setInvitesLoading(true);
    setInvitesError('');
    try {
      const res = await api.get('/invites');
      setInvites(readList<InviteItem>(res, 'invites'));
    } catch (err) {
      setInvitesError(getErrorMessage(err, 'Failed to load invite links'));
    } finally {
      setInvitesLoading(false);
    }
  }, [showInvites]);

  // organizationId: everything reloads after switching organization.
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers, organizationId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles, organizationId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites, organizationId]);

  const openCreate = () => {
    setUserToEdit(null);
    setFormOpen(true);
  };

  const openEdit = (user: UserItem) => {
    setUserToEdit(user);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    const isMember = userToDelete.is_member;
    setIsDeleting(true);
    try {
      await usersService.delete(userToDelete.id);
      toast.success(isMember ? 'Member removed from this organization' : 'User deleted');
      setUserToDelete(null);
      if (users.length === 1 && currentPage > 1) setCurrentPage(currentPage - 1);
      else fetchUsers();
    } catch (err) {
      toast.error(getErrorMessage(err, isMember ? 'Failed to remove member' : 'Failed to delete user'));
    } finally {
      setIsDeleting(false);
    }
  };

  const hasFilters = !!debouncedSearch || roleFilter !== ALL_ROLES || onlineOnly;

  const columns: Column<UserItem>[] = [
    {
      key: 'user',
      label: 'User',
      render: (u) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white font-semibold flex items-center justify-center text-xs shrink-0">
            {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-white light:text-gray-900 text-xs truncate">{u.full_name}</p>
              {u.id === currentUser?.id && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60 light:border-gray-300 light:text-gray-600">You</Badge>
              )}
              {u.is_super_admin && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 bg-amber-500/10 text-amber-300 light:text-amber-700">
                  <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                  Super Admin
                </Badge>
              )}
              {u.is_member && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/40 text-blue-300 light:text-blue-700">Member</Badge>
              )}
            </div>
            <p className="text-[11px] text-white/40 light:text-gray-500 truncate">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (u) => {
        const RoleIcon = roleIcon(u.role?.name);
        return (
          <Badge variant="outline" className={cn('text-[10px] uppercase font-semibold', roleBadgeClass(u.role?.name))}>
            <RoleIcon className="h-3 w-3 mr-1" />
            {u.role?.name || 'No role'}
          </Badge>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              'text-[10px]',
              u.is_active
                ? 'border-emerald-500/40 text-emerald-400 light:text-emerald-700'
                : 'border-white/[0.12] text-white/50 light:border-gray-200 light:text-gray-500'
            )}
          >
            {u.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {u.is_active && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px]',
                u.is_available ? 'text-emerald-400 light:text-emerald-700' : 'text-white/40 light:text-gray-500'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', u.is_available ? 'bg-emerald-500' : 'bg-white/30 light:bg-gray-400')} />
              {u.is_available ? 'Available' : 'Away'}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'created',
      label: 'Added',
      render: (u) => <span className="text-xs text-white/40 light:text-gray-500">{formatDate(u.created_at)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (u) => {
        const isSelf = u.id === currentUser?.id;
        return (
          <div className="flex items-center justify-end gap-1">
            {canWrite && <IconButton icon={Pencil} label="Edit user" onClick={() => openEdit(u)} />}
            {canDelete && (
              <IconButton
                icon={u.is_member ? UserMinus : Trash2}
                label={isSelf ? "You can't delete yourself" : u.is_member ? 'Remove from organization' : 'Delete user'}
                className="hover:text-red-400"
                disabled={isSelf}
                onClick={() => setUserToDelete(u)}
              />
            )}
          </div>
        );
      },
    },
  ];

  if (!canWrite && !canDelete) columns.pop();

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.users') || 'Users'}
        subtitle="Manage who can sign in to this organization and what they can do"
        icon={Users}
        iconGradient="bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
        backLink="/settings"
        actions={
          canWrite ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Invite people
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {!canRead ? (
          <ErrorState
            title="No access"
            description="You don't have permission to view users. Ask an administrator for the users:read permission."
            className="flex-1"
          />
        ) : (
          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">Organization Users</CardTitle>
                    <Badge variant="outline" className="text-[10px] gap-1.5 border-emerald-500/40 text-emerald-400 light:text-emerald-700">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {onlineCount} online
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-white/50 light:text-gray-500">
                    People with login access to this workspace.{' '}
                    <Link to="/settings/roles" className="text-emerald-400 hover:underline">
                      Manage roles
                    </Link>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select
                    value={roleFilter}
                    onValueChange={(v) => {
                      setRoleFilter(v);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ROLES}>All roles</SelectItem>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          <span className="capitalize">{role.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-xs text-white/70 light:text-gray-600 cursor-pointer">
                    <Switch
                      checked={onlineOnly}
                      onCheckedChange={(v) => {
                        setOnlineOnly(v);
                        setCurrentPage(1);
                      }}
                    />
                    Online only
                  </label>
                  <SearchInput
                    value={searchQuery}
                    onChange={(v) => {
                      setSearchQuery(v);
                      setCurrentPage(1);
                    }}
                    placeholder="Search name or email..."
                    className="w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadError && !isLoading ? (
                <ErrorState title="Couldn't load users" description={loadError} onRetry={fetchUsers} />
              ) : (
                <DataTable
                  items={users}
                  columns={columns}
                  isLoading={isLoading}
                  emptyIcon={Users}
                  emptyTitle={hasFilters ? 'No matching users' : 'No users yet'}
                  emptyDescription={
                    hasFilters
                      ? 'Try a different search or filter.'
                      : 'Add a user or create an invite link to bring your team in.'
                  }
                  emptyAction={
                    !hasFilters && canWrite ? (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add User
                      </Button>
                    ) : undefined
                  }
                  currentPage={currentPage}
                  totalItems={totalItems}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                />
              )}
            </CardContent>
          </Card>
        )}

        {showInvites && (
          <InviteLinksCard
            invites={invites}
            isLoading={invitesLoading}
            error={invitesError}
            onRetry={fetchInvites}
            onRevoked={fetchInvites}
            onCreate={() => setInviteOpen(true)}
          />
        )}
      </div>

      {canWrite && (
        <>
          <UserFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            user={userToEdit}
            roles={roles}
            rolesLoading={rolesLoading}
            currentUserId={currentUser?.id}
            isSuperAdmin={isSuperAdmin}
            onSaved={() => fetchUsers()}
          />
          <InviteDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            roles={roles}
            rolesLoading={rolesLoading}
            onCreated={() => fetchInvites()}
          />
        </>
      )}

      <DeleteConfirmDialog
        open={!!userToDelete}
        onOpenChange={(open) => !open && !isDeleting && setUserToDelete(null)}
        title={userToDelete?.is_member ? 'Remove Member' : 'Delete User'}
        itemName={userToDelete?.full_name}
        description={
          userToDelete?.is_member
            ? `${userToDelete.full_name} will lose access to this organization. Their account in their own organization is not affected.`
            : undefined
        }
        confirmLabel={userToDelete?.is_member ? 'Remove' : 'Delete'}
        isSubmitting={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
};
export default UsersView;
