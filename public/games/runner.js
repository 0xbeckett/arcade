// public/games/runner.js — RUNNER: endless side-scrolling runner.
// Auto-run right. A = jump (hold for height), DOWN = slide / dive.
// One hit ends the run. Distance is score. Speed ramps forever.
(function () {
  'use strict';

  // --- LCD layout -----------------------------------------------------
  var COLS = 20;
  var GROUND_ROW = 14; // first row of ground fill (14..17)
  var FEET = 13;       // row the player's feet occupy when grounded
  var PX = 3;          // player screen column (fixed; world scrolls)
  var PXL = PX + 0.2;  // player hitbox left/right (slightly forgiving)
  var PXR = PX + 0.8;

  // --- feel / physics (cells, seconds; dt is a fixed 1/60) -------------
  var JUMP_V = 14.5;    // takeoff speed (cells/s)
  var G_RISE_HOLD = 42; // gravity while rising with A held (floaty apex)
  var G_RISE_REL = 115; // gravity while rising after A released
  var G_FALL = 88;      // gravity while falling
  var G_DIVE = 200;     // gravity while falling with DOWN held (fast-fall)
  var JUMP_CUT = 0.5;   // velocity multiplier on early A release
  var V_MAX = 34;       // terminal fall speed
  var COYOTE_TICKS = 7; // ~117ms of grace after running off an edge
  var BUFFER_TICKS = 7; // ~117ms jump input buffer before landing

  // --- speed ramp / scoring -------------------------------------------
  var SPEED_BASE = 8.5;   // cells/s at the start
  var SPEED_GAIN = 0.018; // extra cells/s per cell travelled
  var SPEED_MAX = 21;

  var STANDING_H = 1.7; // hitbox heights (shaved for fairness)
  var SLIDING_H = 0.9;

  // --- state ------------------------------------------------------------
  var ctx = null;
  var state = 'ready'; // 'ready' | 'playing' | 'dead'
  var tick = 0;        // global tick for blinking/animation
  var scrollX = 0;     // world cells scrolled past the left edge
  var speed = SPEED_BASE;
  var score = 0;
  var best = 0;

  var y = FEET;        // player feet row (float)
  var vy = 0;
  var grounded = true;
  var sliding = false;
  var coyote = 0;
  var buffer = 0;
  var deadTicks = 0;
  var readyScroll = 0; // ambient background drift on the title screen

  var obstacles = []; // {type, x (int, world), w, top, bot} sorted by x
  var nextX = 0;      // world x of the next spawn

  // --- helpers ------------------------------------------------------------
  function h32(n) {
    n |= 0;
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
  }

  function reset() {
    scrollX = 0;
    speed = SPEED_BASE;
    score = 0;
    y = FEET;
    vy = 0;
    grounded = true;
    sliding = false;
    coyote = 0;
    buffer = 0;
    deadTicks = 0;
    obstacles.length = 0;
    nextX = 26; // ~2s of clear track before the first obstacle
  }

  function startRun() {
    reset();
    state = 'playing';
  }

  var pool = [];
  function pushN(t, n) { for (var i = 0; i < n; i++) pool.push(t); }

  function spawn() {
    var d = scrollX;
    pool.length = 0;
    pushN('b1', 3);                 // low block: jump
    if (d > 90) pushN('ceil', 2);   // hanging wall: slide under
    if (d > 200) pushN('b2', 2);    // tall block: full jump
    if (d > 330) pushN('gap', 2);   // hole in the ground
    if (d > 460) pushN('b1w', 2);   // wide low block
    var type = pool[(Math.random() * pool.length) | 0];

    var o;
    if (type === 'b1') o = { type: type, w: 1, top: 13, bot: 14 };
    else if (type === 'b2') o = { type: type, w: 1, top: 12, bot: 14 };
    else if (type === 'b1w') o = { type: type, w: 2, top: 13, bot: 14 };
    else if (type === 'ceil') o = { type: type, w: 2, top: -9, bot: 13 };
    else o = { type: 'gap', w: 2 + (Math.random() < 0.45 ? 1 : 0), top: 99, bot: 99 };

    o.x = Math.round(nextX);
    obstacles.push(o);

    var minGap = speed * 0.62 + 2.5; // always reactable at current speed
    nextX = o.x + o.w + minGap + Math.random() * (speed * 0.9 + 5);
  }

  // Is there ground under this world x? (false inside a gap)
  function support(wx) {
    var c = Math.floor(wx) + 0.5;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.type === 'gap' && c >= o.x && c < o.x + o.w) return false;
    }
    return true;
  }

  function die() {
    state = 'dead';
    deadTicks = 0;
    best = ctx.arcade.setBestScore('runner', score);
    try {
      var p = ctx.arcade.submitScore('runner', score);
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* offline mirror handles it */ }
  }

  // --- simulation ------------------------------------------------------
  function updatePlaying(dt) {
    scrollX += speed * dt;
    score = Math.floor(scrollX);
    speed = Math.min(SPEED_MAX, SPEED_BASE + scrollX * SPEED_GAIN);

    while (nextX < scrollX + COLS + 4) spawn();
    while (obstacles.length && obstacles[0].x + obstacles[0].w < scrollX - 3) {
      obstacles.shift();
    }

    if (buffer > 0) buffer--;
    if (coyote > 0) coyote--;
    if (ctx.input.justPressed('a')) buffer = BUFFER_TICKS;

    if (grounded && !support(scrollX + PX + 0.5)) { // ran off a gap edge
      grounded = false;
      coyote = COYOTE_TICKS;
      vy = 0;
    }

    sliding = grounded && ctx.input.isDown('down');

    if (buffer > 0 && (grounded || coyote > 0)) { // jump (cancels slide)
      vy = -JUMP_V;
      grounded = false;
      sliding = false;
      buffer = 0;
      coyote = 0;
    }

    if (!grounded) {
      if (vy < 0 && ctx.input.justReleased('a')) vy *= JUMP_CUT;
      var g = vy < 0
        ? (ctx.input.isDown('a') ? G_RISE_HOLD : G_RISE_REL)
        : (ctx.input.isDown('down') ? G_DIVE : G_FALL);
      vy = Math.min(vy + g * dt, V_MAX);
      y += vy * dt;

      if (vy >= 0 && y >= FEET) {
        if (y <= FEET + 0.45 && support(scrollX + PX + 0.5)) {
          y = FEET;
          vy = 0;
          grounded = true;
        } else if (y + 1 > 15.4) { // fell into a pit
          die();
          return;
        }
      }
    } else {
      y = FEET;
    }

    // one-hit collision vs solid obstacles
    var pb = y + 1;
    var pt = pb - (sliding ? SLIDING_H : STANDING_H);
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.type === 'gap') continue;
      var sx = o.x - scrollX;
      if (sx > PX + 3) break;
      if (sx + 0.12 < PXR && sx + o.w - 0.12 > PXL &&
          pb > o.top + 0.2 && pt < o.bot - 0.2) {
        die();
        return;
      }
    }
  }

  // --- rendering ---------------------------------------------------------
  function drawBackground(s, bg) {
    // far layer: drifting clouds (quarter speed)
    var offFar = Math.floor(bg * 0.25);
    for (var x = 0; x < COLS; x++) {
      var w = offFar + x;
      if (h32(w * 31 + 7) % 6 === 0) s.set(x, 1 + h32(w * 5) % 3, '░', 'light');
    }
    // mid layer: mountain band on the horizon (half speed)
    var offMid = Math.floor(bg * 0.5);
    for (x = 0; x < COLS; x++) {
      var m = offMid + x;
      var hh = h32(((m / 4) | 0) * 97) % 4;
      for (var k = 0; k < hh; k++) {
        s.set(x, 9 - k, k === hh - 1 ? '░' : '▒', 'light');
      }
    }
  }

  function drawGround(s, bg) {
    var base = Math.floor(bg);
    for (var x = 0; x < COLS; x++) {
      var w = base + x;
      if (!support(w + 0.5)) continue; // gap: sky shows through
      // surface with regular ticks so speed reads at a glance
      s.set(x, GROUND_ROW, '█', ((w % 5) === 0) ? 'darkest' : 'dark');
      for (var yy = GROUND_ROW + 1; yy < 18; yy++) {
        if (h32(w * 13 + yy * 7) % 7 === 0) s.set(x, yy, '░', 'dark');
      }
    }
  }

  function drawObstacles(s) {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.type === 'gap') continue; // rendered as missing ground
      var c0 = Math.round(o.x - scrollX);
      for (var dx = 0; dx < o.w; dx++) {
        var x = c0 + dx;
        if (x < 0 || x >= COLS) continue;
        if (o.type === 'ceil') {
          for (var yy = 1; yy <= 12; yy++) s.set(x, yy, yy <= 3 ? '▓' : '█', 'darkest');
        } else {
          for (yy = o.top; yy < 14; yy++) s.set(x, yy, '█', 'darkest');
        }
      }
    }
  }

  function drawPlayer(s, flash) {
    var fg = flash ? (((tick / 4) | 0) % 2 ? 'light' : 'darkest') : 'darkest';
    var fr = Math.round(y);
    if (sliding) {
      s.set(PX, fr, '■', fg);
      s.set(PX - 1, fr, '░', 'dark'); // slide dust
    } else {
      s.set(PX, fr - 1, '●', fg);
      s.set(PX, fr, '█', fg);
      if (grounded && state === 'playing' && tick % 8 < 4) {
        s.set(PX - 1, FEET, '░', 'dark'); // run dust
      }
    }
  }

  function drawHud(s) {
    s.fillRect(0, 0, COLS, 1, ' ', 'lightest', 'darkest');
    s.text(1, 0, String(score), 'lightest', 'darkest');
    var hi = 'HI ' + Math.max(best, score);
    s.text(COLS - 1 - hi.length, 0, hi, 'lightest', 'darkest');
  }

  function drawReady(s) {
    s.textCentered(3, 'R U N N E R', 'darkest');
    s.textCentered(5, '>> AUTO RUN >>', 'dark');
    s.textCentered(7, 'A: JUMP', 'darkest');
    s.textCentered(8, 'HOLD A: HIGHER', 'darkest');
    s.textCentered(9, '↓: SLIDE', 'darkest');
    if (best > 0) s.textCentered(11, 'BEST ' + best, 'dark');
    if (tick % 40 < 26) s.textCentered(12, 'PRESS A', 'darkest');
  }

  function drawDead(s) {
    s.fillRect(2, 4, 16, 9, ' ', 'darkest', 'lightest');
    s.rect(2, 4, 16, 9, 'darkest', 'lightest');
    s.textCentered(5, 'GAME OVER', 'darkest', 'lightest');
    s.textCentered(7, 'SCORE ' + score, 'darkest', 'lightest');
    s.textCentered(8, 'BEST  ' + best, 'darkest', 'lightest');
    if (tick % 30 < 20) s.textCentered(10, 'A: RUN AGAIN', 'darkest', 'lightest');
  }

  // --- GameModule --------------------------------------------------------
  var game = {
    id: 'runner',
    title: 'RUNNER',

    init: function (context) {
      ctx = context;
      state = 'ready';
      tick = 0;
      readyScroll = 0;
      best = ctx.arcade.getBestScore('runner');
      reset();
    },

    update: function (dtMs) {
      var dt = dtMs / 1000;
      tick++;

      if (state === 'ready') {
        readyScroll += 3 * dt;
        if (ctx.input.justPressed('a') || ctx.input.justPressed('start')) startRun();
      } else if (state === 'playing') {
        updatePlaying(dt);
      } else { // dead
        deadTicks++;
        if (deadTicks >= 20 &&
            (ctx.input.justPressed('a') || ctx.input.justPressed('start'))) {
          startRun();
        }
      }
    },

    render: function (screen) {
      screen.clear('lightest');
      var bg = state === 'ready' ? readyScroll : scrollX;
      drawBackground(screen, bg);
      drawGround(screen, bg);
      drawObstacles(screen);
      if (state !== 'ready') drawPlayer(screen, state === 'dead');
      drawHud(screen);
      if (state === 'ready') drawReady(screen);
      else if (state === 'dead' && deadTicks > 14) drawDead(screen);
    },

    onInput: function (button, pressed) {
      // discrete actions are handled by edge-polling in update();
      // nothing extra needed here.
    },

    destroy: function () {
      ctx = null;
    },
  };

  window.Arcade.registerGame(game);
})();
