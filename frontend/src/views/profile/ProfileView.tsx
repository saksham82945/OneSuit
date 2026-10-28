import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { api, usersService } from '@/services/api';
import { readData } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const ProfileView: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  // The user object has no organization_name; GET /organizations/current (data: { id, name })
  // resolves the active org, including one picked via the org switcher.
  const [orgName, setOrgName] = useState(user?.organization_name || '');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/organizations/current')
      .then((res) => {
        const name = readData<{ name?: string } | null>(res)?.name;
        if (!cancelled && name) setOrgName(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.organization_id]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t('profile.passwordMismatch') || 'New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t('profile.passwordTooShort') || 'Password must be at least 6 characters');
      return;
    }

    setIsChanging(true);
    try {
      await usersService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success(t('profile.passwordChanged') || 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      // e.g. "Current password is incorrect"
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Failed to change password');
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('profile.title') || 'My Profile & Account'}
        subtitle={t('profile.description') || 'Manage your account credentials and system preferences'}
        icon={User}
        iconGradient="bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl mx-auto w-full">
        {/* User Info */}
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {t('profile.accountInfo') || 'Account Information'}
            </CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              {t('profile.accountInfoDesc') || 'Your login credentials and assigned organization roles'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-white/40 light:text-gray-400">{t('common.name') || 'Full Name'}</Label>
                <p className="font-medium text-sm text-white mt-1 light:text-gray-900">{user?.full_name || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-white/40 light:text-gray-400">{t('common.email') || 'Email Address'}</Label>
                <p className="font-medium text-sm text-white mt-1 light:text-gray-900">{user?.email || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-white/40 light:text-gray-400">{t('users.role') || 'Role'}</Label>
                <p className="font-medium text-sm text-emerald-400 capitalize mt-1">
                  {user?.role?.name || (user?.is_super_admin ? 'Super Admin' : '—')}
                </p>
              </div>
              <div>
                <Label className="text-xs text-white/40 light:text-gray-400">Organization</Label>
                <p className="font-medium text-sm text-white mt-1 light:text-gray-900">
                  {orgName || '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password Form */}
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {t('profile.changePassword') || 'Change Password'}
            </CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              {t('profile.changePasswordDesc') || 'Update your security password regularly'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="current" className="text-xs">{t('profile.currentPassword') || 'Current Password'}</Label>
                <div className="relative">
                  <Input
                    id="current"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white light:text-gray-400 light:hover:text-gray-900"
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="new" className="text-xs">{t('profile.newPassword') || 'New Password'}</Label>
                <div className="relative">
                  <Input
                    id="new"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white light:text-gray-400 light:hover:text-gray-900"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="confirm" className="text-xs">{t('profile.confirmNewPassword') || 'Confirm New Password'}</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={isChanging}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {isChanging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('profile.changePassword') || 'Update Password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default ProfileView;
