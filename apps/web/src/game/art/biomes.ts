import type { StageId } from '@dbfc/shared';

export type ParticleStyle = 'pollen' | 'mist' | 'fireflies';

export interface BiomePalette {
  id: StageId;
  night: boolean;
  /** Sky gradient at the start of the run… */
  sky: [string, string, string];
  /** …and near the Ember Shrine (time of day shifts as the chase goes on). */
  skyLate: [string, string, string];
  sun: string;
  sunGlow: string;
  hills: string;
  hillsLight: string;
  far: string;
  farLight: string;
  mid: string;
  midLight: string;
  near: string;
  nearLight: string;
  trunk: string;
  trunkDark: string;
  moss: string;
  brush: string;
  brushLight: string;
  grass: string;
  grassLight: string;
  grassDark: string;
  dirt: string;
  dirtDark: string;
  dirtLight: string;
  stone: string;
  fog: string;
  fogAlpha: number;
  ray: string;
  rayAlpha: number;
  accent: string;
  accent2: string;
  particle: ParticleStyle;
  /** Overlay tint that deepens over the run (warm dusk / deeper night). */
  lateTint: string;
}

export const BIOMES: Record<StageId, BiomePalette> = {
  emerald: {
    id: 'emerald',
    night: false,
    sky: ['#9fc7b8', '#d6e5c3', '#f5e4ad'],
    skyLate: ['#d6b77f', '#efcf92', '#f7b86c'],
    sun: '#fff4cf',
    sunGlow: '#ffe29a',
    hills: '#8fb39a',
    hillsLight: '#bcd2a9',
    far: '#6e9878',
    farLight: '#97bb8b',
    mid: '#4a7851',
    midLight: '#7aa25d',
    near: '#2e5435',
    nearLight: '#5c8843',
    trunk: '#4a3526',
    trunkDark: '#2c2018',
    moss: '#7fa94c',
    brush: '#3a683a',
    brushLight: '#6f9c48',
    grass: '#6ea443',
    grassLight: '#a8d064',
    grassDark: '#3e7931',
    dirt: '#5b412d',
    dirtDark: '#38281c',
    dirtLight: '#7b5b3f',
    stone: '#8d8b7a',
    fog: '#f1f1d6',
    fogAlpha: 0.24,
    ray: '#fff0bd',
    rayAlpha: 0.18,
    accent: '#f2c14e',
    accent2: '#e2694b',
    particle: 'pollen',
    lateTint: '#ff9a3c',
  },
  mistpine: {
    id: 'mistpine',
    night: false,
    sky: ['#97aeab', '#c3cfc3', '#e4dcc1'],
    skyLate: ['#a8a69b', '#d5c4a4', '#eec594'],
    sun: '#fbf1d6',
    sunGlow: '#f1dcae',
    hills: '#8a9f9a',
    hillsLight: '#adbcb4',
    far: '#6b8581',
    farLight: '#8ca39b',
    mid: '#49655f',
    midLight: '#6c8a7d',
    near: '#2b4441',
    nearLight: '#4e6d61',
    trunk: '#4b3b2f',
    trunkDark: '#2b221b',
    moss: '#708f56',
    brush: '#35514a',
    brushLight: '#5c7b62',
    grass: '#5f8f56',
    grassLight: '#93ba7a',
    grassDark: '#3a6643',
    dirt: '#4e4033',
    dirtDark: '#30271f',
    dirtLight: '#6b5846',
    stone: '#8e928b',
    fog: '#e8eee8',
    fogAlpha: 0.42,
    ray: '#f7f1dc',
    rayAlpha: 0.12,
    accent: '#d8c66a',
    accent2: '#c9dccc',
    particle: 'mist',
    lateTint: '#f0a95c',
  },
  moonlit: {
    id: 'moonlit',
    night: true,
    sky: ['#0b1920', '#14303a', '#2a494c'],
    skyLate: ['#081318', '#10262d', '#1f3b40'],
    sun: '#f4edd3',
    sunGlow: '#cfe4d7',
    hills: '#1c3237',
    hillsLight: '#2d494c',
    far: '#16292e',
    farLight: '#26413f',
    mid: '#10222a',
    midLight: '#1f3a37',
    near: '#0b181d',
    nearLight: '#1b3431',
    trunk: '#2b2520',
    trunkDark: '#16120f',
    moss: '#3e6b4f',
    brush: '#10262a',
    brushLight: '#24453f',
    grass: '#3a6a4a',
    grassLight: '#5f9b6d',
    grassDark: '#21442e',
    dirt: '#2e2620',
    dirtDark: '#1a1511',
    dirtLight: '#463a30',
    stone: '#5c6360',
    fog: '#a3c7bd',
    fogAlpha: 0.17,
    ray: '#e2efe4',
    rayAlpha: 0.08,
    accent: '#f5d76e',
    accent2: '#8fe0c4',
    particle: 'fireflies',
    lateTint: '#0a2a33',
  },
};
