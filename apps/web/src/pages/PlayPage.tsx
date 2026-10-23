import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  DEFAULT_SKIN_ID,
  DIFFICULTIES,
  dailySeed,
  isDifficulty,
  isStageId,
  STAGES,
  type AbilityLoadout,
  type Difficulty,
  type RunCompletionDTO,
  type RunResult,
  type RunTicketDTO,
  type StageId,
} from '@dbfc/shared';
import { GameHost, loadGameFonts } from '../game/GameHost';
import {
  GameSession,
  type PauseReason,
  type SessionMode,
  type TutorialPrompt,
} from '../game/session/GameSession';
import { AudioManager } from '../game/systems/AudioManager';
import { TouchControls, useTouchEnabled } from '../game/TouchControls';
import { Icon } from '../components/Icons';
import { Alert, Loading, useDocumentTitle } from '../components/ui';
import { api, ApiError, errorMessage, isNetworkError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { applyLocalRun, localUnlocks, type LocalReward } from '../lib/offline';
import { keyLabel, settingsStore, updateSettings, useSettings } from '../lib/settings';
import { ResultsPanel, type RunOutcomeView } from './play/ResultsPanel';
import { PauseMenu } from './play/PauseMenu';
import { TutorialOverlay } from './play/TutorialOverlay';

type Phase = 'preparing' | 'playing' | 'submitting' | 'results' | 'error';

interface RunSetup {
  mode: SessionMode;
  difficulty: Difficulty;
  stage: StageId;
  seed: number;
  abilities: AbilityLoadout;
  ticket: RunTicketDTO | null;
  startedAt: number;
}

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}

declare global {
  interface Window {
    __dbfc?: {
      session: GameSession | null;
      setAutopilot(on: boolean): void;
      setTimeScale?(n: number): void;
    };
  }
}

export default function PlayPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const settings = useSettings();
  const touch = useTouchEnabled();
  const modeParam = params.get('mode');
  const mode: SessionMode =
    modeParam === 'tutorial' ? 'tutorial' : modeParam === 'daily' ? 'daily' : 'solo';
  const difficulty: Difficulty =
    mode === 'tutorial'
      ? 'easy'
      : isDifficulty(params.get('difficulty'))
        ? (params.get('difficulty') as Difficulty)
        : 'easy';
  const stage: StageId =
    mode === 'tutorial'
      ? 'emerald'
      : isStageId(params.get('stage'))
        ? (params.get('stage') as StageId)
        : 'emerald';
  useDocumentTitle(
    mode === 'tutorial' ? 'Tutorial' : `${DIFFICULTIES[difficulty].name} · ${STAGES[stage].name}`,
  );

  const [phase, setPhase] = useState<Phase>('preparing');
  const [setup, setSetup] = useState<RunSetup | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [paused, setPaused] = useState<PauseReason | null>(null);
  const [prompt, setPrompt] = useState<TutorialPrompt | null>(null);
  const [outcome, setOutcome] = useState<RunOutcomeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [rotateDismissed, setRotateDismissed] = useState(false);
  // Start-of-run hints hide a few seconds after each session starts (derived per session).
  const [hintsHiddenFor, setHintsHiddenFor] = useState<GameSession | null>(null);
  const showHints = session !== null && hintsHiddenFor !== session;
  const pendingSubmit = useRef<{ result: RunResult; inputs: number[] } | null>(null);
  const attempt = useRef(0);
  const skin = auth.user?.selectedSkin ?? DEFAULT_SKIN_ID;

  // Keep audio volumes in sync with settings.
  useEffect(() => {
    const audio = AudioManager.get();
    audio.setVolumes({
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
      muted: settings.muted,
    });
  }, [settings.masterVolume, settings.musicVolume, settings.sfxVolume, settings.muted]);

  // Unlock audio on the first interaction (browser autoplay policy).
  useEffect(() => {
    const unlock = () => AudioManager.get().unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    return () => {
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  /** Request a ticket (or go offline) and start a new session. */
  const prepare = useCallback(async () => {
    const id = ++attempt.current;
    // Fonts are needed by the canvas anyway; awaiting first keeps all state updates async.
    await loadGameFonts();
    let ticket: RunTicketDTO | null = null;
    let seed = mode === 'daily' ? dailySeed() : randomSeed();
    let abilities: AbilityLoadout = localUnlocks().abilities;
    if (mode !== 'tutorial' && auth.status !== 'offline') {
      try {
        await auth.ensureSession();
        ticket = await api<RunTicketDTO>('/api/runs', {
          method: 'POST',
          body: { mode, difficulty, stage },
        });
        seed = ticket.seed;
        abilities = ticket.abilities;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'RUN_LOCKED') {
          if (id === attempt.current) {
            setError(err.message);
            setPhase('error');
          }
          return;
        }
        // Network down, rate limited, or the browser refused our session cookie
        // (401 after creating a guest): fall back to an offline run.
        if (
          !isNetworkError(err) &&
          !(err instanceof ApiError && (err.status === 429 || err.status === 401))
        ) {
          if (id === attempt.current) {
            setError(errorMessage(err));
            setPhase('error');
          }
          return;
        }
        // Server unreachable or busy: fall back to an offline (unranked) run.
        ticket = null;
      }
    }
    if (mode === 'tutorial') abilities = { dash: true, leap: true, shield: false };
    if (id !== attempt.current) return;
    const next: RunSetup = {
      mode,
      difficulty,
      stage,
      seed,
      abilities,
      ticket,
      startedAt: Date.now(),
    };
    const s = new GameSession({
      mode,
      config: { seed, difficulty, stage, abilities, tutorial: mode === 'tutorial' },
      skin,
      startAt: performance.now() + (mode === 'tutorial' ? 1500 : 3200),
    });
    setSetup(next);
    setSession(s);
    setPhase('playing');
  }, [auth, mode, difficulty, stage, skin]);

  /** Reset the screen and prepare a fresh run (Retry / Restart / Try again). */
  const restart = useCallback(() => {
    setPhase('preparing');
    setOutcome(null);
    setError(null);
    setPaused(null);
    setPrompt(null);
    void prepare();
  }, [prepare]);

  const authLoading = auth.status === 'loading';
  const started = useRef(false);
  useEffect(() => {
    // The route remounts this page for new parameters, so this runs once per run setup.
    if (authLoading || started.current) return;
    started.current = true;
    void prepare();
  }, [authLoading, prepare]);

  const submit = useCallback(
    async (result: RunResult, inputs: number[], s: RunSetup) => {
      if (s.mode === 'tutorial') {
        updateSettings({ tutorialDone: true });
        setOutcome({ kind: 'tutorial', result });
        setPhase('results');
        return;
      }
      if (!s.ticket) {
        const reward: LocalReward = applyLocalRun(result, s.difficulty, s.stage);
        setOutcome({ kind: 'offline', result, reward });
        setPhase('results');
        return;
      }
      setPhase('submitting');
      pendingSubmit.current = { result, inputs };
      try {
        const completion = await api<RunCompletionDTO>(`/api/runs/${s.ticket.runId}/complete`, {
          method: 'POST',
          body: {
            inputs,
            claimed: { score: result.score, ticks: result.ticks, outcome: result.outcome },
          },
        });
        pendingSubmit.current = null;
        setOutcome({ kind: 'verified', result: completion.result, completion });
        void auth.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'RUN_ALREADY_SUBMITTED') {
          pendingSubmit.current = null;
          setOutcome({
            kind: 'unverified',
            result,
            error: 'This run was already submitted.',
            retryable: false,
          });
        } else {
          setOutcome({
            kind: 'unverified',
            result,
            error: errorMessage(err),
            retryable: isNetworkError(err) || (err instanceof ApiError && err.status >= 500),
          });
        }
      }
      setPhase('results');
    },
    [auth],
  );

  // Wire session events.
  useEffect(() => {
    if (!session || !setup) return;
    const offs = [
      session.on('pause', (p, reason) => setPaused(p ? reason : null)),
      session.on('prompt', (p) => setPrompt(p)),
      session.on('announce', (m) => setAnnouncement(m)),
      session.on('finish', (result, inputs) => {
        setTimeout(
          () => void submit(result, inputs, setup),
          result.outcome === 'caught' ? 1400 : 900,
        );
      }),
    ];
    // Brief on-screen hints at the start of a run, then get out of the way.
    const hintTimer = setTimeout(
      () => setHintsHiddenFor(session),
      Math.max(0, session.countdown()) + 6000,
    );
    offs.push(() => clearTimeout(hintTimer));
    if (import.meta.env.VITE_E2E === 'true') {
      window.__dbfc = {
        session,
        setAutopilot: (on) => session.setAutopilot(on),
        setTimeScale: (n) => {
          session.timeScale = n;
        },
      };
    }
    return () => offs.forEach((off) => off());
  }, [session, setup, submit]);

  // Pause audio while paused or when the results screen is up.
  useEffect(() => {
    AudioManager.get().setSuspended(paused === 'user' || paused === 'blur');
  }, [paused]);
  useEffect(() => () => AudioManager.get().setSuspended(false), []);

  const retrySubmit = () => {
    if (pendingSubmit.current && setup)
      void submit(pendingSubmit.current.result, pendingSubmit.current.inputs, setup);
  };

  const nextChallenge = useMemo(() => {
    if (!outcome || outcome.kind === 'tutorial' || outcome.result.outcome !== 'caught') return null;
    const unlocks =
      outcome.kind === 'verified'
        ? outcome.completion.unlocks
        : outcome.kind === 'offline'
          ? outcome.reward.unlocks
          : null;
    if (!unlocks) return null;
    const order: Difficulty[] = ['easy', 'medium', 'hard'];
    const nextDiff = order[order.indexOf(difficulty) + 1];
    if (nextDiff && unlocks.difficulties.includes(nextDiff)) return { difficulty: nextDiff, stage };
    const stages: StageId[] = ['emerald', 'mistpine', 'moonlit'];
    const nextStage = stages[stages.indexOf(stage) + 1];
    if (nextStage && unlocks.stages.includes(nextStage)) return { difficulty, stage: nextStage };
    return null;
  }, [outcome, difficulty, stage]);

  const quit = () => navigate('/play');

  return (
    <div className="game-page">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      {session && (
        <div className="game-stage">
          <GameHost session={session} />
        </div>
      )}
      {session && touch && phase === 'playing' && !paused && <TouchControls session={session} />}
      {phase === 'playing' && prompt && session && (
        <TutorialOverlay prompt={prompt} onContinue={() => session.continueTutorial()} />
      )}
      {phase === 'playing' && (paused === 'user' || paused === 'blur') && session && (
        <PauseMenu
          title={
            setup?.mode === 'tutorial' ? 'Tutorial paused' : `${DIFFICULTIES[difficulty].name}`
          }
          subtitle={setup?.mode === 'tutorial' ? 'Learn the basics' : STAGES[stage].name}
          ranked={!!setup?.ticket}
          onResume={() => session.resume()}
          onRestart={restart}
          onQuit={quit}
        />
      )}
      {phase === 'preparing' && (
        <div className="game-overlay">
          <Loading label="Preparing the trail…" />
        </div>
      )}
      {phase === 'submitting' && (
        <div className="game-overlay">
          <Loading label="The forest spirits are verifying your run…" />
        </div>
      )}
      {phase === 'error' && (
        <div className="game-overlay">
          <div className="panel overlay-card stack">
            <h2>Can't start this chase</h2>
            <Alert kind="error">{error}</Alert>
            <div className="row">
              <button type="button" className="btn btn--primary" onClick={restart}>
                <Icon name="refresh" size={18} /> Try again
              </button>
              <Link className="btn btn--ghost" to="/play">
                Back to lobby
              </Link>
            </div>
          </div>
        </div>
      )}
      {phase === 'results' && outcome && setup && (
        <div className="game-overlay" data-game-overlay="modal">
          <ResultsPanel
            outcome={outcome}
            difficulty={setup.difficulty}
            stage={setup.stage}
            mode={setup.mode}
            next={nextChallenge}
            onRetry={restart}
            onRetrySubmit={retrySubmit}
            onNext={(n) =>
              navigate(`/play/run?mode=solo&difficulty=${n.difficulty}&stage=${n.stage}`)
            }
            onLobby={quit}
            signedInAsGuest={!!auth.user?.isGuest}
          />
        </div>
      )}
      {phase === 'playing' && showHints && !paused && !prompt && (
        <div className="game-topbar" aria-hidden={touch}>
          {!touch && (
            <span className="badge">
              <Icon name="info" size={14} />{' '}
              {keyLabel(settingsStore.get().keybinds.pause[0] ?? 'Escape')} to pause
            </span>
          )}
          {setup && !setup.ticket && setup.mode !== 'tutorial' && (
            <span className="badge badge--lock">
              <Icon name="offline" size={14} /> Offline run — not ranked
            </span>
          )}
        </div>
      )}
      <div className="rotate-hint" data-dismissed={String(rotateDismissed)}>
        <div className="stack" style={{ alignItems: 'center', maxWidth: 320 }}>
          <Icon name="refresh" size={44} />
          <h2>Turn your device</h2>
          <p className="muted">
            The forest is wide — landscape gives you the best view of what's coming.
          </p>
          <button type="button" className="btn btn--ghost" onClick={() => setRotateDismissed(true)}>
            Play in portrait anyway
          </button>
        </div>
      </div>
    </div>
  );
}
