import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LogOut, User, Globe, ShieldCheck, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTheme } from '@/hooks/useTheme';

function getInitials(name: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const UserMenu: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, isAvailable, setAvailability, logout } = useAuthStore();
  const { isDark, toggleTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const handleToggleAvailability = (checked: boolean) => {
    setAvailability(checked, checked ? null : new Date().toISOString());
    toast.success(checked ? 'Status set to Available' : 'Status set to Away');
  };

  const handleToggleTheme = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTheme();
    toast.success(isDark ? 'Switched to Light Mode' : 'Switched to Dark Mode');
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/login');
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('locale', lang);
    if (lang === 'ar') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
  };

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'pt', label: 'Português' },
    { code: 'ta', label: 'தமிழ்' },
    { code: 'ar', label: 'العربية' },
  ];

  return (
    <div className="border-t border-gray-200/80 dark:border-white/[0.08] p-2 bg-transparent select-none">
      <div className="flex items-center justify-between gap-1.5">
        {/* Account Trigger */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'flex items-center justify-start flex-1 min-w-0 h-auto px-2 py-1.5 gap-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors',
                collapsed && 'md:justify-center px-1'
              )}
              aria-label="My Account"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-semibold flex items-center justify-center text-xs shrink-0 ring-2 ring-emerald-500/20 shadow-sm">
                {getInitials(user?.full_name || 'Admin')}
              </div>
              {!collapsed && (
                <div className="flex flex-col items-start text-left overflow-hidden flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-[13px] font-semibold truncate text-gray-900 dark:text-gray-100 leading-tight">
                      {user?.full_name || 'Admin User'}
                    </span>
                    {user?.is_super_admin && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300 rounded shrink-0">
                        Admin
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[130px]">
                    {user?.email || 'admin@admin.com'}
                  </span>
                </div>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            side="top"
            align="start"
            className="w-64 p-2 bg-white dark:bg-[#141b1a] border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-gray-100 shadow-2xl rounded-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header info */}
            <div className="px-2 py-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                {t('userMenu.myAccount') || 'My Account'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {user?.email || 'admin@admin.com'}
              </div>
            </div>

            <Separator className="my-1.5 bg-gray-200 dark:bg-white/[0.08]" />

            {/* Theme Toggle in My Account dropdown */}
            <div className="px-2 py-1.5 rounded-xl bg-gray-50/90 dark:bg-white/[0.04] mb-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200">
                  {isDark ? (
                    <Moon className="h-3.5 w-3.5 text-teal-400" />
                  ) : (
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  <span>Appearance</span>
                </div>
                <div className="inline-flex items-center rounded-lg bg-gray-200/80 dark:bg-black/50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all',
                      !isDark
                        ? 'bg-white text-gray-900 shadow-sm font-semibold'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    )}
                  >
                    <Sun className="h-3 w-3" />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all',
                      isDark
                        ? 'bg-teal-600 text-white shadow-sm font-semibold'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    )}
                  >
                    <Moon className="h-3 w-3" />
                    <span>Dark</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Availability Toggle */}
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {t('userMenu.status') || 'Status'}
                </span>
                <Badge
                  className={cn(
                    'text-[10px] px-1.5 py-0 border-0',
                    isAvailable
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-white/60'
                  )}
                >
                  {isAvailable ? t('userMenu.available') || 'Available' : t('userMenu.away') || 'Away'}
                </Badge>
              </div>
              <Switch
                checked={isAvailable}
                onCheckedChange={handleToggleAvailability}
                aria-label="Toggle availability"
              />
            </div>

            <Separator className="my-1.5 bg-gray-200 dark:bg-white/[0.08]" />

            {/* Profile */}
            <Link to="/profile" onClick={() => setOpen(false)}>
              <Button
                variant="ghost"
                className="w-full justify-start px-2 py-1.5 h-auto text-xs font-normal text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/[0.06] rounded-lg"
              >
                <User className="mr-2 h-3.5 w-3.5" />
                <span>{t('userMenu.profile') || 'Profile'}</span>
              </Button>
            </Link>

            {user?.is_super_admin && (
              <Link to="/super-admin" onClick={() => setOpen(false)}>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-2 py-1.5 h-auto text-xs font-normal text-teal-700 hover:text-teal-800 hover:bg-teal-50 dark:text-teal-400 dark:hover:text-teal-300 dark:hover:bg-white/[0.06] rounded-lg font-medium"
                >
                  <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                  <span>Platform Admin</span>
                </Button>
              </Link>
            )}

            <Separator className="my-1.5 bg-gray-200 dark:bg-white/[0.08]" />

            {/* Language Switcher */}
            <div className="px-2 py-1">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
                <Globe className="h-3 w-3" />
                <span>{t('userMenu.language') || 'Language'}</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => changeLanguage(l.code)}
                    className={cn(
                      'text-[11px] px-2 py-1 rounded-md text-left transition-colors',
                      i18n.language === l.code
                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-400 font-semibold'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]'
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator className="my-1.5 bg-gray-200 dark:bg-white/[0.08]" />

            {/* Logout */}
            <Button
              variant="ghost"
              className="w-full justify-start px-2 py-1.5 h-auto text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 rounded-lg"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              <span>{t('userMenu.logOut') || 'Log out'}</span>
            </Button>
          </PopoverContent>
        </Popover>

        {/* Dedicated Quick Theme Toggle Button in My Account Bar */}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={handleToggleTheme}
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className="h-8 w-8 rounded-xl shrink-0 text-gray-600 hover:text-gray-900 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:text-amber-300 dark:hover:bg-white/[0.08] transition-all"
            aria-label="Toggle theme mode"
          >
            {isDark ? (
              <Sun className="h-4 w-4 text-amber-400 animate-in spin-in-90 duration-200" />
            ) : (
              <Moon className="h-4 w-4 text-teal-700 animate-in spin-in-90 duration-200" />
            )}
          </Button>
        )}
      </div>

      {/* When collapsed, small theme icon under the avatar */}
      {collapsed && (
        <div className="flex justify-center mt-1">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={handleToggleTheme}
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className="h-7 w-7 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-amber-300 dark:hover:bg-white/[0.08]"
            aria-label="Toggle theme mode"
          >
            {isDark ? (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-teal-700" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
