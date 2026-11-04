import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { useAuthStore } from '@/stores/auth';

// Sections a subscription plan can switch off (see backend plan_modules.go).
// The menu hides them and their pages show a "not in your plan" notice.

export type PlanModuleKey =
  | 'campaigns'
  | 'chatbot'
  | 'ai_agents'
  | 'ads_manager'
  | 'webhooks'
  | 'api_integration'
  | 'calling'
  | 'catalogue'
  | 'integrations';

export type PlanModules = Partial<Record<PlanModuleKey, boolean>>;

/** Which module a page belongs to (undefined: always available). */
export function moduleForPath(path: string): PlanModuleKey | undefined {
  const is = (p: string) => path === p || path.startsWith(p + '/');
  if (is('/campaigns')) return 'campaigns';
  if (is('/ads')) return 'ads_manager';
  if (is('/chatbot/ai')) return 'ai_agents';
  if (is('/flows') || is('/chatbot/flows') || is('/chatbot/keywords')) return 'chatbot';
  if (is('/settings/webhooks')) return 'webhooks';
  if (is('/settings/api-keys')) return 'api_integration';
  if (is('/calling')) return 'calling';
  if (is('/catalogs')) return 'catalogue';
  if (is('/settings/integrations')) return 'integrations';
  return undefined;
}

/** Primary-rail sections and the modules inside them (hidden when all are off). */
const RAIL_MODULES: Record<string, PlanModuleKey[]> = {
  campaigns: ['campaigns'],
  ads: ['ads_manager'],
  catalogs: ['catalogue'],
  flows: ['chatbot', 'ai_agents'],
};

let cache: { userId: string; modules: PlanModules } | null = null;
let inflight: Promise<PlanModules> | null = null;

function fetchModules(): Promise<PlanModules> {
  if (!inflight) {
    inflight = api
      .get('/plan/modules')
      .then((r) => readData<{ modules: PlanModules }>(r)?.modules ?? {})
      .catch(() => ({}))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The current workspace's module switches; everything is on until loaded. */
export function usePlanModules() {
  const user = useAuthStore((s) => s.user);
  const key = user ? `${user.id}:${user.organization_id ?? ''}` : '';
  const [modules, setModules] = useState<PlanModules>(cache?.userId === key ? cache.modules : {});

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void fetchModules().then((m) => {
      cache = { userId: key, modules: m };
      if (alive) setModules(m);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const isOn = (m?: PlanModuleKey) => !m || modules[m] !== false;
  return {
    modules,
    isOn,
    pathAllowed: (path: string) => isOn(moduleForPath(path)),
    railAllowed: (railId: string) => {
      const mods = RAIL_MODULES[railId];
      return !mods || mods.some((m) => isOn(m));
    },
  };
}
