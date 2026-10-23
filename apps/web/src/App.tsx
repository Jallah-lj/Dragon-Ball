import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { AuthPage } from './pages/AuthPage';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/AccountRecoveryPages';
import { ProfilePage } from './pages/ProfilePage';
import { PublicProfilePage } from './pages/PublicProfilePage';
import { TeamPage } from './pages/TeamPage';
import { JoinTeamPage } from './pages/JoinTeamPage';
import { LeaderboardsPage } from './pages/LeaderboardsPage';
import { CollectionPage } from './pages/CollectionPage';
import { SettingsPage } from './pages/SettingsPage';
import { RaceLobbyPage } from './pages/RaceLobbyPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Game pages pull in Phaser — load them on demand.
const PlayPage = lazy(() => import('./pages/PlayPage'));
const RaceRoomPage = lazy(() => import('./pages/RaceRoomPage'));

/** A new run setup (query string) mounts a fresh gameplay page. */
function PlayRoute() {
  const location = useLocation();
  return <PlayPage key={location.search} />;
}

function RaceRoute() {
  const location = useLocation();
  return <RaceRoomPage key={location.pathname} />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="play" element={<LobbyPage />} />
        <Route path="race" element={<RaceLobbyPage />} />
        <Route path="leaderboards" element={<LeaderboardsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="join/:code" element={<JoinTeamPage />} />
        <Route path="collection" element={<CollectionPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="players/:id" element={<PublicProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="auth/forgot" element={<ForgotPasswordPage />} />
        <Route path="auth/reset" element={<ResetPasswordPage />} />
        <Route path="auth/verify" element={<VerifyEmailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="play/run"
        element={
          <Suspense fallback={<Loading label="Waking the forest…" full />}>
            <PlayRoute />
          </Suspense>
        }
      />
      <Route
        path="race/:code"
        element={
          <Suspense fallback={<Loading label="Joining the race…" full />}>
            <RaceRoute />
          </Suspense>
        }
      />
    </Routes>
  );
}
