import type { AppPlugin } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';

// The Android app (android/) is this web app in a WebView, loaded from the Keni server, with
// Capacitor's bridge in the page. Its plugins load only there, so browsers never fetch them.
export const inApp = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

const app = inApp ? import('@capacitor/app') : null;

// The app's own plugin: android/app/src/main/java/moe/seria/keni/KeniPlugin.kt. Wrapped, as a
// plugin answers any property, `then` too, so a promise can't resolve to it.
type Keni = {
  // The status and navigation bars take the page's color, with icons for a light or dark page.
  setSystemBars(options: { color: string; dark: boolean }): Promise<void>;
  // Leaves this server (and its login) for the app's screen that asks for one.
  changeServer(): Promise<void>;
  // Saves a file (data in base64) to Downloads.
  saveFile(options: { name: string; type: string; data: string }): Promise<void>;
  // What another app shared to Keni, once: {} when there's none.
  takeShare(): Promise<Partial<NativeShare>>;
  // Something was shared: takeShare has it.
  addListener(event: 'share', listener: () => void): Promise<PluginListenerHandle>;
};
type NativeShare = { title?: string; text?: string; files: { name: string; type: string; data: string }[] };
export const keni = inApp
  ? import('@capacitor/core').then(({ registerPlugin }) => ({ plugin: registerPlugin<Keni>('Keni') }))
  : null;

/** Saves a file to the device's Downloads, in the app: a WebView ignores <a download>. */
export async function saveFile(blob: Blob, name: string) {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { plugin } = await keni!;
  await plugin.saveFile({ name, type: blob.type, data: url.slice(url.indexOf(',') + 1) });
}

/** Adds an @capacitor/app listener in the app. Returns its removal, for an effect's cleanup. */
export function listen(add: (App: AppPlugin) => Promise<PluginListenerHandle>) {
  if (!app) return;
  const handle = app.then(({ App }) => add(App));
  return () => void handle.then((h) => h.remove());
}

/** Android's Back in the app. `back` returns false when it has nothing left to do, and the app
 * goes to the background. */
export function useBackButton(back: (canGoBack: boolean) => boolean) {
  const onBack = useEffectEvent(back);
  useEffect(
    () =>
      listen((App) =>
        App.addListener('backButton', ({ canGoBack }) => {
          if (!onBack(canGoBack)) void App.minimizeApp();
        }),
      ),
    [],
  );
}

/** A launcher shortcut (android/app/src/main/res/xml/shortcuts.xml), as it's used. The one that
 * started the app, or came before the login, comes once on mount: Capacitor keeps an appUrlOpen
 * until a listener takes it. */
export function useAppShortcut(onShortcut: (kind: 'add' | 'voice') => void) {
  const shortcut = useEffectEvent(onShortcut);
  useEffect(
    () =>
      listen((App) =>
        App.addListener('appUrlOpen', ({ url }) => {
          const kind = /^keni:\/\/(add|voice)$/.exec(url)?.[1] as 'add' | 'voice' | undefined;
          if (kind) shortcut(kind);
        }),
      ),
    [],
  );
}

/** What another app shares to Keni (Android's share sheet), as it's shared and on mount, for
 * a share that came before (the app starting, the login). */
export function useShare(onShare: (share: { title?: string; text?: string; files: File[] }) => void) {
  const share = useEffectEvent(onShare);
  useEffect(() => {
    if (!keni) return;
    const handle = keni.then(async ({ plugin }) => {
      const take = async () => {
        const { title, text, files } = await plugin.takeShare();
        if (!files) return;
        share({
          title,
          text,
          files: files.map(({ name, type, data }) => new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type })),
        });
      };
      const listener = await plugin.addListener('share', () => void take());
      void take();
      return listener;
    });
    return () => void handle.then((h) => h.remove());
  }, []);
}

// Releases of the app are on GitHub (.github/workflows/android.yml attaches keni.apk). The app asks
// GitHub for the latest one when it starts and every few hours while open.
const RELEASE_CHECK_MS = 6 * 60 * 60 * 1000;

let release: string | null = null; // a newer app's APK
const releaseListeners = new Set<() => void>();

type Release = { tag_name: string; assets: { name: string; browser_download_url: string }[] };

/** The app's version (versionName: "dev" for a local build) and build (versionCode). */
export const appInfo = app?.then(({ App }) => App.getInfo());

void appInfo?.then(({ version }) => {
  const mine = semver(version);
  if (!mine) return; // a local build (dev)
  const check = () =>
    fetch('https://api.github.com/repos/seriaati/keni/releases/latest')
      .then((response) => (response.ok ? (response.json() as Promise<Release>) : null))
      .then((latest) => {
        const theirs = latest && semver(latest.tag_name);
        // No APK: a release from before the app, or one whose APK is still building.
        const apk = latest?.assets.find(({ name }) => name.endsWith('.apk'));
        if (!theirs || !apk || !newer(theirs, mine)) return;
        release = apk.browser_download_url;
        releaseListeners.forEach((listener) => listener());
      })
      .catch(() => undefined); // offline, or GitHub unreachable: next time
  void check();
  setInterval(() => void check(), RELEASE_CHECK_MS);
});

function semver(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match && match.slice(1).map(Number);
}

function newer(a: number[], b: number[]): boolean {
  const i = a.findIndex((n, j) => n !== b[j]);
  return i >= 0 && a[i] > b[i];
}

/** A newer release of the Android app: the URL of its APK. */
export function useAppUpdate(): string | null {
  return useSyncExternalStore(
    (listener) => {
      releaseListeners.add(listener);
      return () => releaseListeners.delete(listener);
    },
    () => release,
  );
}

/** Another host than the server's, so Capacitor hands it to the browser (Bridge.launchIntent),
 * which downloads it and offers to install it over this app. The WebView never loads it. */
export function applyAppUpdate(url: string) {
  location.assign(url);
}
