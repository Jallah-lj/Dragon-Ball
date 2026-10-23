import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SKIN_ID, STAGE_IDS } from '@dbfc/shared';
import { GameHost } from '../game/GameHost';
import { GameSession } from '../game/session/GameSession';

function makeSession(round: number, skin: string): GameSession {
  const seed = (Date.now() ^ (round * 2654435761)) >>> 0;
  return new GameSession({
    mode: 'attract',
    config: {
      seed,
      difficulty: 'medium',
      stage: STAGE_IDS[round % STAGE_IDS.length]!,
      abilities: { dash: true, leap: true, shield: true },
    },
    skin,
    startAt: performance.now(),
  });
}

/** Self-playing chase used as the animated backdrop of the home page. */
export default function AttractView({ skin = DEFAULT_SKIN_ID }: { skin?: string }) {
  const round = useRef(0);
  const [session, setSession] = useState(() => makeSession(0, skin));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = session.on('finish', () => {
      timer = setTimeout(() => {
        round.current += 1;
        setSession(makeSession(round.current, skin));
      }, 1500);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [session, skin]);

  return (
    <GameHost session={session} label="An animated dragon chasing a fireball through the forest" />
  );
}
