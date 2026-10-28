import React, { useEffect, useState } from 'react';
import { teamsService, type Team } from '@/services/api';
import { readData } from '@/services/response';
import { ASSIGNMENT_STRATEGIES, type AssignmentStrategy } from '@/lib/constants';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../users/shared';

const MAX_TIMEOUT_SECS = 300;

export interface TeamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The team being edited; null/undefined creates a new team. */
  team?: Team | null;
  onSaved: (team: Team) => void;
}

export const TeamFormDialog: React.FC<TeamFormDialogProps> = ({ open, onOpenChange, team, onSaved }) => {
  const isEdit = !!team;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategy, setStrategy] = useState<AssignmentStrategy>('round_robin');
  const [timeoutSecs, setTimeoutSecs] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(team?.name || '');
    setDescription(team?.description || '');
    setStrategy(team?.assignment_strategy || 'round_robin');
    setTimeoutSecs(String(team?.per_agent_timeout_secs ?? 0));
    setIsActive(team ? team.is_active : true);
    setFormError('');
  }, [open, team]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    if (!trimmedName) return setFormError('Team name is required.');
    const timeout = timeoutSecs.trim() === '' ? 0 : Number(timeoutSecs);
    if (!Number.isInteger(timeout) || timeout < 0 || timeout > MAX_TIMEOUT_SECS) {
      return setFormError(`Ring timeout must be a whole number from 0 to ${MAX_TIMEOUT_SECS} seconds.`);
    }

    setIsSubmitting(true);
    try {
      // The update handler overwrites description, is_active and the timeout from
      // the body, so always send every field.
      const body = {
        name: trimmedName,
        description: description.trim(),
        assignment_strategy: strategy,
        per_agent_timeout_secs: timeout,
      };
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

  const selectedStrategy = ASSIGNMENT_STRATEGIES.find((s) => s.value === strategy);

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Team' : 'New Team'}</DialogTitle>
            <DialogDescription>
              Teams receive transferred conversations and route them to their members.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="team-name" className="text-xs">Name *</Label>
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

            <div className="grid gap-1.5">
              <Label className="text-xs">Assignment Strategy</Label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as AssignmentStrategy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStrategy && (
                <p className="text-[11px] text-white/40 light:text-gray-500">{selectedStrategy.description}</p>
              )}
            </div>

            {strategy !== 'manual' && (
              <div className="grid gap-1.5">
                <Label htmlFor="team-timeout" className="text-xs">Per-Agent Ring Timeout (seconds)</Label>
                <Input
                  id="team-timeout"
                  type="number"
                  min={0}
                  max={MAX_TIMEOUT_SECS}
                  step={1}
                  value={timeoutSecs}
                  onChange={(e) => setTimeoutSecs(e.target.value)}
                />
                <p className="text-[11px] text-white/40 light:text-gray-500">
                  For calls: seconds to ring each agent before trying the next. 0 uses the global default.
                </p>
              </div>
            )}

            {isEdit && (
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] light:border-gray-200 px-3 py-2.5">
                <div>
                  <Label htmlFor="team-active" className="text-xs">Active</Label>
                  <p className="text-[11px] text-white/40 light:text-gray-500">
                    Inactive teams don't receive new assignments.
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
