import type { Color, PaletteTone } from './types';

/**
 * A palette is the four-tone ramp (lightest -> darkest) that the LCD renders in,
 * plus a glow color for the shader bloom. Games draw with tone names; the shell
 * decides the actual RGB, so we can theme the whole device (classic DMG green,
 * neon, monochrome) without touching game code.
 */
export interface Palette {
  id: string;
  name: string;
  /** rgb() tuples, lightest -> darkest. */
  tones: [RGB, RGB, RGB, RGB];
  /** Color the shader blooms/glows toward. */
  glow: RGB;
  /** The physical LCD panel tint the pixels sit on. */
  panel: RGB;
}

export type RGB = [number, number, number];

/** Classic Game Boy DMG-01 "pea soup" green. The default. */
export const DMG_GREEN: Palette = {
  id: 'dmg',
  name: 'DMG GREEN',
  tones: [
    [0x9b, 0xbc, 0x0f], // lightest
    [0x8b, 0xac, 0x0f], // light
    [0x30, 0x62, 0x30], // dark
    [0x0f, 0x38, 0x0f], // darkest
  ],
  glow: [0x9b, 0xbc, 0x0f],
  panel: [0x8b, 0xac, 0x0f],
};

/** Cyberpunk neon variant, for the "or neon dot-matrix" option. */
export const NEON: Palette = {
  id: 'neon',
  name: 'NEON',
  tones: [
    [0x2a, 0xf5, 0xd0],
    [0x1a, 0xb0, 0xc8],
    [0x28, 0x3a, 0x8f],
    [0x0a, 0x0c, 0x2a],
  ],
  glow: [0x39, 0xff, 0xe0],
  panel: [0x0a, 0x0c, 0x2a],
};

/** Pocket / grayscale variant. */
export const GRAYSCALE: Palette = {
  id: 'gray',
  name: 'POCKET',
  tones: [
    [0xe8, 0xe8, 0xe8],
    [0xa0, 0xa0, 0xa0],
    [0x58, 0x58, 0x58],
    [0x18, 0x18, 0x18],
  ],
  glow: [0xff, 0xff, 0xff],
  panel: [0xc4, 0xc8, 0xb8],
};

export const PALETTES: Palette[] = [DMG_GREEN, NEON, GRAYSCALE];

const TONE_INDEX: Record<PaletteTone, number> = {
  lightest: 0,
  light: 1,
  dark: 2,
  darkest: 3,
};

export function rgbToCss([r, g, b]: RGB): string {
  return `rgb(${r},${g},${b})`;
}

/**
 * Resolve a game-supplied Color to an actual CSS color string using the active
 * palette. Tone names / indices map to the ramp; anything else is treated as a
 * literal CSS color and passed through (the shader still quantizes it).
 */
export function resolveColor(color: Color | undefined, palette: Palette, fallback: number): string {
  if (color === undefined || color === null) {
    return rgbToCss(palette.tones[fallback]);
  }
  if (typeof color === 'number') {
    const i = Math.max(0, Math.min(3, color | 0));
    return rgbToCss(palette.tones[i]);
  }
  const toneIdx = TONE_INDEX[color as PaletteTone];
  if (toneIdx !== undefined) {
    return rgbToCss(palette.tones[toneIdx]);
  }
  return color; // literal CSS color
}
