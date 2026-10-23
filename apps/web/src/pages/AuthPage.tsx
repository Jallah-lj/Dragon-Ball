import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { loginSchema, registerSchema } from '@dbfc/shared';
import { Icon } from '../components/Icons';
import { Alert, Field, Tabs, useDocumentTitle } from '../components/ui';
import { useToast } from '../components/Toast';
import { errorMessage, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth';
import { validate } from '../lib/forms';

type Mode = 'login' | 'register';

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/play';
}

export function AuthPage() {
  const [params] = useSearchParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const upgrading = !!auth.user?.isGuest;
  const [mode, setMode] = useState<Mode>(
    params.get('mode') === 'login' && !upgrading ? 'login' : 'register',
  );
  const next = safeNext(params.get('next'));
  useDocumentTitle(
    upgrading ? 'Save your progress' : mode === 'login' ? 'Sign in' : 'Create account',
  );

  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const payload =
      mode === 'login'
        ? { username: form.username, password: form.password }
        : {
            username: form.username,
            password: form.password,
            ...(form.email.trim() ? { email: form.email } : {}),
            ...(form.displayName.trim() ? { displayName: form.displayName } : {}),
          };
    const { data, errors: v } = validate(mode === 'login' ? loginSchema : registerSchema, payload);
    setErrors(v);
    if (!data) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        const u = await auth.login(form.username, form.password);
        toast(`Welcome back, ${u.displayName}!`, 'flame');
      } else if (upgrading) {
        const u = await auth.upgrade(data as Parameters<typeof auth.upgrade>[0]);
        toast(`Account created — your progress is saved, ${u.displayName}.`, 'shield');
      } else {
        const u = await auth.register(data as Parameters<typeof auth.register>[0]);
        toast(`Welcome to the forest, ${u.displayName}!`, 'flame');
      }
      navigate(next);
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid--2" style={{ alignItems: 'start' }}>
      <section className="panel" aria-labelledby="auth-title">
        <h1 id="auth-title" style={{ fontSize: 'var(--text-2xl)' }}>
          {upgrading ? 'Save your progress' : mode === 'login' ? 'Welcome back' : 'Join the chase'}
        </h1>
        {upgrading ? (
          <p className="muted">
            You're playing as a guest. Create an account to keep your XP, crystals and unlocks, join
            a team and appear on leaderboards.
          </p>
        ) : (
          <Tabs<Mode>
            label="Account"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setErrors({});
              setFormError(null);
            }}
            tabs={[
              { id: 'register', label: 'Create account' },
              { id: 'login', label: 'Sign in' },
            ]}
          />
        )}
        <form className="stack" onSubmit={submit} noValidate>
          {formError && <Alert kind="error">{formError}</Alert>}
          <Field
            label={mode === 'login' ? 'Username or email' : 'Username'}
            error={errors.username}
            hint={mode === 'register' ? '3–20 letters, numbers, “_” or “-”.' : undefined}
          >
            {(p) => (
              <input
                {...p}
                className="input"
                autoComplete="username"
                value={form.username}
                onChange={set('username')}
                required
              />
            )}
          </Field>
          <Field
            label="Password"
            error={errors.password}
            hint={
              mode === 'register'
                ? 'At least 8 characters. A short sentence works well.'
                : undefined
            }
          >
            {(p) => (
              <input
                {...p}
                className="input"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={set('password')}
                required
              />
            )}
          </Field>
          {mode === 'register' && (
            <>
              <Field
                label="Display name (optional)"
                error={errors.displayName}
                hint="Shown on leaderboards. Defaults to your username."
              >
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    autoComplete="nickname"
                    value={form.displayName}
                    onChange={set('displayName')}
                  />
                )}
              </Field>
              <Field
                label="Email (optional)"
                error={errors.email}
                hint="Used only for verification and password resets."
              >
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={set('email')}
                  />
                )}
              </Field>
            </>
          )}
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
            {busy
              ? 'Please wait…'
              : upgrading
                ? 'Create account & keep progress'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
          </button>
          {mode === 'login' && (
            <Link to="/auth/forgot" className="small">
              Forgot your password?
            </Link>
          )}
        </form>
      </section>
      <aside className="panel panel--bark stack">
        <h2 className="panel__title">
          <Icon name="flame" /> Why an account?
        </h2>
        <ul className="summary-list">
          <li>
            <span>Verified scores on global, weekly and team leaderboards</span>
          </li>
          <li>
            <span>Create or join a team and race together</span>
          </li>
          <li>
            <span>Keep XP, crystals, skins and unlocks on every device</span>
          </li>
        </ul>
        {!auth.user && auth.status !== 'offline' && (
          <>
            <p className="muted small">
              Just want to play? Guests can chase right away — create an account later and keep
              everything.
            </p>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await auth.guest();
                  navigate(next);
                } catch (err) {
                  setFormError(errorMessage(err));
                }
              }}
            >
              <Icon name="play" size={18} /> Play as guest
            </button>
          </>
        )}
        {auth.status === 'offline' && (
          <Alert kind="warn">
            The server is offline, so accounts are unavailable. You can still play solo.
          </Alert>
        )}
      </aside>
    </div>
  );
}
