import type { Color, PaletteTone, Screen } from './types';
import { GLYPH_W, GLYPH_H, glyph } from './font';
import type { Palette, RGB } from './palette';

/** Cells across / down. Matches the original Game Boy's 20x18 tile grid. */
export const COLS = 20;
export const ROWS = 18;

/** Each cell is one 5x7 glyph plus a 1-dot gap => a 6x8 dot footprint. */
export const CELL_DOT_W = GLYPH_W + 1; // 6
export const CELL_DOT_H = GLYPH_H + 1; // 8

/** The logical LCD is a grid of dots. 120 x 144, i.e. exactly Game Boy-ish. */
export const DOT_COLS = COLS * CELL_DOT_W; // 120
export const DOT_ROWS = ROWS * CELL_DOT_H; // 144

const TONE_INDEX: Record<string, number> = {
  lightest: 0,
  light: 1,
  dark: 2,
  darkest: 3,
};

// Parse arbitrary CSS colors to RGB once, cached. Palette-independent.
let parseCanvas: CanvasRenderingContext2D | null = null;
const cssCache = new Map<string, RGB>();
function parseCss(css: string): RGB {
  const hit = cssCache.get(css);
  if (hit) return hit;
  let rgb: RGB = [255, 0, 255];
  try {
    if (!parseCanvas) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      parseCanvas = c.getContext('2d');
    }
    if (parseCanvas) {
      parseCanvas.clearRect(0, 0, 1, 1);
      parseCanvas.fillStyle = css;
      parseCanvas.fillRect(0, 0, 1, 1);
      const d = parseCanvas.getImageData(0, 0, 1, 1).data;
      rgb = [d[0], d[1], d[2]];
    }
  } catch {
    /* keep magenta fallback */
  }
  cssCache.set(css, rgb);
  return rgb;
}

function resolveRGB(color: Color | undefined, palette: Palette, fallbackIdx: number): RGB {
  if (color === undefined || color === null) return palette.tones[fallbackIdx];
  if (typeof color === 'number') {
    const i = Math.max(0, Math.min(3, color | 0));
    return palette.tones[i];
  }
  const toneIdx = TONE_INDEX[color as PaletteTone];
  if (toneIdx !== undefined) return palette.tones[toneIdx];
  return parseCss(color);
}

/**
 * The concrete LCD surface. Holds a COLS x ROWS grid of {glyph, fg, bg} and
 * rasterizes it to a DOT_COLS x DOT_ROWS RGBA buffer the shader then styles.
 * All coordinates in the public API are cell coordinates.
 */
export class CellScreen implements Screen {
  readonly cols = COLS;
  readonly rows = ROWS;

  private ch: string[] = new Array(COLS * ROWS).fill(' ');
  private fg: (Color | undefined)[] = new Array(COLS * ROWS).fill('darkest');
  private bg: (Color | undefined)[] = new Array(COLS * ROWS).fill('lightest');

  /** Reusable RGBA output buffer for the dot grid. */
  private raster = new Uint8ClampedArray(DOT_COLS * DOT_ROWS * 4);

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  clear(color: Color = 'lightest'): void {
    for (let i = 0; i < COLS * ROWS; i++) {
      this.ch[i] = ' ';
      this.fg[i] = 'darkest';
      this.bg[i] = color;
    }
  }

  set(x: number, y: number, ch: string, fg?: Color, bg?: Color): void {
    x = x | 0;
    y = y | 0;
    if (!this.inBounds(x, y)) return;
    const i = y * COLS + x;
    this.ch[i] = ch && ch.length ? ch[0] : ' ';
    if (fg !== undefined) this.fg[i] = fg;
    if (bg !== undefined) this.bg[i] = bg;
  }

  get(x: number, y: number): string {
    if (!this.inBounds(x | 0, y | 0)) return ' ';
    return this.ch[(y | 0) * COLS + (x | 0)];
  }

  text(x: number, y: number, str: string, fg?: Color, bg?: Color): void {
    x = x | 0;
    y = y | 0;
    const chars = Array.from(String(str));
    for (let k = 0; k < chars.length; k++) {
      this.set(x + k, y, chars[k], fg, bg);
    }
  }

  textCentered(y: number, str: string, fg?: Color, bg?: Color): void {
    const s = String(str);
    const len = Array.from(s).length;
    const x = Math.round((COLS - len) / 2);
    this.text(x, y, s, fg, bg);
  }

  fillRect(x: number, y: number, w: number, h: number, ch: string, fg?: Color, bg?: Color): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        this.set(x + i, y + j, ch, fg, bg);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, fg?: Color, bg?: Color): void {
    if (w <= 0 || h <= 0) return;
    const x2 = x + w - 1;
    const y2 = y + h - 1;
    for (let i = x; i <= x2; i++) {
      this.set(i, y, '-', fg, bg);
      this.set(i, y2, '-', fg, bg);
    }
    for (let j = y; j <= y2; j++) {
      this.set(x, j, '|', fg, bg);
      this.set(x2, j, '|', fg, bg);
    }
    this.set(x, y, '+', fg, bg);
    this.set(x2, y, '+', fg, bg);
    this.set(x, y2, '+', fg, bg);
    this.set(x2, y2, '+', fg, bg);
  }

  hline(x: number, y: number, w: number, ch: string, fg?: Color): void {
    for (let i = 0; i < w; i++) this.set(x + i, y, ch, fg);
  }

  vline(x: number, y: number, h: number, ch: string, fg?: Color): void {
    for (let j = 0; j < h; j++) this.set(x, y + j, ch, fg);
  }

  /** Debug/testing aid: the current glyph grid as one string per row. */
  dumpText(): string[] {
    const out: string[] = [];
    for (let y = 0; y < ROWS; y++) {
      let row = '';
      for (let x = 0; x < COLS; x++) row += this.ch[y * COLS + x];
      out.push(row);
    }
    return out;
  }

  /**
   * Rasterize the cell grid to the RGBA dot buffer. Each cell paints its 6x8
   * footprint with bg, then stamps the glyph's lit dots in fg. Returns a view
   * that is reused across frames (do not retain it).
   */
  rasterize(palette: Palette): Uint8ClampedArray {
    const out = this.raster;
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const idx = cy * COLS + cx;
        const bg = resolveRGB(this.bg[idx], palette, 0);
        const fg = resolveRGB(this.fg[idx], palette, 3);
        const g = glyph(this.ch[idx]);
        const dotX = cx * CELL_DOT_W;
        const dotY = cy * CELL_DOT_H;
        for (let ry = 0; ry < CELL_DOT_H; ry++) {
          const bits = ry < GLYPH_H ? g[ry] : 0;
          const py = dotY + ry;
          let rowBase = (py * DOT_COLS + dotX) * 4;
          for (let rx = 0; rx < CELL_DOT_W; rx++) {
            const lit = rx < GLYPH_W && bits & (1 << (GLYPH_W - 1 - rx));
            const c = lit ? fg : bg;
            out[rowBase] = c[0];
            out[rowBase + 1] = c[1];
            out[rowBase + 2] = c[2];
            out[rowBase + 3] = 255;
            rowBase += 4;
          }
        }
      }
    }
    return out;
  }
}
