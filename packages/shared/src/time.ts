/**
 * Leaderboard period keys and the daily-challenge seed (UTC based, shared by
 * client and server so both agree on "this week" and "today").
 */
import { hashString } from './sim/rng';

/** ISO-8601 week key, e.g. "2026-W43". */
export function weekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** UTC day key, e.g. "2026-10-23". */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Deterministic seed of the daily challenge for a UTC day. */
export function dailySeed(date: Date = new Date()): number {
  return hashString(`dbfc-daily-${dayKey(date)}`);
}

/** Start of the next ISO week (Monday 00:00 UTC). */
export function nextWeekStart(date: Date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (8 - day));
  return d;
}
