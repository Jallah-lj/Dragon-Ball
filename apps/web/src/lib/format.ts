const numberFormat = new Intl.NumberFormat('en-US');

export function formatNumber(n: number): string {
  return numberFormat.format(Math.round(n));
}

/** 83.4 → "1:23.4" */
export function formatDuration(seconds: number, precise = true): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const secs = precise
    ? rest.toFixed(1).padStart(4, '0')
    : String(Math.floor(rest)).padStart(2, '0');
  return `${m}:${secs}`;
}

export function formatTicks(ticks: number): string {
  return formatDuration(ticks / 60);
}

export function formatDistance(m: number): string {
  return `${formatNumber(m)} m`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return formatDate(iso);
}

export function formatTimeLeft(iso: string, now = Date.now()): string {
  const diff = Math.max(0, (new Date(iso).getTime() - now) / 1000);
  if (diff < 3600) return `${Math.ceil(diff / 60)} min`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h`;
  return `${Math.round(diff / 86400)} d`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
