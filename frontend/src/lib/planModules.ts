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
  | 'integrations'
  | 'teams';

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
  if (is('/settings/teams')) return 'teams';
  return undefined;
}

/** Primary-rail sections and the modules inside them (hidden when all are off). */
const RAIL_MODULES: Record<string, PlanModuleKey[]> = {
  campaigns: ['campaigns'],
  ads: ['ads_manager'],
  catalogs: ['catalogue'],
  flows: ['chatbot', 'ai_agents'],
};

interface PlanState {
  modules: PlanModules;
  /** The workspace signed up for a paid plan and hasn't paid yet. */
  pendingPayment: boolean;
}

const EMPTY: PlanState = { modules: {}, pendingPayment: false };

let cache: { userId: string; state: PlanState } | null = null;
let inflight: Promise<PlanState> | null = null;
const listeners = new Set<() => void>();

function fetchModules(): Promise<PlanState> {
  if (!inflight) {
    inflight = api
      .get('/plan/modules')
      .then((r) => {
        const d = readData<{ modules?: PlanModules; pending_payment?: boolean }>(r);
        return { modules: d?.modules ?? {}, pendingPayment: d?.pending_payment === true };
      })
      .catch(() => EMPTY)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drops the cached plan state and reloads it in every mounted usePlanModules (e.g. after a payment). */
export function refreshPlanModules() {
  cache = null;
  listeners.forEach((l) => l());
}

/** The current workspace's module switches; everything is on until loaded. */
export function usePlanModules() {
  const user = useAuthStore((s) => s.user);
  const key = user ? `${user.id}:${user.organization_id ?? ''}` : '';
  const [state, setState] = useState<PlanState>(cache?.userId === key ? cache.state : EMPTY);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void fetchModules().then((next) => {
      cache = { userId: key, state: next };
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [key, version]);

  const { modules, pendingPayment } = state;

  const isOn = (m?: PlanModuleKey) => !m || modules[m] !== false;
  return {
    modules,
    pendingPayment,
    isOn,
    pathAllowed: (path: string) => isOn(moduleForPath(path)),
    railAllowed: (railId: string) => {
      const mods = RAIL_MODULES[railId];
      return !mods || mods.some((m) => isOn(m));
    },
  };
}
