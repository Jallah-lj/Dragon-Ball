import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { forgotPasswordSchema, resetPasswordSchema } from '@dbfc/shared';
import { Alert, Field, Loading, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { validate } from '../lib/forms';

export function ForgotPasswordPage() {
  useDocumentTitle('Reset password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sent, setSent] = useState<{ emailEnabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { data, errors } = validate(forgotPasswordSchema, { email });
    setFieldError(errors.email);
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      setSent(
        await api<{ ok: boolean; emailEnabled: boolean }>('/api/auth/forgot', {
          method: 'POST',
          body: data,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>Forgot your password?</h1>
      {sent ? (
        <Alert kind="success" title="Check your inbox">
          If an account uses that address, a reset link is on its way. It expires in one hour.
          {!sent.emailEnabled &&
            ' (Email delivery is not configured on this server — the link is written to the server log.)'}
        </Alert>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <p className="muted">Enter the email on your account and we'll send a reset link.</p>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Email" error={fieldError}>
            {(p) => (
              <input
                {...p}
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            Send reset link
          </button>
        </form>
      )}
      <p style={{ marginTop: 'var(--space-4)' }}>
        <Link to="/auth?mode=login">Back to sign in</Link>
      </p>
    </section>
  );
}

export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { data, errors: v } = validate(resetPasswordSchema, { token, password });
    if (password !== confirm) v.confirm = 'Passwords do not match.';
    setErrors(v);
    if (!data || v.confirm) return;
    try {
      await api('/api/auth/reset', { method: 'POST', body: data });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <section className="panel" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>Choose a new password</h1>
      {!token && <Alert kind="error">This reset link is incomplete. Request a new one.</Alert>}
      {done ? (
        <Alert kind="success" title="Password updated">
          You've been signed out everywhere.{' '}
          <Link to="/auth?mode=login">Sign in with your new password</Link>.
        </Alert>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="New password" error={errors.password ?? errors.token}>
            {(p) => (
              <input
                {...p}
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <Field label="Confirm new password" error={errors.confirm}>
            {(p) => (
              <input
                {...p}
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
          </Field>
          <button className="btn btn--primary" type="submit" disabled={!token}>
            Update password
          </button>
        </form>
      )}
    </section>
  );
}

export function VerifyEmailPage() {
  useDocumentTitle('Verify email');
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [error, setError] = useState(token ? '' : 'This verification link is incomplete.');
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api('/api/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => {
        setState('done');
        void refresh();
      })
      .catch((err: unknown) => {
        setState('error');
        setError(errorMessage(err));
      });
  }, [token, refresh]);
  return (
    <section className="panel" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>Email verification</h1>
      {state === 'working' && <Loading label="Verifying…" />}
      {state === 'done' && (
        <Alert kind="success" title="Email verified">
          Thanks! <Link to="/profile">Back to your profile</Link>.
        </Alert>
      )}
      {state === 'error' && <Alert kind="error">{error}</Alert>}
    </section>
  );
}
