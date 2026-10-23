import { useSyncExternalStore } from 'react';
import { createStore, readJson, writeJson } from './store';

export type Action = 'jump' | 'slide' | 'dash' | 'shield' | 'pause';
export type Keybinds = Record<Action, string[]>;

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** 'system' follows prefers-reduced-motion. */
  reducedMotion: 'system' | 'on' | 'off';
  screenShake: boolean;
  highContrast: boolean;
  textScale: 'normal' | 'large';
  graphics: 'high' | 'low';
  showFps: boolean;
  touchControls: 'auto' | 'on' | 'off';
  touchLayout: 'buttons' | 'swipe' | 'both';
  touchHand: 'right' | 'left';
  /** Minimum jump hold applied to touch taps (helps on small screens). */
  keybinds: Keybinds;
  tutorialDone: boolean;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  jump: ['Space', 'ArrowUp', 'KeyW'],
  slide: ['ArrowDown', 'KeyS'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyD'],
  shield: ['KeyE'],
  pause: ['Escape', 'KeyP'],
};

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  muted: false,
  reducedMotion: 'system',
  screenShake: true,
  highContrast: false,
  textScale: 'normal',
  graphics: 'high',
  showFps: false,
  touchControls: 'auto',
  touchLayout: 'both',
  touchHand: 'right',
  keybinds: DEFAULT_KEYBINDS,
  tutorialDone: false,
};

export const ACTION_LABELS: Record<Action, string> = {
  jump: 'Jump / Forest Leap',
  slide: 'Slide / Fast fall',
  dash: 'Fire Dash',
  shield: 'Dragon Shield',
  pause: 'Pause',
};

const STORAGE_KEY = 'dbfc.settings.v1';

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Merge untrusted stored/remote settings with defaults, validating every field. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const d = DEFAULT_SETTINGS;
  const keybinds: Keybinds = { ...DEFAULT_KEYBINDS };
  const rk = (r.keybinds && typeof r.keybinds === 'object' ? r.keybinds : {}) as Record<
    string,
    unknown
  >;
  for (const action of Object.keys(DEFAULT_KEYBINDS) as Action[]) {
    const list = rk[action];
    if (Array.isArray(list)) {
      const codes = list
        .filter((c): c is string => typeof c === 'string' && c.length < 32)
        .slice(0, 4);
      if (codes.length > 0) keybinds[action] = codes;
    }
  }
  return {
    masterVolume: clamp01(r.masterVolume, d.masterVolume),
    musicVolume: clamp01(r.musicVolume, d.musicVolume),
    sfxVolume: clamp01(r.sfxVolume, d.sfxVolume),
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
    reducedMotion: oneOf(r.reducedMotion, ['system', 'on', 'off'] as const, d.reducedMotion),
    screenShake: typeof r.screenShake === 'boolean' ? r.screenShake : d.screenShake,
    highContrast: typeof r.highContrast === 'boolean' ? r.highContrast : d.highContrast,
    textScale: oneOf(r.textScale, ['normal', 'large'] as const, d.textScale),
    graphics: oneOf(r.graphics, ['high', 'low'] as const, d.graphics),
    showFps: typeof r.showFps === 'boolean' ? r.showFps : d.showFps,
    touchControls: oneOf(r.touchControls, ['auto', 'on', 'off'] as const, d.touchControls),
    touchLayout: oneOf(r.touchLayout, ['buttons', 'swipe', 'both'] as const, d.touchLayout),
    touchHand: oneOf(r.touchHand, ['right', 'left'] as const, d.touchHand),
    keybinds,
    tutorialDone: typeof r.tutorialDone === 'boolean' ? r.tutorialDone : d.tutorialDone,
  };
}

export const settingsStore = createStore<Settings>(sanitizeSettings(readJson(STORAGE_KEY)));

const remoteListeners = new Set<(s: Settings) => void>();

settingsStore.subscribe(() => {
  const s = settingsStore.get();
  writeJson(STORAGE_KEY, s);
  applyDocumentSettings(s);
  for (const l of remoteListeners) l(s);
});

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set((prev) => sanitizeSettings({ ...prev, ...patch }));
}

export function resetSettings(): void {
  settingsStore.set({ ...DEFAULT_SETTINGS, tutorialDone: settingsStore.get().tutorialDone });
}

/** Called by the auth layer to sync settings to the server for signed-in players. */
export function onSettingsChange(listener: (s: Settings) => void): () => void {
  remoteListeners.add(listener);
  return () => remoteListeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}

export function prefersReducedMotion(s: Settings = settingsStore.get()): boolean {
  if (s.reducedMotion === 'on') return true;
  if (s.reducedMotion === 'off') return false;
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export function applyDocumentSettings(s: Settings): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.reducedMotion = String(prefersReducedMotion(s));
  html.dataset.highContrast = String(s.highContrast);
  html.dataset.textScale = s.textScale;
}

/** Human readable label for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  const named: Record<string, string> = {
    Space: 'Space',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'Alt',
    AltRight: 'R-Alt',
    Escape: 'Esc',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
  };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** Keys that must never be bound (browser/system navigation). */
export const RESERVED_KEYS = new Set(['Tab', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);

/** Spare keys handed to an action whose only key was taken by another action. */
const SPARE_KEYS = ['KeyQ', 'KeyR', 'KeyF', 'KeyX', 'KeyC', 'KeyZ', 'KeyV', 'KeyG'];

/**
 * Assign `code` to `action` (at `slot`), removing it from any other action.
 * If that leaves another action with no key, it receives the key that was
 * replaced (a swap), or a free default/spare key — never nothing.
 */
export function rebind(keybinds: Keybinds, action: Action, code: string, slot = 0): Keybinds {
  const replaced = keybinds[action][slot];
  const next: Keybinds = { ...keybinds };
  for (const a of Object.keys(next) as Action[]) {
    next[a] = next[a].filter((c) => c !== code);
  }
  const list = [...next[action]];
  if (slot < list.length) list[slot] = code;
  else list.push(code);
  next[action] = Array.from(new Set(list)).slice(0, 4);
  const used = () => new Set(Object.values(next).flat());
  for (const a of Object.keys(next) as Action[]) {
    if (next[a].length > 0) continue;
    const taken = used();
    const candidates = [replaced, ...DEFAULT_KEYBINDS[a], ...SPARE_KEYS].filter(
      (c): c is string => !!c && !taken.has(c),
    );
    if (candidates[0]) next[a] = [candidates[0]];
  }
  return next;
}
