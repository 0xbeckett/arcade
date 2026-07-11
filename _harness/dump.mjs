import { readFileSync } from 'node:fs';
const COLS = 20, ROWS = 18;
const GAME_PATH =
  '/home/beckett/Projects/arcade/.beckett/worktrees/8753e0c7-4bdb-4a54-8b86-c04c41deb90e/public/games/shmup.js';
function makeScreen() {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(' '));
  const inb = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;
  const put = (x, y, ch) => { x = x | 0; y = y | 0; if (inb(x, y)) grid[y][x] = ch && ch.length ? ch[0] : ' '; };
  return {
    cols: COLS, rows: ROWS,
    clear() { for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x] = ' '; },
    set(x, y, ch) { put(x, y, ch); }, get(x, y) { return inb(x | 0, y | 0) ? grid[y | 0][x | 0] : ' '; },
    text(x, y, s) { s = String(s); for (let k = 0; k < s.length; k++) put(x + k, y, s[k]); },
    textCentered(y, s) { s = String(s); this.text(Math.round((COLS - s.length) / 2), y, s); },
    fillRect(x, y, w, h, ch) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, ch); },
    rect() {}, hline(x, y, w, ch) { for (let i = 0; i < w; i++) put(x + i, y, ch); }, vline(x, y, h, ch) { for (let j = 0; j < h; j++) put(x, y + j, ch); },
    rows() { return grid.map((r) => r.join('')); },
  };
}
const held = Object.create(null);
const input = { isDown: (b) => !!held[b], justPressed: () => false, justReleased: () => false };
let reg = null;
globalThis.window = { Arcade: {
  registerGame(g) { reg = g; }, submitScore() { return Promise.resolve([]); }, getLeaderboard() { return Promise.resolve([]); },
  getBestScore() { return 300; }, setBestScore(i, s) { return s; }, gameOver() {},
  Color: { LIGHTEST: 'lightest', LIGHT: 'light', DARK: 'dark', DARKEST: 'darkest' }, version: '1.0.0' } };
(0, eval)(readFileSync(GAME_PATH, 'utf8'));
const s = makeScreen();
const ctx = { screen: s, input, arcade: window.Arcade, gameId: 'shmup' };
function frame() { reg.update(1000 / 60); reg.render(s); }
function show(label) { console.log('\n== ' + label + ' =='); console.log('+' + '-'.repeat(COLS) + '+'); for (const r of s.rows()) console.log('|' + r + '|'); console.log('+' + '-'.repeat(COLS) + '+'); }
reg.init(ctx); frame(); show('TITLE');
reg.onInput('a', true); held['a'] = true;
for (let i = 0; i < 80; i++) frame(); show('EARLY PLAY (~1.3s)');
// hunt for a boss frame
let found = false;
for (let i = 0; i < 6000 && !found; i++) { held['left'] = (i % 120) < 60; held['right'] = !held['left']; frame(); if (s.rows().some((r) => r.includes('▓▓▓▓▓'))) { found = true; } }
show(found ? 'BOSS WAVE' : 'PLAY (no boss yet)');
// force a death: stop firing/moving
reg.init(ctx); reg.onInput('a', true); held['a'] = false; held['left'] = held['right'] = false;
for (let i = 0; i < 4000; i++) { frame(); if (s.rows().some((r) => r.includes('GAME OVER'))) break; }
show('GAME OVER');
