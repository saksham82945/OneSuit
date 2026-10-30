import { create } from 'zustand';
import { api } from '@/services/api';

export type CallRingtone = 'ring' | 'beep' | 'none';

export interface UserSettings {
  email_notifications?: boolean;
  new_message_alerts?: boolean;
  campaign_updates?: boolean;
  call_ringtone?: CallRingtone;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

export interface UserRole {
  id: string;
  name: string;
  description?: string;
  is_system: boolean;
  permissions?: Permission[];
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role_id?: string;
  role?: UserRole;
  organization_id: string;
  // Not returned by the backend (login, /me and switch-org all send the bare user).
  // Kept optional for older cached sessions; resolve the name via GET /organizations/current.
  organization_name?: string;
  settings?: UserSettings;
  is_available?: boolean;
  is_super_admin?: boolean;
}

interface AuthState {
  user: User | null;
  breakStartedAt: string | null;
  isAuthenticated: boolean;
  userRole: string;
  organizationId: string;
  isAvailable: boolean;

  setAuth: (user: User) => void;
  clearAuth: () => void;
  restoreSession: () => boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    full_name: string;
    organization_id: string;
  }) => Promise<void>;
  switchOrg: (organizationId: string) => Promise<void>;
  logout: () => Promise<void>;
  setAvailability: (available: boolean, breakStart?: string | null) => void;
  hasPermission: (resource: string, action?: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  breakStartedAt: null,
  isAuthenticated: false,
  userRole: 'agent',
  organizationId: '',
  isAvailable: true,

  setAuth: (user: User) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({
      user,
      isAuthenticated: true,
      userRole: user.role?.name || 'agent',
      organizationId: user.organization_id || '',
      isAvailable: user.is_available ?? true,
    });
  },

  clearAuth: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('selected_organization_id');
    localStorage.removeItem('super_admin_return_org');
    localStorage.removeItem('super_admin_vendor_name');
    set({
      user: null,
      isAuthenticated: false,
      userRole: 'agent',
      organizationId: '',
      isAvailable: true,
      breakStartedAt: null,
    });
  },

  restoreSession: () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.email) {
          get().setAuth(parsed);
          return true;
        }
      } catch {
        get().clearAuth();
      }
    }
    return false;
  },

  // Re-read the signed-in user from the server so changes made elsewhere
  // (role, permissions, super admin rights) apply without logging out.
  refreshUser: async () => {
    const current = get().user;
    if (!current) return;
    try {
      const response = await api.get('/me');
      const fresh = response.data?.data as Partial<User> | undefined;
      if (fresh && fresh.id === current.id) {
        // Keep the organization this session switched into.
        get().setAuth({ ...current, ...fresh, organization_id: current.organization_id });
      }
    } catch {
      // Network errors or 401s are handled by the API client; keep the cached user.
    }
  },

  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    // A fresh login always starts in the user's own account.
    localStorage.removeItem('super_admin_return_org');
    localStorage.removeItem('super_admin_vendor_name');
    const user = response.data.data.user;
    get().setAuth(user);
  },

  register: async (data) => {
    const response = await api.post('/auth/register', data);
    const user = response.data.data.user;
    get().setAuth(user);
  },

  switchOrg: async (organizationId: string) => {
    const response = await api.post('/auth/switch-org', { organization_id: organizationId });
    const user = response.data.data.user;
    get().setAuth(user);
    localStorage.setItem('selected_organization_id', organizationId);
  },

  logout: async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Ignore logout errors; local auth is cleared either way.
    } finally {
      get().clearAuth();
    }
  },

  setAvailability: (available: boolean, breakStart?: string | null) => {
    const currentUser = get().user;
    if (currentUser) {
      const updated = { ...currentUser, is_available: available };
      localStorage.setItem('user', JSON.stringify(updated));
      set({
        user: updated,
        isAvailable: available,
        breakStartedAt: !available && breakStart ? breakStart : null,
      });
    }
  },

  hasPermission: (resource: string, action: string = 'read') => {
    const user = get().user;
    if (!user) return false;
    if (user.is_super_admin) return true;

    const permissions = user.role?.permissions;
    if (!permissions || !Array.isArray(permissions)) return false;

    return permissions.some(
      (p) =>
        (p.resource === resource || p.resource === '*') &&
        (p.action === action || p.action === '*')
    );
  },
}));
