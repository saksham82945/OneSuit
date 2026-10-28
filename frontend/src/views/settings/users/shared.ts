import { useEffect, useState } from 'react';
import axios from 'axios';

/** A user as returned by GET /api/users (UserResponse in internal/handlers/users.go). */
export interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role_id?: string;
  role?: { id: string; name: string; description?: string; is_system?: boolean };
  is_active: boolean;
  is_available: boolean;
  is_super_admin: boolean;
  /** Belongs to another organization and was added here as a member. */
  is_member: boolean;
  created_at: string;
  updated_at?: string;
}

/** A role as returned by GET /api/roles. */
export interface RoleItem {
  id: string;
  name: string;
  description?: string;
  is_system: boolean;
  is_default: boolean;
}

export type InviteStatus = 'active' | 'expired' | 'used';

/** An invite link (InviteResponse in internal/handlers/signup.go). */
export interface InviteItem {
  id: string;
  /** Only present in the POST /api/invites response. */
  token?: string;
  /** Only present in the POST /api/invites response, e.g. "/join/<token>". */
  path?: string;
  role_id: string;
  role_name: string;
  email: string;
  expires_at: string;
  /** 0 means unlimited. */
  max_uses: number;
  used_count: number;
  status: InviteStatus;
  created_at: string;
}

/** The `message` of an API error envelope ({ status: 'error', message }), or the fallback. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return fallback;
}

/** `value`, updated only after it has stopped changing for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export const formatDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** The role new people get by default: the one marked default, else the system "agent" role. */
export const getDefaultRoleId = (roles: RoleItem[]) =>
  roles.find((r) => r.is_default)?.id ||
  roles.find((r) => r.name === 'agent' && r.is_system)?.id ||
  roles[0]?.id ||
  '';

/** Badge colours per role name, matching the other settings screens. */
export const roleBadgeClass = (name?: string) => {
  switch ((name || '').toLowerCase()) {
    case 'admin':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30 light:text-purple-700';
    case 'manager':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30 light:text-blue-700';
    default:
      return 'bg-white/[0.04] text-white/70 border-white/[0.12] light:bg-gray-100 light:text-gray-700 light:border-gray-200';
  }
};

/** The full, shareable URL for an invite path such as "/join/<token>". */
export const inviteUrl = (path: string) => {
  const basePath = (((window as unknown as { __BASE_PATH__?: string }).__BASE_PATH__) ?? '').replace(/\/$/, '');
  return `${window.location.origin}${basePath}${path}`;
};
