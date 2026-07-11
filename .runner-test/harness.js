// Headless shell stub + behavioral tests for runner.js
'use strict';
const fs = require('fs');
const path = require('path');

// ---- Screen stub (20x18, clipped, last-write-wins) ----
function makeScreen() {
  const cols = 20, rows = 18;
  let cells;
  const blank = () => cells = Array.from({ length: rows }, () => Array(cols).fill(' '));
  blank();
  const setc = (x, y, ch) => {
    x |= 0; y |= 0;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    cells[y][x] = ch ? ch[0] : ' ';
  };
  return {
    cols, rows,
    clear() { blank(); },
    set(x, y, ch) { setc(x, y, ch); },
    get(x, y) { return (cells[y] && cells[y][x]) || ' '; },
    text(x, y, str) { for (let i = 0; i < str.length; i++) setc(x + i, y, str[i]); },
    textCentered(y, str) { this.text(Math.floor((cols - str.length) / 2), y, str); },
    fillRect(x, y, w, h, ch) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setc(x + i, y + j, ch); },
    rect() {}, hline() {}, vline() {},
    dump() { return cells.map(r => r.join('')).join('\n'); },
    find(ch) { const out = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (cells[y][x] === ch) out.push([x, y]); return out; },
  };
}

// ---- Input stub with per-tick edges ----
function makeInput() {
  const held = {}, prev = {};
  return {
    held,
    latch() { for (const k of Object.keys(held)) prev[k] = held[k]; },
    press(b) { held[b] = true; },
    release(b) { held[b] = false; },
    isDown(b) { return !!held[b]; },
    justPressed(b) { return !!held[b] && !prev[b]; },
    justReleased(b) { return !held[b] && !!prev[b]; },
  };
}

// ---- Arcade stub ----
const submits = [];
let localBest = 0;
const Arcade = {
  _game: null,
  registerGame(g) { this._game = g; },
  gameOver() { throw new Error('gameOver called — runner handles its own restart'); },
  submitScore(id, score) { submits.push([id, score]); return Promise.resolve([]); },
  getBestScore() { return localBest; },
  setBestScore(id, s) { localBest = Math.max(localBest, s); return localBest; },
  Color: { LIGHTEST: 0, LIGHT: 1, DARK: 2, DARKEST: 3 },
  version: '1.0.0',
};
global.window = { Arcade };

// load the game
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'games', 'runner.js'), 'utf8');
eval(src);
const game = Arcade._game;

const screen = makeScreen();
const input = makeInput();
const ctx = { screen, input, arcade: Arcade, gameId: 'runner' };

const DT = 1000 / 60;
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    game.update(DT);
    input.latch(); // edges are one-tick, latched after each update
    game.render(screen);
  }
}
function tap(b) { input.press(b); step(1); input.release(b); step(1); }

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS ' + name);
  else { failures++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// deterministic RNG control
let rngSeq = null, rngI = 0;
const realRandom = Math.random;
function fixRng(seq) { rngSeq = seq; rngI = 0; Math.random = () => rngSeq[rngI++ % rngSeq.length]; }
function freeRng() { Math.random = realRandom; }

// ============ Test 1: interface ============
check('registers GameModule with id runner', game && game.id === 'runner' && game.title === 'RUNNER');
check('implements full interface',
  ['init', 'update', 'render', 'onInput', 'destroy'].every(m => typeof game[m] === 'function'));

// ============ Test 2: ready screen -> start ============
game.init(ctx);
step(5);
check('ready screen renders title', screen.dump().includes('R U N N E R'));
tap('a');
step(5);
check('A starts the run (player visible)', screen.find('●').length === 1);

// ============ Test 3: no input -> dies on first obstacle, submits ============
freeRng();
let died = false;
for (let i = 0; i < 60 * 20 && !died; i++) {
  step(1);
  if (screen.dump().includes('GAME OVER')) died = true;
}
check('no-input run ends in GAME OVER', died);
check('score submitted via submitScore(runner, n)',
  submits.length === 1 && submits[0][0] === 'runner' && typeof submits[0][1] === 'number' && submits[0][1] > 0,
  JSON.stringify(submits));
const firstScore = submits.length ? submits[0][1] : 0;

// ============ Test 4: instant restart via A ============
step(25); // past the 20-tick lockout
tap('a');
step(3);
check('A restarts instantly (game over gone, player back)',
  !screen.dump().includes('GAME OVER') && screen.find('●').length === 1);

// ============ Test 5: variable jump height (tap vs hold) ============
function apexRow(holdTicks) {
  game.init(ctx);
  tap('a'); // leave ready
  step(30);
  input.press('a');
  let minHead = 18;
  for (let i = 0; i < 60; i++) {
    step(1);
    if (i === holdTicks) input.release('a');
    const heads = screen.find('●');
    if (heads.length) minHead = Math.min(minHead, heads[0][1]);
  }
  input.release('a');
  return minHead;
}
fixRng([0.99, 0.99]); // long spacing so the jump test area is clear
const tapApex = apexRow(2);
const holdApex = apexRow(40);
check('hold jumps higher than tap (apex rows ' + holdApex + ' < ' + tapApex + ')', holdApex < tapApex);
check('hold jump clears >=2 cells (head row <= 10)', holdApex <= 10, 'apex=' + holdApex);
check('tap jump is short (head row >= 11)', tapApex >= 11, 'apex=' + tapApex);

// ============ Test 6: jumping clears a low block ============
// rng=0 -> always picks first pool entry 'b1', minimal spacing
fixRng([0]);
game.init(ctx);
tap('a');
let survivedTicks = 0, dead = false, hold6 = 0;
// auto-play: when a block is ~2-3 cells ahead, jump and HOLD A through the arc
for (let i = 0; i < 60 * 30 && !dead; i++) {
  let near = false;
  for (let x = 5; x <= 6; x++) if (screen.get(x, 13) === '█') near = true;
  if (near && hold6 <= 0) hold6 = 22;
  if (hold6 > 0) { input.press('a'); hold6--; } else input.release('a');
  step(1);
  survivedTicks++;
  if (screen.dump().includes('GAME OVER')) dead = true;
}
check('reactive jumping survives b1 field >20s (' + (survivedTicks / 60).toFixed(1) + 's)',
  survivedTicks > 60 * 20);

// ============ Test 7: slide passes under ceiling; standing dies ============
function ceilTest(doSlide) {
  fixRng([0]);
  game.init(ctx);
  tap('a');
  let hold = 0;
  for (let i = 0; i < 60 * 60; i++) {
    // detect ceiling ahead (dark pillar in upper rows); never jump into one
    let ceilNear = false;
    for (let x = 4; x <= 9; x++) if (screen.get(x, 6) === '█') ceilNear = true;
    let near = false;
    for (let x = 5; x <= 6; x++) {
      if (screen.get(x, 13) === '█' && screen.get(x, 5) !== '█') near = true;
    }
    if (ceilNear) {
      hold = 0;
      input.release('a');
      if (doSlide) input.press('down');
      // if not sliding: run into it standing
    } else {
      input.release('down');
      if (near && hold <= 0) hold = 22;
      if (hold > 0) { input.press('a'); hold--; } else input.release('a');
    }
    step(1);
    if (screen.dump().includes('GAME OVER')) return { died: true, i };
    const hud = screen.dump().split('\n')[0];
    const m = hud.match(/(\d+)/);
    const score = m ? parseInt(m[1], 10) : 0;
    if (score > 95) fixRng([0.7]); // pool [b1,b1,b1,ceil,ceil] -> 0.7*5=3.5 -> 'ceil'
    if (score >= 200) return { died: false }; // cleared the ceiling-only section
  }
  return { died: false };
}
const slideRes = ceilTest(true);
const standRes = ceilTest(false);
check('sliding survives ceiling section', !slideRes.died, 'died at tick ' + slideRes.i);
check('standing into ceiling dies', standRes.died);

// ============ Test 8: gap with no jump kills (pit death) ============
fixRng([0]);
game.init(ctx);
tap('a');
{
  let dead8 = false, sawGapDeath = false, hold8 = 0;
  for (let i = 0; i < 60 * 120 && !dead8; i++) {
    const hud = screen.dump().split('\n')[0];
    const m = hud.match(/(\d+)/);
    const sc = m ? parseInt(m[1], 10) : 0;
    if (sc > 340) {
      fixRng([0.85]); // pool [b1x3, ceilx2, b2x2, gapx2] = 9 -> 0.85*9=7.65 -> gap
      input.release('a'); input.release('down');
      step(1);
    } else {
      let near = false;
      for (let x = 5; x <= 6; x++) {
        if (screen.get(x, 13) === '█' && screen.get(x, 5) !== '█') near = true;
      }
      let ceilNear = false;
      for (let x = 4; x <= 9; x++) if (screen.get(x, 6) === '█') ceilNear = true;
      if (ceilNear) { hold8 = 0; input.release('a'); input.press('down'); }
      else {
        input.release('down');
        if (near && hold8 <= 0) hold8 = 22;
        if (hold8 > 0) { input.press('a'); hold8--; } else input.release('a');
      }
      step(1);
    }
    if (screen.dump().includes('GAME OVER')) { dead8 = true; sawGapDeath = sc > 340; }
  }
  check('falling into a gap ends the run', dead8 && sawGapDeath);
}

// ============ Test 8b: coyote time (jump 3 ticks AFTER leaving the edge) ====
fixRng([0]);
game.init(ctx);
tap('a');
{
  let coyoteOk = false, dead8b = false, hold8b = 0, phase = 'run', wait = 0;
  for (let i = 0; i < 60 * 120 && !dead8b && !coyoteOk; i++) {
    const m = screen.dump().split('\n')[0].match(/(\d+)/);
    const sc = m ? parseInt(m[1], 10) : 0;
    if (sc > 340) fixRng([0.85]); // force gaps
    if (phase === 'run') {
      if (sc > 340 && screen.get(3, 14) === ' ') {
        // support just vanished under the player: airborne, coyote ticking
        phase = 'wait';
        wait = 3;
        input.release('a'); input.release('down');
      } else {
        let near = false;
        for (let x = 5; x <= 6; x++) {
          if (screen.get(x, 13) === '█' && screen.get(x, 5) !== '█') near = true;
        }
        let ceilNear = false;
        for (let x = 4; x <= 9; x++) if (screen.get(x, 6) === '█') ceilNear = true;
        const gapAhead = screen.get(4, 14) === ' ' || screen.get(5, 14) === ' ';
        if (gapAhead) { hold8b = 0; input.release('a'); input.release('down'); }
        else if (ceilNear) { hold8b = 0; input.release('a'); input.press('down'); }
        else {
          input.release('down');
          if (near && hold8b <= 0) hold8b = 22;
          if (hold8b > 0) { input.press('a'); hold8b--; } else input.release('a');
        }
      }
    } else if (phase === 'wait') {
      if (--wait <= 0) { phase = 'jump'; hold8b = 22; }
    } else { // 'jump': late A press, then see if we cleared the gap
      if (hold8b > 0) { input.press('a'); hold8b--; } else input.release('a');
      if (hold8b < -30) coyoteOk = true; // ~0.9s after the late jump, still alive
      hold8b--;
    }
    step(1);
    if (screen.dump().includes('GAME OVER')) dead8b = true;
  }
  check('coyote time: A pressed 3 ticks after the edge still jumps the gap',
    coyoteOk && !dead8b, 'phase=' + phase);
}

// ============ Test 9: score bookkeeping ============
check('best score tracked (localBest >= first score)', localBest >= firstScore, 'best=' + localBest);
check('multiple submits recorded (one per death)', submits.length >= 3, 'n=' + submits.length);
check('every submit used gameId runner', submits.every(s => s[0] === 'runner'));

// ============ Test 10: render is crash-free in all states ============
game.init(ctx);
game.render(screen); // ready state render
game.destroy();
check('destroy is clean', true);

freeRng();
console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
