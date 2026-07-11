/*
 * MINESWEEPER — a 9 x 9 pocket minefield for the 20 x 18 LCD.
 * D-pad moves, A uncovers, B marks a flag, START deals a fresh board.
 */
(function () {
  'use strict';

  var COLS = 20;
  var SIZE = 9;
  var MINES = 10;
  var GRID_X = 5;
  var GRID_Y = 3;
  var SAFE_CELLS = SIZE * SIZE - MINES;

  var ctx;
  var board;
  var cursorX, cursorY;
  var cleared, elapsed, finalScore;
  var minesPlaced, state, tick;
  var repeat = { up: 0, down: 0, left: 0, right: 0 };

  function makeBoard() {
    board = [];
    for (var y = 0; y < SIZE; y++) {
      board[y] = [];
      for (var x = 0; x < SIZE; x++) {
        board[y][x] = { mine: false, revealed: false, flagged: false, near: 0 };
      }
    }
  }

  function resetGame() {
    makeBoard();
    cursorX = 4;
    cursorY = 4;
    cleared = 0;
    elapsed = 0;
    finalScore = 0;
    minesPlaced = false;
    state = 'play';
    repeat.up = repeat.down = repeat.left = repeat.right = 0;
  }

  function eachNeighbor(x, y, fn) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        var nx = x + dx;
        var ny = y + dy;
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) fn(nx, ny);
      }
    }
  }

  // The opening square and its immediate ring are always clear. This makes a
  // first move useful rather than a coin toss, while keeping mine placement lazy.
  function placeMines(safeX, safeY) {
    var candidates = [];
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        if (Math.abs(x - safeX) > 1 || Math.abs(y - safeY) > 1) candidates.push(y * SIZE + x);
      }
    }
    for (var m = 0; m < MINES; m++) {
      var pick = (Math.random() * candidates.length) | 0;
      var index = candidates.splice(pick, 1)[0];
      board[(index / SIZE) | 0][index % SIZE].mine = true;
    }
    for (y = 0; y < SIZE; y++) {
      for (x = 0; x < SIZE; x++) {
        var cell = board[y][x];
        if (cell.mine) continue;
        cell.near = 0;
        eachNeighbor(x, y, function (nx, ny) {
          if (board[ny][nx].mine) cell.near++;
        });
      }
    }
    minesPlaced = true;
  }

  function points() {
    // Every safe square is worth 25, with one point lost per second. A cleared
    // field earns a 500 point completion bonus, so both speed and exploration matter.
    var base = Math.max(0, cleared * 25 - Math.floor(elapsed));
    return base + (state === 'won' ? 500 : 0);
  }

  function submitResult() {
    finalScore = points();
    try {
      var p = window.Arcade.submitScore('minesweeper', finalScore);
      if (p && p.catch) p.catch(function () {});
    } catch (e) {
      // submitScore is offline-safe in the shell; this guard also keeps a run
      // playable in a minimal development harness.
    }
    try { ctx.arcade.setBestScore('minesweeper', finalScore); } catch (ignore) {}
  }

  function finish(won) {
    if (state !== 'play') return;
    state = won ? 'won' : 'lost';
    submitResult();
  }

  function floodReveal(x, y) {
    var stack = [[x, y]];
    while (stack.length) {
      var pos = stack.pop();
      var cell = board[pos[1]][pos[0]];
      if (cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      cleared++;
      if (cell.near === 0) {
        eachNeighbor(pos[0], pos[1], function (nx, ny) {
          var next = board[ny][nx];
          if (!next.revealed && !next.flagged && !next.mine) stack.push([nx, ny]);
        });
      }
    }
  }

  function reveal() {
    if (state !== 'play') return;
    var cell = board[cursorY][cursorX];
    if (cell.flagged || cell.revealed) return;
    if (!minesPlaced) placeMines(cursorX, cursorY);
    if (cell.mine) {
      cell.revealed = true;
      finish(false);
      return;
    }
    floodReveal(cursorX, cursorY);
    if (cleared === SAFE_CELLS) finish(true);
  }

  function toggleFlag() {
    if (state !== 'play') return;
    var cell = board[cursorY][cursorX];
    if (!cell.revealed) cell.flagged = !cell.flagged;
  }

  function move(direction) {
    if (state !== 'play') return;
    if (direction === 'left') cursorX = Math.max(0, cursorX - 1);
    if (direction === 'right') cursorX = Math.min(SIZE - 1, cursorX + 1);
    if (direction === 'up') cursorY = Math.max(0, cursorY - 1);
    if (direction === 'down') cursorY = Math.min(SIZE - 1, cursorY + 1);
  }

  function flagsUsed() {
    var count = 0;
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) if (board[y][x].flagged) count++;
    return count;
  }

  function drawCell(screen, x, y) {
    var cell = board[y][x];
    var ch = '■';
    var fg = 'dark';
    var bg = 'lightest';
    var showMine = state === 'lost' && cell.mine;

    if (cell.revealed || showMine) {
      bg = 'light';
      if (cell.mine) {
        ch = '*';
        fg = 'darkest';
      } else if (cell.near) {
        ch = String(cell.near);
        fg = cell.near >= 3 ? 'darkest' : 'dark';
      } else {
        ch = ' ';
        fg = 'light';
      }
    } else if (cell.flagged) {
      ch = 'F';
      fg = 'darkest';
    }

    // Inverted cursor is legible on covered squares, open squares, flags, and mines.
    if (state === 'play' && x === cursorX && y === cursorY) {
      bg = 'darkest';
      fg = ch === '■' ? 'lightest' : 'lightest';
    }
    screen.set(GRID_X + x, GRID_Y + y, ch, fg, bg);
  }

  function pad(n, width) {
    var value = String(Math.max(0, n | 0));
    while (value.length < width) value = '0' + value;
    return value;
  }

  function render(screen) {
    screen.clear('lightest');
    var score = state === 'play' ? points() : finalScore;
    screen.fillRect(0, 0, COLS, 1, ' ', 'lightest', 'darkest');
    screen.text(1, 0, 'MINES ' + pad(MINES - flagsUsed(), 2), 'lightest', 'darkest');
    screen.text(13, 0, 'T' + pad(elapsed, 3), 'lightest', 'darkest');
    screen.text(0, 1, 'CLEAR ' + pad(cleared, 2) + '/' + SAFE_CELLS + ' P' + pad(score, 4), 'darkest');

    screen.rect(GRID_X - 1, GRID_Y - 1, SIZE + 2, SIZE + 2, 'darkest', 'lightest');
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) drawCell(screen, x, y);

    if (state === 'play') {
      screen.textCentered(14, 'A REVEAL  B FLAG', 'darkest');
      screen.textCentered(15, 'D-PAD: CURSOR', 'dark');
      screen.textCentered(17, 'START: NEW BOARD', 'dark');
    } else {
      screen.fillRect(1, 13, 18, 4, ' ', 'darkest', 'lightest');
      screen.rect(1, 13, 18, 4, 'darkest', 'lightest');
      screen.textCentered(14, state === 'won' ? 'FIELD CLEAR!' : 'BOOM! MINE HIT', 'darkest', 'lightest');
      screen.textCentered(15, 'SCORE ' + pad(finalScore, 4), 'darkest', 'lightest');
      if ((tick % 40) < 26) screen.textCentered(17, 'START: AGAIN', 'darkest');
    }
  }

  var game = {
    id: 'minesweeper',
    title: 'MINESWEEPER',

    init: function (context) {
      ctx = context;
      tick = 0;
      resetGame();
    },

    update: function (dtMs) {
      tick++;
      if (state !== 'play') return;
      elapsed += dtMs / 1000;
      // A held d-pad repeats after a short pause; taps move immediately in onInput.
      var directions = ['up', 'down', 'left', 'right'];
      for (var i = 0; i < directions.length; i++) {
        var dir = directions[i];
        if (!ctx.input.isDown(dir)) continue;
        repeat[dir] -= dtMs;
        if (repeat[dir] <= 0) {
          move(dir);
          repeat[dir] += 100;
        }
      }
    },

    render: render,

    onInput: function (button, pressed) {
      if (!pressed) {
        if (repeat.hasOwnProperty(button)) repeat[button] = 0;
        return;
      }
      if (button === 'start') {
        resetGame();
        return;
      }
      if (button === 'a') reveal();
      else if (button === 'b') toggleFlag();
      else if (repeat.hasOwnProperty(button)) {
        move(button);
        repeat[button] = 250;
      }
    },

    destroy: function () {
      board = [];
      ctx = null;
    },
  };

  window.Arcade.registerGame(game);
})();
