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
import { useTheme } from '@/hooks/useTheme';

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

/** Categorical colours in a fixed order (light / dark steps of the same hues). */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export interface ChartColors {
  series: string[];
  text: string;
  muted: string;
  grid: string;
  surface: string;
  tooltipBg: string;
  tooltipText: string;
}

export const useChartColors = (): ChartColors => {
  const { isDark } = useTheme();
  return isDark
    ? {
        series: SERIES_DARK,
        text: '#f0efec',
        muted: '#9a9992',
        grid: 'rgba(255,255,255,0.06)',
        surface: '#141b1a',
        tooltipBg: '#232a29',
        tooltipText: '#f0efec',
      }
    : {
        series: SERIES_LIGHT,
        text: '#0b0b0b',
        muted: '#6b6a66',
        grid: 'rgba(0,0,0,0.06)',
        surface: '#ffffff',
        tooltipBg: '#1f2937',
        tooltipText: '#ffffff',
      };
};

/** Shared tooltip look. */
export const tooltipOptions = (c: ChartColors) => ({
  backgroundColor: c.tooltipBg,
  titleColor: c.tooltipText,
  bodyColor: c.tooltipText,
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
  usePointStyle: true,
});

/** Options for time-series bar/line charts (one y axis, recessive grid). */
export const timeSeriesOptions = (
  c: ChartColors,
  opts: { stacked?: boolean; money?: (n: number) => string; legend?: boolean } = {}
): ChartOptions<'bar' | 'line'> => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      display: opts.legend ?? true,
      position: 'top',
      align: 'end',
      labels: { color: c.muted, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, font: { size: 11 } },
    },
    tooltip: {
      ...tooltipOptions(c),
      callbacks: opts.money
        ? { label: (ctx) => ` ${ctx.dataset.label}: ${opts.money!(Number(ctx.parsed.y ?? 0))}` }
        : undefined,
    },
  },
  scales: {
    x: {
      stacked: opts.stacked,
      grid: { display: false },
      border: { color: c.grid },
      ticks: { color: c.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
    y: {
      stacked: opts.stacked,
      beginAtZero: true,
      grid: { color: c.grid },
      border: { display: false },
      ticks: {
        color: c.muted,
        font: { size: 10 },
        precision: 0,
        maxTicksLimit: 5,
        callback: opts.money ? (v) => opts.money!(Number(v)) : undefined,
      },
    },
  },
});
