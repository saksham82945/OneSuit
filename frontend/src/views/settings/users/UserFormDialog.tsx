import React, { useEffect, useState } from 'react';
import { api, usersService } from '@/services/api';
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
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getDefaultRoleId, getErrorMessage, isValidEmail, type RoleItem, type UserItem } from './shared';

export interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user being edited; null/undefined creates a new user. */
  user?: UserItem | null;
  roles: RoleItem[];
  rolesLoading?: boolean;
  currentUserId?: string;
  /** Only super admins may grant or revoke super admin. */
  isSuperAdmin: boolean;
  onSaved: (user: UserItem) => void;
}

export const UserFormDialog: React.FC<UserFormDialogProps> = ({
  open,
  onOpenChange,
  user,
  roles,
  rolesLoading,
  currentUserId,
  isSuperAdmin,
  onSaved,
}) => {
  const isEdit = !!user;
  const isSelf = !!user && user.id === currentUserId;
  // Members from another organization: only their role here can be changed.
  const isMember = !!user?.is_member;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [makeSuperAdmin, setMakeSuperAdmin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFullName(user?.full_name || '');
    setEmail(user?.email || '');
    setPassword('');
    setRoleId(user ? user.role_id || user.role?.id || '' : getDefaultRoleId(roles));
    setIsActive(user ? user.is_active : true);
    setMakeSuperAdmin(user?.is_super_admin || false);
    setFormError('');
    // roles are deliberately not a dependency: a late roles load must not wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  // Roles may arrive after the dialog opened; pick the default then.
  useEffect(() => {
    if (open && !roleId && !user && roles.length) setRoleId(getDefaultRoleId(roles));
  }, [open, roleId, user, roles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const name = fullName.trim();
    const mail = email.trim();
    if (!isMember) {
      if (!name || !mail) return setFormError('Full name and email are required.');
      if (!isValidEmail(mail)) return setFormError('Enter a valid email address.');
      if (!isEdit && !password) return setFormError('A password is required.');
      if (password && password.length < 6) return setFormError('Password must be at least 6 characters.');
    }
    if (!roleId) return setFormError('Choose a role.');

    setIsSubmitting(true);
    try {
      let res;
      if (!isEdit) {
        // POST /api/users: { email, password, full_name, role_id, is_super_admin? }
        const body: Record<string, unknown> = { email: mail, password, full_name: name, role_id: roleId };
        if (isSuperAdmin && makeSuperAdmin) body.is_super_admin = true;
        res = await api.post('/users', body);
      } else if (isMember) {
        // Cross-org members: the API only accepts a role change.
        res = await usersService.update(user.id, { role_id: roleId });
      } else {
        // PUT /api/users/{id}: { email, full_name, role_id, is_active, password?, is_super_admin? }
        const body: Record<string, unknown> = {
          email: mail,
          full_name: name,
          role_id: roleId,
          is_active: isActive,
        };
        if (password) body.password = password;
        if (isSuperAdmin && makeSuperAdmin !== user.is_super_admin) body.is_super_admin = makeSuperAdmin;
        res = await api.put(`/users/${user.id}`, body);
      }
      toast.success(isEdit ? 'User updated' : 'User created');
      onOpenChange(false);
      onSaved(readData<UserItem>(res));
    } catch (err) {
      // Includes the plan limit ("Your plan allows up to N users...").
      const message = getErrorMessage(err, isEdit ? 'Failed to update user' : 'Failed to create user');
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedRole = roles.find((r) => r.id === roleId);

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit User' : 'Add User'}</DialogTitle>
            <DialogDescription>
              {isMember
                ? 'This person belongs to another organization. Only their role here can be changed.'
                : isEdit
                  ? 'Update the account details and role.'
                  : 'Create a login for a new team member. Share the password with them securely.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="user-full-name" className="text-xs">Full Name *</Label>
              <Input
                id="user-full-name"
                placeholder="e.g. Alex Morgan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isMember}
                autoComplete="off"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="user-email" className="text-xs">Email *</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="alex@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isMember}
                autoComplete="off"
              />
            </div>

            {!isMember && (
              <div className="grid gap-1.5">
                <Label htmlFor="user-password" className="text-xs">
                  {isEdit ? 'New Password' : 'Password *'}
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  placeholder={isEdit ? 'Leave blank to keep the current password' : 'At least 6 characters'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-xs">Role *</Label>
              <Select value={roleId} onValueChange={setRoleId} disabled={rolesLoading && !roles.length}>
                <SelectTrigger>
                  <SelectValue placeholder={rolesLoading ? 'Loading roles...' : 'Select a role'}>
                    {selectedRole && <span className="capitalize">{selectedRole.name}</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{role.name}</span>
                        {role.is_system && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">System</Badge>
                        )}
                        {role.is_default && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Default</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRole?.description && (
                <p className="text-[11px] text-white/40 light:text-gray-500">{selectedRole.description}</p>
              )}
            </div>

            {isEdit && !isMember && (
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] light:border-gray-200 px-3 py-2.5">
                <div>
                  <Label htmlFor="user-active" className="text-xs">Active</Label>
                  <p className="text-[11px] text-white/40 light:text-gray-500">
                    {isSelf ? 'You cannot deactivate your own account.' : 'Inactive users cannot sign in.'}
                  </p>
                </div>
                <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} disabled={isSelf} />
              </div>
            )}

            {isSuperAdmin && !isMember && (
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] light:border-gray-200 px-3 py-2.5">
                <div>
                  <Label htmlFor="user-super-admin" className="text-xs">Super Admin</Label>
                  <p className="text-[11px] text-white/40 light:text-gray-500">
                    Full access to every organization on this instance.
                  </p>
                </div>
                <Switch
                  id="user-super-admin"
                  checked={makeSuperAdmin}
                  onCheckedChange={setMakeSuperAdmin}
                  disabled={isSelf && user?.is_super_admin}
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
              {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
