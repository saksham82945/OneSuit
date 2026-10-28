import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('color-mode') as Theme | null;
  if (saved === 'light' || saved === 'dark') return saved;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

let currentTheme: Theme = getInitialTheme();

function applyTheme(theme: Theme) {
  currentTheme = theme;
  if (typeof document !== 'undefined') {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('color-mode', theme);
  }
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const listener = () => setTheme(currentTheme);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const toggleTheme = () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  const setMode = (t: Theme) => {
    applyTheme(t);
  };

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme: setMode,
  };
}

export default useTheme;
