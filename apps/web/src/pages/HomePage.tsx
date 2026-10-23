import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { DIFFICULTIES, type LeaderboardPageDTO } from '@dbfc/shared';
import { DragonAvatar } from '../components/DragonAvatar';
import { Icon, type IconName } from '../components/Icons';
import { Logo } from '../components/Logo';
import { useDocumentTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { formatNumber } from '../lib/format';
import { keyLabel, prefersReducedMotion, useSettings } from '../lib/settings';
import { useApi } from '../lib/useApi';

const AttractView = lazy(() => import('./AttractView'));

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'flame',
    title: 'Three dragon abilities',
    body: 'Fire Dash burns through thorns, Forest Leap gives a second wing-beat in mid-air, and Dragon Shield shrugs off one hit.',
  },
  {
    icon: 'leaf',
    title: 'Fair, readable forests',
    body: 'Every trail is generated from hand-made patterns and proven clearable by a look-ahead bot. Moving hazards always warn you first.',
  },
  {
    icon: 'team',
    title: 'Teams & live races',
    body: 'Form a team, invite friends with a code, race up to six dragons on the same trail and climb the weekly team standings.',
  },
  {
    icon: 'shield',
    title: 'Scores you can trust',
    body: 'The server replays every run from your inputs before it reaches a leaderboard. No trusted client scores, no shortcuts.',
  },
];

export function HomePage() {
  useDocumentTitle('');
  const { user, status } = useAuth();
  const settings = useSettings();
  const reduced = prefersReducedMotion(settings);
  const top = useApi<LeaderboardPageDTO>(
    status === 'ready' ? '/api/leaderboards?period=weekly&difficulty=medium&page=1' : null,
  );
  const firstRun = !settings.tutorialDone;
  const playHref = firstRun
    ? '/play/run?mode=tutorial'
    : '/play/run?mode=solo&difficulty=easy&stage=emerald';

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <section className="hero" aria-labelledby="hero-title">
        {reduced ? (
          <div className="hero__still" aria-hidden="true" />
        ) : (
          <Suspense fallback={<div className="hero__still" aria-hidden="true" />}>
            <AttractView skin={user?.selectedSkin} />
          </Suspense>
        )}
        <div className="hero__overlay">
          <h1 id="hero-title" className="sr-only">
            Dragon Ball: Forest Chase
          </h1>
          <Logo />
          <p className="hero__tagline">
            A runaway fireball is fleeing through the enchanted forest. Leap, slide and blaze after
            it before it reaches the Ember Shrine.
          </p>
          <div className="hero__actions">
            <Link className="btn btn--primary btn--lg" to={playHref}>
              <Icon name="play" size={20} /> {firstRun ? 'Start with the tutorial' : 'Play now'}
            </Link>
            <Link className="btn btn--lg" to="/play">
              <Icon name="path" size={20} /> Choose your trail
            </Link>
            <Link className="btn btn--ghost btn--lg" to="/race">
              <Icon name="race" size={20} /> Race friends
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid--features" aria-label="Features">
        {FEATURES.map((f) => (
          <div className="panel panel--flat feature" key={f.title}>
            <Icon name={f.icon} size={28} />
            <div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid--2">
        <div className="panel">
          <h2 className="panel__title">
            <Icon name="book" /> How to play
          </h2>
          <ul className="summary-list">
            <li>
              <span>Jump (hold for height) · tap again mid-air to Forest Leap</span>
              <span>
                <span className="kbd">{keyLabel(settings.keybinds.jump[0] ?? 'Space')}</span>{' '}
                <span className="kbd">{keyLabel(settings.keybinds.jump[1] ?? 'ArrowUp')}</span>
              </span>
            </li>
            <li>
              <span>Slide under branches · fast-fall in the air</span>
              <span className="kbd">{keyLabel(settings.keybinds.slide[0] ?? 'ArrowDown')}</span>
            </li>
            <li>
              <span>Fire Dash (costs orb energy)</span>
              <span className="kbd">{keyLabel(settings.keybinds.dash[0] ?? 'ShiftLeft')}</span>
            </li>
            <li>
              <span>Dragon Shield (unlocks after your first catch)</span>
              <span className="kbd">{keyLabel(settings.keybinds.shield[0] ?? 'KeyE')}</span>
            </li>
            <li>
              <span>Pause</span>
              <span className="kbd">{keyLabel(settings.keybinds.pause[0] ?? 'Escape')}</span>
            </li>
          </ul>
          <p className="small muted">
            On phones and tablets, use the on-screen buttons or swipe up, down and right. Clean
            clears build Flow, which makes your dragon faster — collisions reset it.
          </p>
          <Link to="/settings">Change controls</Link>
        </div>
        <div className="panel">
          <h2 className="panel__title">
            <Icon name="trophy" /> This week on {DIFFICULTIES.medium.name}
          </h2>
          {status === 'offline' ? (
            <p className="muted">Leaderboards are unavailable while offline.</p>
          ) : top.data && top.data.entries.length > 0 ? (
            <ol className="race-players">
              {top.data.entries.slice(0, 5).map((e) => (
                <li className="race-player" key={e.userId}>
                  <span className={`rank rank--${e.rank}`}>{e.rank}</span>
                  <DragonAvatar skin={e.avatar} size={32} />
                  <Link className="race-player__name" to={`/players/${e.userId}`}>
                    {e.displayName}
                    {e.team ? (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        {e.team.tag}
                      </span>
                    ) : null}
                  </Link>
                  <span>{formatNumber(e.score)}</span>
                </li>
              ))}
            </ol>
          ) : top.loading ? (
            <p className="muted">Loading the standings…</p>
          ) : (
            <p className="muted">No catches yet this week — be the first dragon on the board.</p>
          )}
          <Link to="/leaderboards">All leaderboards</Link>
        </div>
      </section>
    </div>
  );
}
