/*
 * ARCADE GAME TEMPLATE  —  copy this to public/games/<your-slug>.js
 * ------------------------------------------------------------------
 * Fill in the id, title, and the five lifecycle methods. Then add "<your-slug>"
 * to the "games" array in public/games/manifest.json. That's the whole hook —
 * you never touch the shell, the menu, or the registry.
 *
 * Full docs + Screen/Arcade reference: /docs/GAME_API.md
 * Optional editor types (JSDoc):  /public/games/arcade.d.ts
 */
/** @typedef {import('./arcade').GameModule} GameModule */
/** @typedef {import('./arcade').ArcadeContext} ArcadeContext */
/** @typedef {import('./arcade').Screen} Screen */
/** @typedef {import('./arcade').Button} Button */
(function () {
  'use strict';

  /** @type {ArcadeContext} */
  var ctx;

  /** @type {GameModule} */
  var game = {
    id: 'template', // unique slug, also the leaderboard/storage key
    title: 'TEMPLATE', // shown in the menu

    // Called once when the player selects your game. Set up state here.
    init: function (context) {
      ctx = context;
      // ctx.screen  -> the LCD drawing API (20 x 18 cells)
      // ctx.input   -> input.isDown('up'|'down'|'left'|'right'|'a'|'b'|'start'|'select')
      // ctx.arcade  -> submitScore / getLeaderboard / getBestScore / gameOver
    },

    // Fixed-timestep tick. dtMs is ALWAYS ~16.67 (60Hz). Advance state here.
    update: function (dtMs) {
      // e.g. poll held input:
      // if (ctx.input.isDown('left')) x -= 1;
    },

    // Draw the whole frame every call — the previous frame is not kept.
    render: function (screen) {
      screen.clear('lightest'); // fill with the light tone
      screen.textCentered(8, 'HELLO ARCADE', 'darkest');
      // screen.set(x, y, ch, fg, bg);  screen.text(x, y, str, fg, bg);
      // colors: 'lightest' | 'light' | 'dark' | 'darkest' (or any CSS color)
    },

    // Called on every button edge (press = true, release = false).
    onInput: function (button, pressed) {
      // if (pressed && button === 'a') { ... }
      // When the run ends, submit the score and let the shell take over:
      // ctx.arcade.gameOver(myScore);
    },

    // Called once when your game is unmounted. Release timers/listeners here.
    destroy: function () {},
  };

  // Register with the shell. Do this exactly once, at load time.
  window.Arcade.registerGame(game);
})();
