import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { AppSettings, ThemePref } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  userName: '',
  onboardingComplete: false,
  theme: 'dark',
  dashboardView: 'grid',
  dismissedTips: [],
  ai: { enabled: false, apiKey: '', model: 'claude-opus-5-5' },
  editor: { paper: 'dark', showSceneNumbers: true, pageSize: 'letter' },
};

let cache: AppSettings = DEFAULT_SETTINGS;

function merge(value: Partial<AppSettings> | undefined): AppSettings {
  const v = value ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...v,
    ai: { ...DEFAULT_SETTINGS.ai, ...(v.ai ?? {}) },
    editor: { ...DEFAULT_SETTINGS.editor, ...(v.editor ?? {}) },
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app');
  cache = merge(row?.value as Partial<AppSettings> | undefined);
  return cache;
}

/** Last loaded settings, for code paths that cannot await (e.g. activity actor names). */
export function settingsSnapshot(): AppSettings {
  return cache;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = merge({
    ...current,
    ...patch,
    ai: { ...current.ai, ...(patch.ai ?? {}) },
    editor: { ...current.editor, ...(patch.editor ?? {}) },
  });
  await db.settings.put({ key: 'app', value: next });
  cache = next;
  if (patch.theme) applyTheme(patch.theme);
  return next;
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(async () => {
    const row = await db.settings.get('app');
    cache = merge(row?.value as Partial<AppSettings> | undefined);
    return cache;
  }, []);
}

export function actorName(): string {
  return cache.userName.trim() || 'You';
}

export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return pref;
}

export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem('sceneforge:theme', pref);
  } catch {
    /* storage unavailable */
  }
  const t = resolveTheme(pref);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b0b0c' : '#f4f1ea');
}

export async function dismissTip(id: string) {
  const s = await loadSettings();
  if (!s.dismissedTips.includes(id)) await updateSettings({ dismissedTips: [...s.dismissedTips, id] });
}
