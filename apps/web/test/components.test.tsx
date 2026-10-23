import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { RunCompletionDTO, RunResult } from '@dbfc/shared';
import { ResultsPanel } from '../src/pages/play/ResultsPanel';
import { LobbyPage } from '../src/pages/LobbyPage';
import { AuthProvider } from '../src/lib/auth';
import { ToastProvider } from '../src/components/Toast';

const result: RunResult = {
  points: 900,
  orbs: 30,
  crystals: 4,
  scales: 0,
  pickups: 1,
  cleared: 25,
  hits: 1,
  stumbles: 0,
  pitFalls: 0,
  mudHits: 0,
  jumps: 30,
  slides: 6,
  dashes: 3,
  leaps: 2,
  shieldsUsed: 0,
  shieldBlocks: 0,
  thornsBurned: 1,
  closestGap: 0,
  maxFlow: 9,
  outcome: 'caught',
  ticks: 3600,
  seconds: 60,
  score: 6789,
  distance: 640,
  heartsLeft: 2,
  breakdown: {
    distance: 640,
    actions: 900,
    catchBonus: 1000,
    timeBonus: 150,
    heartsBonus: 300,
    multiplier: 1.5,
  },
};

describe('ResultsPanel', () => {
  it('shows the verified score, breakdown, rewards and actions', () => {
    const completion: RunCompletionDTO = {
      result,
      ranked: true,
      mismatch: false,
      xpGained: 321,
      crystalsGained: 24,
      newAchievements: ['first-catch'],
      personalBest: true,
      rank: { weekly: 3, allTime: 12 },
      level: 4,
      leveledUp: true,
      unlocks: {
        difficulties: ['easy', 'medium'],
        stages: ['emerald'],
        abilities: { dash: true, leap: true, shield: true },
      },
    };
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <ToastProvider>
          <ResultsPanel
            outcome={{ kind: 'verified', result, completion }}
            difficulty="medium"
            stage="emerald"
            mode="solo"
            next={null}
            signedInAsGuest={false}
            onRetry={onRetry}
            onRetrySubmit={vi.fn()}
            onNext={vi.fn()}
            onLobby={vi.fn()}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Fireball caught!' })).toBeTruthy();
    expect(screen.getByLabelText('Score 6,789')).toBeTruthy();
    expect(screen.getByText('Verified by server')).toBeTruthy();
    expect(screen.getByText('+321 XP')).toBeTruthy();
    expect(screen.getByText('First Catch')).toBeTruthy();
    expect(screen.getByText(/3rd this week/)).toBeTruthy();
    screen.getByRole('button', { name: /Retry/ }).click();
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('LobbyPage', () => {
  it('locks difficulties and forests that are not unlocked yet (offline)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <LobbyPage />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    const medium = await screen.findByRole('radio', { name: /^Wildwood Chase/ });
    expect(medium.getAttribute('aria-disabled')).toBe('true');
    expect(medium.textContent).toMatch(/Catch the fireball on Forest Explorer to unlock/);
    expect(
      screen.getByRole('radio', { name: /^Forest Explorer/ }).getAttribute('aria-checked'),
    ).toBe('true');
    await waitFor(() => expect(screen.getByText(/saved on this device only/)).toBeTruthy());
  });
});
