/**
 * Dragon skins (cosmetics). The dragon is drawn procedurally, so a skin is a
 * palette plus an unlock rule. Skins never affect gameplay.
 */

export interface DragonPalette {
  body: string;
  bodyShade: string;
  belly: string;
  wing: string;
  wingShade: string;
  horn: string;
  spines: string;
  eye: string;
  flame: string;
}

export type SkinUnlock =
  | { type: 'default' }
  | { type: 'purchase'; price: number }
  | { type: 'achievement'; achievement: string };

export interface SkinDef {
  id: string;
  name: string;
  description: string;
  unlock: SkinUnlock;
  palette: DragonPalette;
}

export const SKINS: readonly SkinDef[] = [
  {
    id: 'emberscale',
    name: 'Emberscale',
    description: 'Crimson scales warmed by the forge-heart of the forest.',
    unlock: { type: 'default' },
    palette: {
      body: '#b8432a',
      bodyShade: '#7a2617',
      belly: '#f0b26a',
      wing: '#93321f',
      wingShade: '#5e1c11',
      horn: '#f3dfb4',
      spines: '#e8873a',
      eye: '#ffd34d',
      flame: '#ff8a2a',
    },
  },
  {
    id: 'mossback',
    name: 'Mossback',
    description: 'Lichen-green hide that vanishes among the ferns.',
    unlock: { type: 'purchase', price: 150 },
    palette: {
      body: '#557f3c',
      bodyShade: '#314f22',
      belly: '#ddd296',
      wing: '#436a33',
      wingShade: '#27411d',
      horn: '#ebe3c3',
      spines: '#a9c95e',
      eye: '#ffcf4a',
      flame: '#ffb347',
    },
  },
  {
    id: 'barkhide',
    name: 'Barkhide',
    description: 'Weathered bronze scales, tough as old oak.',
    unlock: { type: 'purchase', price: 300 },
    palette: {
      body: '#7d5434',
      bodyShade: '#4e3320',
      belly: '#dcbd8e',
      wing: '#614028',
      wingShade: '#3b2717',
      horn: '#f0e4c9',
      spines: '#c48d4c',
      eye: '#ffd166',
      flame: '#ff9f43',
    },
  },
  {
    id: 'duskwing',
    name: 'Duskwing',
    description: 'Slate-teal wings edged with dusk gold. Earned by untouchable chasers.',
    unlock: { type: 'achievement', achievement: 'untouchable' },
    palette: {
      body: '#33545b',
      bodyShade: '#1d3237',
      belly: '#cdbd92',
      wing: '#27464e',
      wingShade: '#152b30',
      horn: '#eadfc3',
      spines: '#d8aa4c',
      eye: '#ffcc55',
      flame: '#ffb04a',
    },
  },
  {
    id: 'goldcrest',
    name: 'Goldcrest',
    description: "Burnished gold, worn only by those who passed the Dragon's Trial.",
    unlock: { type: 'achievement', achievement: 'dragons-trial' },
    palette: {
      body: '#c99a3b',
      bodyShade: '#8a6420',
      belly: '#f6e2a8',
      wing: '#a8792c',
      wingShade: '#6e4c18',
      horn: '#fff4d6',
      spines: '#ffd36b',
      eye: '#fff1a8',
      flame: '#ffd166',
    },
  },
  {
    id: 'ashborn',
    name: 'Ashborn',
    description: 'Charcoal scales split by living embers. Granted to scale collectors.',
    unlock: { type: 'achievement', achievement: 'scale-collector' },
    palette: {
      body: '#3b3532',
      bodyShade: '#221f1d',
      belly: '#6e5d4f',
      wing: '#2e2927',
      wingShade: '#1b1817',
      horn: '#dbd1c2',
      spines: '#ff7a2a',
      eye: '#ff9a3a',
      flame: '#ff6a1f',
    },
  },
];

export const DEFAULT_SKIN_ID = 'emberscale';
export const SKIN_IDS = SKINS.map((s) => s.id);

export function skinById(id: string | null | undefined): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function isSkinId(id: unknown): id is string {
  return typeof id === 'string' && SKIN_IDS.includes(id);
}
