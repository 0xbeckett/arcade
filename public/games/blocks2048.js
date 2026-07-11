/*
 * 2048 — slide equal numbered blocks together on the 20 x 18 LCD.
 * The board is deliberately drawn in large, high-contrast character cells so
 * four-digit tiles remain readable through the dot-matrix display.
 */
(function () {
  'use strict';

  var SIZE = 4;
  var ctx;
  var board;
  var score;
  var best;
  var state;
  var made2048;
  var submitted;
  var ticks;

  function resetGame() {
    board = [];
    for (var i = 0; i < SIZE * SIZE; i++) board.push(0);
    score = 0;
    state = 'play';
    made2048 = false;
    submitted = false;
    addTile();
    addTile();
  }

  function addTile() {
    var empty = [];
    for (var i = 0; i < board.length; i++) if (!board[i]) empty.push(i);
    if (!empty.length) return false;
    var spot = empty[(Math.random() * empty.length) | 0];
    // Standard 2048 distribution: a 4 appears one time in ten.
    board[spot] = Math.random() < 0.9 ? 2 : 4;
    return true;
  }

  function lineFor(direction, n) {
    var line = [];
    var i;
    if (direction === 'left') for (i = 0; i < SIZE; i++) line.push(n * SIZE + i);
    if (direction === 'right') for (i = SIZE - 1; i >= 0; i--) line.push(n * SIZE + i);
    if (direction === 'up') for (i = 0; i < SIZE; i++) line.push(i * SIZE + n);
    if (direction === 'down') for (i = SIZE - 1; i >= 0; i--) line.push(i * SIZE + n);
    return line;
  }

  // A line is read from its leading edge.  Combining adjacent compacted values
  // once is what prevents 2,2,2,2 from becoming 8 in one move.
  function collapseLine(indices) {
    var values = [];
    var i;
    for (i = 0; i < SIZE; i++) if (board[indices[i]]) values.push(board[indices[i]]);

    var result = [];
    for (i = 0; i < values.length; i++) {
      if (values[i] === values[i + 1]) {
        var merged = values[i] * 2;
        result.push(merged);
        score += merged;
        if (merged === 2048) made2048 = true;
        i++;
      } else {
        result.push(values[i]);
      }
    }
    while (result.length < SIZE) result.push(0);

    var changed = false;
    for (i = 0; i < SIZE; i++) {
      if (board[indices[i]] !== result[i]) changed = true;
      board[indices[i]] = result[i];
    }
    return changed;
  }

  function canMove() {
    for (var i = 0; i < board.length; i++) {
      if (!board[i]) return true;
      var x = i % SIZE;
      var y = (i / SIZE) | 0;
      if (x < SIZE - 1 && board[i] === board[i + 1]) return true;
      if (y < SIZE - 1 && board[i] === board[i + SIZE]) return true;
    }
    return false;
  }

  function submitFinalScore() {
    if (submitted) return;
    submitted = true;
    try {
      // Keep the result visible so START/A can immediately deal another game.
      // The shell API itself handles online and offline score storage.
      var result = window.Arcade.submitScore('blocks2048', score);
      if (result && result.catch) result.catch(function () {});
    } catch (ignore) {}
    try {
      if (ctx.arcade.setBestScore) best = ctx.arcade.setBestScore('blocks2048', score);
    } catch (ignoreBest) {}
  }

  function slide(direction) {
    if (state !== 'play') return;
    var moved = false;
    for (var n = 0; n < SIZE; n++) {
      if (collapseLine(lineFor(direction, n))) moved = true;
    }
    if (!moved) {
      if (!canMove()) {
        state = 'over';
        submitFinalScore();
      }
      return;
    }

    addTile();
    if (made2048) {
      state = 'won';
    } else if (!canMove()) {
      state = 'over';
      submitFinalScore();
    }
  }

  function tileStyle(value) {
    if (value === 2) return { fg: 'darkest', bg: 'lightest' };
    if (value === 4) return { fg: 'darkest', bg: 'light' };
    if (value === 8 || value === 16) return { fg: 'lightest', bg: 'dark' };
    if (value === 32 || value === 64) return { fg: 'lightest', bg: 'darkest' };
    return { fg: 'darkest', bg: 'light' };
  }

  function drawTile(screen, x, y, value) {
    if (!value) {
      screen.fillRect(x, y, 4, 2, '░', 'dark', 'darkest');
      return;
    }
    var style = tileStyle(value);
    var text = String(value);
    screen.fillRect(x, y, 4, 2, ' ', style.fg, style.bg);
    screen.text(x + ((4 - text.length) >> 1), y, text, style.fg, style.bg);
    // A one-row pixel shadow makes every block look like a distinct LCD tile.
    screen.hline(x, y + 1, 4, '▓', style.fg);
  }

  function scoreText(value) {
    var text = String(value);
    return text.length > 6 ? text.slice(-6) : text;
  }

  function drawBoard(screen) {
    screen.fillRect(0, 2, 20, 10, ' ', 'darkest', 'darkest');
    screen.rect(0, 2, 20, 10, 'lightest', 'darkest');
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) drawTile(screen, 2 + x * 4, 3 + y * 2, board[y * SIZE + x]);
    }
  }

  function render(screen) {
    screen.clear('lightest');
    screen.fillRect(0, 0, 20, 1, ' ', 'lightest', 'darkest');
    screen.text(1, 0, '2 0 4 8', 'lightest', 'darkest');
    var scoreLabel = 'S' + scoreText(score);
    screen.text(19 - scoreLabel.length, 0, scoreLabel, 'lightest', 'darkest');
    var bestLabel = 'BEST ' + scoreText(Math.max(best || 0, score));
    screen.text(0, 1, bestLabel, 'dark');
    screen.text(13, 1, 'MERGE!', 'darkest');
    drawBoard(screen);

    if (state === 'play') {
      screen.textCentered(13, 'D-PAD: SLIDE TILES', 'darkest');
      screen.textCentered(14, 'MATCH EQUAL NUMBERS', 'dark');
      screen.textCentered(16, 'START: NEW GAME', 'dark');
      screen.textCentered(17, 'MAKE A 2048 BLOCK', 'darkest');
    } else {
      screen.fillRect(1, 12, 18, 5, ' ', 'lightest', 'lightest');
      screen.rect(1, 12, 18, 5, 'darkest', 'lightest');
      if (state === 'won') {
        screen.textCentered(13, 'YOU MADE 2048!', 'darkest', 'lightest');
        screen.textCentered(14, 'A: KEEP GOING', 'dark', 'lightest');
      } else {
        screen.textCentered(13, 'NO MOVES LEFT', 'darkest', 'lightest');
        screen.textCentered(14, 'FINAL ' + scoreText(score), 'dark', 'lightest');
      }
      if ((ticks % 40) < 28) screen.textCentered(15, 'START/A: AGAIN', 'darkest', 'lightest');
    }
  }

  var game = {
    id: 'blocks2048',
    title: '2048',

    init: function (context) {
      ctx = context;
      ticks = 0;
      try { best = ctx.arcade.getBestScore('blocks2048'); } catch (ignore) { best = 0; }
      resetGame();
    },

    update: function () {
      ticks++;
    },

    render: render,

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (state === 'over') {
        if (button === 'start' || button === 'a') resetGame();
        return;
      }
      if (state === 'won') {
        if (button === 'a') {
          // The 2048 milestone is acknowledged once; play may then continue
          // toward 4096 without reopening the same modal after every slide.
          made2048 = false;
          if (canMove()) state = 'play';
          else {
            state = 'over';
            submitFinalScore();
          }
        } else if (button === 'start') resetGame();
        return;
      }
      if (button === 'start') { resetGame(); return; }
      if (button === 'up' || button === 'down' || button === 'left' || button === 'right') slide(button);
    },

    destroy: function () {
      board = [];
      ctx = null;
    }
  };

  window.Arcade.registerGame(game);
})();
