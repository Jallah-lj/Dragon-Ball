import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBINDS,
  DEFAULT_SETTINGS,
  keyLabel,
  rebind,
  sanitizeSettings,
} from '../src/lib/settings';

describe('settings', () => {
  it('sanitizes untrusted stored data field by field', () => {
    const s = sanitizeSettings({
      masterVolume: 7,
      musicVolume: 'loud',
      reducedMotion: 'maybe',
      keybinds: { jump: ['KeyJ', 42], dash: 'nope' },
      extra: 1,
    });
    expect(s.masterVolume).toBe(1);
    expect(s.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(s.reducedMotion).toBe('system');
    expect(s.keybinds.jump).toEqual(['KeyJ']);
    expect(s.keybinds.dash).toEqual(DEFAULT_KEYBINDS.dash);
    expect('extra' in s).toBe(false);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('rebinding moves a key between actions and never leaves an action unbound', () => {
    const next = rebind(DEFAULT_KEYBINDS, 'dash', 'Space', 0);
    expect(next.dash[0]).toBe('Space');
    expect(next.jump).not.toContain('Space');
    const lone = rebind({ ...DEFAULT_KEYBINDS, shield: ['KeyE'] }, 'jump', 'KeyE', 0);
    expect(lone.jump).toContain('KeyE');
    // Shield's only key was taken, so it receives the key Jump gave up (a swap).
    expect(lone.shield).toEqual(['Space']);
    const all = Object.values(lone).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('labels keys for display', () => {
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ArrowDown')).toBe('↓');
    expect(keyLabel('Digit3')).toBe('3');
  });
});
