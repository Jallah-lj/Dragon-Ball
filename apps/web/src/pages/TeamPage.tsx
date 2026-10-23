import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  createTeamSchema,
  inviteCodeSchema,
  TEAM_MAX_SIZE,
  TEAM_MIN_SIZE,
  type TeamDTO,
  type TeamMemberDTO,
  type TeamRole,
} from '@dbfc/shared';
import { DragonAvatar } from '../components/DragonAvatar';
import { Icon } from '../components/Icons';
import { RequireSession } from '../components/RequireSession';
import { Alert, ErrorBlock, Field, Loading, Modal, useDocumentTitle } from '../components/ui';
import { useToast } from '../components/Toast';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatNumber, formatTimeLeft } from '../lib/format';
import { validate } from '../lib/forms';
import { useApi } from '../lib/useApi';

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Owner',
  captain: 'Captain',
  member: 'Member',
};

export function TeamPage() {
  useDocumentTitle('Team');
  return (
    <RequireSession account feature="Teams">
      {() => <TeamContent />}
    </RequireSession>
  );
}

function TeamContent() {
  const mine = useApi<{ team: TeamDTO | null }>('/api/teams/mine');
  const { refresh } = useAuth();
  if (mine.loading && !mine.data) return <Loading />;
  if (mine.error || !mine.data) return <ErrorBlock error={mine.error} onRetry={mine.reload} />;
  const onChange = (team: TeamDTO | null) => {
    mine.setData({ team });
    void refresh();
  };
  return mine.data.team ? (
    <TeamDashboard team={mine.data.team} onChange={onChange} reload={mine.reload} />
  ) : (
    <NoTeam onCreated={onChange} />
  );
}

function NoTeam({ onCreated }: { onCreated: (t: TeamDTO) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', tag: '', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { data, errors: v } = validate(createTeamSchema, {
      ...form,
      description: form.description || undefined,
    });
    setErrors(v);
    if (!data) return;
    try {
      const team = await api<TeamDTO>('/api/teams', { method: 'POST', body: data });
      toast(`Team ${team.name} founded!`, 'team');
      onCreated(team);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    }
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    const res = inviteCodeSchema.safeParse(code);
    if (!res.success) {
      setCodeError(res.error.issues[0]?.message);
      return;
    }
    navigate(`/join/${res.data}`);
  };
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Teams</p>
          <h1>Find your flight</h1>
          <p>
            Teams climb the weekly standings together with placement points from live races. Create
            one or join with an invite code.
          </p>
        </div>
      </div>
      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <form className="panel stack" onSubmit={create} noValidate aria-labelledby="create-team">
          <h2 id="create-team" className="panel__title">
            <Icon name="flag" /> Found a team
          </h2>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Team name" error={errors.name} hint="3–32 characters, unique.">
            {(p) => (
              <input
                {...p}
                className="input"
                value={form.name}
                maxLength={32}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            )}
          </Field>
          <Field
            label="Tag"
            error={errors.tag}
            hint="2–5 letters or digits, shown next to names (e.g. EMBR)."
          >
            {(p) => (
              <input
                {...p}
                className="input"
                value={form.tag}
                maxLength={5}
                style={{ textTransform: 'uppercase', maxWidth: 160 }}
                onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })}
              />
            )}
          </Field>
          <Field label="Description (optional)" error={errors.description}>
            {(p) => (
              <textarea
                {...p}
                className="textarea"
                maxLength={200}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            )}
          </Field>
          <button type="submit" className="btn btn--primary" style={{ alignSelf: 'flex-start' }}>
            Create team
          </button>
        </form>
        <form className="panel stack" onSubmit={join} noValidate aria-labelledby="join-team">
          <h2 id="join-team" className="panel__title">
            <Icon name="link" /> Join with a code
          </h2>
          <p className="muted small">Ask a team owner or captain for an invite code or link.</p>
          <Field label="Invite code" error={codeError}>
            {(p) => (
              <input
                {...p}
                className="input code-input"
                value={code}
                maxLength={8}
                placeholder="ABCD2345"
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em', maxWidth: 240 }}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeError(undefined);
                }}
              />
            )}
          </Field>
          <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>
            Look up invite
          </button>
        </form>
      </div>
    </>
  );
}

function TeamDashboard({
  team,
  onChange,
  reload,
}: {
  team: TeamDTO;
  onChange: (t: TeamDTO | null) => void;
  reload: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | {
    title: string;
    body: string;
    action: () => Promise<void>;
    danger?: boolean;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const role = team.yourRole;
  const isOwner = role === 'owner';
  const canManage = role === 'owner' || role === 'captain';
  const sorted = [...team.members].sort(
    (a, b) => b.bestScore - a.bestScore || b.racePoints - a.racePoints,
  );

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const setRole = (m: TeamMemberDTO, next: TeamRole) =>
    run(async () =>
      onChange(
        await api<TeamDTO>(`/api/teams/${team.id}/members/${m.userId}`, {
          method: 'PATCH',
          body: { role: next },
        }),
      ),
    );

  const remove = (m: TeamMemberDTO) =>
    setConfirm({
      title: `Remove ${m.displayName}?`,
      body: `${m.displayName} will leave ${team.name}. They can rejoin with a new invite.`,
      danger: true,
      action: async () => {
        await api(`/api/teams/${team.id}/members/${m.userId}`, { method: 'DELETE' });
        toast(`${m.displayName} was removed.`, 'team');
        reload();
      },
    });

  const canRemove = (m: TeamMemberDTO) =>
    m.userId !== user?.id && (isOwner || (role === 'captain' && m.role === 'member'));
  const alone = team.memberCount === 1;

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            Team · <span className="badge badge--gold">{team.tag}</span>
          </p>
          <h1>{team.name}</h1>
          <p>{team.description || 'No description yet.'}</p>
        </div>
        <span className="badge">
          <Icon name="team" size={14} /> {team.memberCount} / {team.maxMembers} members
        </span>
      </div>
      {error && <Alert kind="error">{error}</Alert>}

      <section className="stats" aria-label="Team statistics">
        {[
          ['bolt', 'Points this week', team.stats.weeklyPoints],
          ['trophy', 'All-time points', team.stats.allTimePoints],
          ['race', 'Races', team.stats.races],
          ['crown', 'Race wins', team.stats.wins],
          ['flame', 'Best score', team.stats.bestScore],
        ].map(([icon, label, value]) => (
          <div className="stat" key={label as string}>
            <div className="stat__label">
              <Icon name={icon as 'bolt'} size={14} /> {label}
            </div>
            <div className="stat__value">{formatNumber(value as number)}</div>
          </div>
        ))}
      </section>

      <section className="panel" aria-labelledby="members">
        <h2 id="members" className="panel__title">
          <Icon name="team" /> Members
        </h2>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Team members ranked by best score</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Dragon</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
                <th scope="col" className="num">
                  Best score
                </th>
                <th scope="col" className="num">
                  Race points
                </th>
                {canManage && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <tr key={m.userId} data-you={m.userId === user?.id}>
                  <td>{i + 1}</td>
                  <td>
                    <span className="row" style={{ gap: 'var(--space-2)' }}>
                      <DragonAvatar skin={m.avatar} size={30} />
                      <Link to={`/players/${m.userId}`}>{m.displayName}</Link>
                      <span className="muted small">Lv {m.level}</span>
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${m.role === 'owner' ? 'badge--gold' : m.role === 'captain' ? 'badge--moss' : ''}`}
                    >
                      {m.role === 'owner' && <Icon name="crown" size={12} />}
                      {m.role === 'captain' && <Icon name="shield" size={12} />}{' '}
                      {ROLE_LABEL[m.role]}
                    </span>
                  </td>
                  <td>{formatDate(m.joinedAt)}</td>
                  <td className="num">{formatNumber(m.bestScore)}</td>
                  <td className="num">{formatNumber(m.racePoints)}</td>
                  {canManage && (
                    <td>
                      <span className="row" style={{ gap: 'var(--space-1)' }}>
                        {isOwner && m.role === 'member' && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => void setRole(m, 'captain')}
                          >
                            Make captain
                          </button>
                        )}
                        {isOwner && m.role === 'captain' && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => void setRole(m, 'member')}
                          >
                            Make member
                          </button>
                        )}
                        {isOwner && m.role !== 'owner' && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() =>
                              setConfirm({
                                title: `Make ${m.displayName} the owner?`,
                                body: 'You will become a captain. Only the owner can change roles, resize or disband the team.',
                                action: async () =>
                                  onChange(
                                    await api<TeamDTO>(
                                      `/api/teams/${team.id}/members/${m.userId}`,
                                      { method: 'PATCH', body: { role: 'owner' } },
                                    ),
                                  ),
                              })
                            }
                          >
                            Transfer ownership
                          </button>
                        )}
                        {canRemove(m) && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => remove(m)}
                          >
                            Remove
                          </button>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && <Invites team={team} reload={reload} />}
      {canManage && <TeamSettings team={team} isOwner={isOwner} onChange={onChange} />}

      <section className="panel panel--bark" aria-labelledby="leave">
        <h2 id="leave" className="panel__title">
          <Icon name="logout" /> Leave or disband
        </h2>
        {isOwner && !alone && (
          <p className="muted small">
            As the owner, transfer ownership to another member before leaving.
          </p>
        )}
        <div className="row">
          {(!isOwner || alone) && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() =>
                setConfirm({
                  title: alone ? `Leave and disband ${team.name}?` : `Leave ${team.name}?`,
                  body: alone
                    ? 'You are the only member, so the team will be disbanded.'
                    : 'You can rejoin later with a new invite.',
                  danger: true,
                  action: async () => {
                    await api(`/api/teams/${team.id}/leave`, { method: 'POST', body: {} });
                    toast(`You left ${team.name}.`, 'logout');
                    onChange(null);
                  },
                })
              }
            >
              Leave team
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() =>
                setConfirm({
                  title: `Disband ${team.name}?`,
                  body: 'All members are removed and the team’s standings are deleted. This cannot be undone.',
                  danger: true,
                  action: async () => {
                    await api(`/api/teams/${team.id}`, { method: 'DELETE' });
                    toast(`${team.name} was disbanded.`, 'info');
                    onChange(null);
                  },
                })
              }
            >
              Disband team
            </button>
          )}
        </div>
      </section>

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.body}</p>
          <div className="row">
            <button
              type="button"
              className={`btn ${confirm.danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={async () => {
                const action = confirm.action;
                setConfirm(null);
                await run(action);
              }}
            >
              Confirm
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Invites({ team, reload }: { team: TeamDTO; reload: () => void }) {
  const toast = useToast();
  const [hours, setHours] = useState(72);
  const [uses, setUses] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/api/teams/${team.id}/invites`, {
        method: 'POST',
        body: { expiresInHours: hours, maxUses: uses },
      });
      toast('Invite created.', 'link');
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const link = (code: string) => `${window.location.origin}/join/${code}`;
  return (
    <section className="panel" aria-labelledby="invites">
      <h2 id="invites" className="panel__title">
        <Icon name="link" /> Invites
      </h2>
      {error && <Alert kind="error">{error}</Alert>}
      <form className="row" onSubmit={create} style={{ alignItems: 'flex-end' }}>
        <label className="field">
          <span className="field__label">Expires after</span>
          <select
            className="select"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={1}>1 hour</option>
            <option value={24}>1 day</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Uses</span>
          <select className="select" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
            {[1, 3, 5, 10, 25].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="btn btn--gold"
          disabled={team.memberCount >= team.maxMembers}
        >
          Create invite
        </button>
      </form>
      {team.memberCount >= team.maxMembers && (
        <p className="small muted">
          The team is full — raise the size limit or remove members to invite more.
        </p>
      )}
      {(team.invites ?? []).length === 0 ? (
        <p className="muted small" style={{ marginTop: 'var(--space-3)' }}>
          No active invites.
        </p>
      ) : (
        <ul
          className="stack"
          style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-4)' }}
        >
          {team.invites!.map((inv) => (
            <li
              key={inv.code}
              className="row row--between"
              style={{
                borderTop: '1px solid rgba(244,234,210,0.08)',
                paddingTop: 'var(--space-3)',
              }}
            >
              <span className="row">
                <span className="code-chip">{inv.code}</span>
                <span className="small muted">
                  {inv.uses}/{inv.maxUses} used · expires in {formatTimeLeft(inv.expiresAt)} · by{' '}
                  {inv.createdBy}
                </span>
              </span>
              <span className="row" style={{ gap: 'var(--space-1)' }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link(inv.code));
                      toast('Invite link copied.', 'copy');
                    } catch {
                      toast(link(inv.code), 'link');
                    }
                  }}
                >
                  <Icon name="copy" size={14} /> Copy link
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={async () => {
                    await api(`/api/teams/${team.id}/invites/${inv.code}`, { method: 'DELETE' });
                    reload();
                  }}
                >
                  Revoke
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamSettings({
  team,
  isOwner,
  onChange,
}: {
  team: TeamDTO;
  isOwner: boolean;
  onChange: (t: TeamDTO) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description);
  const [max, setMax] = useState(team.maxMembers);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrors({});
    const body: Record<string, unknown> = {};
    if (name !== team.name) body.name = name;
    if (description !== team.description) body.description = description;
    if (isOwner && max !== team.maxMembers) body.maxMembers = max;
    if (Object.keys(body).length === 0) return;
    try {
      onChange(await api<TeamDTO>(`/api/teams/${team.id}`, { method: 'PATCH', body }));
      toast('Team updated.', 'check');
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    }
  };
  return (
    <section className="panel" aria-labelledby="team-settings">
      <h2 id="team-settings" className="panel__title">
        <Icon name="settings" /> Team settings
      </h2>
      <form className="stack" onSubmit={save} noValidate style={{ maxWidth: 560 }}>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Name" error={errors.name}>
          {(p) => (
            <input
              {...p}
              className="input"
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Description" error={errors.description}>
          {(p) => (
            <textarea
              {...p}
              className="textarea"
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        {isOwner && (
          <Field
            label="Maximum members"
            error={errors.maxMembers}
            hint={`Between ${TEAM_MIN_SIZE} and ${TEAM_MAX_SIZE}.`}
          >
            {(p) => (
              <input
                {...p}
                className="input"
                type="number"
                min={Math.max(TEAM_MIN_SIZE, team.memberCount)}
                max={TEAM_MAX_SIZE}
                value={max}
                style={{ maxWidth: 140 }}
                onChange={(e) => setMax(Number(e.target.value))}
              />
            )}
          </Field>
        )}
        <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>
          Save changes
        </button>
      </form>
    </section>
  );
}
