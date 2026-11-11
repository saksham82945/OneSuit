import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck, LifeBuoy, Search, Sun, Moon, Phone, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/hooks/useTheme';
import { primaryAccount, useWhatsAppAccounts } from '@/hooks/useWhatsAppAccounts';
import { exitVendorAccount, isInsideClient } from '@/services/superAdmin';
import { cn } from '@/lib/utils';
import { UserMenu } from './UserMenu';

interface TopStatusBarProps {
  className?: string;
  /** Opens the command palette. */
  onOpenSearch?: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The search field look-alike that opens the command palette. */
const SearchButton: React.FC<{ onClick?: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Search pages and actions"
    aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
    className="group flex h-8 min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 text-xs text-gray-500 transition-colors hover:border-gray-300 hover:bg-white hover:text-gray-700 sm:w-64 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20 dark:hover:bg-white/[0.07] dark:hover:text-gray-200"
  >
    <Search className="h-3.5 w-3.5 shrink-0" />
    <span className="hidden truncate sm:inline">Search pages and actions…</span>
    <kbd className="ml-auto hidden shrink-0 rounded border border-gray-200 bg-white px-1.5 py-px font-sans text-[10px] font-medium text-gray-500 sm:inline dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400">
      {isMac ? '⌘K' : 'Ctrl K'}
    </kbd>
  </button>
);

const ThemeButton: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-amber-300"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

/** The connected WhatsApp number (GET /api/accounts), or a link to connect one. */
const WhatsAppNumberPill: React.FC = () => {
  const { accounts, loading, failed } = useWhatsAppAccounts();
  const canWrite = useAuthStore((s) => s.hasPermission('accounts', 'write'));
  if (loading || failed) return null;

  const account = primaryAccount(accounts);
  if (!account) {
    if (!canWrite) return null;
    return (
      <Link
        to="/settings/whatsapp-setup"
        className="telemetry-pill shrink-0 !text-amber-700 hover:!bg-amber-50 dark:!text-amber-300 dark:hover:!bg-amber-500/10"
        title="No WhatsApp number is connected yet"
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
        <span className="text-[11px] font-semibold">Connect WhatsApp</span>
      </Link>
    );
  }

  const active = (account.status || 'active') === 'active';
  const name = account.display_name || account.name;
  return (
    <Link
      to="/settings/accounts"
      className="telemetry-pill min-w-0 hover:!bg-gray-100 dark:hover:!bg-white/[0.08]"
      title={`${name}${account.phone_number ? ` · ${account.phone_number}` : ''} · ${active ? 'Connected' : account.status}`}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', active ? 'bg-emerald-500' : 'bg-gray-400')} aria-hidden />
      <Phone className="hidden h-3 w-3 shrink-0 text-gray-400 sm:block" aria-hidden />
      <span className="max-w-[9rem] truncate text-[11px] font-semibold sm:max-w-[14rem]">{name}</span>
      {account.phone_number && (
        <span className="hidden truncate text-[11px] text-gray-500 lg:inline dark:text-gray-400">{account.phone_number}</span>
      )}
      <span className="sr-only">{active ? 'Connected' : account.status}</span>
    </Link>
  );
};

/** Super admin inside a client's account: one click back to the platform panel. */
const BackToSuperAdminButton: React.FC = () => {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const back = async () => {
    setLeaving(true);
    try {
      await exitVendorAccount();
      navigate('/super-admin/clients');
    } catch {
      toast.error('Could not leave the client account');
      setLeaving(false);
    }
  };
  return (
    <button
      type="button"
      onClick={back}
      disabled={leaving}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-60"
      title="Leave this client and go back to the Super Admin panel"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{leaving ? 'Returning…' : 'Back to Super Admin'}</span>
    </button>
  );
};

export const TopStatusBar: React.FC<TopStatusBarProps> = ({ className, onOpenSearch }) => {
  const { user } = useAuthStore();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const platformMode = isSuperAdmin && !isInsideClient(user);

  return (
    <div
      className={cn(
        'h-12 border-b border-gray-200/80 dark:border-[#1c2725] bg-white/90 dark:bg-[#111817]/90 backdrop-blur-sm px-3 sm:px-6 flex items-center justify-between gap-2 text-xs shrink-0 z-10 min-w-0',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {isSuperAdmin && !platformMode && <BackToSuperAdminButton />}
        <SearchButton onClick={onOpenSearch} />
        {platformMode && (
          <div className="hidden items-center gap-1.5 font-semibold text-violet-700 lg:flex dark:text-violet-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="truncate">Platform Operator Mode</span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        {platformMode ? (
          <Link
            to="/super-admin/tickets"
            className="telemetry-pill shrink-0 !border-violet-300/70 !text-violet-700 hover:!bg-violet-100/70 dark:!border-violet-700/50 dark:!text-violet-300 dark:hover:!bg-violet-950/50"
            title="Manage platform support tickets"
          >
            <LifeBuoy className="h-3.5 w-3.5" />
            <span className="hidden text-[11px] font-semibold sm:inline">Support Tickets</span>
          </Link>
        ) : (
          <WhatsAppNumberPill />
        )}
        <ThemeButton />
        <UserMenu variant="topbar" />
      </div>
    </div>
  );
};

export default TopStatusBar;
