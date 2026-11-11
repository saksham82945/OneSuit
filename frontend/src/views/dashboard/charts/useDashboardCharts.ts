import { useEffect, useState } from 'react';
import { dashboardChartsService, type DashboardCharts } from '@/services/dashboard';

/** Loads GET /api/dashboard/charts for a range; refetches when the range or reloadKey changes. */
export function useDashboardCharts(from: string, to: string, reloadKey = 0) {
  const [data, setData] = useState<DashboardCharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    dashboardChartsService
      .get({ from, to })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, reloadKey]);

  return { data, loading, error };
}
