'use strict';
const fs = require('fs');
const path = require('path');

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
  };
}
function makeInput() {
  const held = {}, prev = {};
  return {
    latch() { for (const k of Object.keys(held)) prev[k] = held[k]; },
    press(b) { held[b] = true; },
    release(b) { held[b] = false; },
    isDown(b) { return !!held[b]; },
    justPressed(b) { return !!held[b] && !prev[b]; },
    justReleased(b) { return !held[b] && !!prev[b]; },
  };
}
const Arcade = {
  _game: null,
  registerGame(g) { this._game = g; },
  submitScore() { return Promise.resolve([]); },
  getBestScore() { return 0; },
  setBestScore(id, s) { return s; },
};
global.window = { Arcade };
eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'games', 'runner.js'), 'utf8'));
const game = Arcade._game;
const screen = makeScreen();
const input = makeInput();
game.init({ screen, input, arcade: Arcade, gameId: 'runner' });

Math.random = () => 0; // b1 only, min spacing

const DT = 1000 / 60;
function step() { game.update(DT); input.latch(); game.render(screen); }

// leave ready
input.press('a'); step(); input.release('a'); step();

const frames = [];
let heldA = false;
for (let i = 0; i < 60 * 10; i++) {
  let near = false;
  for (let x = 5; x <= 6; x++) if (screen.get(x, 13) === '█') near = true;
  if (near && !heldA) { input.press('a'); heldA = true; }
  if (!near && heldA) { input.release('a'); heldA = false; }
  step();
  frames.push('tick ' + i + ' A=' + heldA + '\n' + screen.dump());
  if (screen.dump().includes('GAME OVER')) {
    console.log('DIED at tick ' + i);
    for (let k = Math.max(0, frames.length - 14); k < frames.length; k++) {
      console.log('---------\n' + frames[k]);
    }
    process.exit(0);
  }
}
console.log('survived 10s');
