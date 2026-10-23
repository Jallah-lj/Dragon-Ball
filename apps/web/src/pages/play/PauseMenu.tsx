import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/Icons';
import { keyLabel, updateSettings, useSettings } from '../../lib/settings';

interface Props {
  title: string;
  subtitle: string;
  ranked: boolean;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
}

export function PauseMenu({ title, subtitle, ranked, onResume, onRestart, onQuit }: Props) {
  const settings = useSettings();
  const resumeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => resumeRef.current?.focus(), []);
  return (
    <div className="game-overlay" data-game-overlay="modal">
      <div
        className="panel overlay-card stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        <p className="eyebrow">Paused · {subtitle}</p>
        <h2 id="pause-title">{title}</h2>
        <div className="stack">
          <button
            ref={resumeRef}
            type="button"
            className="btn btn--primary btn--lg btn--block"
            onClick={onResume}
          >
            <Icon name="play" size={20} /> Resume{' '}
            <span className="kbd">{keyLabel(settings.keybinds.pause[0] ?? 'Escape')}</span>
          </button>
          <button type="button" className="btn btn--block" onClick={onRestart}>
            <Icon name="refresh" size={18} /> Restart run
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={onQuit}>
            <Icon name="back" size={18} /> Quit to lobby
          </button>
        </div>
        <hr className="divider" />
        <div className="grid grid--2" style={{ gap: 'var(--space-3)' }}>
          <label className="field">
            <span className="field__label">Music volume</span>
            <input
              className="range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field__label">Effects volume</span>
            <input
              className="range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.muted}
            onChange={(e) => updateSettings({ muted: e.target.checked })}
          />{' '}
          Mute all sound
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.screenShake}
            onChange={(e) => updateSettings({ screenShake: e.target.checked })}
          />{' '}
          Screen shake
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          {ranked
            ? 'Paused time is not counted. Your run is verified by the server when it ends.'
            : 'Offline runs are saved on this device only.'}{' '}
          <Link to="/settings" onClick={onQuit}>
            All settings &amp; key bindings
          </Link>
        </p>
      </div>
    </div>
  );
}
