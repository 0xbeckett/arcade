// Headless harness for public/games/shmup.js.
// Mocks window.Arcade + Screen + Input, loads the game, and exercises it.
import { readFileSync } from 'node:fs';

const COLS = 20, ROWS = 18;
const GAME_PATH =
  '/home/beckett/Projects/arcade/.beckett/worktrees/8753e0c7-4bdb-4a54-8b86-c04c41deb90e/public/games/shmup.js';

// ---- mock Screen -----------------------------------------------------------
let nanSets = 0, throwCount = 0;
function makeScreen() {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(' '));
  const inb = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;
  const put = (x, y, ch) => {
    if (Number.isNaN(x) || Number.isNaN(y)) { nanSets++; return; }
    x = x | 0; y = y | 0;
    if (!inb(x, y)) return;
    grid[y][x] = ch && ch.length ? ch[0] : ' ';
  };
  return {
    cols: COLS, rows: ROWS, grid,
    clear() { for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x] = ' '; },
    set(x, y, ch) { put(x, y, ch); },
    get(x, y) { return inb(x | 0, y | 0) ? grid[y | 0][x | 0] : ' '; },
    text(x, y, str) { const s = String(str); for (let k = 0; k < s.length; k++) put(x + k, y, s[k]); },
    textCentered(y, str) { const s = String(str); this.text(Math.round((COLS - s.length) / 2), y, s); },
    fillRect(x, y, w, h, ch) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, ch); },
    rect(x, y, w, h) { for (let i = 0; i < w; i++) { put(x + i, y, '-'); put(x + i, y + h - 1, '-'); } for (let j = 0; j < h; j++) { put(x, y + j, '|'); put(x + w - 1, y + j, '|'); } },
    hline(x, y, w, ch) { for (let i = 0; i < w; i++) put(x + i, y, ch); },
    vline(x, y, h, ch) { for (let j = 0; j < h; j++) put(x, y + j, ch); },
    rows() { return grid.map((r) => r.join('')); },
  };
}

// ---- mock Input ------------------------------------------------------------
const held = Object.create(null);
const input = {
  isDown: (b) => !!held[b],
  justPressed: () => false,
  justReleased: () => false,
};

// ---- mock Arcade -----------------------------------------------------------
const bestStore = Object.create(null);
let registered = null;
const submits = [];
const gameOverCalls = [];
globalThis.window = {
  Arcade: {
    registerGame(g) { registered = g; },
    submitScore(id, score) { submits.push({ id, score }); return Promise.resolve([]); },
    getLeaderboard() { return Promise.resolve([]); },
    getBestScore(id) { return bestStore[id] || 0; },
    setBestScore(id, score) { bestStore[id] = Math.max(bestStore[id] || 0, score); return bestStore[id]; },
    gameOver(score) { gameOverCalls.push(score); },
    Color: { LIGHTEST: 'lightest', LIGHT: 'light', DARK: 'dark', DARKEST: 'darkest' },
    version: '1.0.0',
  },
};

// ---- load the game ---------------------------------------------------------
const code = readFileSync(GAME_PATH, 'utf8');
(0, eval)(code);

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  -', msg); }

assert(registered, 'game registered itself');
assert(registered.id === 'shmup', "id === 'shmup'");
assert(registered.title && typeof registered.title === 'string', 'has title');
for (const m of ['init', 'update', 'render', 'onInput', 'destroy'])
  assert(typeof registered[m] === 'function', `${m}() is a function`);

const screen = makeScreen();
const ctx = { screen, input, arcade: window.Arcade, gameId: 'shmup' };

function step() {
  try { registered.update(1000 / 60); } catch (e) { throwCount++; console.error('update threw:', e); }
  try { registered.render(screen); } catch (e) { throwCount++; console.error('render threw:', e); }
}
function tap(btn) { held[btn] = true; try { registered.onInput(btn, true); } catch (e) { throwCount++; console.error('onInput threw:', e); } }
function release(btn) { held[btn] = false; try { registered.onInput(btn, false); } catch (e) { throwCount++; } }
function frameHas(sub) { return screen.rows().some((r) => r.includes(sub)); }
function shipXY() {
  const rows = screen.rows();
  for (let y = 0; y < ROWS; y++) { const x = rows[y].indexOf('↑'); if (x >= 0) return [x, y]; }
  return [-1, -1];
}
function bossOnScreen() { return screen.rows().some((r) => r.includes('▓▓▓▓▓')); }

// -- title renders --
registered.init(ctx);
step();
assert(frameHas('SHMUP') || frameHas('PRESS A'), 'title screen renders');

// -- Run A: closed-loop dodge AI + autofire, across deaths, hunt for a boss --
tap('a'); // start
held['a'] = true; // autofire held
let bossSeen = false, deaths = 0;
for (let i = 0; i < 14000; i++) {
  const rows = screen.rows();
  const [sx, sy] = shipXY();
  held['left'] = held['right'] = held['up'] = held['down'] = false;
  if (sx >= 0) {
    let dangerL = 0, dangerR = 0, dangerC = 0;
    for (let y = Math.max(0, sy - 5); y < sy; y++) {
      for (let x = 0; x < COLS; x++) {
        if (rows[y][x] === '↓') {
          if (x < sx) dangerL += (6 - (sy - y));
          if (x > sx) dangerR += (6 - (sy - y));
          if (Math.abs(x - sx) <= 1) dangerC += (6 - (sy - y));
        }
      }
    }
    if (dangerC > 0 || dangerL !== dangerR) {
      if (dangerL > dangerR) held['right'] = true; else if (dangerR > dangerL) held['left'] = true;
      else held[sx < COLS / 2 ? 'right' : 'left'] = true;
    }
    if (sy > 14) held['up'] = true;
  }
  if (frameHas('GAME OVER')) { deaths++; tap('a'); }
  step();
  if (bossOnScreen()) bossSeen = true;
}
console.log(`   run A: deaths=${deaths} bossSeen=${bossSeen} submits=${submits.length}`);
assert(bossSeen, 'a mini-boss (5-wide hull) appeared during play');

// -- Run B: deterministic death path, verify submitScore + restart --
registered.init(ctx);
held['a'] = held['left'] = held['right'] = held['up'] = held['down'] = false;
tap('a'); release('a'); // start only (no held fire)
const submitsBefore = submits.length;
let over = false, guard = 0;
while (!over && guard++ < 20000) { step(); if (frameHas('GAME OVER')) over = true; }
assert(over, 'unfired stationary ship eventually dies -> GAME OVER');
assert(submits.length === submitsBefore + 1, 'exactly one submitScore on death');
if (submits.length) {
  const last = submits[submits.length - 1];
  assert(last.id === 'shmup', "submitScore called with id 'shmup'");
  assert(typeof last.score === 'number' && last.score >= 0, 'submitted score is a number >= 0');
}
assert(gameOverCalls.length === 0, 'does NOT call arcade.gameOver (self-managed end screen)');
assert(bestStore['shmup'] !== undefined, 'best score persisted via setBestScore');

// restart from game over via A
tap('a');
step();
assert(!frameHas('GAME OVER'), 'A on game-over restarts (GAME OVER cleared)');
for (let i = 0; i < 600; i++) step();

// -- summary --
console.log('---');
assert(throwCount === 0, `no exceptions across all runs (threw ${throwCount})`);
assert(nanSets === 0, `no NaN coordinates passed to screen (saw ${nanSets})`);
assert(submits.length >= 2, 'submitScore fired on multiple deaths');
console.log('bestStore.shmup =', bestStore['shmup']);
console.log(process.exitCode ? 'RESULT: FAILURES' : 'RESULT: ALL PASS');
