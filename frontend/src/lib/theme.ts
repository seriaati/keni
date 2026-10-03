import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'keni-theme';
const listeners = new Set<() => void>();
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

let current: Theme = readStored() ?? (systemDark.matches ? 'dark' : 'light');

function apply() {
  document.documentElement.dataset.theme = current;
  listeners.forEach((l) => l());
}

apply();

// Follow the OS setting until the user picks a theme explicitly
systemDark.addEventListener('change', (e) => {
  if (readStored()) return;
  current = e.matches ? 'dark' : 'light';
  apply();
});

export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable — theme still applies for this session
  }
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => current);
}
