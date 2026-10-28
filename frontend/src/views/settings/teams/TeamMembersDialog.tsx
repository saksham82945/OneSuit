import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teamsService, usersService, type Team, type TeamMember } from '@/services/api';
import { readData, readList } from '@/services/response';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Shield, UserMinus, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getErrorMessage, useDebouncedValue, type UserItem } from '../users/shared';

export interface TeamMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team | null;
  currentUserId?: string;
  /** teams:write — can add/remove anyone, including managers. */
  canWriteTeams: boolean;
  /** users:read — needed to search for people to add. */
  canReadUsers: boolean;
  /** Called after a member was added or removed, so the list can refresh its counts. */
  onChanged: () => void;
}

const Initials: React.FC<{ name?: string; muted?: boolean }> = ({ name, muted }) => (
  <div
    className={cn(
      'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold',
      muted
        ? 'bg-white/[0.06] text-white/60 light:bg-gray-100 light:text-gray-600'
        : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
    )}
  >
    {(name || '?').slice(0, 2).toUpperCase()}
  </div>
);

export const TeamMembersDialog: React.FC<TeamMembersDialogProps> = ({
  open,
  onOpenChange,
  team,
  currentUserId,
  canWriteTeams,
  canReadUsers,
  onChanged,
}) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');

  const [userSearch, setUserSearch] = useState('');
  const debouncedSearch = useDebouncedValue(userSearch.trim(), 300);
  const [candidates, setCandidates] = useState<UserItem[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState('');
  const searchSeq = useRef(0);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const teamId = team?.id;

  // Team managers may add agents and remove agents (but not managers) without teams:write.
  const isTeamManager = members.some((m) => m.user_id === currentUserId && m.role === 'manager');
  const canManage = canWriteTeams || isTeamManager;

  const fetchMembers = useCallback(async () => {
    if (!teamId) return;
    setMembersLoading(true);
    setMembersError('');
    try {
      const res = await teamsService.listMembers(teamId);
      setMembers(readList<TeamMember>(res, 'members'));
    } catch (err) {
      setMembersError(getErrorMessage(err, 'Failed to load team members'));
    } finally {
      setMembersLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!open) return;
    setUserSearch('');
    setCandidates([]);
    setMembers([]);
    fetchMembers();
  }, [open, fetchMembers]);

  useEffect(() => {
    if (!open || !canManage || !canReadUsers) return;
    const seq = ++searchSeq.current;
    setCandidatesLoading(true);
    setCandidatesError('');
    usersService
      .list({ search: debouncedSearch || undefined, limit: 20 })
      .then((res) => {
        if (seq === searchSeq.current) setCandidates(readList<UserItem>(res, 'users'));
      })
      .catch((err) => {
        if (seq === searchSeq.current) setCandidatesError(getErrorMessage(err, 'Failed to load users'));
      })
      .finally(() => {
        if (seq === searchSeq.current) setCandidatesLoading(false);
      });
  }, [open, canManage, canReadUsers, debouncedSearch]);

  const availableUsers = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.user_id));
    return candidates.filter((u) => !memberIds.has(u.id) && u.is_active);
  }, [candidates, members]);

  const addMember = async (user: UserItem, role: 'agent' | 'manager') => {
    if (!teamId) return;
    setBusyUserId(user.id);
    try {
      // POST /api/teams/{id}/members: { user_id, role }
      const res = await teamsService.addMember(teamId, { user_id: user.id, role });
      const added = readData<{ member?: TeamMember }>(res)?.member;
      setMembers((prev) => [
        ...prev,
        {
          id: added?.id || user.id,
          user_id: user.id,
          role: added?.role || role,
          last_assigned_at: null,
          full_name: added?.full_name || user.full_name,
          email: added?.email || user.email,
          is_available: added?.is_available ?? user.is_available,
        },
      ]);
      toast.success(`${user.full_name} added as ${role}`);
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add member'));
    } finally {
      setBusyUserId(null);
    }
  };

  const confirmRemove = async () => {
    if (!teamId || !memberToRemove) return;
    setIsRemoving(true);
    try {
      await teamsService.removeMember(teamId, memberToRemove.user_id);
      setMembers((prev) => prev.filter((m) => m.user_id !== memberToRemove.user_id));
      toast.success(`${memberToRemove.full_name || 'Member'} removed from the team`);
      setMemberToRemove(null);
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove member'));
    } finally {
      setIsRemoving(false);
    }
  };

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        a.role === b.role ? (a.full_name || '').localeCompare(b.full_name || '') : a.role === 'manager' ? -1 : 1
      ),
    [members]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{team?.name ? `${team.name} — Members` : 'Team Members'}</DialogTitle>
            <DialogDescription>
              Managers can add and remove agents in this team. Agents receive assigned conversations.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4">
            <div>
              <p className="text-xs font-medium text-white/70 light:text-gray-700 mb-2">
                Members{!membersLoading && !membersError ? ` (${members.length})` : ''}
              </p>
              {membersLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-11 rounded-lg bg-white/[0.04] animate-pulse light:bg-gray-50" />
                  ))}
                </div>
              ) : membersError ? (
                <ErrorState title="Couldn't load members" description={membersError} onRetry={fetchMembers} className="py-6" />
              ) : sortedMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-white/40 light:bg-gray-50 light:text-gray-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <p className="text-xs text-white/50 light:text-gray-500">No members yet</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                  {sortedMembers.map((m) => {
                    // Managers without teams:write can't remove other managers.
                    const canRemove = canWriteTeams || (isTeamManager && m.role !== 'manager');
                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.03] light:hover:bg-gray-50 transition-colors"
                      >
                        <Initials name={m.full_name || m.email} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium truncate text-white light:text-gray-900">{m.full_name || m.email}</p>
                            {m.user_id === currentUserId && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60 light:border-gray-200 light:text-gray-600">You</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-white/40 light:text-gray-500 truncate">{m.email}</p>
                        </div>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] shrink-0',
                            m.is_available ? 'text-emerald-400' : 'text-white/40 light:text-gray-500'
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', m.is_available ? 'bg-emerald-500' : 'bg-white/30 light:bg-gray-50')} />
                          {m.is_available ? 'Available' : 'Away'}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] capitalize shrink-0',
                            m.role === 'manager'
                              ? 'border-blue-500/40 text-blue-300 light:text-blue-700'
                              : 'border-white/[0.12] text-white/60 light:border-gray-200 light:text-gray-600'
                          )}
                        >
                          {m.role === 'manager' && <Shield className="h-3 w-3 mr-1" />}
                          {m.role}
                        </Badge>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            disabled={!canRemove}
                            aria-label={`Remove ${m.full_name || m.email}`}
                            title={canRemove ? 'Remove from team' : 'Only admins can remove managers'}
                            onClick={() => setMemberToRemove(m)}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {canManage && !membersLoading && !membersError && (
              <>
                <Separator className="bg-white/[0.08] light:bg-gray-200" />
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-xs font-medium text-white/70 light:text-gray-700">Add members</p>
                    {canReadUsers && (
                      <SearchInput value={userSearch} onChange={setUserSearch} placeholder="Search users..." className="w-56" />
                    )}
                  </div>
                  {!canReadUsers ? (
                    <p className="text-xs text-white/40 light:text-gray-500 py-2">
                      You need the users:read permission to look up people to add.
                    </p>
                  ) : candidatesLoading ? (
                    <div className="flex items-center justify-center py-4 text-xs text-white/40 light:text-gray-400">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading users...
                    </div>
                  ) : candidatesError ? (
                    <p className="text-xs text-red-400 py-2">{candidatesError}</p>
                  ) : availableUsers.length === 0 ? (
                    <p className="text-xs text-white/40 light:text-gray-500 text-center py-3">
                      {debouncedSearch ? 'No matching users outside this team' : 'Everyone shown is already in this team'}
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                      {availableUsers.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.03] light:hover:bg-gray-50 transition-colors"
                        >
                          <Initials name={u.full_name || u.email} muted />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate text-white light:text-gray-900">{u.full_name}</p>
                            <p className="text-[11px] text-white/40 light:text-gray-500 truncate">{u.email}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={busyUserId !== null}
                              onClick={() => addMember(u, 'agent')}
                            >
                              {busyUserId === u.id ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <UserPlus className="h-3 w-3 mr-1" />
                              )}
                              Agent
                            </Button>
                            {canWriteTeams && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={busyUserId !== null}
                                onClick={() => addMember(u, 'manager')}
                              >
                                <Shield className="h-3 w-3 mr-1" />
                                Manager
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!memberToRemove}
        onOpenChange={(o) => !o && !isRemoving && setMemberToRemove(null)}
        title="Remove Member"
        description={
          memberToRemove
            ? `Remove ${memberToRemove.full_name || memberToRemove.email} from ${team?.name || 'this team'}? Their account is not affected.`
            : undefined
        }
        confirmLabel="Remove"
        isSubmitting={isRemoving}
        onConfirm={confirmRemove}
      />
    </>
  );
};
