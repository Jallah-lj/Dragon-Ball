import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  raceCodeSchema,
  STAGE_IDS,
  STAGES,
  type Difficulty,
  type RaceRoomSummaryDTO,
  type RaceVisibility,
  type StageId,
} from '@dbfc/shared';
import { Icon } from '../components/Icons';
import { RequireSession } from '../components/RequireSession';
import { Alert, EmptyState, Field, useDocumentTitle } from '../components/ui';
import { AudioManager } from '../game/systems/AudioManager';
import { connectSocket } from '../lib/socket';

export function RaceLobbyPage() {
  useDocumentTitle('Live race');
  return (
    <RequireSession feature="Live races">
      {(user) => <RaceLobby hasTeam={!!user.team} />}
    </RequireSession>
  );
}

function RaceLobby({ hasTeam }: { hasTeam: boolean }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RaceRoomSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [stage, setStage] = useState<StageId>('emerald');
  const [visibility, setVisibility] = useState<RaceVisibility>('open');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s = await connectSocket();
        const res = await s.timeout(5000).emitWithAck('race:list');
        if (!alive) return;
        if (res.ok) setRooms(res.rooms);
        else setError(res.error.message);
      } catch {
        if (alive)
          setError('Could not reach the race server. Check your connection and try again.');
      }
    };
    void load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    AudioManager.get().unlock();
    setBusy(true);
    setError(null);
    try {
      const s = await connectSocket();
      const res = await s
        .timeout(8000)
        .emitWithAck('race:create', { difficulty, stage, visibility });
      if (res.ok) navigate(`/race/${res.room.code}`);
      else setError(res.error.message);
    } catch {
      setError('Could not create the race. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const parsed = raceCodeSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message);
      return;
    }
    AudioManager.get().unlock();
    navigate(`/race/${parsed.data}`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Live race</p>
          <h1>Race up to six dragons</h1>
          <p>
            Everyone runs the same trail at the same moment. The server verifies every finish, ranks
            the field and awards team points.
          </p>
        </div>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="grid grid--2" style={{ alignItems: 'start', marginTop: 'var(--space-4)' }}>
        <form className="panel stack" onSubmit={create} aria-labelledby="create-race">
          <h2 id="create-race" className="panel__title">
            <Icon name="flag" /> Host a race
          </h2>
          <label className="field">
            <span className="field__label">Difficulty</span>
            <select
              className="select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTY_IDS.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTIES[d].name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Forest</span>
            <select
              className="select"
              value={stage}
              onChange={(e) => setStage(e.target.value as StageId)}
            >
              {STAGE_IDS.map((s) => (
                <option key={s} value={s}>
                  {STAGES[s].name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Who can join</legend>
            <label className="checkbox">
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'open'}
                onChange={() => setVisibility('open')}
              />{' '}
              Anyone with the code (listed below)
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'team'}
                disabled={!hasTeam}
                onChange={() => setVisibility('team')}
              />{' '}
              Team members only
              {!hasTeam && <span className="small muted">— join a team first</span>}
            </label>
          </fieldset>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy}
            style={{ alignSelf: 'flex-start' }}
          >
            <Icon name="race" size={18} /> Create race room
          </button>
        </form>
        <div className="stack">
          <form className="panel stack" onSubmit={join} aria-labelledby="join-race">
            <h2 id="join-race" className="panel__title">
              <Icon name="link" /> Join with a code
            </h2>
            <Field label="Race code" error={codeError}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={code}
                  maxLength={6}
                  placeholder="ABC234"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.2em', maxWidth: 220 }}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setCodeError(undefined);
                  }}
                />
              )}
            </Field>
            <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>
              Join race
            </button>
          </form>
          <section className="panel" aria-labelledby="open-races">
            <h2 id="open-races" className="panel__title">
              <Icon name="team" /> Open lobbies
            </h2>
            {rooms === null ? (
              <p className="muted">Looking for races…</p>
            ) : rooms.length === 0 ? (
              <EmptyState icon="race" title="No open lobbies right now">
                <p>Host one and share the code.</p>
              </EmptyState>
            ) : (
              <ul className="race-players">
                {rooms.map((r) => (
                  <li key={r.code} className="race-player">
                    <span className="code-chip" style={{ fontSize: 'var(--text-sm)' }}>
                      {r.code}
                    </span>
                    <span className="race-player__name">
                      {r.hostName}
                      <span className="small muted" style={{ display: 'block', fontWeight: 400 }}>
                        {DIFFICULTIES[r.difficulty].name} · {STAGES[r.stage].name}
                      </span>
                    </span>
                    <span className="small">
                      {r.players}/{r.maxPlayers}
                    </span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => navigate(`/race/${r.code}`)}
                    >
                      Join
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
