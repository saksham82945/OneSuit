import React, { useEffect, useState } from 'react';
import { teamsService, type Team } from '@/services/api';
import { readData } from '@/services/response';
import { TEAM_ACCESS_OPTIONS } from '@/lib/teamAccess';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '../users/shared';

export interface TeamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The team being edited; null/undefined creates a new team. */
  team?: Team | null;
  onSaved: (team: Team) => void;
}

/** Create or edit a team: its name, description and what its members can access. */
export const TeamFormDialog: React.FC<TeamFormDialogProps> = ({ open, onOpenChange, team, onSaved }) => {
  const isEdit = !!team;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [access, setAccess] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(team?.name || '');
    setDescription(team?.description || '');
    setAccess(team?.access ?? []);
    setIsActive(team ? team.is_active : true);
    setFormError('');
  }, [open, team]);

  const toggle = (key: string) => setAccess((a) => (a.includes(key) ? a.filter((k) => k !== key) : [...a, key]));
  const allSelected = access.length === TEAM_ACCESS_OPTIONS.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    if (!trimmedName) return setFormError('Team name is required.');

    setIsSubmitting(true);
    try {
      const body = { name: trimmedName, description: description.trim(), access };
      const res = isEdit
        ? await teamsService.update(team.id, { ...body, is_active: isActive })
        : await teamsService.create(body);
      const saved = readData<{ team?: Team }>(res)?.team;
      toast.success(isEdit ? 'Team updated' : 'Team created');
      onOpenChange(false);
      if (saved) onSaved(saved);
    } catch (err) {
      const message = getErrorMessage(err, isEdit ? 'Failed to update team' : 'Failed to create team');
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Team' : 'New Team'}</DialogTitle>
            <DialogDescription>
              Name the team and choose what its members can use. Add people to the team from the Members button.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="team-name" className="text-xs">Team name *</Label>
              <Input
                id="team-name"
                placeholder="e.g. Customer Support"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="team-description" className="text-xs">Description</Label>
              <Textarea
                id="team-description"
                rows={2}
                className="min-h-[60px]"
                placeholder="What does this team handle?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Access</Label>
                  <p className="text-[11px] text-white/40 light:text-gray-500">
                    Members can use these on top of what their own role allows.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[11px] font-medium text-emerald-400 light:text-emerald-600 hover:underline"
                  onClick={() => setAccess(allSelected ? [] : TEAM_ACCESS_OPTIONS.map((o) => o.key))}
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {TEAM_ACCESS_OPTIONS.map((o) => {
                  const on = access.includes(o.key);
                  const Icon = o.icon;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(o.key)}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        on
                          ? 'border-emerald-500/60 bg-emerald-500/10 light:bg-emerald-50'
                          : 'border-white/[0.08] hover:bg-white/[0.03] light:border-gray-200 light:hover:bg-gray-50'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-white/25 light:border-gray-300'
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-xs font-medium">
                          <Icon className="h-3.5 w-3.5 text-white/50 light:text-gray-500" />
                          {o.label}
                        </span>
                        <span className="block text-[11px] text-white/40 light:text-gray-500">{o.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isEdit && (
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] light:border-gray-200 px-3 py-2.5">
                <div>
                  <Label htmlFor="team-active" className="text-xs">Active</Label>
                  <p className="text-[11px] text-white/40 light:text-gray-500">
                    An inactive team gives its members no access and gets no chats.
                  </p>
                </div>
                <Switch id="team-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}

            {formError && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 light:text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                <span>{formError}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
