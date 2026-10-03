import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'keni-theme';
const listeners = new Set<() => void>();
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let preference: ThemePreference = readStored();
let current: Theme = resolve();

function resolve(): Theme {
  if (preference !== 'system') return preference;
  return systemDark.matches ? 'dark' : 'light';
}

function apply() {
  current = resolve();
  document.documentElement.dataset.theme = current;
  listeners.forEach((l) => l());
}

apply();

// Re-resolve when the OS setting changes (only matters while preference is 'system')
systemDark.addEventListener('change', apply);

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage unavailable — preference still applies for this session
  }
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The resolved theme currently applied ('light' or 'dark'). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => current);
}

/** The user's chosen preference, including 'system'. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference);
}
