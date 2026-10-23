import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { DragonAvatar } from './DragonAvatar';
import { Icon } from './Icons';
import { Logo } from './Logo';
import { useToast } from './Toast';

const NAV = [
  { to: '/play', label: 'Play' },
  { to: '/race', label: 'Race' },
  { to: '/leaderboards', label: 'Leaderboards' },
  { to: '/team', label: 'Team' },
  { to: '/collection', label: 'Collection' },
];

function AccountMenu() {
  const { user, logout, status } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (status === 'loading') return <span className="spinner" aria-label="Loading account" />;
  if (!user) {
    return (
      <Link className="btn btn--ghost btn--sm" to="/auth">
        <Icon name="user" size={16} /> Sign in
      </Link>
    );
  }
  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <DragonAvatar skin={user.avatar} size={34} />
        <span className="account-menu__name">
          {user.displayName}
          <span className="account-menu__meta">
            {user.isGuest ? 'Guest' : `Level ${user.level}`}
          </span>
        </span>
      </button>
      {open && (
        <div className="account-menu__list" role="menu">
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)}>
            <Icon name="user" size={16} /> Profile
          </Link>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)}>
            <Icon name="settings" size={16} /> Settings
          </Link>
          {user.isGuest ? (
            <Link role="menuitem" to="/auth?mode=upgrade" onClick={() => setOpen(false)}>
              <Icon name="shield" size={16} /> Save progress (create account)
            </Link>
          ) : null}
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              await logout();
              toast('Signed out.', 'logout');
              navigate('/');
            }}
          >
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { status } = useAuth();
  const location = useLocation();
  // The mobile menu is open only on the page where it was opened, so it closes on navigation.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === location.pathname;
  const setMenuOpen = (fn: (open: boolean) => boolean) =>
    setMenuPath(fn(menuOpen) ? location.pathname : null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      <a className="skip-link" href="#main" onClick={() => mainRef.current?.focus()}>
        Skip to content
      </a>
      <header className="app-header">
        <Link to="/" className="app-header__brand" aria-label="Dragon Ball: Forest Chase — home">
          <Logo variant="compact" />
        </Link>
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm menu-toggle"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Icon name="menu" size={20} />
        </button>
        <nav id="main-nav" className="app-nav" data-open={menuOpen} aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="app-header__account">
          <AccountMenu />
        </div>
      </header>
      {status === 'offline' && (
        <div className="offline-banner" role="status">
          <Icon name="offline" size={18} /> Offline mode — the server can't be reached. Solo runs
          still work and progress is saved on this device.
        </div>
      )}
      <main id="main" className="app-main" tabIndex={-1} ref={mainRef}>
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>
          Dragon Ball: Forest Chase is an original fan-made game. “Dragon Ball” is a trademark of
          its respective owners; this project is not affiliated with or endorsed by them and uses no
          franchise characters, art, logos or music.
        </span>
        <span>
          <Link to="/settings">Settings &amp; controls</Link> · v{__APP_VERSION__}
        </span>
      </footer>
    </>
  );
}
