import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ABILITIES,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  STAGE_IDS,
  STAGES,
  unlockHint,
  type Difficulty,
  type ProgressDTO,
  type StageId,
  type Unlocks,
} from '@dbfc/shared';
import { Icon } from '../components/Icons';
import { Alert, Tabs, useDocumentTitle } from '../components/ui';
import { BIOMES } from '../game/art/biomes';
import { AudioManager } from '../game/systems/AudioManager';
import { useAuth } from '../lib/auth';
import { formatDuration, formatNumber } from '../lib/format';
import { localUnlocks, useLocalProfile } from '../lib/offline';
import { updateSettings, useSettings } from '../lib/settings';
import { useApi } from '../lib/useApi';

type Mode = 'solo' | 'daily';

const DENSITY: Record<Difficulty, string> = { easy: 'Sparse', medium: 'Mixed', hard: 'Relentless' };

export function LobbyPage() {
  useDocumentTitle('Choose your trail');
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const settings = useSettings();
  const local = useLocalProfile();
  const progress = useApi<ProgressDTO>(user && status === 'ready' ? '/api/progress' : null);
  const [mode, setMode] = useState<Mode>('solo');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [stage, setStage] = useState<StageId>('emerald');

  const online = !!user && status === 'ready';
  const unlocks: Unlocks = useMemo(() => {
    if (online && progress.data) return progress.data.unlocks;
    return localUnlocks(local);
  }, [online, progress.data, local]);
  const records = online && progress.data ? progress.data.records : local.records;
  const record = records.find((r) => r.difficulty === difficulty && r.stage === stage);
  const d = DIFFICULTIES[difficulty];
  const canStart =
    mode === 'daily' ||
    (unlocks.difficulties.includes(difficulty) && unlocks.stages.includes(stage));

  const start = () => {
    AudioManager.get().unlock();
    if (mode === 'daily') navigate('/play/run?mode=daily&difficulty=medium&stage=emerald');
    else navigate(`/play/run?mode=solo&difficulty=${difficulty}&stage=${stage}`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Lobby</p>
          <h1>Choose your trail</h1>
          <p>
            Pick a difficulty and a forest. Catch the fireball to unlock harder chases and new
            forests.
          </p>
        </div>
        <div className="row">
          <Link className="btn btn--ghost" to="/play/run?mode=tutorial">
            <Icon name="book" size={18} /> Tutorial
          </Link>
          <Link className="btn btn--ghost" to="/race">
            <Icon name="race" size={18} /> Live race
          </Link>
        </div>
      </div>

      {!settings.tutorialDone && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <Alert kind="info" title="New to the forest?">
            The two-minute tutorial teaches jumping, sliding, Fire Dash and Forest Leap — time stops
            at each lesson.{' '}
            <span className="row" style={{ marginTop: 8 }}>
              <Link className="btn btn--sm btn--gold" to="/play/run?mode=tutorial">
                Play the tutorial
              </Link>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => updateSettings({ tutorialDone: true })}
              >
                Skip — I know how to play
              </button>
            </span>
          </Alert>
        </div>
      )}

      <div className="lobby-grid">
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <Tabs<Mode>
            label="Game mode"
            value={mode}
            onChange={setMode}
            tabs={[
              { id: 'solo', label: 'Solo chase' },
              { id: 'daily', label: "Today's Trail" },
            ]}
          />
          {mode === 'daily' ? (
            <div className="panel panel--flat">
              <h2 className="panel__title">
                <Icon name="clock" /> Today's Trail
              </h2>
              <p className="muted">
                Everyone gets the same Wildwood Chase course today. Learn it, master it, and top the
                daily board — a new trail grows at midnight UTC.
              </p>
            </div>
          ) : (
            <>
              <section aria-labelledby="difficulty-heading">
                <h2 id="difficulty-heading" style={{ fontSize: 'var(--text-xl)' }}>
                  Difficulty
                </h2>
                <div className="choice-grid" role="radiogroup" aria-labelledby="difficulty-heading">
                  {DIFFICULTY_IDS.map((id) => {
                    const cfg = DIFFICULTIES[id];
                    const locked = !unlocks.difficulties.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        className="choice"
                        aria-checked={difficulty === id}
                        aria-disabled={locked}
                        onClick={() => !locked && setDifficulty(id)}
                      >
                        <span className="choice__title">
                          {cfg.name}
                          {locked && <Icon name="lock" size={16} title="Locked" />}
                        </span>
                        <span className="choice__meta">
                          {locked ? unlockHint('difficulty', id) : cfg.tagline}
                        </span>
                        <span className="choice__badge">
                          <span
                            className={`badge ${id === 'easy' ? 'badge--moss' : id === 'medium' ? 'badge--gold' : 'badge--ember'}`}
                          >
                            {id === 'easy' ? 'Easy' : id === 'medium' ? 'Medium' : 'Hard'}
                          </span>
                        </span>
                        <span className="choice__check" aria-hidden="true">
                          <Icon name="check" size={18} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section aria-labelledby="stage-heading">
                <h2 id="stage-heading" style={{ fontSize: 'var(--text-xl)' }}>
                  Forest
                </h2>
                <div className="choice-grid" role="radiogroup" aria-labelledby="stage-heading">
                  {STAGE_IDS.map((id) => {
                    const s = STAGES[id];
                    const b = BIOMES[id];
                    const locked = !unlocks.stages.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        className="choice"
                        aria-checked={stage === id}
                        aria-disabled={locked}
                        onClick={() => !locked && setStage(id)}
                      >
                        <span
                          className="stage-swatch"
                          aria-hidden="true"
                          style={{
                            background: `linear-gradient(180deg, ${b.sky[0]} 0%, ${b.sky[2]} 45%, ${b.mid} 46%, ${b.near} 75%, ${b.grass} 76%, ${b.dirt} 100%)`,
                          }}
                        />
                        <span className="choice__title">
                          {s.name}
                          {locked && <Icon name="lock" size={16} title="Locked" />}
                        </span>
                        <span className="choice__meta">
                          {locked ? unlockHint('stage', id) : s.description}
                        </span>
                        <span className="choice__check" aria-hidden="true">
                          <Icon name="check" size={18} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>

        <aside className="panel panel--bark" aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="panel__title">
            <Icon name="flag" /> {mode === 'daily' ? "Today's Trail" : d.name}
          </h2>
          <ul className="summary-list">
            <li>
              <span>Forest</span>
              <span>{STAGES[mode === 'daily' ? 'emerald' : stage].name}</span>
            </li>
            <li>
              <span>Dragon speed</span>
              <span>
                {DIFFICULTIES[mode === 'daily' ? 'medium' : difficulty].baseSpeed.toFixed(1)} m/s
              </span>
            </li>
            <li>
              <span>Fireball head start</span>
              <span>{DIFFICULTIES[mode === 'daily' ? 'medium' : difficulty].startGap} m</span>
            </li>
            <li>
              <span>Hearts</span>
              <span>{DIFFICULTIES[mode === 'daily' ? 'medium' : difficulty].hearts}</span>
            </li>
            <li>
              <span>Hazards</span>
              <span>{DENSITY[mode === 'daily' ? 'medium' : difficulty]}</span>
            </li>
            <li>
              <span>Score multiplier</span>
              <span>×{DIFFICULTIES[mode === 'daily' ? 'medium' : difficulty].scoreMultiplier}</span>
            </li>
          </ul>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Abilities</h3>
          <ul className="summary-list">
            <li>
              <span>Fire Dash</span>
              <span>{ABILITIES.dash.energyCost} energy</span>
            </li>
            <li>
              <span>Forest Leap</span>
              <span>{(ABILITIES.leap.cooldownTicks / 60).toFixed(0)}s cooldown</span>
            </li>
            <li>
              <span>Dragon Shield</span>
              <span>
                {unlocks.abilities.shield ? (
                  `${(ABILITIES.shield.cooldownTicks / 60).toFixed(0)}s cooldown`
                ) : (
                  <span className="badge badge--lock">
                    <Icon name="lock" size={12} /> First catch
                  </span>
                )}
              </span>
            </li>
          </ul>
          {mode === 'solo' && record && (
            <p className="small muted">
              Best: {formatNumber(record.bestScore)} pts · {record.catches}{' '}
              {record.catches === 1 ? 'catch' : 'catches'}
              {record.bestTicks ? ` · fastest ${formatDuration(record.bestTicks / 60)}` : ''}
            </p>
          )}
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={!canStart}
            onClick={start}
          >
            <Icon name="play" size={20} /> Start chase
          </button>
          <p className="small muted" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
            {status === 'offline'
              ? 'Offline: this run will be saved on this device only.'
              : !user
                ? 'You can play right away as a guest. Create an account to appear on leaderboards.'
                : user.isGuest
                  ? 'Playing as a guest — runs are verified but not ranked.'
                  : 'Ranked: your run is verified by the server and posted to the leaderboards.'}
          </p>
        </aside>
      </div>
    </>
  );
}
