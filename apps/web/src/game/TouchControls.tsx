import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Action } from '../lib/settings';
import { useSettings } from '../lib/settings';
import type { GameSession } from './session/GameSession';

interface Props {
  session: GameSession;
}

const SWIPE_PX = 36;

function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
  );
}

export function useTouchEnabled(): boolean {
  const s = useSettings();
  return s.touchControls === 'on' || (s.touchControls === 'auto' && isTouchDevice());
}

/**
 * On-screen buttons (hold for higher jumps / longer slides) and optional
 * swipe gestures. Uses pointer events with capture and prevents page scroll.
 */
export function TouchControls({ session }: Props) {
  const settings = useSettings();
  const swipeRef = useRef<{ id: number; x: number; y: number; action: Action | null } | null>(null);
  const buttons = settings.touchLayout !== 'swipe';
  const swipes = settings.touchLayout !== 'buttons';

  // Release everything if the component unmounts mid-press.
  useEffect(() => () => session.releaseAll(), [session]);

  const bind = (action: Action) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      session.press(action);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      session.release(action);
    },
    onPointerCancel: () => session.release(action),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const onSurfaceDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipes) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    swipeRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, action: null };
  };
  const onSurfaceMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId || s.action) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx))
      s.action = dy < 0 ? 'jump' : 'slide';
    else if (dx > SWIPE_PX * 1.4) s.action = 'dash';
    if (s.action) session.press(s.action);
  };
  const onSurfaceUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    if (s.action) session.release(s.action);
    else {
      // A plain tap jumps (short hop).
      session.press('jump');
      setTimeout(() => session.release('jump'), 90);
    }
    swipeRef.current = null;
  };

  const left = settings.touchHand === 'left';
  return (
    <div className="touch-layer" data-hand={settings.touchHand}>
      {swipes && (
        <div
          className="touch-surface"
          onPointerDown={onSurfaceDown}
          onPointerMove={onSurfaceMove}
          onPointerUp={onSurfaceUp}
          onPointerCancel={onSurfaceUp}
          aria-hidden="true"
        />
      )}
      {buttons && (
        <>
          <div className={`touch-cluster touch-cluster--${left ? 'right' : 'left'}`}>
            <button
              type="button"
              className="touch-btn touch-btn--small"
              aria-label="Dragon Shield"
              {...bind('shield')}
            >
              Shield
            </button>
            <button type="button" className="touch-btn" aria-label="Slide" {...bind('slide')}>
              Slide
            </button>
          </div>
          <div className={`touch-cluster touch-cluster--${left ? 'left' : 'right'}`}>
            <button
              type="button"
              className="touch-btn touch-btn--small touch-btn--ember"
              aria-label="Fire Dash"
              {...bind('dash')}
            >
              Dash
            </button>
            <button
              type="button"
              className="touch-btn touch-btn--jump"
              aria-label="Jump"
              {...bind('jump')}
            >
              Jump
            </button>
          </div>
        </>
      )}
    </div>
  );
}
