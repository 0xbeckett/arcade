/*
 * DEMO: CATCH  —  the bundled self-test game.
 * ------------------------------------------------------------------
 * This is NOT one of the 10 arcade games. It exists to prove the whole plugin
 * path works end to end: a GameModule loaded from public/games/<slug>.js
 * registers itself, mounts through init(ctx), reads input, renders on the LCD,
 * ends, and submits a score. It also doubles as a fully-worked reference.
 *
 * Catch the falling blocks with your paddle (LEFT / RIGHT). Hold A to drop
 * faster. Miss 3 and it's game over -> the shell runs the high-score flow.
 *
 * It uses ONLY the frozen public API: the `ctx` handed to init() and the global
 * `window.Arcade`. It never imports anything from the shell.
 */
(function () {
  'use strict';

  var COLS = 20;
  var ROWS = 18;

  var ctx, screen, input;
  var state; // 'title' | 'play' | 'over'
  var paddleX, dropX, dropY, vy, score, lives, flash;

  function reset() {
    paddleX = 8; // left cell of a 4-wide paddle
    score = 0;
    lives = 3;
    vy = 0.16;
    flash = 0;
    spawn();
  }

  function spawn() {
    dropX = 1 + Math.floor(Math.random() * (COLS - 2));
    dropY = 2;
  }

  var game = {
    id: 'demo',
    title: 'DEMO: CATCH',

    init: function (context) {
      ctx = context;
      screen = context.screen;
      input = context.input;
      reset();
      state = 'title';
    },

    update: function (dtMs) {
      var f = dtMs / 16.667; // frames elapsed (≈1 at 60Hz)
      if (flash > 0) flash -= dtMs;
      if (state !== 'play') return;

      // Move the paddle (poll held input).
      if (input.isDown('left')) paddleX -= 0.45 * f;
      if (input.isDown('right')) paddleX += 0.45 * f;
      if (paddleX < 0) paddleX = 0;
      if (paddleX > COLS - 4) paddleX = COLS - 4;

      // The block falls; A makes it plummet.
      dropY += vy * f * (input.isDown('a') ? 2.5 : 1);

      if (dropY >= ROWS - 2) {
        var px = Math.round(paddleX);
        var caught = dropX >= px && dropX <= px + 3;
        if (caught) {
          score += 1;
          vy += 0.012; // speed up a touch each catch
        } else {
          lives -= 1;
          flash = 140;
          if (lives <= 0) {
            gameOver();
            return;
          }
        }
        spawn();
      }
    },

    render: function (s) {
      s.clear('lightest');

      // Header.
      s.fillRect(0, 0, COLS, 1, ' ', 'lightest', 'darkest');
      s.text(1, 0, 'CATCH', 'lightest', 'darkest');
      var sc = 'SCORE ' + score;
      s.text(COLS - 1 - sc.length, 0, sc, 'lightest', 'darkest');

      if (state === 'title') {
        s.textCentered(5, 'DEMO SELF-TEST', 'dark');
        s.rect(2, 7, COLS - 4, 6, 'dark');
        s.textCentered(8, 'CATCH THE', 'darkest');
        s.textCentered(9, 'FALLING BLOCKS', 'darkest');
        s.textCentered(11, 'LEFT/RIGHT MOVE', 'dark');
        var best = ctx.arcade.getBestScore('demo');
        s.textCentered(14, 'BEST ' + best, 'dark');
        s.textCentered(16, 'PRESS A TO START', 'darkest');
        return;
      }

      // Lives.
      for (var i = 0; i < 3; i++) {
        s.set(1 + i, 2, i < lives ? '♥' : '.', 'dark');
      }

      // Falling block.
      var by = Math.round(dropY);
      if (by >= 2 && by < ROWS - 1) s.set(dropX, by, '●', 'darkest');

      // Paddle.
      var px = Math.round(paddleX);
      var bg = flash > 0 && Math.floor(flash / 40) % 2 === 0 ? 'dark' : undefined;
      s.fillRect(px, ROWS - 1, 4, 1, '█', 'darkest', bg);
    },

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (state === 'title' && (button === 'a' || button === 'start')) {
        reset();
        state = 'play';
      }
    },

    destroy: function () {
      // Nothing to clean up. State is module-local and re-init() resets it.
    },
  };

  function gameOver() {
    state = 'over';
    // Hand control back to the shell: it saves the best score, runs name entry
    // if this is a high score, and shows the leaderboard.
    ctx.arcade.gameOver(score);
  }

  // THE registration hook — every game does exactly this.
  window.Arcade.registerGame(game);
})();
