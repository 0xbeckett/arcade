// public/games/breakout.js — BREAKOUT: brick-basher for the 20x18 LCD.
//
// Hold LEFT/RIGHT (or tap the d-pad) to slide the paddle. A / UP / START serves
// the ball; angle off the paddle is set by where the ball lands on it. Clear the
// wall to advance — each level is a fresh layout with a faster ball. 3 lives.
//
// Juice within the dot-matrix palette: crunchy brick debris, screen-shake on
// impact, a full-frame invert "flash" on big beats, and a speed ramp that heats
// the ball up as a life goes on. Ball physics live in float world-space (cells,
// seconds) and are sub-stepped so nothing tunnels through a brick.
//
// Uses only the frozen Game API: window.Arcade.registerGame / ctx / Screen.
(function () {
  'use strict';

  // --- LCD layout ---------------------------------------------------------
  var COLS = 20;
  var ROWS = 18;

  var BRICK_TOP = 2;     // first screen row of the brick field (row 1 is a spacer)
  var BRICK_W = 2;       // each brick is 2 cells wide...
  var BRICK_COLS = 10;   // ...so 10 bricks span the full width
  var MAX_ROWS = 7;      // deepest brick field a level can build

  var TOP_BOUND = 1;     // ball ceiling (just under the HUD row)
  var PADDLE_Y = 16;     // screen row the paddle sits on
  var PADDLE_W = 4;      // paddle width in cells

  // --- feel / physics (cells, seconds; dt arrives in ms) ------------------
  var BALL_R = 0.45;
  var PADDLE_SPEED = 24;       // cells/s — snappy, hold to slide
  var MAX_BOUNCE = 1.05;       // rad — steepest angle off the paddle edge (~60deg)
  var ENGLISH = 0.14;          // how much paddle motion tugs the ball sideways
  var SPEED_L1 = 8.5;          // ball speed at level 1
  var SPEED_PER_LEVEL = 1.15;  // faster every level
  var SPEED_MAX = 20;          // hard ceiling
  var HEAT_PADDLE = 0.35;      // speed gained per paddle hit (the ramp within a life)
  var HEAT_BRICK = 0.12;       // speed gained per brick smashed
  var SUBSTEP = 0.2;           // max cells moved per collision sub-step
  var SERVE_AUTO = 2.6;        // auto-launch after this long parked on the paddle

  var SHAKE_DUR = 0.22;        // seconds a screen-shake lasts
  var FLASH_DUR = 0.14;        // seconds an invert-flash lasts

  // --- glyphs (all in the shell's 5x7 font) -------------------------------
  var BLOCK = String.fromCharCode(0x2588);      // █
  var SHADE = String.fromCharCode(0x2593);      // ▓
  var MED = String.fromCharCode(0x2592);        // ▒
  var LIGHT = String.fromCharCode(0x2591);      // ░
  var BALL = String.fromCharCode(0x25CF);       // ●
  var HEART = String.fromCharCode(0x2665);      // ♥
  var LARROW = String.fromCharCode(0x2190);     // ←
  var RARROW = String.fromCharCode(0x2192);     // →

  // --- palettes (flash = full invert) -------------------------------------
  var PAL_NORMAL = { bg: 'lightest', on: 'darkest', mid: 'dark', soft: 'light' };
  var PAL_FLASH = { bg: 'darkest', on: 'lightest', mid: 'light', soft: 'dark' };
  var pal = PAL_NORMAL;

  // --- state --------------------------------------------------------------
  var ctx, input, best;
  var state;               // 'title' | 'serve' | 'play' | 'clear' | 'over'
  var tick;                // global frame counter (blink / shake jitter)

  var grid, activeRows, bricksLeft;
  var ball, prevX, prevY, trail;
  var paddleX, paddleVel;
  var speed, level, score, lives, combo;
  var particles;

  var serveTimer, clearTimer, overTimer, banner;
  var shakeTime, shakeMag, flashTime;
  var submitted;
  var demo;                // ambient ball for the title attract loop

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // --- level construction -------------------------------------------------
  // Four rotating patterns keep "new layout" honest as levels climb.
  function brickPresent(pattern, r, c, rows) {
    switch (pattern) {
      case 1: return ((r + c) & 1) === 0;                 // checkerboard
      case 2: {                                           // centered pyramid
        var m = Math.min(r, 3);
        return c >= m && c < BRICK_COLS - m;
      }
      case 3: return (c % 3) !== 2;                       // vertical gaps
      default: return true;                               // solid wall
    }
  }

  function buildLevel() {
    var rows = Math.min(4 + Math.floor((level + 1) / 2), MAX_ROWS);
    var pattern = (level - 1) % 4;
    var toughTop = Math.min(Math.floor(level / 2), rows - 1); // top rows take 2 hits
    grid = [];
    bricksLeft = 0;
    for (var r = 0; r < rows; r++) {
      var rowArr = [];
      for (var c = 0; c < BRICK_COLS; c++) {
        if (brickPresent(pattern, r, c, rows)) {
          var hp = r < toughTop ? 2 : 1;
          rowArr.push({ hp: hp, maxHp: hp });
          bricksLeft++;
        } else {
          rowArr.push(null);
        }
      }
      grid.push(rowArr);
    }
    activeRows = rows;
  }

  // --- serving & flow -----------------------------------------------------
  function levelSpeed() {
    return Math.min(SPEED_L1 + (level - 1) * SPEED_PER_LEVEL, SPEED_MAX);
  }

  function toServe() {
    state = 'serve';
    speed = levelSpeed();
    combo = 0;
    serveTimer = 0;
    ball = { x: paddleX + PADDLE_W / 2, y: PADDLE_Y - 1, vx: 0, vy: 0 };
    prevX = ball.x;
    prevY = ball.y;
    trail = [];
  }

  function launch() {
    var a = clamp((ball.x - COLS / 2) / (COLS / 2), -1, 1) * 0.35 + rand(-0.12, 0.12);
    ball.vx = Math.sin(a) * speed;
    ball.vy = -Math.cos(a) * speed;
    state = 'play';
    shake(0.3);
  }

  function startGame() {
    level = 1;
    score = 0;
    lives = 3;
    particles = [];
    paddleX = (COLS - PADDLE_W) / 2;
    paddleVel = 0;
    submitted = false;
    banner = '';
    buildLevel();
    toServe();
  }

  function loseLife() {
    lives--;
    combo = 0;
    burst(ball.x, PADDLE_Y - 0.5, 7, LIGHT, 3.5, -1);
    shake(1.4);
    flash();
    if (lives <= 0) {
      state = 'over';
      overTimer = 0.7; // lockout so a serve-mash doesn't insta-restart
      if (!submitted) {
        submitted = true;
        best = ctx.arcade.setBestScore('breakout', score);
        // Hand off to the shell: high-score name entry, submit, leaderboard, menu.
        ctx.arcade.gameOver(score);
      }
    } else {
      toServe();
    }
  }

  function clearLevel() {
    state = 'clear';
    clearTimer = 1.3;
    banner = 'LEVEL ' + level;
    shake(1.0);
    flash();
  }

  // --- juice --------------------------------------------------------------
  function shake(mag) {
    shakeTime = SHAKE_DUR;
    shakeMag = Math.max(shakeMag * (shakeTime > 0 ? 1 : 0), mag);
  }
  function flash() { flashTime = FLASH_DUR; }

  function burst(x, y, n, glyph, spread, bias) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, Math.PI * 2);
      var s = rand(spread * 0.4, spread);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s + bias, // bias<0 kicks debris upward off a brick
        life: rand(0.25, 0.55),
        glyph: glyph,
      });
    }
  }

  // --- ball helpers -------------------------------------------------------
  function setSpeed(s) {
    var m = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (m < 1e-6) { ball.vx = 0; ball.vy = -s; return; }
    ball.vx *= s / m;
    ball.vy *= s / m;
  }

  // keep the ball from creeping toward a stalled horizontal rally
  function enforceMinAngle() {
    var minV = speed * 0.3;
    if (Math.abs(ball.vy) < minV) {
      ball.vy = (ball.vy < 0 ? -1 : 1) * minV;
      var sgn = ball.vx < 0 ? -1 : 1;
      ball.vx = sgn * Math.sqrt(Math.max(0, speed * speed - ball.vy * ball.vy));
    }
  }

  function hitPaddle() {
    combo = 0;
    var center = paddleX + PADDLE_W / 2;
    var rel = clamp((ball.x - center) / (PADDLE_W / 2), -0.85, 0.85);
    var a = rel * MAX_BOUNCE;
    speed = Math.min(speed + HEAT_PADDLE, SPEED_MAX);
    ball.vx = Math.sin(a) * speed + paddleVel * ENGLISH;
    ball.vy = -Math.abs(Math.cos(a) * speed);
    ball.y = PADDLE_Y - BALL_R;
    setSpeed(speed);
    enforceMinAngle();
    shake(0.3);
    burst(ball.x, PADDLE_Y, 2, LIGHT, 2, -1);
  }

  // damage the brick at grid (gr,gc); reflect using the pre-step position
  function hitBrick(gr, gc) {
    var brick = grid[gr][gc];
    var bl = gc * BRICK_W, br = bl + BRICK_W;
    var bt = BRICK_TOP + gr, bb = bt + 1;

    var insideX = prevX >= bl && prevX < br;
    var insideY = prevY >= bt && prevY < bb;
    if (insideY && !insideX) {                 // came in from a side
      ball.vx = -ball.vx;
      ball.x = ball.vx > 0 ? br + BALL_R : bl - BALL_R;
    } else if (insideX && !insideY) {          // came in from top / bottom
      ball.vy = -ball.vy;
      ball.y = ball.vy > 0 ? bb + BALL_R : bt - BALL_R;
    } else {                                   // corner clip: flip the faster axis
      if (Math.abs(ball.vx) > Math.abs(ball.vy)) { ball.vx = -ball.vx; }
      else { ball.vy = -ball.vy; }
    }

    combo++;
    speed = Math.min(speed + HEAT_BRICK, SPEED_MAX);
    setSpeed(speed);
    enforceMinAngle();

    var cx = bl + BRICK_W / 2, cy = bt + 0.5;
    brick.hp--;
    if (brick.hp > 0) {                        // cracked a tough brick
      score += 5;
      burst(cx, cy, 2, LIGHT, 2.5, 0);
      shake(0.35);
    } else {                                   // smashed it
      grid[gr][gc] = null;
      bricksLeft--;
      var base = 10 + (activeRows - 1 - gr) * 5 + (brick.maxHp >= 2 ? 20 : 0);
      score += base * Math.min(combo, 5);
      burst(cx, cy, 5, MED, 4, -1.5);
      shake(brick.maxHp >= 2 ? 0.8 : 0.55);
      if (bricksLeft <= 0) { clearLevel(); return true; }
    }
    return false;
  }

  // one physics tick: sub-stepped so fast balls don't skip bricks
  function stepBall(dt) {
    var dist = speed * dt;
    var steps = Math.max(1, Math.ceil(dist / SUBSTEP));
    var sdt = dt / steps;
    for (var k = 0; k < steps; k++) {
      prevX = ball.x;
      prevY = ball.y;
      ball.x += ball.vx * sdt;
      ball.y += ball.vy * sdt;

      // walls
      if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); shake(0.25); }
      else if (ball.x + BALL_R > COLS) { ball.x = COLS - BALL_R; ball.vx = -Math.abs(ball.vx); shake(0.25); }
      if (ball.y - BALL_R < TOP_BOUND) { ball.y = TOP_BOUND + BALL_R; ball.vy = Math.abs(ball.vy); shake(0.25); }

      // bricks (ball treated as its center cell)
      var gr = Math.floor(ball.y) - BRICK_TOP;
      var gc = Math.floor(ball.x / BRICK_W);
      if (gr >= 0 && gr < activeRows && gc >= 0 && gc < BRICK_COLS && grid[gr][gc]) {
        if (hitBrick(gr, gc)) return; // level cleared mid-step
      }

      // paddle
      if (ball.vy > 0 &&
          ball.y + BALL_R >= PADDLE_Y && ball.y - BALL_R <= PADDLE_Y + 0.6 &&
          ball.x >= paddleX - 0.15 && ball.x <= paddleX + PADDLE_W + 0.15) {
        hitPaddle();
      }

      // dropped it
      if (ball.y - BALL_R > ROWS - 0.5) { loseLife(); return; }
    }

    // short motion trail for readability at speed
    trail.unshift({ x: ball.x, y: ball.y });
    if (trail.length > 3) trail.pop();
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += 9 * dt; // gravity — debris tumbles down
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > ROWS) particles.splice(i, 1);
    }
  }

  function movePaddle(dt) {
    var dir = (input.isDown('left') ? -1 : 0) + (input.isDown('right') ? 1 : 0);
    paddleVel = dir * PADDLE_SPEED;
    paddleX = clamp(paddleX + paddleVel * dt, 0, COLS - PADDLE_W);
  }

  // --- rendering ----------------------------------------------------------
  var sox = 0, soy = 0; // current screen-shake offset (whole play field)

  function setF(screen, x, y, ch, color) { // shaken field cell
    var px = Math.round(x) + sox, py = Math.round(y) + soy;
    if (px >= 0 && px < COLS && py >= 0 && py < ROWS) screen.set(px, py, ch, color);
  }

  function brickGlyph(brick) { return brick.hp >= 2 ? SHADE : BLOCK; }
  function brickColor(brick, r, c) {
    if (brick.hp >= 2) return pal.on;
    return ((r + c) & 1) ? pal.mid : pal.on; // checker shading reads as separate bricks
  }

  function drawBricks(screen) {
    for (var r = 0; r < activeRows; r++) {
      for (var c = 0; c < BRICK_COLS; c++) {
        var brick = grid[r][c];
        if (!brick) continue;
        var y = BRICK_TOP + r;
        var g = brickGlyph(brick), col = brickColor(brick, r, c);
        for (var i = 0; i < BRICK_W; i++) setF(screen, c * BRICK_W + i, y, g, col);
      }
    }
  }

  function drawPaddle(screen) {
    var x0 = Math.round(paddleX);
    for (var i = 0; i < PADDLE_W; i++) setF(screen, x0 + i, PADDLE_Y, BLOCK, pal.on);
  }

  function drawBall(screen) {
    for (var i = trail.length - 1; i >= 0; i--) {
      setF(screen, trail[i].x, trail[i].y, LIGHT, pal.soft);
    }
    setF(screen, ball.x, ball.y, BALL, pal.on);
  }

  function drawParticles(screen) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      setF(screen, p.x, p.y, p.glyph, p.life > 0.35 ? pal.on : pal.mid);
    }
  }

  function drawHud(screen) {
    var s = String(score);
    screen.text(0, 0, s, pal.on);
    if (state === 'play' && combo >= 2) {
      screen.text(s.length + 1, 0, 'x' + Math.min(combo, 5), pal.mid);
    }
    screen.textCentered(0, 'L' + level, pal.mid);
    var hearts = '';
    for (var i = 0; i < lives; i++) hearts += HEART;
    if (hearts) screen.text(COLS - hearts.length, 0, hearts, pal.on);
  }

  function drawField(screen) {
    drawBricks(screen);
    drawParticles(screen);
    drawPaddle(screen);
    drawBall(screen);
  }

  function drawTitle(screen) {
    // a slim demo wall + a bouncing ball for ambient life
    for (var c = 0; c < BRICK_COLS; c++) {
      setF(screen, c * BRICK_W, 3, (c & 1) ? SHADE : BLOCK, (c & 1) ? pal.mid : pal.on);
      setF(screen, c * BRICK_W + 1, 3, (c & 1) ? SHADE : BLOCK, (c & 1) ? pal.mid : pal.on);
    }
    setF(screen, demo.x, demo.y, BALL, pal.on);

    screen.textCentered(6, 'BREAKOUT', pal.on);
    if (best > 0) screen.textCentered(8, 'BEST ' + best, pal.mid);
    screen.textCentered(11, LARROW + RARROW + ' MOVE', pal.mid);
    screen.textCentered(12, 'A / START: SERVE', pal.mid);
    if ((tick >> 4) % 2 === 0) screen.textCentered(15, 'PRESS START', pal.on);
  }

  function drawOver(screen) {
    drawField(screen);
    screen.fillRect(3, 6, 14, 6, ' ', pal.on, pal.bg);
    screen.rect(3, 6, 14, 6, pal.on, pal.bg);
    screen.textCentered(7, 'GAME OVER', pal.on, pal.bg);
    screen.textCentered(9, 'SCORE ' + score, pal.on, pal.bg);
    if (overTimer <= 0 && (tick >> 4) % 2 === 0) {
      screen.textCentered(10, 'START: RETRY', pal.on, pal.bg);
    }
  }

  // --- GameModule ---------------------------------------------------------
  var game = {
    id: 'breakout',
    title: 'BREAKOUT',

    init: function (context) {
      ctx = context;
      input = context.input;
      tick = 0;
      shakeTime = 0; shakeMag = 0; flashTime = 0;
      best = ctx.arcade.getBestScore('breakout');
      state = 'title';
      level = 1; score = 0; lives = 3; combo = 0;
      particles = [];
      paddleX = (COLS - PADDLE_W) / 2;
      demo = { x: 6, y: 5, vx: 0.16, vy: 0.11 };
    },

    update: function (dtMs) {
      var dt = Math.min(dtMs / 1000, 0.05); // clamp huge frames (tab was backgrounded)
      tick++;

      if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
      if (flashTime > 0) flashTime = Math.max(0, flashTime - dt);

      if (state === 'title') {
        // bounce the attract ball around the panel
        demo.x += demo.vx; demo.y += demo.vy;
        if (demo.x < 0.5 || demo.x > COLS - 1.5) demo.vx = -demo.vx;
        if (demo.y < 4.5 || demo.y > ROWS - 1.5) demo.vy = -demo.vy;
        return;
      }

      if (state === 'over') {
        if (overTimer > 0) overTimer -= dt;
        updateParticles(dt);
        return;
      }

      movePaddle(dt);
      updateParticles(dt);

      if (state === 'serve') {
        ball.x = paddleX + PADDLE_W / 2;
        ball.y = PADDLE_Y - 1;
        serveTimer += dt;
        if (serveTimer >= SERVE_AUTO) launch();
      } else if (state === 'play') {
        stepBall(dt);
      } else if (state === 'clear') {
        clearTimer -= dt;
        if (clearTimer <= 0) { level++; buildLevel(); toServe(); }
      }
    },

    render: function (screen) {
      // pick palette (invert on flash frames) and current shake offset
      pal = (flashTime > 0 && (tick & 1) === 0) ? PAL_FLASH : PAL_NORMAL;
      if (shakeTime > 0) {
        var amp = shakeMag * (shakeTime / SHAKE_DUR);
        sox = Math.round(Math.sin(tick * 3.3) * amp);
        soy = Math.round(Math.cos(tick * 2.7) * amp);
      } else {
        sox = 0; soy = 0; shakeMag = 0;
      }

      screen.clear(pal.bg);

      if (state === 'title') {
        drawTitle(screen);
      } else if (state === 'over') {
        drawOver(screen);
      } else {
        drawField(screen);
        drawHud(screen);
        if (state === 'serve') {
          if ((tick >> 3) % 2 === 0) screen.textCentered(13, 'A: SERVE', pal.on);
        } else if (state === 'clear') {
          screen.textCentered(9, banner, pal.on, pal.bg);
          screen.textCentered(11, 'CLEAR!', pal.mid);
        }
      }
    },

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (state === 'title') {
        if (button === 'start' || button === 'a') startGame();
      } else if (state === 'serve') {
        if (button === 'a' || button === 'up' || button === 'start') launch();
      } else if (state === 'over') {
        if (overTimer <= 0 && (button === 'start' || button === 'a')) startGame();
      }
    },

    destroy: function () {
      grid = null;
      particles = [];
      trail = [];
      ctx = null;
    },
  };

  window.Arcade.registerGame(game);
})();
