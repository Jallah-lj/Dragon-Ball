/**
 * Keyboard and gamepad input → session actions, using the player's keybinds.
 * Touch controls live in React (see TouchControls) and call the same API.
 */
import { settingsStore, type Action } from '../../lib/settings';
import type { GameSession } from '../session/GameSession';

const GAMEPAD_MAP: [number, Action][] = [
  [0, 'jump'], // A / Cross
  [12, 'jump'], // D-pad up
  [1, 'slide'], // B / Circle
  [13, 'slide'], // D-pad down
  [2, 'dash'], // X / Square
  [5, 'dash'], // RB
  [7, 'dash'], // RT
  [3, 'shield'], // Y / Triangle
  [4, 'shield'], // LB
  [9, 'pause'], // Start
];

export class InputController {
  private session: GameSession;
  private padHeld = new Map<string, boolean>();
  private readonly onKeyDown = (e: KeyboardEvent) => this.key(e, true);
  private readonly onKeyUp = (e: KeyboardEvent) => this.key(e, false);
  private readonly onBlur = () => {
    this.session.releaseAll();
    if (!this.session.isRace) this.session.pause('blur');
  };
  private readonly onVisibility = () => {
    if (document.hidden) this.onBlur();
  };

  constructor(session: GameSession) {
    this.session = session;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setSession(session: GameSession): void {
    this.session = session;
    this.padHeld.clear();
  }

  private actionFor(code: string): Action | null {
    const binds = settingsStore.get().keybinds;
    for (const action of Object.keys(binds) as Action[]) {
      if (binds[action].includes(code)) return action;
    }
    return null;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const target = e.target as HTMLElement | null;
    // Don't steal keys from form fields or open dialogs.
    if (
      target &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    )
      return;
    if (document.querySelector('[data-game-overlay="modal"]')) {
      // An overlay menu is open: only Pause/Escape reaches the game.
      const action = this.actionFor(e.code);
      if (down && action === 'pause' && !e.repeat) {
        e.preventDefault();
        this.session.press('pause');
      }
      return;
    }
    const action = this.actionFor(e.code);
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    if (down) this.session.press(action);
    else if (action !== 'pause') this.session.release(action);
  }

  /** Poll connected gamepads (call once per frame). */
  pollGamepads(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const pressed = new Map<Action, boolean>();
    for (const pad of pads) {
      if (!pad) continue;
      for (const [index, action] of GAMEPAD_MAP) {
        if (pad.buttons[index]?.pressed) pressed.set(action, true);
      }
      const ly = pad.axes[1] ?? 0;
      if (ly > 0.6) pressed.set('slide', true);
      if (ly < -0.6) pressed.set('jump', true);
    }
    for (const action of ['jump', 'slide', 'dash', 'shield', 'pause'] as Action[]) {
      const now = pressed.get(action) ?? false;
      const before = this.padHeld.get(action) ?? false;
      if (now && !before) this.session.press(action);
      if (!now && before && action !== 'pause') this.session.release(action);
      this.padHeld.set(action, now);
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
