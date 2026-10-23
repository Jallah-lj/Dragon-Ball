import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  achievementById,
  DIFFICULTIES,
  STAGES,
  type Difficulty,
  type RunCompletionDTO,
  type RunResult,
  type StageId,
} from '@dbfc/shared';
import { Icon } from '../../components/Icons';
import { Alert } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatDuration, formatNumber, ordinal } from '../../lib/format';
import type { LocalReward } from '../../lib/offline';
import { shareResult, shareText } from '../../lib/share';
import type { SessionMode } from '../../game/session/GameSession';

export type RunOutcomeView =
  | { kind: 'verified'; result: RunResult; completion: RunCompletionDTO }
  | { kind: 'offline'; result: RunResult; reward: LocalReward }
  | { kind: 'unverified'; result: RunResult; error: string; retryable: boolean }
  | { kind: 'tutorial'; result: RunResult };

interface Props {
  outcome: RunOutcomeView;
  difficulty: Difficulty;
  stage: StageId;
  mode: SessionMode;
  next: { difficulty: Difficulty; stage: StageId } | null;
  signedInAsGuest: boolean;
  onRetry(): void;
  onRetrySubmit(): void;
  onNext(n: { difficulty: Difficulty; stage: StageId }): void;
  onLobby(): void;
}

const TITLES = {
  caught: 'Fireball caught!',
  escaped: 'The fireball escaped',
  defeated: 'Your dragon is exhausted',
} as const;

const SUBTITLES = {
  caught: 'Your dragon closed the gap and claimed the flame.',
  escaped: 'It reached the Ember Shrine first. Build Flow and use Fire Dash to close in faster.',
  defeated: 'Out of hearts. Watch for the hazard warnings and keep your Shield for emergencies.',
} as const;

export function ResultsPanel({
  outcome,
  difficulty,
  stage,
  mode,
  next,
  signedInAsGuest,
  onRetry,
  onRetrySubmit,
  onNext,
  onLobby,
}: Props) {
  const r = outcome.result;
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shared, setShared] = useState<string | null>(null);

  useEffect(() => headingRef.current?.focus(), []);

  // Keyboard shortcuts: R = retry, Enter = primary action, L = lobby.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyR') onRetry();
      if (e.code === 'KeyL') onLobby();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRetry, onLobby]);

  if (outcome.kind === 'tutorial') {
    return (
      <div
        className="panel overlay-card stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-title"
      >
        <p className="eyebrow">Tutorial complete</p>
        <h2
          id="results-title"
          className="results-title results-title--caught"
          tabIndex={-1}
          ref={headingRef}
        >
          You caught the fireball!
        </h2>
        <p className="muted">
          You've learned to jump, slide, Fire Dash and Forest Leap. The real chase begins in the
          Emerald Woodland — the fireball won't slow down for you there.
        </p>
        <div className="row">
          <Link
            className="btn btn--primary btn--lg"
            to="/play/run?mode=solo&difficulty=easy&stage=emerald"
          >
            <Icon name="play" size={20} /> Start your first chase
          </Link>
          <button type="button" className="btn btn--ghost" onClick={onLobby}>
            Lobby
          </button>
        </div>
      </div>
    );
  }

  const completion = outcome.kind === 'verified' ? outcome.completion : null;
  const reward = outcome.kind === 'offline' ? outcome.reward : null;
  const xp = completion?.xpGained ?? reward?.xpGained ?? 0;
  const crystals = completion?.crystalsGained ?? reward?.crystalsGained ?? 0;
  const achievements = completion?.newAchievements ?? reward?.newAchievements ?? [];
  const personalBest = completion?.personalBest ?? reward?.personalBest ?? false;
  const leveledUp = completion?.leveledUp ?? reward?.leveledUp ?? false;
  const level = completion?.level ?? reward?.level;
  const b = r.breakdown;

  const share = async () => {
    const res = await shareResult(shareText(r, difficulty, stage), window.location.origin);
    if (res === 'copied') {
      setShared('Result copied to clipboard.');
      toast('Result copied to clipboard.', 'copy');
    } else if (res === 'shared') setShared('Shared!');
    else setShared('Sharing is not available in this browser.');
  };

  return (
    <div
      className="panel overlay-card overlay-card--wide stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-title"
    >
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="eyebrow">
            {mode === 'daily' ? "Today's Trail · " : ''}
            {DIFFICULTIES[difficulty].name} · {STAGES[stage].name}
          </p>
          <h2
            id="results-title"
            className={`results-title ${r.outcome === 'caught' ? 'results-title--caught' : ''}`}
            tabIndex={-1}
            ref={headingRef}
          >
            {TITLES[r.outcome]}
          </h2>
          <p className="muted" style={{ maxWidth: '52ch' }}>
            {SUBTITLES[r.outcome]}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="results-score" aria-label={`Score ${formatNumber(r.score)}`}>
            {formatNumber(r.score)}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
            {personalBest && (
              <span className="badge badge--gold">
                <Icon name="crown" size={14} /> Personal best
              </span>
            )}
            {completion && (
              <span className="badge badge--moss">
                <Icon name="check" size={14} /> Verified by server
              </span>
            )}
            {outcome.kind === 'offline' && (
              <span className="badge badge--lock">
                <Icon name="offline" size={14} /> Offline · not ranked
              </span>
            )}
          </div>
        </div>
      </div>

      {outcome.kind === 'unverified' && (
        <Alert kind="warn" title="Your run couldn't be verified yet">
          {outcome.error}{' '}
          {outcome.retryable && (
            <button
              type="button"
              className="btn btn--sm btn--gold"
              onClick={onRetrySubmit}
              style={{ marginLeft: 8 }}
            >
              Retry submission
            </button>
          )}
        </Alert>
      )}
      {completion?.mismatch && (
        <Alert kind="info">
          The server replayed your inputs and its verified score is shown here.
        </Alert>
      )}

      <div className="stats">
        <div className="stat">
          <div className="stat__label">
            <Icon name="path" size={14} /> Distance
          </div>
          <div className="stat__value">{formatNumber(r.distance)} m</div>
        </div>
        <div className="stat">
          <div className="stat__label">
            <Icon name="clock" size={14} /> Time
          </div>
          <div className="stat__value">{formatDuration(r.seconds)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">
            <Icon name="flame" size={14} /> Orbs
          </div>
          <div className="stat__value">{r.orbs}</div>
        </div>
        <div className="stat">
          <div className="stat__label">
            <Icon name="crystal" size={14} /> Crystals
          </div>
          <div className="stat__value">{r.crystals}</div>
        </div>
        <div className="stat">
          <div className="stat__label">
            <Icon name="leaf" size={14} /> Obstacles cleared
          </div>
          <div className="stat__value">{r.cleared}</div>
        </div>
        <div className="stat">
          <div className="stat__label">
            <Icon name="heart" size={14} /> Hits taken
          </div>
          <div className="stat__value">{r.hits}</div>
        </div>
        {r.scales > 0 && (
          <div className="stat">
            <div className="stat__label">
              <Icon name="scale" size={14} /> Ancient scales
            </div>
            <div className="stat__value">{r.scales}</div>
          </div>
        )}
      </div>

      <div className="grid grid--2">
        <table className="breakdown" aria-label="Score breakdown">
          <tbody>
            <tr>
              <td>Distance</td>
              <td>{formatNumber(b.distance)}</td>
            </tr>
            <tr>
              <td>Pickups, clears &amp; burns</td>
              <td>{formatNumber(b.actions)}</td>
            </tr>
            {b.catchBonus > 0 && (
              <tr>
                <td>Catch bonus</td>
                <td>{formatNumber(b.catchBonus)}</td>
              </tr>
            )}
            {b.timeBonus > 0 && (
              <tr>
                <td>Speed bonus</td>
                <td>{formatNumber(b.timeBonus)}</td>
              </tr>
            )}
            {b.heartsBonus > 0 && (
              <tr>
                <td>Hearts remaining</td>
                <td>{formatNumber(b.heartsBonus)}</td>
              </tr>
            )}
            <tr>
              <td>Difficulty multiplier</td>
              <td>×{b.multiplier}</td>
            </tr>
          </tbody>
        </table>
        <div className="stack">
          {(completion || reward) && (
            <div className="row">
              <span className="badge badge--gold">
                <Icon name="bolt" size={14} /> +{formatNumber(xp)} XP
              </span>
              <span className="badge badge--moss">
                <Icon name="crystal" size={14} /> +{formatNumber(crystals)} crystals
              </span>
              {leveledUp && level ? (
                <span className="badge badge--ember">
                  <Icon name="crown" size={14} /> Level {level}!
                </span>
              ) : null}
            </div>
          )}
          {completion && completion.ranked && (
            <p className="small muted" style={{ margin: 0 }}>
              {completion.rank.weekly
                ? `${ordinal(completion.rank.weekly)} this week`
                : 'Not on this week’s board yet'}
              {completion.rank.allTime ? ` · ${ordinal(completion.rank.allTime)} all-time` : ''}
            </p>
          )}
          {completion && !completion.ranked && signedInAsGuest && (
            <p className="small muted" style={{ margin: 0 }}>
              Guest runs don't appear on leaderboards.{' '}
              <Link to="/auth?mode=upgrade">Create an account</Link> to keep your progress and
              compete.
            </p>
          )}
          {achievements.length > 0 && (
            <div className="stack" aria-label="New achievements">
              {achievements.map((id) => {
                const a = achievementById(id);
                return (
                  <div className="achievement-chip" key={id}>
                    <Icon name="trophy" size={18} style={{ color: 'var(--amber-300)' }} />
                    <span>
                      <strong>{a?.name ?? id}</strong>
                      <span className="small muted"> — {a?.description}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="row">
        <button type="button" className="btn btn--primary btn--lg" onClick={onRetry}>
          <Icon name="refresh" size={20} /> Retry <span className="kbd">R</span>
        </button>
        {next && (
          <button type="button" className="btn btn--gold btn--lg" onClick={() => onNext(next)}>
            Next: {DIFFICULTIES[next.difficulty].name} · {STAGES[next.stage].name}{' '}
            <Icon name="arrow" size={18} />
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onLobby}>
          Lobby <span className="kbd">L</span>
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => void share()}>
          <Icon name="share" size={18} /> Share
        </button>
      </div>
      {shared && (
        <p className="small muted" role="status" style={{ margin: 0 }}>
          {shared}
        </p>
      )}
    </div>
  );
}
