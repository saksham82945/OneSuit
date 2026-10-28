import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Building2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Organization {
  id: string;
  name: string;
  slug?: string;
  role?: string;
}

type RawOrganization = {
  id?: string;
  organization_id?: string;
  name?: string;
  slug?: string;
  role?: string;
  role_name?: string;
};

/**
 * Accepts the real API shape ({ organizations: [...] }, items keyed by
 * organization_id) as well as a bare array, and normalizes to Organization[].
 */
const toOrganizations = (payload: unknown): Organization[] => {
  const raw = Array.isArray(payload)
    ? payload
    : (payload as { organizations?: unknown } | null)?.organizations;
  if (!Array.isArray(raw)) return [];
  return (raw as RawOrganization[])
    .map((o) => ({
      id: o.id ?? o.organization_id ?? '',
      name: o.name ?? '',
      slug: o.slug,
      role: o.role ?? o.role_name,
    }))
    .filter((o) => o.id);
};

/** Fetch the orgs to offer: memberships, plus every org for super admins. */
const fetchOrganizations = async (isSuperAdmin: boolean): Promise<Organization[]> => {
  const mine = toOrganizations((await api.get('/me/organizations')).data?.data);
  if (!isSuperAdmin) return mine;
  try {
    const all = toOrganizations((await api.get('/organizations')).data?.data);
    const seen = new Set(mine.map((o) => o.id));
    return [...mine, ...all.filter((o) => !seen.has(o.id))];
  } catch {
    return mine;
  }
};

export const OrganizationSwitcher: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const { t } = useTranslation();
  const { user, switchOrg, hasPermission } = useAuthStore();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const isSuperAdmin = user?.is_super_admin || false;
  const canCreateOrg = hasPermission('organizations', 'write');

  useEffect(() => {
    let cancelled = false;
    fetchOrganizations(isSuperAdmin)
      .catch(() => [] as Organization[])
      .then((orgs) => {
        if (cancelled) return;
        // Always include the org the session is in, so the select has a value.
        if (user?.organization_id && !orgs.some((o) => o.id === user.organization_id)) {
          orgs = [{ id: user.organization_id, name: user.organization_name || 'Current organization' }, ...orgs];
        }
        setOrganizations(orgs);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isSuperAdmin]);

  const handleSelectOrg = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const orgId = e.target.value;
    if (!orgId || orgId === user?.organization_id) return;
    try {
      await switchOrg(orgId);
      window.location.reload();
    } catch {
      toast.error('Failed to switch organization');
    }
  };

  const submitCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setIsCreating(true);
    try {
      await api.post('/organizations', { name: newOrgName.trim() });
      toast.success(t('organizations.created') || 'Organization created');
      setIsCreateOpen(false);
      setNewOrgName('');
      setOrganizations(await fetchOrganizations(isSuperAdmin));
    } catch {
      toast.error(t('organizations.createFailed') || 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isSuperAdmin && organizations.length <= 1) {
    return null;
  }

  return (
    <div className="px-2 py-2 border-b border-white/[0.08] light:border-gray-200">
      {!collapsed ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-medium text-white/40 light:text-gray-400 uppercase tracking-wide px-1"
              title={isSuperAdmin ? 'The vendor whose workspace the menu below manages' : undefined}
            >
              {isSuperAdmin ? 'Vendor' : 'Organization'}
            </span>
            {canCreateOrg && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-white/50 hover:text-white light:text-gray-500 light:hover:text-gray-900"
                onClick={() => setIsCreateOpen(true)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="relative">
            <select
              value={user?.organization_id || ''}
              onChange={handleSelectOrg}
              aria-label="Select organization"
              className="w-full h-8 px-2.5 py-1 text-[13px] bg-white/[0.04] light:bg-gray-100 text-white light:text-gray-900 border border-white/[0.08] light:border-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id} className="bg-[#141414] text-white light:bg-white light:text-gray-900">
                  {org.name}
                </option>
              ))}
            </select>
            <Building2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-white/40 pointer-events-none light:text-gray-400" />
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:text-white light:text-gray-600 light:hover:text-gray-900"
            title={user?.organization_name || 'Organization'}
          >
            <Building2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Create Org Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-sm bg-[#141414] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900">
          <DialogHeader>
            <DialogTitle>{t('organizations.createTitle') || 'Create Organization'}</DialogTitle>
            <DialogDescription className="text-white/50 text-xs light:text-gray-500">
              {t('organizations.createDesc') || 'Add a new workspace organization.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="bg-white/[0.04] border-white/[0.08] light:bg-gray-50 light:border-gray-200"
              onKeyDown={(e) => e.key === 'Enter' && submitCreateOrg()}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="border-white/[0.08] light:border-gray-200">
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button
              onClick={submitCreateOrg}
              disabled={isCreating || !newOrgName.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.create') || 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default OrganizationSwitcher;
