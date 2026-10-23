import { DIFFICULTIES, STAGES, type Difficulty, type RunResult, type StageId } from '@dbfc/shared';
import { formatDuration, formatNumber } from './format';

export function shareText(result: RunResult, difficulty: Difficulty, stage: StageId): string {
  const d = DIFFICULTIES[difficulty].name;
  const s = STAGES[stage].name;
  const head =
    result.outcome === 'caught'
      ? `I caught the fireball in ${formatDuration(result.seconds)}`
      : result.outcome === 'escaped'
        ? `The fireball escaped me after ${formatNumber(result.distance)} m`
        : `My dragon fell after ${formatNumber(result.distance)} m`;
  return `${head} on ${d} in the ${s} — ${formatNumber(result.score)} points. Dragon Ball: Forest Chase`;
}

/** Use the Web Share API when available, otherwise copy to the clipboard. */
export async function shareResult(
  text: string,
  url: string,
): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Dragon Ball: Forest Chase', text, url });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
