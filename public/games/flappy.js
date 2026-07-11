// public/games/flappy.js — FLAPPY: one-button tap-to-fly.
// A (or UP) flaps; gravity pulls you down. Thread the gaps in the walls.
// +1 per gap cleared. Touch a wall, the floor, or the ceiling and you drop.
// A / START restarts instantly.
(function () {
  'use strict';

  // --- LCD layout (20 x 18 dot-matrix) --------------------------------
  var COLS = 20;
  var ROWS = 18;
  var HUD_ROW = 0;      // score / best live on the top row
  var SKY_TOP = 1;      // first playable sky row
  var GROUND_TOP = 16;  // rows 16..17 are ground fill
  var BX = 5;           // bird column (fixed; the world scrolls past it)
  var BIRD_RX = 0.42;   // bird half-width  (forgiving hitbox)
  var BIRD_RY = 0.42;   // bird half-height

  // Death boundaries for the bird's centre row.
  var CEIL_Y = SKY_TOP + 0.1;      // ram the ceiling -> dead
  var FLOOR_Y = GROUND_TOP - 0.5;  // touch the ground -> dead

  // --- feel / physics (cells, seconds; dt clamped near 1/60) ----------
  var GRAVITY = 52;     // downward accel (cells/s^2)
  var FLAP_V = 15;      // instant upward velocity on a tap (cells/s)
  var MAX_FALL = 24;    // terminal fall speed

  // --- walls / scroll / difficulty ------------------------------------
  var WALL_W = 2;         // wall thickness in columns
  var GAP_BASE = 6;       // opening height (rows) at the start
  var GAP_MIN = 5;        // tightest opening at high score
  var SPACING = 9;        // horizontal cells between wall centres
  var SCROLL_BASE = 7.5;  // world speed at score 0 (cells/s)
  var SCROLL_MAX = 11;    // capped world speed
  var SCROLL_GAIN = 0.16; // added cells/s per point scored
  var GAP_TOP_MIN = 2;                         // highest a gap can start
  var MAX_GAP_STEP = 5;   // clamp gap-to-gap vertical jump (keeps it fair)
  var FIRST_WALL_X = COLS + 6;  // runway before the first wall

  // --- state ----------------------------------------------------------
  var ctx = null;
  var state = 'ready';  // 'ready' | 'playing' | 'dead'
  var tick = 0;         // global animation tick
  var score = 0;
  var best = 0;
  var y = 0;            // bird centre row (float)
  var vy = 0;           // bird vertical velocity (cells/s)
  var flapAnim = 0;     // frames remaining of the flap pose
  var deadTicks = 0;
  var scroll = SCROLL_BASE;
  var driftX = 0;       // ambient background scroll (also used on menus)
  var walls = [];       // {x (float screen col of left edge), gapTop, gapH, scored}

  // --- helpers --------------------------------------------------------
  function h32(n) {
    n |= 0;
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
  }

  function gapHeight() {
    // shrink the opening a touch as the score climbs, but never below GAP_MIN
    return Math.max(GAP_MIN, GAP_BASE - Math.floor(score / 12));
  }

  // highest valid gapTop so the whole opening stays above the ground
  function gapTopMax(gapH) {
    return GROUND_TOP - gapH - 1;
  }

  function makeWall(x, prevTop) {
    var gapH = gapHeight();
    var lo = GAP_TOP_MIN;
    var hi = gapTopMax(gapH);
    if (hi < lo) hi = lo;
    // keep consecutive gaps within a reachable vertical step of each other
    if (prevTop != null) {
      lo = Math.max(lo, prevTop - MAX_GAP_STEP);
      hi = Math.min(hi, prevTop + MAX_GAP_STEP);
      if (hi < lo) hi = lo;
    }
    var gapTop = lo + Math.floor(Math.random() * (hi - lo + 1));
    return { x: x, gapTop: gapTop, gapH: gapH, scored: false };
  }

  function reset() {
    score = 0;
    y = (SKY_TOP + GROUND_TOP) / 2; // start mid-sky
    vy = 0;
    flapAnim = 0;
    deadTicks = 0;
    scroll = SCROLL_BASE;
    walls.length = 0;
    walls.push(makeWall(FIRST_WALL_X, null));
  }

  function startGame() {
    reset();
    state = 'playing';
    flap(); // first tap pops the bird up immediately -> feels responsive
  }

  function flap() {
    vy = -FLAP_V;
    flapAnim = 6;
  }

  function die() {
    if (state !== 'playing') return;
    state = 'dead';
    deadTicks = 0;
    best = ctx.arcade.setBestScore('flappy', score);
    try {
      var p = ctx.arcade.submitScore('flappy', score);
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* offline leaderboard mirror handles it */ }
  }

  // --- simulation -----------------------------------------------------
  function updatePlaying(dt) {
    if (ctx.input.justPressed('a') || ctx.input.justPressed('up')) flap();
    if (flapAnim > 0) flapAnim--;

    // integrate gravity
    vy = Math.min(vy + GRAVITY * dt, MAX_FALL);
    y += vy * dt;

    // ceiling / floor are lethal
    if (y <= CEIL_Y) { y = CEIL_Y; die(); return; }
    if (y >= FLOOR_Y) { y = FLOOR_Y; die(); return; }

    // scroll the world; speed ramps gently with score
    scroll = Math.min(SCROLL_MAX, SCROLL_BASE + score * SCROLL_GAIN);
    for (var i = 0; i < walls.length; i++) walls[i].x -= scroll * dt;

    // recycle off-screen walls, keep the pipeline full at even spacing
    while (walls.length && walls[0].x + WALL_W < -1) walls.shift();
    var last = walls[walls.length - 1];
    if (!last || last.x <= COLS - SPACING) {
      walls.push(makeWall((last ? last.x : COLS) + SPACING, last ? last.gapTop : null));
    }

    // scoring + collision against every nearby wall
    var bl = BX - BIRD_RX, br = BX + BIRD_RX;
    var bt = y - BIRD_RY, bb = y + BIRD_RY;
    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      var wl = w.x, wr = w.x + WALL_W;
      // count the point once the bird has fully passed the wall
      if (!w.scored && wr < bl) { w.scored = true; score++; }
      // horizontal overlap?
      if (br > wl && bl < wr) {
        var openTop = w.gapTop;
        var openBot = w.gapTop + w.gapH;
        if (bt < openTop || bb > openBot) { die(); return; }
      }
    }
  }

  // --- rendering ------------------------------------------------------
  function drawBackground(s, drift) {
    // sparse drifting dots -> the classic dot-matrix haze
    var off = Math.floor(drift);
    for (var x = 0; x < COLS; x++) {
      var wx = off + x;
      var col = h32(wx * 131 + 17);
      // one faint speck per column, parked on a stable-ish row
      var ry = 2 + (col % 12);
      if ((col >> 8) % 5 === 0 && ry < GROUND_TOP) s.set(x, ry, '·', 'light');
      // occasional low cloud band, half speed
      var cw = Math.floor(drift * 0.5) + x;
      if (h32(cw * 71) % 11 === 0) {
        var cy = 3 + h32(cw * 3) % 3;
        s.set(x, cy, '▒', 'light');
        if (x + 1 < COLS) s.set(x + 1, cy, '░', 'light');
      }
    }
  }

  function drawGround(s, drift) {
    var base = Math.floor(drift);
    for (var x = 0; x < COLS; x++) {
      var wx = base + x;
      // surface line with moving ticks so the speed reads at a glance
      s.set(x, GROUND_TOP, '█', (wx % 4 === 0) ? 'darkest' : 'dark');
      for (var yy = GROUND_TOP + 1; yy < ROWS; yy++) {
        s.set(x, yy, (h32(wx * 13 + yy * 7) % 3 === 0) ? '▓' : '█', 'darkest');
      }
    }
  }

  function drawWalls(s) {
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var c0 = Math.round(w.x);
      var openTop = w.gapTop;
      var openBot = w.gapTop + w.gapH;
      for (var dx = 0; dx < WALL_W; dx++) {
        var x = c0 + dx;
        if (x < 0 || x >= COLS) continue;
        // top pillar
        for (var yy = SKY_TOP; yy < openTop; yy++) {
          s.set(x, yy, yy === openTop - 1 ? '▓' : '█', 'darkest');
        }
        // bottom pillar
        for (yy = openBot; yy < GROUND_TOP; yy++) {
          s.set(x, yy, yy === openBot ? '▓' : '█', 'darkest');
        }
      }
      // a lit inner edge on the left column reads as a rounded pipe lip
      if (c0 >= 0 && c0 < COLS) {
        if (openTop - 1 >= SKY_TOP) s.set(c0, openTop - 1, '▒', 'dark');
        if (openBot < GROUND_TOP) s.set(c0, openBot, '▒', 'dark');
      }
    }
  }

  function drawBird(s, flash) {
    var fr = Math.round(y);
    if (flash && ((tick >> 2) & 1)) return; // blink on death
    var fg = 'darkest';
    // puff of air left of the bird just after a flap
    if (flapAnim > 3 && BX - 1 >= 0) s.set(BX - 1, fr, '░', 'dark');
    s.set(BX, fr, '●', fg);
  }

  function drawHud(s) {
    s.text(1, HUD_ROW, String(score), 'darkest');
    var hi = 'HI ' + Math.max(best, score);
    s.text(COLS - hi.length - 1, HUD_ROW, hi, 'dark');
  }

  function drawReady(s) {
    s.fillRect(2, 3, 16, 9, ' ', 'darkest', 'lightest');
    s.rect(2, 3, 16, 9, 'darkest', 'lightest');
    s.textCentered(4, 'F L A P P Y', 'darkest', 'lightest');
    s.textCentered(6, 'A / UP: FLAP', 'darkest', 'lightest');
    s.textCentered(7, 'MIND THE GAP', 'dark', 'lightest');
    if (best > 0) s.textCentered(9, 'BEST ' + best, 'dark', 'lightest');
    if (tick % 40 < 26) s.textCentered(10, 'PRESS A', 'darkest', 'lightest');
  }

  function drawDead(s) {
    s.fillRect(2, 4, 16, 9, ' ', 'darkest', 'lightest');
    s.rect(2, 4, 16, 9, 'darkest', 'lightest');
    s.textCentered(5, 'GAME OVER', 'darkest', 'lightest');
    s.textCentered(7, 'SCORE ' + score, 'darkest', 'lightest');
    s.textCentered(8, 'BEST  ' + best, 'darkest', 'lightest');
    if (tick % 30 < 20) s.textCentered(10, 'A: RETRY', 'darkest', 'lightest');
  }

  // --- GameModule -----------------------------------------------------
  var game = {
    id: 'flappy',
    title: 'FLAPPY',

    init: function (context) {
      ctx = context;
      state = 'ready';
      tick = 0;
      driftX = 0;
      best = ctx.arcade.getBestScore('flappy');
      reset();
    },

    update: function (dtMs) {
      // clamp dt so a stalled tab can't teleport the bird through a wall
      var dt = Math.min(dtMs, 50) / 1000;
      tick++;
      driftX += SCROLL_BASE * 0.5 * dt;

      if (state === 'ready') {
        if (ctx.input.justPressed('a') || ctx.input.justPressed('up') ||
            ctx.input.justPressed('start')) {
          startGame();
        }
      } else if (state === 'playing') {
        updatePlaying(dt);
        driftX = 0; // ground/background derive their scroll from walls while playing
      } else { // dead
        deadTicks++;
        if (deadTicks >= 14 &&
            (ctx.input.justPressed('a') || ctx.input.justPressed('up') ||
             ctx.input.justPressed('start'))) {
          startGame();
        }
      }
    },

    render: function (screen) {
      screen.clear('lightest');
      // while playing, tie the parallax to distance travelled; on menus, drift
      var travelled = state === 'playing'
        ? (FIRST_WALL_X - (walls.length ? walls[0].x : FIRST_WALL_X)) + score * SPACING
        : driftX;
      drawBackground(screen, travelled);
      drawGround(screen, travelled);
      drawWalls(screen);
      if (state !== 'ready') drawBird(screen, state === 'dead');
      drawHud(screen);
      if (state === 'ready') drawReady(screen);
      else if (state === 'dead' && deadTicks > 10) drawDead(screen);
    },

    onInput: function (button, pressed) {
      // discrete actions are edge-polled in update(); nothing to do here
    },

    destroy: function () {
      ctx = null;
      walls.length = 0;
    },
  };

  window.Arcade.registerGame(game);
})();
