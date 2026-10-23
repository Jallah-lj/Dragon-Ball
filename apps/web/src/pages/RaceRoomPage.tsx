import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  DIFFICULTIES,
  raceCodeSchema,
  STAGES,
  type RaceFinishPayload,
  type RaceResultsDTO,
  type RaceRoomDTO,
  type RaceStandingDTO,
  type RunResult,
} from '@dbfc/shared';
import { DragonAvatar } from '../components/DragonAvatar';
import { Icon } from '../components/Icons';
import { Alert, Loading, useDocumentTitle } from '../components/ui';
import { useToast } from '../components/Toast';
import { GameHost } from '../game/GameHost';
import { GameSession } from '../game/session/GameSession';
import { AudioManager } from '../game/systems/AudioManager';
import { TouchControls, useTouchEnabled } from '../game/TouchControls';
import { useAuth } from '../lib/auth';
import { formatDuration, formatNumber, ordinal } from '../lib/format';
import { connectSocket, getSocket, measureClockOffset } from '../lib/socket';
import { useSettings } from '../lib/settings';

type Problem = { code: string; message: string };

export default function RaceRoomPage() {
  const params = useParams();
  const parsed = raceCodeSchema.safeParse(params.code ?? '');
  const code = parsed.success ? parsed.data : null;
  useDocumentTitle(code ? `Race ${code}` : 'Race');
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const touch = useTouchEnabled();
  const settings = useSettings();
  const [room, setRoom] = useState<RaceRoomDTO | null>(null);
  const [problem, setProblem] = useState<Problem | null>(
    code ? null : { code: 'BAD_REQUEST', message: 'That is not a valid race code.' },
  );
  const [session, setSession] = useState<GameSession | null>(null);
  const [finishers, setFinishers] = useState<RaceStandingDTO[]>([]);
  const [results, setResults] = useState<RaceResultsDTO | null>(null);
  const [myResult, setMyResult] = useState<RunResult | null>(null);
  const [connection, setConnection] = useState<'connected' | 'reconnecting'>('connected');
  const [menuOpen, setMenuOpen] = useState(false);
  const offset = useRef(0);
  const pendingFinish = useRef<RaceFinishPayload | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const roomRef = useRef<RaceRoomDTO | null>(null);
  const meId = auth.user?.id ?? null;

  useEffect(() => {
    const audio = AudioManager.get();
    audio.setVolumes({
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
      muted: settings.muted,
    });
  }, [settings.masterVolume, settings.musicVolume, settings.sfxVolume, settings.muted]);

  const submitFinish = useCallback(async () => {
    const payload = pendingFinish.current;
    if (!payload) return;
    const s = getSocket();
    if (!s.connected) return; // retried on reconnect
    try {
      const res = await s.timeout(15000).emitWithAck('race:finish', payload);
      pendingFinish.current = null;
      if (res.ok) setMyResult(res.result);
      else if (res.error.code !== 'RUN_ALREADY_SUBMITTED') toast(res.error.message, 'alert');
    } catch {
      // Timed out — keep it pending and retry after reconnecting.
    }
  }, [toast]);

  // Create (or resync) the game session from a countdown/racing room.
  const ensureSession = useCallback(
    (r: RaceRoomDTO, startAtServer: number, seed: number) => {
      const localStart = performance.now() + (startAtServer - (Date.now() + offset.current));
      const existing = sessionRef.current;
      if (existing && existing.config.seed === seed) {
        existing.setStartAt(localStart);
        return;
      }
      const me = r.players.find((p) => p.userId === meId);
      if (!me) return;
      const s = new GameSession({
        mode: 'race',
        config: {
          seed,
          difficulty: r.difficulty,
          stage: r.stage,
          abilities: me.abilities ?? { dash: true, leap: true, shield: false },
        },
        skin: me.skin,
        startAt: localStart,
      });
      s.on('progress', (p) => getSocket().volatile.emit('race:progress', p));
      s.on('pause', (open) => setMenuOpen(open));
      s.on('finish', (result, inputs) => {
        pendingFinish.current = {
          inputs,
          claimed: { score: result.score, ticks: result.ticks, outcome: result.outcome },
        };
        void submitFinish();
      });
      sessionRef.current = s;
      setSession(s);
      if (import.meta.env.VITE_E2E === 'true') {
        window.__dbfc = { session: s, setAutopilot: (on) => s.setAutopilot(on) };
      }
    },
    [meId, submitFinish],
  );

  // Connect, sync clocks and join.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void (async () => {
      const user = await auth.ensureSession().catch(() => null);
      if (cancelled) return;
      if (!user) {
        setProblem({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Live races need the Forest Chase server, which is unreachable right now.',
        });
        return;
      }
      try {
        const s = await connectSocket();
        offset.current = (await measureClockOffset(s)).offset;
        const res = await s.timeout(8000).emitWithAck('race:join', { code });
        if (cancelled) return;
        if (!res.ok) setProblem(res.error);
        else {
          roomRef.current = res.room;
          setRoom(res.room);
        }
      } catch {
        if (!cancelled)
          setProblem({
            code: 'SERVICE_UNAVAILABLE',
            message: 'Could not connect to the race server.',
          });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Socket event wiring.
  useEffect(() => {
    if (!code) return;
    const s = getSocket();
    const onState = (r: RaceRoomDTO) => {
      if (r.code !== code) return;
      roomRef.current = r;
      setRoom(r);
      for (const p of r.players) {
        const ghost = sessionRef.current?.ghosts.get(p.userId);
        if (ghost) ghost.finished = p.finished || p.dnf;
      }
      if (
        (r.phase === 'countdown' || r.phase === 'racing') &&
        r.seed !== null &&
        r.startAt !== null
      )
        ensureSession(r, r.startAt, r.seed);
    };
    const onCountdown = (p: { code: string; seed: number; startAt: number; serverNow: number }) => {
      if (p.code !== code || !roomRef.current) return;
      ensureSession(roomRef.current, p.startAt, p.seed);
    };
    const onProgress = (
      updates: { userId: string; x: number; y: number; flags: number; hearts: number }[],
    ) => {
      const sess = sessionRef.current;
      const r = roomRef.current;
      if (!sess || !r) return;
      for (const u of updates) {
        if (u.userId === meId) continue;
        const p = r.players.find((x) => x.userId === u.userId);
        if (p) sess.updateGhost(u.userId, p.displayName, p.skin, u);
      }
    };
    const onFinished = (st: RaceStandingDTO) =>
      setFinishers((f) => (f.some((x) => x.userId === st.userId) ? f : [...f, st]));
    const onResults = (r: RaceResultsDTO) => {
      if (r.code === code) setResults(r);
    };
    const onClosed = (p: { code: string; reason: string }) => {
      if (p.code !== code) return;
      setProblem({
        code: 'RACE_EXPIRED',
        message: p.reason === 'expired' ? 'This race lobby expired.' : 'This race room was closed.',
      });
    };
    const onRevoked = () => {
      toast('You were signed out.', 'logout');
      navigate('/auth?mode=login');
    };
    const onDisconnect = () => setConnection('reconnecting');
    const onConnect = async () => {
      setConnection('connected');
      try {
        const res = await s.timeout(8000).emitWithAck('race:join', { code });
        if (res.ok) onState(res.room);
        void submitFinish();
      } catch {
        // Next reconnect will retry.
      }
    };
    s.on('race:state', onState);
    s.on('race:countdown', onCountdown);
    s.on('race:progress', onProgress);
    s.on('race:finished', onFinished);
    s.on('race:results', onResults);
    s.on('race:closed', onClosed);
    s.on('session:revoked', onRevoked);
    s.on('disconnect', onDisconnect);
    s.io.on('reconnect', onConnect);
    return () => {
      s.off('race:state', onState);
      s.off('race:countdown', onCountdown);
      s.off('race:progress', onProgress);
      s.off('race:finished', onFinished);
      s.off('race:results', onResults);
      s.off('race:closed', onClosed);
      s.off('session:revoked', onRevoked);
      s.off('disconnect', onDisconnect);
      s.io.off('reconnect', onConnect);
    };
  }, [code, ensureSession, meId, navigate, submitFinish, toast]);

  // Unlock audio on first interaction.
  useEffect(() => {
    const unlock = () => AudioManager.get().unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    return () => {
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  const leave = async () => {
    try {
      await getSocket().timeout(4000).emitWithAck('race:leave');
    } catch {
      // Leaving locally anyway.
    }
    navigate('/race');
  };

  const me = room?.players.find((p) => p.userId === meId) ?? null;
  const isHost = room?.hostId === meId;
  const connectedPlayers = room?.players.filter((p) => p.connected) ?? [];
  const waitingFor =
    room?.players.filter((p) => p.connected && !p.ready && p.userId !== room.hostId) ?? [];
  const canStart =
    !!room && isHost && connectedPlayers.length >= room.minPlayers && waitingFor.length === 0;
  const startReason = !room
    ? ''
    : connectedPlayers.length < room.minPlayers
      ? `Waiting for at least ${room.minPlayers} dragons.`
      : waitingFor.length
        ? `Waiting for ${waitingFor.map((p) => p.displayName).join(', ')}.`
        : '';
  const inRace =
    room && (room.phase === 'countdown' || room.phase === 'racing' || room.phase === 'results');
  const live = useMemo(
    () =>
      [...finishers].sort(
        (a, b) =>
          (a.outcome === 'caught' ? 0 : 1) - (b.outcome === 'caught' ? 0 : 1) || a.ticks - b.ticks,
      ),
    [finishers],
  );

  if (problem) {
    return (
      <div
        className="game-page"
        style={{
          display: 'grid',
          placeItems: 'center',
          padding: 'var(--space-4)',
          overflowY: 'auto',
          touchAction: 'auto',
        }}
      >
        <div className="panel overlay-card stack">
          <h1 style={{ fontSize: 'var(--text-2xl)' }}>
            {problem.code === 'RACE_FULL'
              ? 'Race is full'
              : problem.code === 'RACE_STARTED'
                ? 'Race already started'
                : problem.code === 'RACE_NOT_FOUND'
                  ? 'Race not found'
                  : 'Race unavailable'}
          </h1>
          <Alert kind="warn">{problem.message}</Alert>
          <div className="row">
            <Link className="btn btn--primary" to="/race">
              Back to race lobby
            </Link>
            <Link className="btn btn--ghost" to="/play">
              Solo chase
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (!room) return <Loading label="Joining the race…" full />;

  return (
    <div className="game-page">
      {session && inRace ? (
        <div className="game-stage">
          <GameHost session={session} label="Live race" />
        </div>
      ) : (
        <div className="race-backdrop" aria-hidden="true" />
      )}
      {session && touch && room.phase === 'racing' && !myResult && (
        <TouchControls session={session} />
      )}
      {connection === 'reconnecting' && (
        <div className="game-topbar" style={{ top: 10, bottom: 'auto' }} role="status">
          <span className="badge badge--ember">
            <Icon name="offline" size={14} /> Connection lost — reconnecting… your dragon keeps
            running.
          </span>
        </div>
      )}

      {room.phase === 'lobby' && (
        <div className="game-overlay">
          <div
            className="panel overlay-card overlay-card--wide stack"
            aria-labelledby="lobby-title"
          >
            <div className="row row--between">
              <div>
                <p className="eyebrow">
                  Race lobby · {room.visibility === 'team' ? `Team ${room.teamTag} only` : 'Open'}
                </p>
                <h1 id="lobby-title" style={{ fontSize: 'var(--text-2xl)', marginBottom: 4 }}>
                  {DIFFICULTIES[room.difficulty].name} · {STAGES[room.stage].name}
                </h1>
              </div>
              <div className="row">
                <span className="code-chip" aria-label={`Race code ${room.code}`}>
                  {room.code}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/race/${room.code}`,
                      );
                      toast('Race link copied.', 'copy');
                    } catch {
                      toast(`${window.location.origin}/race/${room.code}`, 'link');
                    }
                  }}
                >
                  <Icon name="copy" size={14} /> Copy link
                </button>
              </div>
            </div>
            <ul className="race-players" aria-label="Racers">
              {room.players.map((p) => (
                <li
                  className="race-player"
                  key={p.userId}
                  data-ready={p.ready || p.userId === room.hostId}
                >
                  <DragonAvatar skin={p.avatar} size={36} />
                  <span className="race-player__name">
                    {p.displayName}{' '}
                    {p.userId === meId && <span className="badge badge--gold">You</span>}
                    {p.teamTag && (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        {p.teamTag}
                      </span>
                    )}
                  </span>
                  {p.userId === room.hostId && (
                    <span className="badge badge--gold">
                      <Icon name="crown" size={12} /> Host
                    </span>
                  )}
                  {!p.connected ? (
                    <span className="badge badge--ember">
                      <Icon name="offline" size={12} /> Reconnecting
                    </span>
                  ) : p.ready || p.userId === room.hostId ? (
                    <span className="badge badge--moss">
                      <Icon name="check" size={12} /> Ready
                    </span>
                  ) : (
                    <span className="badge">Not ready</span>
                  )}
                </li>
              ))}
              {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }).map(
                (_, i) => (
                  <li className="race-player" key={`empty-${i}`} style={{ opacity: 0.45 }}>
                    <span className="race-player__name muted">Open slot</span>
                  </li>
                ),
              )}
            </ul>
            <div className="row">
              {isHost ? (
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  disabled={!canStart}
                  onClick={async () => {
                    AudioManager.get().unlock();
                    const res = await getSocket().timeout(8000).emitWithAck('race:start');
                    if (!res.ok) toast(res.error.message, 'alert');
                  }}
                >
                  <Icon name="flag" size={20} /> Start race
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn btn--lg ${me?.ready ? '' : 'btn--primary'}`}
                  onClick={async () => {
                    AudioManager.get().unlock();
                    const res = await getSocket()
                      .timeout(8000)
                      .emitWithAck('race:ready', { ready: !me?.ready });
                    if (!res.ok) toast(res.error.message, 'alert');
                  }}
                >
                  {me?.ready ? 'Not ready' : "I'm ready"}
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={() => void leave()}>
                Leave
              </button>
            </div>
            <p className="small muted" role="status" style={{ margin: 0 }}>
              {isHost
                ? startReason || 'Everyone is ready — start when you like.'
                : 'The host starts the race once everyone is ready.'}{' '}
              Lobbies close after 30 minutes.
            </p>
          </div>
        </div>
      )}

      {menuOpen && room.phase === 'racing' && !myResult && (
        <div className="game-overlay game-overlay--clear" data-game-overlay="modal">
          <div
            className="panel overlay-card stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="race-menu"
          >
            <h2 id="race-menu">The race goes on!</h2>
            <p className="muted">Live races can't be paused — your dragon is still running.</p>
            <div className="row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => (session ? session.resume() : setMenuOpen(false))}
              >
                Back to the race
              </button>
              <button type="button" className="btn btn--danger" onClick={() => void leave()}>
                Forfeit &amp; leave
              </button>
            </div>
          </div>
        </div>
      )}

      {myResult && !results && (
        <div className="game-overlay" data-game-overlay="modal">
          <div className="panel overlay-card stack" role="status">
            <p className="eyebrow">Run verified</p>
            <h2>
              {myResult.outcome === 'caught'
                ? `Caught in ${formatDuration(myResult.seconds)}!`
                : 'Finished'}
            </h2>
            <p className="muted">
              Score {formatNumber(myResult.score)}. Waiting for the other dragons ({live.length}/
              {room.players.filter((p) => !p.dnf).length} finished)…
            </p>
            <ol className="race-players">
              {live.map((s, i) => (
                <li key={s.userId} className="race-player">
                  <span className="rank">{i + 1}</span>
                  <span className="race-player__name">{s.displayName}</span>
                  <span>
                    {s.outcome === 'caught' ? formatDuration(s.ticks / 60) : formatNumber(s.score)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {results && (
        <div className="game-overlay" data-game-overlay="modal">
          <div
            className="panel overlay-card overlay-card--wide stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="race-results"
          >
            <p className="eyebrow">
              Race results · {DIFFICULTIES[results.difficulty].name} · {STAGES[results.stage].name}
            </p>
            <h2 id="race-results" className="results-title">
              {(() => {
                const mine = results.standings.find((s) => s.userId === meId);
                if (!mine) return 'Race complete';
                if (mine.dnf) return 'Did not finish';
                return mine.placement === 1 ? 'Victory!' : `You placed ${ordinal(mine.placement)}`;
              })()}
            </h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Place</th>
                    <th scope="col">Dragon</th>
                    <th scope="col">Result</th>
                    <th scope="col" className="num">
                      Time
                    </th>
                    <th scope="col" className="num">
                      Score
                    </th>
                    <th scope="col" className="num">
                      Team points
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.standings.map((s) => (
                    <tr key={s.userId} data-you={s.userId === meId}>
                      <td>
                        <span className={`rank rank--${s.placement}`}>{s.placement}</span>
                      </td>
                      <td>
                        {s.displayName} {s.teamTag && <span className="badge">{s.teamTag}</span>}
                      </td>
                      <td>
                        {s.dnf
                          ? 'DNF'
                          : s.outcome === 'caught'
                            ? 'Caught'
                            : s.outcome === 'escaped'
                              ? 'Escaped'
                              : 'Exhausted'}
                      </td>
                      <td className="num">{s.dnf ? '—' : formatDuration(s.ticks / 60)}</td>
                      <td className="num">{s.dnf ? '—' : formatNumber(s.score)}</td>
                      <td className="num">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Catches rank first (fastest wins), then distance score. Every finish was replayed and
              verified by the server.
            </p>
            <div className="row">
              <Link className="btn btn--primary" to="/race">
                <Icon name="race" size={18} /> Race again
              </Link>
              <Link className="btn btn--ghost" to="/leaderboards?board=teams">
                Team standings
              </Link>
              <Link className="btn btn--ghost" to="/play">
                Solo chase
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
