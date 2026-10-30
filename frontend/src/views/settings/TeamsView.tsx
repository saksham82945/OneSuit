import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { teamsService, type Team } from '@/services/api';
import { readList, readTotal } from '@/services/response';
import { useAuthStore } from '@/stores/auth';
import { teamAccessLabel } from '@/lib/teamAccess';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Plus, Pencil, Trash2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate, getErrorMessage, useDebouncedValue } from './users/shared';
import { TeamFormDialog } from './teams/TeamFormDialog';
import { TeamMembersDialog } from './teams/TeamMembersDialog';

export type TeamItem = Team;

const PAGE_SIZE = 20;


export const TeamsView: React.FC = () => {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const organizationId = useAuthStore((s) => s.organizationId);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canReadTeams = hasPermission('teams', 'read');
  const canWrite = hasPermission('teams', 'write');
  const canDelete = hasPermission('teams', 'delete');
  const canReadUsers = hasPermission('users', 'read');

  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);
  const requestSeq = useRef(0);

  const [formOpen, setFormOpen] = useState(false);
  const [teamToEdit, setTeamToEdit] = useState<Team | null>(null);
  const [membersTeam, setMembersTeam] = useState<Team | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTeams = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    setLoadError('');
    try {
      // Without teams:read the API returns only the teams you belong to.
      const res = await teamsService.list({
        search: debouncedSearch || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });
      if (seq !== requestSeq.current) return;
      setTeams(readList<Team>(res, 'teams'));
      setTotalItems(readTotal(res, 'teams'));
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setLoadError(getErrorMessage(err, 'Failed to load teams'));
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [debouncedSearch, currentPage]);

  // organizationId: reload after switching organization.
  useEffect(() => {
    fetchTeams();
  }, [fetchTeams, organizationId]);

  const openCreate = () => {
    setTeamToEdit(null);
    setFormOpen(true);
  };

  const handleSaved = (saved: Team) => {
    fetchTeams();
    // Go straight to member management for a brand-new team.
    if (!teamToEdit) setMembersTeam(saved);
  };

  const handleDelete = async () => {
    if (!teamToDelete) return;
    setIsDeleting(true);
    try {
      await teamsService.delete(teamToDelete.id);
      toast.success('Team deleted');
      setTeamToDelete(null);
      if (teams.length === 1 && currentPage > 1) setCurrentPage(currentPage - 1);
      else fetchTeams();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete team'));
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<Team>[] = [
    {
      key: 'name',
      label: 'Team',
      render: (team) => (
        <button
          type="button"
          className="flex items-center gap-2.5 min-w-0 text-left group"
          onClick={() => setMembersTeam(team)}
        >
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white light:text-gray-900 text-xs truncate group-hover:text-emerald-400 transition-colors">
              {team.name}
            </p>
            {team.description && (
              <p className="text-[11px] text-white/40 light:text-gray-500 truncate max-w-[320px]">{team.description}</p>
            )}
          </div>
        </button>
      ),
    },
    {
      key: 'access',
      label: 'Access',
      render: (team) =>
        team.access && team.access.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-w-[340px]">
            {team.access.map((a) => (
              <Badge
                key={a}
                variant="outline"
                className="text-[10px] font-medium border-emerald-500/25 bg-emerald-500/10 text-emerald-300 light:bg-emerald-50 light:text-emerald-700 light:border-emerald-200"
              >
                {teamAccessLabel(a)}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-white/40 light:text-gray-400">Role access only</span>
        ),
    },
    {
      key: 'members',
      label: 'Members',
      render: (team) => (
        <button type="button" onClick={() => setMembersTeam(team)} className="cursor-pointer">
          <Badge variant="outline" className="text-xs font-mono border-white/10 hover:border-emerald-500/40 light:border-gray-200">
            {team.member_count || 0} {team.member_count === 1 ? 'member' : 'members'}
          </Badge>
        </button>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (team) => (
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            team.is_active
              ? 'border-emerald-500/40 text-emerald-400 light:text-emerald-700'
              : 'border-white/[0.12] text-white/50 light:border-gray-200 light:text-gray-500'
          )}
        >
          {team.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      render: (team) => <span className="text-xs text-white/40 light:text-gray-500">{formatDate(team.created_at)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (team) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={UserCog} label="Manage members" onClick={() => setMembersTeam(team)} />
          {canWrite && (
            <IconButton
              icon={Pencil}
              label="Edit team"
              onClick={() => {
                setTeamToEdit(team);
                setFormOpen(true);
              }}
            />
          )}
          {canDelete && (
            <IconButton
              icon={Trash2}
              label="Delete team"
              className="hover:text-red-400"
              onClick={() => setTeamToDelete(team)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.teams') || 'Teams'}
        subtitle="Group agents into teams for conversation routing and transfers"
        icon={Users}
        iconGradient="bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20"
        backLink="/settings"
        actions={
          canWrite ? (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Team
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">{canReadTeams ? 'All Teams' : 'Your Teams'}</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Group people and choose what each team can access, on top of their role
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={(v) => {
                  setSearchQuery(v);
                  setCurrentPage(1);
                }}
                placeholder="Search teams..."
                className="w-64"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadError && !isLoading ? (
              <ErrorState title="Couldn't load teams" description={loadError} onRetry={fetchTeams} />
            ) : (
              <DataTable
                items={teams}
                columns={columns}
                isLoading={isLoading}
                emptyIcon={Users}
                emptyTitle={debouncedSearch ? 'No matching teams' : 'No teams yet'}
                emptyDescription={
                  debouncedSearch
                    ? 'Try a different search term.'
                    : canWrite
                      ? 'Create a team to route conversations to a group of agents.'
                      : "You aren't a member of any team yet."
                }
                emptyAction={
                  !debouncedSearch && canWrite ? (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Team
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
      </div>

      {canWrite && (
        <TeamFormDialog open={formOpen} onOpenChange={setFormOpen} team={teamToEdit} onSaved={handleSaved} />
      )}

      <TeamMembersDialog
        open={!!membersTeam}
        onOpenChange={(o) => !o && setMembersTeam(null)}
        team={membersTeam}
        currentUserId={currentUser?.id}
        canWriteTeams={canWrite}
        canReadUsers={canReadUsers}
        onChanged={fetchTeams}
      />

      <DeleteConfirmDialog
        open={!!teamToDelete}
        onOpenChange={(o) => !o && !isDeleting && setTeamToDelete(null)}
        title="Delete Team"
        description={
          teamToDelete
            ? `Delete "${teamToDelete.name}"? Its ${teamToDelete.member_count || 0} member(s) are removed from the team (their accounts are not affected). This cannot be undone.`
            : undefined
        }
        isSubmitting={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
};
export default TeamsView;
