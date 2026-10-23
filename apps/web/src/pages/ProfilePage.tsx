import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  achievementById,
  changePasswordSchema,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  levelForXp,
  skinById,
  STAGE_IDS,
  STAGES,
  type CollectionDTO,
  type ProfileDTO,
  type SessionInfoDTO,
} from '@dbfc/shared';
import { DragonAvatar } from '../components/DragonAvatar';
import { Icon } from '../components/Icons';
import { RequireSession } from '../components/RequireSession';
import { Alert, ErrorBlock, Field, Loading, Modal, useDocumentTitle } from '../components/ui';
import { useToast } from '../components/Toast';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDuration, formatNumber, formatRelative } from '../lib/format';
import { validate } from '../lib/forms';
import { useApi } from '../lib/useApi';

export function ProfilePage() {
  useDocumentTitle('Profile');
  return <RequireSession feature="Your profile">{() => <ProfileContent />}</RequireSession>;
}

function ProfileContent() {
  const profile = useApi<ProfileDTO>('/api/profile');
  if (profile.loading && !profile.data) return <Loading />;
  if (profile.error || !profile.data)
    return <ErrorBlock error={profile.error} onRetry={profile.reload} />;
  const p = profile.data;
  const lvl = levelForXp(p.user.xp);
  const stats = p.progress.stats;
  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <section className="panel row" style={{ gap: 'var(--space-5)', alignItems: 'center' }}>
        <DragonAvatar skin={p.user.avatar} size={96} label={`${p.user.displayName}'s dragon`} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <p className="eyebrow">{p.user.isGuest ? 'Guest explorer' : `@${p.user.username}`}</p>
          <h1 style={{ marginBottom: 'var(--space-2)' }}>{p.user.displayName}</h1>
          <div className="row small">
            <span className="badge badge--gold">
              <Icon name="crown" size={14} /> Level {lvl.level}
            </span>
            <span className="badge badge--moss">
              <Icon name="crystal" size={14} /> {formatNumber(p.user.crystals)} crystals
            </span>
            {p.user.team && (
              <Link className="badge" to="/team">
                <Icon name="team" size={14} /> {p.user.team.tag} · {p.user.team.role}
              </Link>
            )}
            <span className="muted">Joined {formatDate(p.user.createdAt)}</span>
          </div>
          <div style={{ marginTop: 'var(--space-3)', maxWidth: 420 }}>
            <div className="row row--between small muted">
              <span>XP</span>
              <span>
                {formatNumber(lvl.xpIntoLevel)} / {formatNumber(lvl.xpForNext)}
              </span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={lvl.xpForNext}
              aria-valuenow={lvl.xpIntoLevel}
              aria-label="Progress to next level"
            >
              <div
                className="progress__bar"
                style={{ width: `${(lvl.xpIntoLevel / lvl.xpForNext) * 100}%` }}
              />
            </div>
          </div>
        </div>
        {p.user.isGuest && (
          <Link className="btn btn--gold" to="/auth?mode=upgrade&next=/profile">
            <Icon name="shield" size={18} /> Save progress — create account
          </Link>
        )}
      </section>

      <section className="stats" aria-label="Lifetime statistics">
        {[
          ['flame', 'Catches', stats.catches],
          ['path', 'Runs', stats.runs],
          ['race', 'Races', stats.races],
          ['trophy', 'Race wins', stats.raceWins],
          ['crystal', 'Crystals found', stats.crystalsCollected],
          ['scale', 'Ancient scales', stats.scalesFound],
          ['thorn', 'Thorns burned', stats.thornsBurned],
        ].map(([icon, label, value]) => (
          <div className="stat" key={label as string}>
            <div className="stat__label">
              <Icon name={icon as 'flame'} size={14} /> {label}
            </div>
            <div className="stat__value">{formatNumber(value as number)}</div>
          </div>
        ))}
      </section>

      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <h2 className="panel__title">
            <Icon name="flag" /> Trail progress
          </h2>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">
                Best score and catches per difficulty and forest
              </caption>
              <thead>
                <tr>
                  <th scope="col">Difficulty</th>
                  {STAGE_IDS.map((s) => (
                    <th key={s} scope="col">
                      {STAGES[s].name.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIFFICULTY_IDS.map((d) => (
                  <tr key={d}>
                    <th scope="row">{DIFFICULTIES[d].name}</th>
                    {STAGE_IDS.map((s) => {
                      const r = p.progress.records.find((x) => x.difficulty === d && x.stage === s);
                      const locked =
                        !p.progress.unlocks.difficulties.includes(d) ||
                        !p.progress.unlocks.stages.includes(s);
                      return (
                        <td key={s}>
                          {r ? (
                            <span>
                              {formatNumber(r.bestScore)}
                              <span className="muted small"> · {r.catches}×</span>
                            </span>
                          ) : locked ? (
                            <span className="muted small">
                              <Icon name="lock" size={12} /> Locked
                            </span>
                          ) : (
                            <span className="muted small">Not tried</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2 className="panel__title">
            <Icon name="trophy" /> Achievements
          </h2>
          {p.achievements.length === 0 ? (
            <p className="muted">No achievements yet — catch the fireball to earn your first.</p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {p.achievements.slice(0, 6).map((a) => (
                <li key={a.id} className="row row--between small">
                  <span>
                    <Icon name="trophy" size={14} style={{ color: 'var(--amber-300)' }} />{' '}
                    {achievementById(a.id)?.name ?? a.id}
                  </span>
                  <span className="muted">{formatRelative(a.unlockedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/collection">See all achievements and skins</Link>
        </section>
      </div>

      <section className="panel">
        <h2 className="panel__title">
          <Icon name="clock" /> Recent runs
        </h2>
        {p.recentRuns.length === 0 ? (
          <p className="muted">No verified runs yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Trail</th>
                  <th scope="col">Result</th>
                  <th scope="col" className="num">
                    Time
                  </th>
                  <th scope="col" className="num">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.recentRuns.map((r) => (
                  <tr key={r.id}>
                    <td>{formatRelative(r.finishedAt)}</td>
                    <td>
                      {r.mode === 'daily' ? "Today's Trail" : r.mode === 'race' ? 'Race' : 'Solo'}
                    </td>
                    <td>
                      {DIFFICULTIES[r.difficulty].name} · {STAGES[r.stage].name}
                    </td>
                    <td>
                      {r.outcome === 'caught' ? (
                        <span className="badge badge--gold">
                          <Icon name="check" size={12} /> Caught
                        </span>
                      ) : (
                        <span className="badge">
                          {r.outcome === 'escaped' ? 'Escaped' : 'Exhausted'}
                        </span>
                      )}
                    </td>
                    <td className="num">{formatDuration(r.ticks / 60)}</td>
                    <td className="num">{formatNumber(r.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EditProfile profile={p} onSaved={profile.reload} />
      {!p.user.isGuest && <Security emailVerified={p.user.emailVerified} email={p.user.email} />}
      <DangerZone hasPassword={!p.user.isGuest} />
    </div>
  );
}

function EditProfile({ profile, onSaved }: { profile: ProfileDTO; onSaved: () => void }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const collection = useApi<CollectionDTO>('/api/collection');
  const [displayName, setDisplayName] = useState(profile.user.displayName);
  const [email, setEmail] = useState(profile.user.email ?? '');
  const [avatar, setAvatar] = useState(profile.user.avatar);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const owned = collection.data?.skins.filter((s) => s.owned) ?? [];
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const body: Record<string, string> = {};
      if (displayName !== profile.user.displayName) body.displayName = displayName;
      if (avatar !== profile.user.avatar) body.avatar = avatar;
      if (
        !profile.user.isGuest &&
        email.trim() &&
        email.trim().toLowerCase() !== (profile.user.email ?? '')
      )
        body.email = email.trim();
      if (Object.keys(body).length === 0) {
        setBusy(false);
        return;
      }
      const res = await api<{ user: ProfileDTO['user'] }>('/api/profile', {
        method: 'PATCH',
        body,
      });
      setUser(res.user);
      toast(
        body.email ? 'Profile saved — check your inbox to verify the new email.' : 'Profile saved.',
        'check',
      );
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel" aria-labelledby="edit-profile">
      <h2 id="edit-profile" className="panel__title">
        <Icon name="user" /> Edit profile
      </h2>
      <form className="stack" onSubmit={save} noValidate style={{ maxWidth: 560 }}>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Display name" error={errors.displayName}>
          {(p) => (
            <input
              {...p}
              className="input"
              value={displayName}
              maxLength={24}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
        </Field>
        {!profile.user.isGuest && (
          <Field
            label="Email"
            error={errors.email}
            hint={
              profile.user.email
                ? profile.user.emailVerified
                  ? 'Verified.'
                  : 'Not verified yet.'
                : 'Optional — for password resets.'
            }
          >
            {(p) => (
              <input
                {...p}
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
        )}
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Avatar</legend>
          <div className="row" role="radiogroup" aria-label="Avatar">
            {owned.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={avatar === s.id}
                className="choice"
                style={{ minHeight: 0, padding: 'var(--space-2)', alignItems: 'center' }}
                onClick={() => setAvatar(s.id)}
              >
                <DragonAvatar skin={s.id} size={48} />
                <span className="small">{skinById(s.id).name}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="btn btn--primary"
          disabled={busy}
          style={{ alignSelf: 'flex-start' }}
        >
          Save profile
        </button>
      </form>
    </section>
  );
}

function Security({ emailVerified, email }: { emailVerified: boolean; email: string | null }) {
  const { logoutAll } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const sessions = useApi<{ sessions: SessionInfoDTO[] }>('/api/auth/sessions');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    const { data, errors: v } = validate(changePasswordSchema, pw);
    setErrors(v);
    setError(null);
    if (!data) return;
    try {
      await api('/api/auth/password', { method: 'POST', body: data });
      setPw({ currentPassword: '', newPassword: '' });
      toast('Password changed. Other devices were signed out.', 'shield');
      sessions.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    }
  };
  return (
    <section className="panel" aria-labelledby="security">
      <h2 id="security" className="panel__title">
        <Icon name="shield" /> Security
      </h2>
      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <form className="stack" onSubmit={changePassword} noValidate>
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Change password</h3>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Current password" error={errors.currentPassword}>
            {(p) => (
              <input
                {...p}
                className="input"
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              />
            )}
          </Field>
          <Field label="New password" error={errors.newPassword}>
            {(p) => (
              <input
                {...p}
                className="input"
                type="password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
              />
            )}
          </Field>
          <button className="btn" type="submit" style={{ alignSelf: 'flex-start' }}>
            Update password
          </button>
          {email && !emailVerified && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                try {
                  await api('/api/auth/resend-verification', { method: 'POST', body: {} });
                  toast('Verification email sent.', 'check');
                } catch (err) {
                  toast(errorMessage(err), 'alert');
                }
              }}
            >
              Resend verification email
            </button>
          )}
        </form>
        <div className="stack">
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Signed-in devices</h3>
          {sessions.loading && !sessions.data ? (
            <Loading />
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {sessions.data?.sessions.map((s) => (
                <li key={s.id} className="row row--between small">
                  <span>
                    <strong>{s.current ? 'This device' : describeAgent(s.userAgent)}</strong>
                    <span className="muted"> · active {formatRelative(s.lastSeenAt)}</span>
                  </span>
                  {!s.current && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={async () => {
                        await api(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                        sessions.reload();
                      }}
                    >
                      Sign out
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              await logoutAll();
              toast('Signed out on every device.', 'logout');
              navigate('/');
            }}
          >
            <Icon name="logout" size={18} /> Sign out everywhere
          </button>
        </div>
      </div>
    </section>
  );
}

function describeAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Firefox/.test(ua)
    ? 'Firefox'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome/.test(ua)
        ? 'Chrome'
        : /Safari/.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

function DangerZone({ hasPassword }: { hasPassword: boolean }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const remove = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/auth/account', {
        method: 'DELETE',
        body: { confirm, ...(hasPassword ? { password } : {}) },
      });
      setUser(null);
      toast('Your account and all its data were deleted.', 'info');
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <section className="panel panel--bark" aria-labelledby="danger">
      <h2 id="danger" className="panel__title">
        <Icon name="alert" /> Delete account
      </h2>
      <p className="muted">
        Permanently deletes your profile, runs, progress, skins and leaderboard entries. If you own
        a team, ownership passes to the longest-serving captain or member.
      </p>
      <button type="button" className="btn btn--danger" onClick={() => setOpen(true)}>
        Delete my account…
      </button>
      {open && (
        <Modal title="Delete your account?" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={remove}>
            <p>This cannot be undone.</p>
            {error && <Alert kind="error">{error}</Alert>}
            {hasPassword && (
              <Field label="Password">
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
            )}
            <Field label="Type DELETE to confirm">
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              )}
            </Field>
            <div className="row">
              <button type="submit" className="btn btn--danger" disabled={confirm !== 'DELETE'}>
                Delete forever
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
