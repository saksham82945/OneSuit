import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const EXPLORER_ROLE = 'explorer';
const DEMO_TOAST_ID = 'demo-workspace-read-only';

/**
 * Shown to explorers (accounts looking around the shared demo workspace) with
 * a way to pick a plan. While mounted it also turns the backend's "changes are
 * turned off" 403 into a single toast that points at the plans.
 */
export const ExplorerBanner: React.FC = () => {
  const navigate = useNavigate();
  const isExplorer = useAuthStore((s) => s.user?.role?.name === EXPLORER_ROLE);

  useEffect(() => {
    if (!isExplorer) return;
    const id = api.interceptors.response.use(undefined, (error: AxiosError<{ message?: unknown }>) => {
      const message = error.response?.data?.message;
      if (
        error.response?.status === 403 &&
        typeof message === 'string' &&
        message.toLowerCase().includes('demo workspace')
      ) {
        // Fixed id: several blocked requests at once still show one toast.
        toast.info(message, {
          id: DEMO_TOAST_ID,
          duration: 8000,
          action: { label: 'Choose a plan', onClick: () => navigate('/pricing') },
        });
        // Most pages also toast the API error themselves; drop those copies so
        // the explorer sees one message (with the plan link) instead of two.
        // Not at 0ms: the Toaster adds new toasts on a timeout, and a dismiss
        // that arrives before the add is lost.
        const dropDuplicates = () =>
          toast
            .getToasts()
            .filter((t) => t.id !== DEMO_TOAST_ID && 'title' in t && t.title === message)
            .forEach((t) => toast.dismiss(t.id));
        setTimeout(dropDuplicates, 100);
        setTimeout(dropDuplicates, 500);
      }
      return Promise.reject(error);
    });
    return () => api.interceptors.response.eject(id);
  }, [isExplorer, navigate]);

  if (!isExplorer) return null;

  return (
    <div className="sticky top-12 md:top-0 z-30 flex items-center justify-between gap-3 border-b border-emerald-500/20 bg-emerald-950 px-4 py-1.5 text-xs text-emerald-50 shrink-0 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-900">
      <span className="flex items-center gap-2 min-w-0">
        <Compass className="h-3.5 w-3.5 shrink-0 text-emerald-400 light:text-emerald-600" />
        <span className="truncate">
          <span className="sm:hidden">Demo workspace · view only</span>
          <span className="hidden sm:inline">
            You're exploring a demo workspace with sample data. Changes are turned off.
          </span>
        </span>
      </span>
      <Link
        to="/pricing"
        className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-0.5 font-medium text-white hover:bg-emerald-500"
      >
        Choose a plan
      </Link>
    </div>
  );
};
