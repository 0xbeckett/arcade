// public/games/snake.js — SNAKE for the 20 x 18 Game Boy LCD.
// Steer with the d-pad. Eat dots, grow, and survive as the clock accelerates.
(function () {
  'use strict';

  var COLS = 20;
  var ROWS = 18;
  // A one-cell bezel leaves the board easy to read on the small LCD.
  var LEFT = 1;
  var RIGHT = COLS - 2;
  var TOP = 3;
  var BOTTOM = ROWS - 2;
  var BASE_STEP = 150;
  var FASTEST_STEP = 62;
  var POINTS_PER_FOOD = 10;

  var BLOCK = String.fromCharCode(0x2588); // █
  var SHADE = String.fromCharCode(0x2593); // ▓
  var DOT = String.fromCharCode(0x25CF);   // ●
  var ARROWS = String.fromCharCode(0x2190) + String.fromCharCode(0x2192);

  var ctx;
  var state;
  var snake;
  var food;
  var direction;
  var pendingDirection;
  var score;
  var best;
  var stepTimer;
  var foodPulse;
  var ticks;
  var submitted;

  function same(a, b) { return a.x === b.x && a.y === b.y; }

  function opposite(a, b) {
    return a.x + b.x === 0 && a.y + b.y === 0;
  }

  function occupied(x, y) {
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].x === x && snake[i].y === y) return true;
    }
    return false;
  }

  function placeFood() {
    // The board can never fill in a normal run, but this bounded random pass
    // also guarantees that food is never placed in the snake.
    var width = RIGHT - LEFT + 1;
    var height = BOTTOM - TOP + 1;
    var x, y, tries = 0;
    do {
      x = LEFT + ((Math.random() * width) | 0);
      y = TOP + ((Math.random() * height) | 0);
      tries++;
    } while (occupied(x, y) && tries < width * height * 2);

    if (occupied(x, y)) {
      for (y = TOP; y <= BOTTOM; y++) {
        for (x = LEFT; x <= RIGHT; x++) {
          if (!occupied(x, y)) { food = { x: x, y: y }; return; }
        }
      }
    }
    food = { x: x, y: y };
  }

  function resetGame() {
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 }
    ];
    direction = { x: 1, y: 0 };
    pendingDirection = null;
    score = 0;
    stepTimer = 0;
    foodPulse = 0;
    submitted = false;
    placeFood();
    state = 'play';
  }

  function stepDelay() {
    // Each meal trims a few milliseconds; the cap keeps touch controls fair.
    return Math.max(FASTEST_STEP, BASE_STEP - (score / POINTS_PER_FOOD) * 4);
  }

  function submitFinalScore() {
    if (submitted) return;
    submitted = true;
    if (ctx && ctx.arcade && ctx.arcade.setBestScore) {
      best = ctx.arcade.setBestScore('snake', score);
    }
    // Hand off to the shell: it runs high-score name entry, submits the score,
    // shows the leaderboard, then returns to the menu.
    ctx.arcade.gameOver(score);
  }

  function endGame() {
    state = 'over';
    submitFinalScore();
  }

  function moveSnake() {
    if (pendingDirection) {
      direction = pendingDirection;
      pendingDirection = null;
    }

    var head = snake[0];
    var next = { x: head.x + direction.x, y: head.y + direction.y };
    var ate = same(next, food);

    // A move into the departing tail is legal unless this move grows the snake.
    var collisionLength = snake.length - (ate ? 0 : 1);
    if (next.x < LEFT || next.x > RIGHT || next.y < TOP || next.y > BOTTOM) {
      endGame();
      return;
    }
    for (var i = 0; i < collisionLength; i++) {
      if (same(next, snake[i])) { endGame(); return; }
    }

    snake.unshift(next);
    if (ate) {
      score += POINTS_PER_FOOD;
      foodPulse = 1;
      placeFood();
    } else {
      snake.pop();
    }
  }

  function steer(button) {
    var wanted = null;
    if (button === 'up') wanted = { x: 0, y: -1 };
    else if (button === 'down') wanted = { x: 0, y: 1 };
    else if (button === 'left') wanted = { x: -1, y: 0 };
    else if (button === 'right') wanted = { x: 1, y: 0 };
    if (!wanted || state !== 'play') return;

    // Test against the effective direction, allowing a quick corner but never
    // allowing two mobile d-pad events to reverse straight into the body.
    var effective = pendingDirection || direction;
    if (!opposite(wanted, effective)) pendingDirection = wanted;
  }

  function drawBoard(screen) {
    screen.clear('lightest');
    // Subtle dot-matrix field and a dark, chunky bezel around the play area.
    for (var y = TOP; y <= BOTTOM; y++) {
      for (var x = LEFT; x <= RIGHT; x++) {
        if (((x * 7 + y * 11) % 13) === 0) screen.set(x, y, '░', 'light');
      }
    }
    screen.hline(0, 2, COLS, BLOCK, 'darkest');
    screen.hline(0, 17, COLS, BLOCK, 'darkest');
    screen.vline(0, 2, 16, BLOCK, 'darkest');
    screen.vline(19, 2, 16, BLOCK, 'darkest');
  }

  function drawHud(screen) {
    var hi = Math.max(best || 0, score || 0);
    screen.text(0, 0, 'SCORE ' + score, 'darkest');
    var highText = 'HI ' + hi;
    screen.text(COLS - highText.length, 0, highText, 'dark');
    screen.hline(0, 1, COLS, '-', 'light');
  }

  function drawSnake(screen) {
    for (var i = snake.length - 1; i >= 0; i--) {
      var part = snake[i];
      var glyph = i === 0 ? DOT : (i % 3 === 0 ? SHADE : BLOCK);
      var tone = i === 0 ? 'darkest' : (i % 2 === 0 ? 'dark' : 'darkest');
      screen.set(part.x, part.y, glyph, tone);
    }
    var foodGlyph = foodPulse > 0 && (ticks & 2) ? SHADE : DOT;
    screen.set(food.x, food.y, foodGlyph, foodPulse > 0 ? 'darkest' : 'dark');
  }

  function drawTitle(screen) {
    screen.clear('lightest');
    // A miniature crawling snake gives the title a little LCD life.
    screen.textCentered(3, 'S N A K E', 'darkest');
    screen.textCentered(5, DOT + BLOCK + BLOCK + SHADE + '  ' + DOT, 'dark');
    if (best > 0) screen.textCentered(7, 'BEST ' + best, 'dark');
    screen.textCentered(10, ARROWS + ' D-PAD STEERS', 'darkest');
    screen.textCentered(11, 'EAT DOTS. GROW.', 'dark');
    if ((ticks >> 4) % 2 === 0) screen.textCentered(14, 'START / A: PLAY', 'darkest');
  }

  function drawOver(screen) {
    drawBoard(screen);
    drawSnake(screen);
    screen.fillRect(2, 6, 16, 7, ' ', 'lightest', 'lightest');
    screen.rect(2, 6, 16, 7, 'darkest', 'lightest');
    screen.textCentered(7, 'GAME OVER', 'darkest', 'lightest');
    screen.textCentered(9, 'SCORE ' + score, 'darkest', 'lightest');
    if ((ticks >> 4) % 2 === 0) screen.textCentered(11, 'START/A: AGAIN', 'dark', 'lightest');
  }

  var game = {
    id: 'snake',
    title: 'SNAKE',

    init: function (context) {
      ctx = context;
      state = 'title';
      snake = [];
      score = 0;
      best = ctx.arcade.getBestScore ? ctx.arcade.getBestScore('snake') : 0;
      ticks = 0;
      submitted = false;
    },

    update: function (dtMs) {
      ticks++;
      if (state !== 'play') return;
      var dt = Math.min(dtMs, 100); // a resumed mobile tab must not skip a board.
      stepTimer += dt;
      foodPulse = Math.max(0, foodPulse - dt / 260);
      while (stepTimer >= stepDelay() && state === 'play') {
        stepTimer -= stepDelay();
        moveSnake();
      }
    },

    render: function (screen) {
      if (state === 'title') {
        drawTitle(screen);
      } else if (state === 'over') {
        drawOver(screen);
      } else {
        drawBoard(screen);
        drawSnake(screen);
        drawHud(screen);
      }
    },

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (state === 'title' || state === 'over') {
        if (button === 'start' || button === 'a') resetGame();
        return;
      }
      steer(button);
    },

    destroy: function () {
      snake = [];
      food = null;
      pendingDirection = null;
      ctx = null;
    }
  };

  window.Arcade.registerGame(game);
})();
