import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { inviteCodeSchema, type InvitePreviewDTO, type TeamDTO } from '@dbfc/shared';
import { Icon } from '../components/Icons';
import { Alert, ErrorBlock, Loading, useDocumentTitle } from '../components/ui';
import { useToast } from '../components/Toast';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatTimeLeft } from '../lib/format';
import { useApi } from '../lib/useApi';

const STATUS_TEXT: Record<Exclude<InvitePreviewDTO['status'], 'valid'>, string> = {
  expired: 'This invite has expired. Ask the team for a fresh one.',
  exhausted: 'This invite has already been used the maximum number of times.',
  revoked: 'The team revoked this invite.',
  full: 'This team is full right now.',
};

export function JoinTeamPage() {
  const { code: raw = '' } = useParams();
  const parsed = inviteCodeSchema.safeParse(raw);
  const code = parsed.success ? parsed.data : null;
  useDocumentTitle('Team invite');
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const preview = useApi<InvitePreviewDTO>(code ? `/api/invites/${code}` : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!code)
    return (
      <Alert kind="error">
        That doesn't look like an invite code. Codes are 8 characters, like ABCD2345.
      </Alert>
    );
  if (preview.loading && !preview.data) return <Loading />;
  if (preview.error) {
    if (preview.error instanceof ApiError && preview.error.code === 'INVITE_INVALID') {
      return (
        <section className="panel empty" style={{ maxWidth: 560 }}>
          <Icon name="link" size={40} />
          <h1 style={{ fontSize: 'var(--text-2xl)' }}>Invite not found</h1>
          <p>The code {code} doesn't match any team invite.</p>
          <Link className="btn" to="/team">
            Back to teams
          </Link>
        </section>
      );
    }
    return <ErrorBlock error={preview.error} onRetry={preview.reload} />;
  }
  const inv = preview.data!;
  const next = encodeURIComponent(`/join/${code}`);
  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const team = await api<TeamDTO>(`/api/invites/${code}/accept`, { method: 'POST', body: {} });
      toast(`Welcome to ${team.name}!`, 'team');
      await refresh();
      navigate('/team');
    } catch (err) {
      setError(errorMessage(err));
      preview.reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel stack" style={{ maxWidth: 600 }} aria-labelledby="invite-title">
      <p className="eyebrow">Team invite · {code}</p>
      <h1 id="invite-title" style={{ fontSize: 'var(--text-2xl)' }}>
        Join {inv.team.name} <span className="badge badge--gold">{inv.team.tag}</span>
      </h1>
      {inv.team.description && <p className="muted">{inv.team.description}</p>}
      <p className="small">
        {inv.team.memberCount} / {inv.team.maxMembers} members
        {inv.status === 'valid' && ` · invite expires in ${formatTimeLeft(inv.expiresAt)}`}
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      {inv.status !== 'valid' ? (
        <Alert kind="warn">{STATUS_TEXT[inv.status]}</Alert>
      ) : !user ? (
        <div className="row">
          <Link className="btn btn--primary" to={`/auth?mode=register&next=${next}`}>
            Create account to join
          </Link>
          <Link className="btn" to={`/auth?mode=login&next=${next}`}>
            Sign in
          </Link>
        </div>
      ) : user.isGuest ? (
        <div className="stack">
          <p className="muted small">
            Teams are for registered players. Your guest progress comes with you.
          </p>
          <Link
            className="btn btn--primary"
            to={`/auth?mode=upgrade&next=${next}`}
            style={{ alignSelf: 'flex-start' }}
          >
            Create account to join
          </Link>
        </div>
      ) : user.team ? (
        <Alert kind="info">
          You're already in {user.team.name}. <Link to="/team">Leave it first</Link> to join another
          team.
        </Alert>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => void accept()}
          disabled={busy}
          style={{ alignSelf: 'flex-start' }}
        >
          <Icon name="team" size={20} /> Join {inv.team.name}
        </button>
      )}
    </section>
  );
}
