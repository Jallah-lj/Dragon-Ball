import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthResponseDTO, SessionUserDTO } from '@dbfc/shared';
import {
  api,
  ApiError,
  detectBlockedCookies,
  getSessionToken,
  isNetworkError,
  setCsrfToken,
  setSessionToken,
} from './api';
import { onSettingsChange, sanitizeSettings, settingsStore } from './settings';
import { disconnectSocket } from './socket';

export type AuthStatus = 'loading' | 'ready' | 'offline';

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUserDTO | null;
  refresh(): Promise<SessionUserDTO | null>;
  login(username: string, password: string): Promise<SessionUserDTO>;
  register(input: {
    username: string;
    password: string;
    email?: string;
    displayName?: string;
  }): Promise<SessionUserDTO>;
  guest(): Promise<SessionUserDTO>;
  upgrade(input: {
    username: string;
    password: string;
    email?: string;
    displayName?: string;
  }): Promise<SessionUserDTO>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  setUser(user: SessionUserDTO | null): void;
  /** Make sure a session exists (creates a guest session if needed). */
  ensureSession(): Promise<SessionUserDTO | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<SessionUserDTO | null>(null);
  const userRef = useRef<SessionUserDTO | null>(null);
  const settingsSync = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullingSettings = useRef(false);

  const setUser = useCallback((u: SessionUserDTO | null) => {
    userRef.current = u;
    setUserState(u);
    // Signed out (or the session expired): forget any header token too.
    if (u === null && getSessionToken()) setSessionToken(null);
  }, []);

  const pullSettings = useCallback(async () => {
    try {
      pullingSettings.current = true;
      const remote = await api<{ settings: unknown }>('/api/settings');
      if (remote.settings && typeof remote.settings === 'object') {
        const local = settingsStore.get();
        const merged = sanitizeSettings({ ...local, ...(remote.settings as object) });
        merged.tutorialDone = merged.tutorialDone || local.tutorialDone;
        settingsStore.set(merged);
      }
    } catch {
      // Settings sync is best-effort.
    } finally {
      pullingSettings.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api<AuthResponseDTO>('/api/auth/me');
      setCsrfToken(res.csrfToken);
      setUser(res.user);
      setStatus('ready');
      return res.user;
    } catch (err) {
      if (isNetworkError(err)) {
        setStatus('offline');
        return userRef.current;
      }
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setStatus('ready');
        return null;
      }
      setStatus('ready');
      throw err;
    }
  }, [setUser]);

  // Bootstrap the session once; state updates happen in the promise callbacks.
  useEffect(() => {
    let cancelled = false;
    api<AuthResponseDTO>('/api/auth/me').then(
      (res) => {
        if (cancelled) return;
        detectBlockedCookies();
        setCsrfToken(res.csrfToken);
        setUser(res.user);
        setStatus('ready');
        void pullSettings();
      },
      (err: unknown) => {
        if (cancelled) return;
        if (isNetworkError(err)) setStatus('offline');
        else {
          // The server answered, so a working browser now holds our CSRF cookie.
          detectBlockedCookies();
          if (err instanceof ApiError && err.status === 401) setUser(null);
          setStatus('ready');
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [setUser, pullSettings]);

  // While offline, keep checking whether the server came back.
  useEffect(() => {
    if (status !== 'offline') return;
    const id = setInterval(() => void refresh(), 15000);
    return () => clearInterval(id);
  }, [status, refresh]);

  // Push settings changes for signed-in players (debounced).
  useEffect(
    () =>
      onSettingsChange((s) => {
        if (!userRef.current || pullingSettings.current) return;
        if (settingsSync.current) clearTimeout(settingsSync.current);
        settingsSync.current = setTimeout(() => {
          void api('/api/settings', { method: 'PUT', body: { settings: s } }).catch(
            () => undefined,
          );
        }, 800);
      }),
    [],
  );

  const handleAuth = useCallback(
    (res: AuthResponseDTO) => {
      if (res.sessionToken) setSessionToken(res.sessionToken);
      setCsrfToken(res.csrfToken);
      setUser(res.user);
      setStatus('ready');
      disconnectSocket(); // reconnect with the new session when needed
      return res.user;
    },
    [setUser],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      refresh,
      setUser,
      async login(username, password) {
        const u = handleAuth(
          await api<AuthResponseDTO>('/api/auth/login', {
            method: 'POST',
            body: { username, password },
          }),
        );
        void pullSettings();
        return u;
      },
      async register(input) {
        return handleAuth(
          await api<AuthResponseDTO>('/api/auth/register', { method: 'POST', body: input }),
        );
      },
      async guest() {
        return handleAuth(
          await api<AuthResponseDTO>('/api/auth/guest', { method: 'POST', body: {} }),
        );
      },
      async upgrade(input) {
        return handleAuth(
          await api<AuthResponseDTO>('/api/auth/upgrade', { method: 'POST', body: input }),
        );
      },
      async logout() {
        try {
          await api('/api/auth/logout', { method: 'POST', body: {} });
        } finally {
          disconnectSocket();
          setUser(null);
        }
      },
      async logoutAll() {
        await api('/api/auth/logout-all', { method: 'POST', body: {} });
        disconnectSocket();
        setUser(null);
      },
      async ensureSession() {
        if (userRef.current) return userRef.current;
        if (status === 'offline') return null;
        try {
          return handleAuth(
            await api<AuthResponseDTO>('/api/auth/guest', { method: 'POST', body: {} }),
          );
        } catch (err) {
          if (isNetworkError(err)) {
            setStatus('offline');
            return null;
          }
          throw err;
        }
      },
    }),
    [status, user, refresh, setUser, handleAuth, pullSettings],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
