import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, AlertTriangle, Check, Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatDateTime,
  getDefaultRoleId,
  getErrorMessage,
  inviteUrl,
  isValidEmail,
  type InviteItem,
  type RoleItem,
} from './shared';

const EXPIRY_OPTIONS = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

type UsesMode = 'single' | 'unlimited' | 'custom';
const MAX_USES = 1000; // maxInviteUses in internal/handlers/signup.go

const copyText = async (text: string, fallbackInput?: HTMLInputElement | null) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (e.g. insecure origin): fall back to a selection copy.
    if (!fallbackInput) return false;
    fallbackInput.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
};

export interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleItem[];
  rolesLoading?: boolean;
  onCreated: (invite: InviteItem) => void;
}

export const InviteDialog: React.FC<InviteDialogProps> = ({ open, onOpenChange, roles, rolesLoading, onCreated }) => {
  const [roleId, setRoleId] = useState('');
  const [email, setEmail] = useState('');
  const [expiry, setExpiry] = useState('7');
  const [usesMode, setUsesMode] = useState<UsesMode>('single');
  const [customUses, setCustomUses] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [created, setCreated] = useState<InviteItem | null>(null);
  const [copied, setCopied] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRoleId(getDefaultRoleId(roles));
    setEmail('');
    setExpiry('7');
    setUsesMode('single');
    setCustomUses('5');
    setFormError('');
    setCreated(null);
    setCopied(false);
  };

  useEffect(() => {
    if (open) reset();
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !roleId && roles.length) setRoleId(getDefaultRoleId(roles));
  }, [open, roleId, roles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const mail = email.trim();
    if (mail && !isValidEmail(mail)) return setFormError('Enter a valid email address, or leave it blank.');
    let maxUses = 1;
    if (usesMode === 'unlimited') maxUses = 0;
    if (usesMode === 'custom') {
      maxUses = Number(customUses);
      if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_USES) {
        return setFormError(`Number of uses must be a whole number from 1 to ${MAX_USES}.`);
      }
    }

    setIsSubmitting(true);
    try {
      // POST /api/invites: { role_id?, email?, expires_in_days, max_uses }
      const res = await api.post('/invites', {
        role_id: roleId || undefined,
        email: mail || undefined,
        expires_in_days: Number(expiry),
        max_uses: maxUses,
      });
      const invite = readData<InviteItem>(res);
      setCreated(invite);
      onCreated(invite);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create invite link');
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const link = created?.path ? inviteUrl(created.path) : '';

  const handleCopy = async () => {
    if (!link) return;
    if (await copyText(link, linkInputRef.current)) {
      setCopied(true);
      toast.success('Invite link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  };

  const selectedRole = roles.find((r) => r.id === roleId);

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[480px]">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite link ready</DialogTitle>
              <DialogDescription>
                {created.email
                  ? `Only ${created.email} can use this link to join this organization.`
                  : 'Anyone who opens this link can create an account in this organization.'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="flex items-center gap-2">
                <Input
                  ref={linkInputRef}
                  readOnly
                  value={link}
                  aria-label="Invite link"
                  className="font-mono text-[11px]"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 light:text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                <span>
                  Copy this link now. It is shown only once and cannot be retrieved later. If you lose it,
                  revoke it and create a new one.
                </span>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-white/[0.03] light:bg-gray-50 px-3 py-2">
                  <dt className="text-white/40 light:text-gray-500">Role</dt>
                  <dd className="capitalize font-medium mt-0.5">{created.role_name || '—'}</dd>
                </div>
                <div className="rounded-md bg-white/[0.03] light:bg-gray-50 px-3 py-2">
                  <dt className="text-white/40 light:text-gray-500">Uses</dt>
                  <dd className="font-medium mt-0.5">
                    {created.max_uses === 0 ? 'Unlimited' : created.max_uses === 1 ? 'Single use' : `${created.max_uses} uses`}
                  </dd>
                </div>
                <div className="rounded-md bg-white/[0.03] light:bg-gray-50 px-3 py-2">
                  <dt className="text-white/40 light:text-gray-500">Expires</dt>
                  <dd className="font-medium mt-0.5">{formatDateTime(created.expires_at)}</dd>
                </div>
              </dl>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={reset}>
                Create another
              </Button>
              <Button type="button" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-emerald-400" />
                Invite people
              </DialogTitle>
              <DialogDescription>
                Create a link people can use to sign up and join this organization with the chosen role.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={roleId} onValueChange={setRoleId} disabled={rolesLoading && !roles.length}>
                  <SelectTrigger>
                    <SelectValue placeholder={rolesLoading ? 'Loading roles...' : 'Default role'}>
                      {selectedRole && <span className="capitalize">{selectedRole.name}</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        <div className="flex items-center gap-2">
                          <span className="capitalize">{role.name}</span>
                          {role.is_default && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Default</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="invite-email" className="text-xs">Restrict to email (optional)</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="Anyone with the link"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-[11px] text-white/40 light:text-gray-500">
                  When set, only this email address can accept the invite.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Expires after</Label>
                  <Select value={expiry} onValueChange={setExpiry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Uses</Label>
                  <Select value={usesMode} onValueChange={(v) => setUsesMode(v as UsesMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single use</SelectItem>
                      <SelectItem value="unlimited">Unlimited</SelectItem>
                      <SelectItem value="custom">Set a number</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {usesMode === 'custom' && (
                <div className="grid gap-1.5">
                  <Label htmlFor="invite-uses" className="text-xs">Number of uses</Label>
                  <Input
                    id="invite-uses"
                    type="number"
                    min={1}
                    max={MAX_USES}
                    step={1}
                    value={customUses}
                    onChange={(e) => setCustomUses(e.target.value)}
                  />
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
                {isSubmitting ? 'Creating...' : 'Create link'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
