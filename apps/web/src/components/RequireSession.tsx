import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { SessionUserDTO } from '@dbfc/shared';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from './Icons';
import { Alert, Loading } from './ui';

interface Props {
  /** Require a full account (not a guest). */
  account?: boolean;
  feature: string;
  children: (user: SessionUserDTO) => ReactNode;
}

/** Gate a page behind a session, offering sign-in or guest play inline. */
export function RequireSession({ account = false, feature, children }: Props) {
  const { user, status, guest } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const next = encodeURIComponent(location.pathname + location.search);
  if (status === 'loading') return <Loading />;
  if (status === 'offline') {
    return (
      <div className="panel">
        <Alert kind="warn" title="Offline">
          {feature} needs the Forest Chase server, which can't be reached right now. Solo chases
          still work offline.
        </Alert>
        <Link className="btn btn--primary" to="/play" style={{ marginTop: 'var(--space-4)' }}>
          <Icon name="play" size={18} /> Play offline
        </Link>
      </div>
    );
  }
  if (!user || (account && user.isGuest)) {
    return (
      <div className="panel" style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>
          {account && user?.isGuest ? 'Create your account' : 'Sign in to continue'}
        </h1>
        <p className="muted">
          {account
            ? `${feature} is available to registered players. ${user?.isGuest ? 'Your guest progress comes with you when you create an account.' : ''}`
            : `${feature} needs a session — sign in, or jump in as a guest.`}
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Link
            className="btn btn--primary"
            to={`/auth?mode=${user?.isGuest ? 'upgrade' : 'register'}&next=${next}`}
          >
            <Icon name="user" size={18} /> {user?.isGuest ? 'Create account' : 'Create account'}
          </Link>
          {!user && (
            <Link className="btn" to={`/auth?mode=login&next=${next}`}>
              Sign in
            </Link>
          )}
          {!user && !account && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={async () => {
                try {
                  await guest();
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              Continue as guest
            </button>
          )}
        </div>
      </div>
    );
  }
  return <>{children(user)}</>;
}
