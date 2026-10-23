import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icons';
import { Alert, Modal, useDocumentTitle } from '../components/ui';
import { useToast } from '../components/Toast';
import { resetLocalProfile } from '../lib/offline';
import {
  ACTION_LABELS,
  DEFAULT_KEYBINDS,
  keyLabel,
  rebind,
  RESERVED_KEYS,
  resetSettings,
  updateSettings,
  useSettings,
  type Action,
} from '../lib/settings';

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span className="field__label row row--between">
        {label} <span className="muted">{Math.round(value * 100)}%</span>
      </span>
      <input
        className="range"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SettingsPage() {
  useDocumentTitle('Settings');
  const s = useSettings();
  const toast = useToast();
  const [listening, setListening] = useState<{ action: Action; slot: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && listening.action !== 'pause') {
        setListening(null);
        return;
      }
      if (RESERVED_KEYS.has(e.code)) {
        setNotice(`${keyLabel(e.code)} is reserved by the browser.`);
        return;
      }
      updateSettings({ keybinds: rebind(s.keybinds, listening.action, e.code, listening.slot) });
      setNotice(`${ACTION_LABELS[listening.action]} → ${keyLabel(e.code)}`);
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, s.keybinds]);

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Settings</h1>
          <p>
            Changes apply instantly and are saved on this device — and to your account when you're
            signed in.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setConfirmReset(true)}
        >
          <Icon name="refresh" size={16} /> Restore defaults
        </button>
      </div>

      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <section className="panel stack" aria-labelledby="audio">
          <h2 id="audio" className="panel__title">
            <Icon name="bolt" /> Audio
          </h2>
          <Slider
            label="Master volume"
            value={s.masterVolume}
            onChange={(v) => updateSettings({ masterVolume: v })}
          />
          <Slider
            label="Music"
            value={s.musicVolume}
            onChange={(v) => updateSettings({ musicVolume: v })}
          />
          <Slider
            label="Sound effects"
            value={s.sfxVolume}
            onChange={(v) => updateSettings({ sfxVolume: v })}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.muted}
              onChange={(e) => updateSettings({ muted: e.target.checked })}
            />{' '}
            Mute everything
          </label>
        </section>

        <section className="panel stack" aria-labelledby="a11y">
          <h2 id="a11y" className="panel__title">
            <Icon name="leaf" /> Accessibility &amp; display
          </h2>
          <Choice
            label="Reduced motion"
            value={s.reducedMotion}
            options={[
              { id: 'system', label: 'Follow system setting' },
              { id: 'on', label: 'On — calmer effects, no camera shake' },
              { id: 'off', label: 'Off — full effects' },
            ]}
            onChange={(v) => updateSettings({ reducedMotion: v })}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.screenShake}
              onChange={(e) => updateSettings({ screenShake: e.target.checked })}
            />{' '}
            Screen shake on hits
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.highContrast}
              onChange={(e) => updateSettings({ highContrast: e.target.checked })}
            />{' '}
            Higher-contrast text
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.textScale === 'large'}
              onChange={(e) => updateSettings({ textScale: e.target.checked ? 'large' : 'normal' })}
            />{' '}
            Larger interface text
          </label>
          <Choice
            label="Graphics quality"
            value={s.graphics}
            options={[
              { id: 'high', label: 'High — sharp on high-DPI screens' },
              { id: 'low', label: 'Low — fewer particles, lower resolution' },
            ]}
            onChange={(v) => updateSettings({ graphics: v })}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.showFps}
              onChange={(e) => updateSettings({ showFps: e.target.checked })}
            />{' '}
            Show frame rate
          </label>
        </section>
      </div>

      <section className="panel" aria-labelledby="controls">
        <h2 id="controls" className="panel__title">
          <Icon name="settings" /> Keyboard controls
        </h2>
        <p className="small muted">
          Select a key slot, then press the new key. Each key can only do one thing. Gamepads work
          too (A jump, B slide, X/RB dash, Y/LB shield, Start pause).
        </p>
        {notice && (
          <p className="small" role="status">
            {notice}
          </p>
        )}
        {(Object.keys(DEFAULT_KEYBINDS) as Action[]).map((action) => (
          <div className="keybind-row" key={action}>
            <span>{ACTION_LABELS[action]}</span>
            <span className="keybind-row__keys">
              {[0, 1].map((slot) => {
                const code = s.keybinds[action][slot];
                const active = listening?.action === action && listening.slot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    className="btn btn--sm btn--ghost keybind-btn"
                    data-listening={active}
                    aria-label={`${ACTION_LABELS[action]} key ${slot + 1}: ${code ? keyLabel(code) : 'unbound'}${active ? ', press a key' : ''}`}
                    onClick={() => setListening(active ? null : { action, slot })}
                  >
                    {active ? 'Press a key…' : code ? keyLabel(code) : '+ Add'}
                  </button>
                );
              })}
            </span>
          </div>
        ))}
      </section>

      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <section className="panel stack" aria-labelledby="touch">
          <h2 id="touch" className="panel__title">
            <Icon name="wing" /> Touch controls
          </h2>
          <Choice
            label="On-screen controls"
            value={s.touchControls}
            options={[
              { id: 'auto', label: 'Automatic (touch devices)' },
              { id: 'on', label: 'Always show' },
              { id: 'off', label: 'Never show' },
            ]}
            onChange={(v) => updateSettings({ touchControls: v })}
          />
          <Choice
            label="Layout"
            value={s.touchLayout}
            options={[
              { id: 'both', label: 'Buttons + swipes' },
              { id: 'buttons', label: 'Buttons only' },
              { id: 'swipe', label: 'Swipes only (up jump, down slide, right dash)' },
            ]}
            onChange={(v) => updateSettings({ touchLayout: v })}
          />
          <Choice
            label="Jump button side"
            value={s.touchHand}
            options={[
              { id: 'right', label: 'Right thumb' },
              { id: 'left', label: 'Left thumb' },
            ]}
            onChange={(v) => updateSettings({ touchHand: v })}
          />
        </section>
        <section className="panel stack" aria-labelledby="data">
          <h2 id="data" className="panel__title">
            <Icon name="book" /> Tutorial &amp; data
          </h2>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              updateSettings({ tutorialDone: false });
              toast('The tutorial will be suggested again.', 'book');
            }}
          >
            Show the tutorial again
          </button>
          <Link
            className="btn btn--ghost"
            to="/play/run?mode=tutorial"
            style={{ alignSelf: 'flex-start' }}
          >
            <Icon name="play" size={16} /> Play the tutorial now
          </Link>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              resetLocalProfile();
              toast('Offline progress on this device was cleared.', 'refresh');
            }}
          >
            Clear offline progress on this device
          </button>
          <p className="small muted">
            Account security, sessions and deletion live on your <Link to="/profile">profile</Link>.
          </p>
        </section>
      </div>
      {confirmReset && (
        <Modal title="Restore default settings?" onClose={() => setConfirmReset(false)}>
          <Alert kind="info">
            Audio, display, keyboard and touch settings return to their defaults.
          </Alert>
          <div className="row" style={{ marginTop: 'var(--space-4)' }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                resetSettings();
                setConfirmReset(false);
                toast('Settings restored.', 'refresh');
              }}
            >
              Restore defaults
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
