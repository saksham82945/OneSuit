import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { formatCount } from '@/components/dashboard';
import type { ChartPalette } from './palette';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);

const FONT = { family: 'inherit', size: 11 } as const;

const tooltip = (p: ChartPalette) => ({
  backgroundColor: p.tooltipBg,
  titleColor: p.tooltipText,
  bodyColor: p.tooltipText,
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
  usePointStyle: true,
  titleFont: { ...FONT, weight: 'bold' as const },
  bodyFont: FONT,
});

/** Axes styling shared by line and bar charts. */
const axes = (p: ChartPalette, horizontal = false, stacked = false) => {
  const value = {
    beginAtZero: true,
    stacked,
    grid: { color: p.grid },
    border: { display: false },
    ticks: {
      color: p.tick,
      font: FONT,
      precision: 0,
      maxTicksLimit: 5,
      callback: (v: string | number) => formatCount(Number(v)),
    },
  };
  const category = {
    stacked,
    grid: { display: false },
    border: { display: false },
    ticks: { color: p.tick, font: FONT, autoSkip: true, maxRotation: 0, maxTicksLimit: horizontal ? 10 : 8 },
  };
  return horizontal ? { x: value, y: category } : { x: category, y: value };
};

export const lineOptions = (p: ChartPalette): ChartOptions<'line'> => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { display: false }, tooltip: tooltip(p) },
  scales: axes(p),
  elements: { line: { tension: 0.35, borderWidth: 2 }, point: { radius: 0, hoverRadius: 4, hitRadius: 8 } },
});

export const barOptions = (
  p: ChartPalette,
  { horizontal = false, stacked = false }: { horizontal?: boolean; stacked?: boolean } = {}
): ChartOptions<'bar'> => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: horizontal ? 'y' : 'x',
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { display: false }, tooltip: tooltip(p) },
  scales: axes(p, horizontal, stacked),
  datasets: { bar: { borderRadius: 4, maxBarThickness: horizontal ? 18 : 28, borderSkipped: false } },
});

export const doughnutOptions = (p: ChartPalette): ChartOptions<'doughnut'> => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '72%',
  plugins: { legend: { display: false }, tooltip: tooltip(p) },
  elements: { arc: { borderWidth: 0 } },
});
