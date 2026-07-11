/**
 * A self-contained 5x7 bitmap font for the dot-matrix LCD. Bundling our own
 * glyphs (instead of leaning on a system monospace font) guarantees identical,
 * crisp, authentically-chunky rendering on every phone and browser, and lets
 * the shader treat every lit cell as a real LCD dot.
 *
 * Each glyph is 7 rows of 5 columns. Source uses 'X' = lit, '.' = off. At
 * runtime each glyph is a Uint8Array of 7 bytes; the low 5 bits of each byte
 * are the row's columns (bit 4 = leftmost). Lowercase falls back to uppercase
 * for the classic all-caps LCD look. Unknown glyphs render as a hollow box.
 */

export const GLYPH_W = 5;
export const GLYPH_H = 7;

const SRC: Record<string, string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '!': ['..X..', '..X..', '..X..', '..X..', '..X..', '.....', '..X..'],
  '"': ['.X.X.', '.X.X.', '.....', '.....', '.....', '.....', '.....'],
  '#': ['.X.X.', '.X.X.', 'XXXXX', '.X.X.', 'XXXXX', '.X.X.', '.X.X.'],
  '$': ['..X..', '.XXXX', 'X.X..', '.XXX.', '..X.X', 'XXXX.', '..X..'],
  '%': ['XX..X', 'XX..X', '...X.', '..X..', '.X...', 'X..XX', 'X..XX'],
  '&': ['.XX..', 'X..X.', 'X.X..', '.X...', 'X.X.X', 'X..X.', '.XX.X'],
  "'": ['..X..', '..X..', '..X..', '.....', '.....', '.....', '.....'],
  '(': ['...X.', '..X..', '.X...', '.X...', '.X...', '..X..', '...X.'],
  ')': ['.X...', '..X..', '...X.', '...X.', '...X.', '..X..', '.X...'],
  '*': ['.....', '..X..', 'X.X.X', '.XXX.', 'X.X.X', '..X..', '.....'],
  '+': ['.....', '..X..', '..X..', 'XXXXX', '..X..', '..X..', '.....'],
  ',': ['.....', '.....', '.....', '.....', '..X..', '..X..', '.X...'],
  '-': ['.....', '.....', '.....', 'XXXXX', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.XX..', '.XX..'],
  '/': ['....X', '....X', '...X.', '..X..', '.X...', 'X....', 'X....'],
  '0': ['.XXX.', 'X...X', 'X..XX', 'X.X.X', 'XX..X', 'X...X', '.XXX.'],
  '1': ['..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
  '2': ['.XXX.', 'X...X', '....X', '...X.', '..X..', '.X...', 'XXXXX'],
  '3': ['XXXXX', '...X.', '..X..', '...X.', '....X', 'X...X', '.XXX.'],
  '4': ['...X.', '..XX.', '.X.X.', 'X..X.', 'XXXXX', '...X.', '...X.'],
  '5': ['XXXXX', 'X....', 'XXXX.', '....X', '....X', 'X...X', '.XXX.'],
  '6': ['..XX.', '.X...', 'X....', 'XXXX.', 'X...X', 'X...X', '.XXX.'],
  '7': ['XXXXX', '....X', '...X.', '..X..', '.X...', '.X...', '.X...'],
  '8': ['.XXX.', 'X...X', 'X...X', '.XXX.', 'X...X', 'X...X', '.XXX.'],
  '9': ['.XXX.', 'X...X', 'X...X', '.XXXX', '....X', '...X.', '.XX..'],
  ':': ['.....', '.XX..', '.XX..', '.....', '.XX..', '.XX..', '.....'],
  ';': ['.....', '.XX..', '.XX..', '.....', '.XX..', '.XX..', '.X...'],
  '<': ['...X.', '..X..', '.X...', 'X....', '.X...', '..X..', '...X.'],
  '=': ['.....', '.....', 'XXXXX', '.....', 'XXXXX', '.....', '.....'],
  '>': ['.X...', '..X..', '...X.', '....X', '...X.', '..X..', '.X...'],
  '?': ['.XXX.', 'X...X', '....X', '...X.', '..X..', '.....', '..X..'],
  '@': ['.XXX.', 'X...X', 'X.XXX', 'X.X.X', 'X.XXX', 'X....', '.XXX.'],
  'A': ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  'B': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
  'C': ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
  'D': ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  'E': ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  'F': ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
  'G': ['.XXX.', 'X...X', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXXX'],
  'H': ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  'I': ['.XXX.', '..X..', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
  'J': ['..XXX', '...X.', '...X.', '...X.', 'X..X.', 'X..X.', '.XX..'],
  'K': ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
  'L': ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  'M': ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
  'N': ['X...X', 'X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X'],
  'O': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  'P': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
  'Q': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X..X.', '.XX.X'],
  'R': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  'S': ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  'T': ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  'U': ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  'V': ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
  'W': ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
  'X': ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
  'Y': ['X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..'],
  'Z': ['XXXXX', '....X', '...X.', '..X..', '.X...', 'X....', 'XXXXX'],
  '[': ['.XXX.', '.X...', '.X...', '.X...', '.X...', '.X...', '.XXX.'],
  '\\': ['X....', 'X....', '.X...', '..X..', '...X.', '....X', '....X'],
  ']': ['.XXX.', '...X.', '...X.', '...X.', '...X.', '...X.', '.XXX.'],
  '^': ['..X..', '.X.X.', 'X...X', '.....', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', 'XXXXX'],
  '`': ['.X...', '..X..', '.....', '.....', '.....', '.....', '.....'],
  '{': ['..XX.', '..X..', '..X..', '.XX..', '..X..', '..X..', '..XX.'],
  '|': ['..X..', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  '}': ['.XX..', '..X..', '..X..', '..XX.', '..X..', '..X..', '.XX..'],
  '~': ['.....', '.....', '.X...', 'X.X.X', '...X.', '.....', '.....'],
  // Block / shade characters, handy for games (walls, bars, meters).
  '█': ['XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX'], // full block
  '▓': ['XX.XX', 'X.X.X', 'XX.XX', '.X.X.', 'XX.XX', 'X.X.X', 'XX.XX'], // dark shade
  '▒': ['X.X.X', '.X.X.', 'X.X.X', '.X.X.', 'X.X.X', '.X.X.', 'X.X.X'], // medium shade
  '░': ['X...X', '.....', '..X..', '.....', '..X..', '.....', 'X...X'], // light shade
  '■': ['.....', '.XXX.', '.XXX.', '.XXX.', '.XXX.', '.XXX.', '.....'], // filled square
  '●': ['.....', '.XXX.', 'XXXXX', 'XXXXX', 'XXXXX', '.XXX.', '.....'], // filled circle
  '♥': ['.....', '.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..', '.....'], // heart
  '←': ['.....', '..X..', '.X...', 'XXXXX', '.X...', '..X..', '.....'], // left arrow
  '→': ['.....', '..X..', '...X.', 'XXXXX', '...X.', '..X..', '.....'], // right arrow
  '↑': ['..X..', '.XXX.', 'X.X.X', '..X..', '..X..', '..X..', '.....'], // up arrow
  '↓': ['.....', '..X..', '..X..', '..X..', 'X.X.X', '.XXX.', '..X..'], // down arrow
};

// The hollow box shown for any glyph we don't have art for.
const MISSING = ['XXXXX', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXXX'];

const CACHE = new Map<string, Uint8Array>();

function compile(rows: string[]): Uint8Array {
  const out = new Uint8Array(GLYPH_H);
  for (let r = 0; r < GLYPH_H; r++) {
    const row = rows[r] ?? '';
    let bits = 0;
    for (let c = 0; c < GLYPH_W; c++) {
      if (row[c] === 'X') bits |= 1 << (GLYPH_W - 1 - c);
    }
    out[r] = bits;
  }
  return out;
}

/**
 * Get the 7-byte bitmap for a character. Lowercase folds to uppercase; unknown
 * glyphs return the hollow-box placeholder so nothing ever crashes on render.
 */
export function glyph(ch: string): Uint8Array {
  if (!ch) ch = ' ';
  let key = ch[0];
  let cached = CACHE.get(key);
  if (cached) return cached;

  let rows = SRC[key];
  if (!rows) {
    const upper = key.toUpperCase();
    rows = SRC[upper];
  }
  const compiled = compile(rows ?? MISSING);
  CACHE.set(key, compiled);
  return compiled;
}
