/*
 * ASTEROIDS — vector-drift shooter for the 20x18 LCD.
 *
 * Left/Right rotate, A thrusts (real inertia + drift), B fires. Rocks split
 * twice when shot, waves get denser, a saucer shows up from wave 2 on.
 * Everything lives in float world-space over the cell grid and wraps.
 *
 * Uses only the frozen Game API: registerGame / ctx / Screen / window.Arcade.
 */
(function () {
  'use strict';

  var COLS = 20;
  var ROWS = 18;
  var TAU = Math.PI * 2;

  // --- tuning -------------------------------------------------------------
  var TURN_SPEED = 3.9;        // rad/s
  var THRUST = 7.5;            // cells/s^2
  var DRAG = 0.995;            // per-tick velocity retention (keeps the drift)
  var MAX_SPEED = 10;          // cells/s
  var SHIP_R = 0.45;

  var BULLET_SPEED = 15;       // cells/s (ship velocity is added on top)
  var BULLET_LIFE = 0.8;       // s
  var MAX_BULLETS = 4;
  var FIRE_COOLDOWN = 0.17;    // s, when holding B

  var RESPAWN_INVULN = 2.4;    // s of blinking safety
  var DEATH_PAUSE = 1.1;       // s between explosion and respawn

  var SIZE_R = [0, 0.42, 0.8, 1.4];      // collision radius by size 1..3
  var SIZE_SCORE = [0, 100, 50, 20];     // small rocks are worth the most
  var UFO_SCORE = 200;
  var EXTRA_LIFE_EVERY = 1000;

  // glyphs (all covered by the shell's 5x7 font)
  var SHADE = String.fromCharCode(0x2593);      // ▓
  var BLOCK = String.fromCharCode(0x2588);      // █
  var LIGHTSHADE = String.fromCharCode(0x2591); // ░
  var DOT = '.';
  var BALL = String.fromCharCode(0x25CF);       // ●
  var HEART = String.fromCharCode(0x2665);      // ♥

  // --- state --------------------------------------------------------------
  var ctx, input, best;
  var state;                   // 'title' | 'play' | 'over'
  var ship, bullets, enemyBullets, rocks, particles, ufo;
  var score, lives, wave, nextLifeAt;
  var fireTimer, waveTimer, deathTimer, overTimer, ufoTimer;
  var ticks, submitted;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function wrap(v, span) {
    v %= span;
    return v < 0 ? v + span : v;
  }

  // shortest separation on a wrapping axis
  function wdelta(a, b, span) {
    var d = a - b;
    if (d > span / 2) d -= span;
    if (d < -span / 2) d += span;
    return d;
  }

  function hits(ax, ay, bx, by, r) {
    var dx = wdelta(ax, bx, COLS);
    var dy = wdelta(ay, by, ROWS);
    return dx * dx + dy * dy < r * r;
  }

  // --- entities -----------------------------------------------------------
  function newShip() {
    return { x: COLS / 2, y: ROWS / 2, vx: 0, vy: 0, a: 0, thrusting: false, invuln: RESPAWN_INVULN };
  }

  function spawnRock(size, x, y, speed, dir) {
    rocks.push({
      x: x, y: y,
      vx: Math.sin(dir) * speed,
      vy: -Math.cos(dir) * speed,
      size: size, r: SIZE_R[size],
    });
  }

  function spawnWaveRocks() {
    var count = Math.min(2 + wave, 6);
    var speed = Math.min(1.1 + wave * 0.18, 2.8);
    for (var i = 0; i < count; i++) {
      var x, y, tries = 0;
      do { // keep new rocks off the ship's back
        x = rand(0, COLS);
        y = rand(1, ROWS);
        tries++;
      } while (tries < 40 && hits(x, y, ship.x, ship.y, 6));
      spawnRock(3, x, y, rand(speed * 0.7, speed), rand(0, TAU));
    }
  }

  function burst(x, y, n, life, glyph, fg) {
    for (var i = 0; i < n; i++) {
      var d = rand(0, TAU), s = rand(2, 6);
      particles.push({
        x: x, y: y,
        vx: Math.sin(d) * s, vy: -Math.cos(d) * s,
        life: rand(life * 0.5, life), glyph: glyph, fg: fg,
      });
    }
  }

  function splitRock(idx) {
    var r = rocks[idx];
    rocks.splice(idx, 1);
    addScore(SIZE_SCORE[r.size]);
    burst(r.x, r.y, r.size * 2 + 1, 0.35, DOT, 'dark');
    if (r.size > 1) {
      var speed = Math.sqrt(r.vx * r.vx + r.vy * r.vy) * 1.35 + 0.5;
      var base = Math.atan2(r.vx, -r.vy);
      spawnRock(r.size - 1, r.x, r.y, speed, base + rand(0.5, 1.4));
      spawnRock(r.size - 1, r.x, r.y, speed, base - rand(0.5, 1.4));
    }
  }

  function addScore(pts) {
    score += pts;
    while (score >= nextLifeAt) {
      nextLifeAt += EXTRA_LIFE_EVERY;
      if (lives < 5) lives++;
    }
  }

  function spawnUfo() {
    var fromLeft = Math.random() < 0.5;
    ufo = {
      x: fromLeft ? -1 : COLS + 1,
      y: rand(2, ROWS - 3),
      vx: (fromLeft ? 1 : -1) * rand(1.8, 2.6),
      baseY: 0, t: 0, shoot: 1.2,
    };
    ufo.baseY = ufo.y;
  }

  function resetUfoTimer() { ufoTimer = rand(9, 16); }

  // --- game flow ----------------------------------------------------------
  function startGame() {
    score = 0;
    lives = 3;
    wave = 0;
    nextLifeAt = EXTRA_LIFE_EVERY;
    ship = newShip();
    bullets = [];
    enemyBullets = [];
    rocks = [];
    particles = [];
    ufo = null;
    fireTimer = 0;
    deathTimer = 0;
    waveTimer = 1.3; // "WAVE 1" banner, then rocks spawn
    wave = 1;
    submitted = false;
    resetUfoTimer();
    state = 'play';
  }

  function killShip() {
    burst(ship.x, ship.y, 10, 0.6, String.fromCharCode(0x2591), 'dark');
    burst(ship.x, ship.y, 6, 0.45, DOT, 'darkest');
    lives--;
    deathTimer = DEATH_PAUSE;
  }

  function endGame() {
    state = 'over';
    overTimer = 0.7; // brief lockout so B-mashing doesn't insta-restart
    if (!submitted) {
      submitted = true;
      ctx.arcade.setBestScore('asteroids', score);
      // Hand off to the shell: high-score name entry, submit, leaderboard, menu.
      ctx.arcade.gameOver(score);
    }
  }

  function fire() {
    if (bullets.length >= MAX_BULLETS || fireTimer > 0) return;
    fireTimer = FIRE_COOLDOWN;
    var dx = Math.sin(ship.a), dy = -Math.cos(ship.a);
    bullets.push({
      x: ship.x + dx * 0.8, y: ship.y + dy * 0.8,
      vx: ship.vx + dx * BULLET_SPEED,
      vy: ship.vy + dy * BULLET_SPEED,
      life: BULLET_LIFE,
    });
    // recoil nudge — tiny, but makes firing feel physical
    ship.vx -= dx * 0.12;
    ship.vy -= dy * 0.12;
  }

  // --- update -------------------------------------------------------------
  function moveWrapped(o, dt) {
    o.x = wrap(o.x + o.vx * dt, COLS);
    o.y = wrap(o.y + o.vy * dt, ROWS);
  }

  function updatePlay(dt) {
    var i, j;

    // wave clear -> banner -> denser wave
    if (rocks.length === 0 && waveTimer <= 0) {
      wave++;
      waveTimer = 1.3;
    }
    if (waveTimer > 0) {
      waveTimer -= dt;
      if (waveTimer <= 0) spawnWaveRocks();
    }

    // ship (alive) or death pause
    if (deathTimer > 0) {
      deathTimer -= dt;
      if (deathTimer <= 0) {
        if (lives <= 0) { endGame(); return; }
        ship = newShip();
      }
    } else {
      if (input.isDown('left')) ship.a -= TURN_SPEED * dt;
      if (input.isDown('right')) ship.a += TURN_SPEED * dt;
      ship.a = (ship.a % TAU + TAU) % TAU;

      ship.thrusting = input.isDown('a');
      if (ship.thrusting) {
        ship.vx += Math.sin(ship.a) * THRUST * dt;
        ship.vy += -Math.cos(ship.a) * THRUST * dt;
        var sp = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
        if (sp > MAX_SPEED) { ship.vx *= MAX_SPEED / sp; ship.vy *= MAX_SPEED / sp; }
      }
      ship.vx *= DRAG;
      ship.vy *= DRAG;
      moveWrapped(ship, dt);
      if (ship.invuln > 0) ship.invuln -= dt;

      if (input.isDown('b')) fire();
    }
    if (fireTimer > 0) fireTimer -= dt;

    // bullets
    for (i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      moveWrapped(b, dt);
      b.life -= dt;
      if (b.life <= 0) { bullets.splice(i, 1); continue; }
      var hit = false;
      for (j = rocks.length - 1; j >= 0; j--) {
        if (hits(b.x, b.y, rocks[j].x, rocks[j].y, rocks[j].r + 0.15)) {
          splitRock(j);
          hit = true;
          break;
        }
      }
      if (!hit && ufo && hits(b.x, b.y, ufo.x, ufo.y, 1.1)) {
        addScore(UFO_SCORE);
        burst(ufo.x, ufo.y, 8, 0.5, DOT, 'darkest');
        ufo = null;
        resetUfoTimer();
        hit = true;
      }
      if (hit) bullets.splice(i, 1);
    }

    // rocks drift
    for (i = 0; i < rocks.length; i++) moveWrapped(rocks[i], dt);

    // saucer
    if (ufo) {
      ufo.t += dt;
      ufo.x += ufo.vx * dt; // deliberately NOT wrapped: it crosses and leaves
      ufo.y = ufo.baseY + Math.sin(ufo.t * 1.7) * 1.6;
      ufo.shoot -= dt;
      if (ufo.shoot <= 0 && deathTimer <= 0) {
        ufo.shoot = 1.6;
        var aim = Math.atan2(wdelta(ship.x, ufo.x, COLS), -wdelta(ship.y, ufo.y, ROWS)) + rand(-0.45, 0.45);
        enemyBullets.push({
          x: ufo.x, y: ufo.y,
          vx: Math.sin(aim) * 7, vy: -Math.cos(aim) * 7,
          life: 2.2,
        });
      }
      if (ufo.x < -2 || ufo.x > COLS + 2) { ufo = null; resetUfoTimer(); }
    } else if (wave >= 2 && rocks.length > 0) {
      ufoTimer -= dt;
      if (ufoTimer <= 0) spawnUfo();
    }

    // enemy bullets
    for (i = enemyBullets.length - 1; i >= 0; i--) {
      var eb = enemyBullets[i];
      moveWrapped(eb, dt);
      eb.life -= dt;
      if (eb.life <= 0) enemyBullets.splice(i, 1);
    }

    // ship collisions
    if (deathTimer <= 0 && ship.invuln <= 0) {
      var dead = false;
      for (i = rocks.length - 1; i >= 0 && !dead; i--) {
        if (hits(ship.x, ship.y, rocks[i].x, rocks[i].y, rocks[i].r + SHIP_R)) {
          splitRock(i); // the rock you rammed breaks too
          dead = true;
        }
      }
      if (!dead && ufo && hits(ship.x, ship.y, ufo.x, ufo.y, 1.0 + SHIP_R)) dead = true;
      for (i = enemyBullets.length - 1; i >= 0 && !dead; i--) {
        if (hits(ship.x, ship.y, enemyBullets[i].x, enemyBullets[i].y, SHIP_R + 0.2)) {
          enemyBullets.splice(i, 1);
          dead = true;
        }
      }
      if (dead) killShip();
    }

    // particles
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      moveWrapped(p, dt);
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // --- render -------------------------------------------------------------
  var SHIP_GLYPHS = [
    String.fromCharCode(0x2191), '/', String.fromCharCode(0x2192), '\\',
    String.fromCharCode(0x2193), '/', String.fromCharCode(0x2190), '\\',
  ];

  function cellAt(screen, x, y, ch, fg) {
    screen.set(wrap(Math.round(x), COLS), wrap(Math.round(y), ROWS), ch, fg);
  }

  // chunky blob: fill every cell whose center is inside the rock's radius
  function drawRock(screen, r) {
    if (r.size === 1) { cellAt(screen, r.x, r.y, BALL, 'dark'); return; }
    var glyph = r.size === 3 ? SHADE : BLOCK;
    var span = Math.ceil(r.r);
    var cx = Math.round(r.x), cy = Math.round(r.y);
    for (var oy = -span; oy <= span; oy++) {
      for (var ox = -span; ox <= span; ox++) {
        var dx = cx + ox - r.x, dy = cy + oy - r.y;
        if (dx * dx + dy * dy < r.r * r.r) {
          screen.set(wrap(cx + ox, COLS), wrap(cy + oy, ROWS), glyph, 'dark');
        }
      }
    }
  }

  function drawShip(screen) {
    if (deathTimer > 0) return;
    if (ship.invuln > 0 && (ticks >> 2) % 2 === 0) return; // blink while safe
    if (ship.thrusting) {
      var fx = ship.x - Math.sin(ship.a) * 1.1;
      var fy = ship.y + Math.cos(ship.a) * 1.1;
      cellAt(screen, fx, fy, (ticks >> 1) % 2 ? LIGHTSHADE : DOT, 'dark');
    }
    var idx = Math.round(ship.a / (TAU / 8)) % 8;
    cellAt(screen, ship.x, ship.y, SHIP_GLYPHS[idx], 'darkest');
  }

  function drawUfo(screen) {
    if (!ufo) return;
    var x = Math.round(ufo.x), y = Math.round(wrap(ufo.y, ROWS));
    screen.set(x - 1, y, '<', 'darkest');
    if (x >= 0 && x < COLS) screen.set(x, y, BLOCK, 'darkest');
    screen.set(x + 1, y, '>', 'darkest');
  }

  function drawHud(screen) {
    screen.text(0, 0, String(score), 'darkest');
    for (var i = 0; i < lives; i++) screen.set(COLS - 1 - i, 0, HEART, 'darkest');
  }

  function renderPlay(screen) {
    var i;
    for (i = 0; i < particles.length; i++) {
      cellAt(screen, particles[i].x, particles[i].y, particles[i].glyph, particles[i].fg);
    }
    for (i = 0; i < rocks.length; i++) drawRock(screen, rocks[i]);
    for (i = 0; i < bullets.length; i++) cellAt(screen, bullets[i].x, bullets[i].y, DOT, 'darkest');
    for (i = 0; i < enemyBullets.length; i++) cellAt(screen, enemyBullets[i].x, enemyBullets[i].y, '*', 'darkest');
    drawUfo(screen);
    drawShip(screen);
    drawHud(screen);
    if (waveTimer > 0 && rocks.length === 0) {
      screen.textCentered(8, 'WAVE ' + wave, 'darkest');
    }
  }

  function renderTitle(screen) {
    // ambient drift behind the title
    for (var i = 0; i < rocks.length; i++) drawRock(screen, rocks[i]);
    screen.textCentered(3, 'ASTEROIDS', 'darkest');
    screen.textCentered(5, SHADE + ' ' + BALL + ' ' + DOT, 'dark');
    var best = ctx.arcade.getBestScore('asteroids');
    if (best > 0) screen.textCentered(7, 'BEST ' + best, 'darkest');
    screen.textCentered(10, String.fromCharCode(0x2190) + String.fromCharCode(0x2192) + ' TURN', 'dark');
    screen.textCentered(11, 'A THRUST B FIRE', 'dark');
    if ((ticks >> 4) % 2 === 0) screen.textCentered(14, 'PRESS START', 'darkest');
  }

  function renderOver(screen) {
    renderPlay(screen);
    screen.textCentered(7, ' GAME  OVER ', 'lightest', 'darkest');
    screen.textCentered(9, ' SCORE ' + score + ' ', 'darkest', 'light');
    if (overTimer <= 0 && (ticks >> 4) % 2 === 0) {
      screen.textCentered(12, 'START: RETRY', 'darkest');
    }
  }

  // --- module -------------------------------------------------------------
  var game = {
    id: 'asteroids',
    title: 'ASTEROIDS',

    init: function (context) {
      ctx = context;
      input = context.input;
      ticks = 0;
      state = 'title';
      // ambient rocks for the title screen
      rocks = [];
      particles = [];
      bullets = [];
      enemyBullets = [];
      ufo = null;
      ship = newShip();
      ship.x = -99; ship.y = -99; // park it far away so spawn checks pass
      wave = 1;
      for (var i = 0; i < 3; i++) spawnRock(3 - (i % 2), rand(0, COLS), rand(0, ROWS), rand(0.6, 1.2), rand(0, TAU));
    },

    update: function (dtMs) {
      var dt = dtMs / 1000;
      ticks++;
      if (state === 'play') {
        updatePlay(dt);
      } else {
        for (var i = 0; i < rocks.length; i++) moveWrapped(rocks[i], dt);
        for (var j = particles.length - 1; j >= 0; j--) {
          var p = particles[j];
          moveWrapped(p, dt);
          p.life -= dt;
          if (p.life <= 0) particles.splice(j, 1);
        }
        if (state === 'over' && overTimer > 0) overTimer -= dt;
      }
    },

    render: function (screen) {
      screen.clear('lightest');
      if (state === 'title') renderTitle(screen);
      else if (state === 'play') renderPlay(screen);
      else renderOver(screen);
    },

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (state === 'title') {
        if (button === 'start' || button === 'a') startGame();
      } else if (state === 'over') {
        if (overTimer <= 0 && (button === 'start' || button === 'a')) startGame();
      } else if (state === 'play') {
        if (button === 'b' && deathTimer <= 0) fire();
      }
    },

    destroy: function () {
      rocks = bullets = enemyBullets = particles = [];
      ufo = null;
    },
  };

  window.Arcade.registerGame(game);
})();
