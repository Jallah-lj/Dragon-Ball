/** Rendering constants shared by the game scenes. */
export const VIEW_W = 1280;
export const VIEW_H = 720;
/** Pixels per simulation metre (logical resolution). */
export const PPM = 46;
/** Horizontal screen position of the dragon (fraction of view width). */
export const DRAGON_SCREEN_X = 0.26;
/** Vertical screen position of the ground under the dragon (fraction of view height). */
export const GROUND_SCREEN_Y = 0.77;

export const DEPTH = {
  sky: 0,
  rays: 5,
  far: 10,
  farFog: 12,
  mid: 20,
  midFog: 22,
  near: 30,
  backBrush: 35,
  terrain: 40,
  mud: 41,
  obstacleBack: 45,
  collectible: 50,
  obstacle: 55,
  ghost: 58,
  dragon: 60,
  fireball: 65,
  particles: 70,
  foreground: 80,
  fog: 85,
  vignette: 90,
} as const;
