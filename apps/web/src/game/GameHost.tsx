import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { setRenderScale } from './art/canvas';
import { VIEW_H, VIEW_W } from './constants';
import { ForestScene } from './scenes/ForestScene';
import { HudScene } from './scenes/HudScene';
import type { GameSession } from './session/GameSession';
import { settingsStore } from '../lib/settings';

let fontsReady: Promise<void> | null = null;

/** Wait (briefly) for the web fonts used inside the canvas. */
export function loadGameFonts(): Promise<void> {
  if (!fontsReady) {
    const fonts = [
      '800 20px "Alegreya Sans"',
      '700 20px "Alegreya Sans"',
      '700 40px "Grenze Gotisch Variable"',
      '400 16px "Alegreya SC"',
    ];
    const load = Promise.all(fonts.map((f) => document.fonts?.load(f).catch(() => undefined))).then(
      () => undefined,
    );
    fontsReady = Promise.race([load, new Promise<void>((r) => setTimeout(r, 1500))]);
  }
  return fontsReady;
}

/**
 * Internal render scale: match the physical pixel width of the display (capped
 * at 2×, and at 1× in low-graphics mode). Small screens render at a reduced
 * resolution, which keeps fill-rate low on phones.
 */
function chooseScale(el: HTMLElement): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(el.clientWidth, 320);
  const raw = (width * dpr) / VIEW_W;
  const max = settingsStore.get().graphics === 'low' ? 1 : 2;
  return Math.min(max, Math.max(0.5, Math.round(raw * 4) / 4));
}

interface Props {
  session: GameSession;
  label?: string;
}

/** Hosts the Phaser game for a GameSession. Restarts scenes when the session changes. */
export function GameHost({ session, label = 'Dragon Ball: Forest Chase game view' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sessionRef = useRef(session);

  useEffect(() => {
    let cancelled = false;
    void loadGameFonts().then(() => {
      if (cancelled || !ref.current) return;
      const S = chooseScale(ref.current);
      setRenderScale(S);
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: ref.current,
        width: VIEW_W * S,
        height: VIEW_H * S,
        backgroundColor: '#0d120e',
        banner: false,
        disableContextMenu: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true, powerPreference: 'high-performance', roundPixels: false },
        audio: { noAudio: true },
        input: { keyboard: false, gamepad: false },
        fps: { smoothStep: true },
        scene: [ForestScene, HudScene],
      });
      game.registry.set('session', sessionRef.current);
      gameRef.current = game;
      if (import.meta.env.VITE_E2E === 'true')
        (window as unknown as { __dbfcGame?: Phaser.Game }).__dbfcGame = game;
    });
    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    const game = gameRef.current;
    if (!game || game.registry.get('session') === session) return;
    game.registry.set('session', session);
    // Restarting the forest scene relaunches the HUD as well.
    game.scene.getScene('forest')?.scene.restart();
  }, [session]);

  return <div ref={ref} className="game-host" role="img" aria-label={label} />;
}

export default GameHost;
