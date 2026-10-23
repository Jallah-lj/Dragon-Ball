import { useEffect, useRef } from 'react';
import { keyLabel, useSettings } from '../../lib/settings';
import type { TutorialPrompt } from '../../game/session/GameSession';
import { useTouchEnabled } from '../../game/TouchControls';

interface Props {
  prompt: TutorialPrompt;
  onContinue(): void;
}

export function TutorialOverlay({ prompt, onContinue }: Props) {
  const settings = useSettings();
  const touch = useTouchEnabled();
  const ref = useRef<HTMLDivElement>(null);
  const { lesson, step } = prompt;
  const action = lesson.action === 'leap' ? 'jump' : lesson.action;
  const keys = action === 'run' ? [] : settings.keybinds[action].slice(0, 2).map(keyLabel);
  const body =
    lesson.action === 'leap' && step === 2
      ? 'Now press Jump again while in the air to beat your wings — reach the crystals!'
      : lesson.body;
  const touchHint: Record<string, string> = {
    jump: 'Tap Jump',
    slide: 'Tap Slide',
    dash: 'Tap Dash',
    run: 'Tap anywhere',
  };

  useEffect(() => {
    ref.current?.focus();
  }, [prompt]);

  return (
    <div className="game-overlay game-overlay--clear">
      <div
        className="panel tutorial-card"
        role="dialog"
        aria-live="assertive"
        aria-labelledby="tutorial-title"
        tabIndex={-1}
        ref={ref}
      >
        <p className="tutorial-progress">
          Lesson {prompt.index + 1} of {prompt.total}
        </p>
        <h2 id="tutorial-title">
          {lesson.action === 'leap' && step === 2 ? 'Jump again!' : lesson.title}
        </h2>
        <p>{body}</p>
        {keys.length > 0 && (
          <div className="tutorial-keys" aria-label="Keys">
            {keys.map((k) => (
              <span className="kbd" key={k}>
                {k}
              </span>
            ))}
            {touch && <span className="badge">{touchHint[action]}</span>}
          </div>
        )}
        {lesson.action === 'run' && (
          <button type="button" className="btn btn--primary" onClick={onContinue}>
            Let's go
          </button>
        )}
      </div>
    </div>
  );
}
