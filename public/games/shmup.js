/*
 * SHMUP  —  vertical scrolling space shooter.
 * ---------------------------------------------------------------------------
 * A self-contained GameModule for the arcade shell. It plugs into the frozen
 * public API only: the `ctx` handed to init() and the global window.Arcade. It
 * never imports the shell and never touches the DOM.
 *
 *   D-PAD  move the ship (roams the lower field so you can dodge)
 *   A      fire (hold for auto-fire)
 *   START  also fires / starts / retries
 *
 * Waves of enemies descend and weave, spraying bullets you must dodge. Shoot
 * them for points; get hit and lose one of 3 lives. Difficulty escalates every
 * wave and a mini-boss shows up every 5th wave. On death the run ends, the
 * score is submitted, and A / START restarts.
 *
 * Everything is drawn on the 20x18 dot-matrix LCD via the Screen API, kept
 * fast and punchy with a scrolling starfield and lots of little particles.
 */
(function () {
  'use strict';

  var COLS = 20;
  var ROWS = 18;

  // The ship roams the lower band of the field so the top stays a threat zone.
  var SHIP_MIN_Y = 8;
  var SHIP_MAX_Y = 16;
  var SHIP_HOME_Y = 15;

  var SHIP_SPEED = 0.34; // cells / frame at 60Hz
  var BULLET_SPEED = 0.85; // player shots, fast and snappy
  var FIRE_MS = 150; // auto-fire cadence
  var MAX_BULLETS = 6; // on-screen player-shot cap (readability + perf)
  var MAX_EBULLETS = 28;
  var MAX_PARTS = 48;

  // Handles into the shell.
  var ctx, screen, input;

  // Top-level state machine: 'title' | 'play' | 'over'.
  var state;

  // Run state.
  var score, best, newBest, lives, wave;
  var time; // ms accumulator, drives blinking UI

  // Entities. All positions are floating-point cell coordinates.
  var ship; // {x,y,cooldown,invuln,hitFlash,thrust}
  var bullets = []; // player shots: {x,y}
  var ebullets = []; // enemy shots: {x,y,vx,vy}
  var enemies = []; // {type,x,baseX,y,vy,vx,amp,freq,phase,hp,w,h,shoot,shootEvery,aim,scoreVal,glyph,flash,boss}
  var particles = []; // {x,y,vx,vy,life,max}
  var stars = []; // parallax backdrop: {x,y,v}

  // Wave / spawn control.
  var spawnQueue = []; // pending enemies: {t,spec}
  var waveTimer; // ms before the next wave when the field is clear
  var bonusGiven; // wave-clear bonus awarded flag

  // Screen-wide feel: brief flash + shake on big hits.
  var flash, shake, shX, shY;

  // A short centered banner (WAVE n / WARNING / GET READY).
  var bannerText, bannerTimer, bannerWarn;

  // -- helpers ---------------------------------------------------------------

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function addParticle(x, y, vx, vy, life) {
    if (particles.length >= MAX_PARTS) particles.shift();
    particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life });
  }

  function explode(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = rand(0.05, 0.36);
      addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(220, 520));
    }
  }

  function initStars() {
    stars.length = 0;
    for (var i = 0; i < 16; i++) {
      stars.push({ x: rand(0, COLS), y: rand(1, ROWS), v: rand(0.05, 0.24) });
    }
  }

  function resetGame() {
    score = 0;
    lives = 3;
    wave = 0;
    time = 0;
    bullets.length = 0;
    ebullets.length = 0;
    enemies.length = 0;
    particles.length = 0;
    spawnQueue.length = 0;
    ship = { x: 9.5, y: SHIP_HOME_Y, cooldown: 0, invuln: 900, hitFlash: 0, thrust: 0 };
    waveTimer = 700;
    bonusGiven = false;
    flash = 0;
    shake = 0;
    bannerText = 'GET READY';
    bannerTimer = 1100;
    bannerWarn = false;
    newBest = false;
    initStars();
  }

  // -- waves -----------------------------------------------------------------

  function startWave() {
    wave++;
    bonusGiven = false;
    if (wave % 5 === 0) {
      spawnBoss();
    } else {
      buildWave(wave);
      bannerText = 'WAVE ' + wave;
      bannerTimer = 1100;
      bannerWarn = false;
    }
  }

  function buildWave(w) {
    var count = Math.min(3 + w, 9);
    var pattern = (w - 1) % 3; // 0 columns, 1 weave, 2 diagonal drift
    var vy = Math.min(0.045 + w * 0.006, 0.14);
    var stagger = Math.max(520 - w * 22, 220);
    var shootEvery = Math.max(2400 - w * 130, 800);
    var aim = w >= 3;

    for (var i = 0; i < count; i++) {
      var frac = count > 1 ? i / (count - 1) : 0.5;
      var x = 2 + frac * (COLS - 4);
      var r = Math.random();
      var spec;

      var shooterChance = Math.min(0.1 + w * 0.03, 0.4);
      var isShooter = w >= 2 && r < shooterChance;
      var isWeaver = !isShooter && (pattern === 1 || r < 0.4);

      if (isShooter) {
        spec = {
          type: 2, glyph: '▓', x: x, vy: vy * 0.8, hp: 2, scoreVal: 25,
          shootEvery: shootEvery, aim: aim,
        };
      } else if (isWeaver) {
        var amp = 2 + Math.random() * 2;
        spec = {
          type: 1, glyph: '■', x: clamp(x, amp + 1, COLS - 2 - amp),
          vy: vy, hp: 1, scoreVal: 15, amp: amp,
          freq: 0.04 + Math.random() * 0.05, phase: Math.random() * 6.28,
          shootEvery: aim ? shootEvery * 1.6 : 0, aim: aim,
        };
      } else {
        spec = {
          type: 0, glyph: '●', x: x, vy: vy, hp: 1, scoreVal: 10,
          shootEvery: w >= 4 ? shootEvery * 1.8 : 0, aim: false,
        };
      }

      // Diagonal drift replaces the weave for pattern 2.
      if (pattern === 2 && !isShooter) {
        spec.amp = 0;
        spec.freq = 0;
        spec.vx = (i % 2 ? 1 : -1) * (0.03 + w * 0.004);
      }

      spec.y = -1;
      spawnQueue.push({ t: i * stagger, spec: spec });
    }
  }

  function spawnBoss() {
    var hp = 24 + wave * 3;
    spawnQueue.push({
      t: 500,
      spec: {
        type: 3, boss: true, glyph: '▓', x: (COLS - 5) / 2, y: -2,
        vy: 0.05, w: 5, h: 2, hp: hp, scoreVal: 200 + wave * 20,
        shootEvery: Math.max(1300 - wave * 20, 700), aim: true, vx: 0.05,
      },
    });
    bannerText = 'WARNING';
    bannerTimer = 1700;
    bannerWarn = true;
  }

  function spawnEnemy(spec) {
    enemies.push({
      type: spec.type,
      x: spec.x,
      baseX: spec.x,
      y: spec.y != null ? spec.y : -1,
      vy: spec.vy || 0,
      vx: spec.vx || 0,
      amp: spec.amp || 0,
      freq: spec.freq || 0,
      phase: spec.phase || 0,
      hp: spec.hp,
      maxHp: spec.hp,
      w: spec.w || 1,
      h: spec.h || 1,
      shoot: spec.shootEvery ? spec.shootEvery * 0.6 : 0,
      shootEvery: spec.shootEvery || 0,
      aim: !!spec.aim,
      scoreVal: spec.scoreVal,
      glyph: spec.glyph,
      flash: 0,
      boss: !!spec.boss,
    });
  }

  // -- firing ----------------------------------------------------------------

  function firePlayer() {
    if (bullets.length >= MAX_BULLETS) return;
    bullets.push({ x: ship.x, y: ship.y - 1 });
    ship.cooldown = FIRE_MS;
    addParticle(ship.x, ship.y - 0.6, rand(-0.05, 0.05), 0.28, 150);
  }

  function enemyShoot(e) {
    if (ebullets.length >= MAX_EBULLETS) return;
    var sx = e.x;
    var sy = e.y + 0.5;
    var speed = Math.min(0.1 + wave * 0.006, 0.2);
    var vx = 0;
    var vy = speed;
    if (e.aim) {
      var dx = ship.x - sx;
      var dy = ship.y - sy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      vx = (dx / d) * speed;
      vy = Math.abs((dy / d) * speed);
      if (vy < 0.05) vy = 0.05;
    }
    ebullets.push({ x: sx, y: sy, vx: vx, vy: vy });
  }

  function bossShoot(e) {
    var cx = e.x + (e.w - 1) / 2;
    var cy = e.y + e.h;
    var speed = Math.min(0.1 + wave * 0.005, 0.18);
    var n = wave >= 10 ? 5 : 3;
    for (var k = 0; k < n; k++) {
      if (ebullets.length >= MAX_EBULLETS) break;
      var t = k - (n - 1) / 2;
      ebullets.push({ x: cx, y: cy, vx: t * 0.05, vy: speed });
    }
    // One aimed shot to keep the player honest.
    if (ebullets.length < MAX_EBULLETS) {
      var dx = ship.x - cx;
      var dy = ship.y - cy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      ebullets.push({ x: cx, y: cy, vx: (dx / d) * speed, vy: Math.abs((dy / d) * speed) || speed });
    }
  }

  // -- simulation ------------------------------------------------------------

  function updateStars(f) {
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      st.y += st.v * f;
      if (st.y >= ROWS) {
        st.y = 1;
        st.x = rand(0, COLS);
        st.v = rand(0.05, 0.26);
      }
    }
  }

  function updateShip(f, dtMs) {
    if (ship.invuln > 0) ship.invuln -= dtMs;
    if (ship.hitFlash > 0) ship.hitFlash -= dtMs;
    if (ship.cooldown > 0) ship.cooldown -= dtMs;

    var dx = 0;
    var dy = 0;
    if (input.isDown('left')) dx -= 1;
    if (input.isDown('right')) dx += 1;
    if (input.isDown('up')) dy -= 1;
    if (input.isDown('down')) dy += 1;
    ship.x = clamp(ship.x + dx * SHIP_SPEED * f, 0, COLS - 1);
    ship.y = clamp(ship.y + dy * SHIP_SPEED * f, SHIP_MIN_Y, SHIP_MAX_Y);

    // Auto-fire while A (or START) is held.
    if ((input.isDown('a') || input.isDown('start')) && ship.cooldown <= 0) {
      firePlayer();
    }

    // Engine thrust trail.
    ship.thrust -= dtMs;
    if (ship.thrust <= 0) {
      ship.thrust = 90;
      addParticle(ship.x, ship.y + 1, rand(-0.04, 0.04), rand(0.18, 0.34), 260);
    }
  }

  function updateBullets(f) {
    for (var i = bullets.length - 1; i >= 0; i--) {
      bullets[i].y -= BULLET_SPEED * f;
      if (bullets[i].y < -1) bullets.splice(i, 1);
    }
  }

  function updateEbullets(f) {
    for (var i = ebullets.length - 1; i >= 0; i--) {
      var b = ebullets[i];
      b.x += b.vx * f;
      b.y += b.vy * f;
      if (b.y > ROWS + 1 || b.x < -1 || b.x > COLS + 1) ebullets.splice(i, 1);
    }
  }

  function updateEnemies(f, dtMs) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.flash > 0) e.flash -= dtMs;

      if (e.boss) {
        if (e.y < 2) {
          e.y += e.vy * f;
        } else {
          e.y = 2;
          e.x += e.vx * f;
          if (e.x <= 0) {
            e.x = 0;
            e.vx = Math.abs(e.vx);
          } else if (e.x >= COLS - e.w) {
            e.x = COLS - e.w;
            e.vx = -Math.abs(e.vx);
          }
        }
      } else {
        e.y += e.vy * f;
        if (e.amp > 0) {
          e.phase += e.freq * f;
          e.x = e.baseX + e.amp * Math.sin(e.phase);
        } else if (e.vx) {
          e.x += e.vx * f;
          if (e.x < 0.5) {
            e.x = 0.5;
            e.vx = -e.vx;
          } else if (e.x > COLS - 1.5) {
            e.x = COLS - 1.5;
            e.vx = -e.vx;
          }
        }
      }

      // Fire control.
      if (e.shootEvery > 0 && e.y > 0 && e.y < ROWS - 1) {
        e.shoot -= dtMs;
        if (e.shoot <= 0) {
          e.shoot = e.shootEvery + Math.random() * 400;
          if (e.boss) bossShoot(e);
          else enemyShoot(e);
        }
      }

      // Despawn once fully off the bottom.
      if (e.y > ROWS + 1) enemies.splice(i, 1);
    }
  }

  function updateParticles(f, dtMs) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.life -= dtMs;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function hitEnemy(e, bx, by) {
    var rx = Math.round(bx);
    var ry = Math.round(by);
    var ex = Math.round(e.x);
    var ey = Math.round(e.y);
    if (e.boss) return rx >= ex && rx < ex + e.w && ry >= ey && ry < ey + e.h;
    return rx === ex && ry === ey;
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 90;
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    score += e.scoreVal;
    explode(e.x + (e.w - 1) / 2, e.y + (e.h - 1) / 2, e.boss ? 20 : 8);
    shake = Math.max(shake, e.boss ? 380 : 110);
    if (e.boss) flash = Math.max(flash, 200);
    var idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
  }

  function playerHit() {
    lives--;
    ship.invuln = 1400;
    ship.hitFlash = 500;
    flash = Math.max(flash, 220);
    shake = Math.max(shake, 340);
    explode(ship.x, ship.y, 14);
    ebullets.length = 0; // clear the screen of shots — a fair recovery beat
    if (lives <= 0) endRun();
  }

  function endRun() {
    state = 'over';
    if (score > best) {
      best = score;
      newBest = true;
    }
    try {
      ctx.arcade.setBestScore('shmup', score);
    } catch (e) {}
    // Hand off to the shell: high-score name entry, submit, leaderboard, menu.
    ctx.arcade.gameOver(score);
  }

  function handleCollisions() {
    // Player shots vs enemies.
    for (var bi = bullets.length - 1; bi >= 0; bi--) {
      var b = bullets[bi];
      for (var ei = enemies.length - 1; ei >= 0; ei--) {
        var e = enemies[ei];
        if (hitEnemy(e, b.x, b.y)) {
          addParticle(b.x, b.y, rand(-0.12, 0.12), rand(-0.18, 0.05), 130);
          bullets.splice(bi, 1);
          damageEnemy(e, 1);
          break;
        }
      }
    }

    if (ship.invuln > 0) return;

    var sx = Math.round(ship.x);
    var sy = Math.round(ship.y);

    // Enemy shots vs ship.
    for (var i = ebullets.length - 1; i >= 0; i--) {
      if (Math.round(ebullets[i].x) === sx && Math.round(ebullets[i].y) === sy) {
        playerHit();
        return;
      }
    }

    // Enemy bodies vs ship.
    for (var k = enemies.length - 1; k >= 0; k--) {
      if (hitEnemy(enemies[k], ship.x, ship.y)) {
        if (!enemies[k].boss) killEnemy(enemies[k]);
        playerHit();
        return;
      }
    }
  }

  function updateWaves(dtMs) {
    // Instantiate queued enemies as their delays elapse.
    for (var i = spawnQueue.length - 1; i >= 0; i--) {
      spawnQueue[i].t -= dtMs;
      if (spawnQueue[i].t <= 0) {
        spawnEnemy(spawnQueue[i].spec);
        spawnQueue.splice(i, 1);
      }
    }

    // Field clear -> award the wave bonus, breathe, then escalate.
    if (spawnQueue.length === 0 && enemies.length === 0) {
      if (!bonusGiven) {
        bonusGiven = true;
        if (wave > 0) score += 20 * wave;
        waveTimer = 1100;
      }
      waveTimer -= dtMs;
      if (waveTimer <= 0) startWave();
    }
  }

  // -- rendering -------------------------------------------------------------

  function computeShake() {
    if (shake > 0) {
      shX = Math.floor(shake / 50) % 2 ? 1 : -1;
      shY = Math.floor(shake / 80) % 2 ? 1 : 0;
    } else {
      shX = 0;
      shY = 0;
    }
  }

  function drawStars(s) {
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      s.set(Math.round(st.x), Math.round(st.y), '.', st.v > 0.14 ? 'dark' : 'light');
    }
  }

  function drawEnemies(s) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var ex = Math.round(e.x) + shX;
      var ey = Math.round(e.y) + shY;
      if (e.boss) {
        // HP bar just above the hull.
        var frac = Math.max(0, e.hp) / e.maxHp;
        var barW = e.w;
        for (var bx = 0; bx < barW; bx++) {
          var on = bx / barW < frac;
          s.set(ex + bx, ey - 1, on ? '■' : '.', on ? 'darkest' : 'dark');
        }
        var hull = e.flash > 0 ? '█' : '▓';
        for (var jy = 0; jy < e.h; jy++) {
          for (var jx = 0; jx < e.w; jx++) {
            s.set(ex + jx, ey + jy, hull, 'darkest');
          }
        }
        // A pair of "eyes" so the boss reads as a face.
        s.set(ex + 1, ey, '●', 'light');
        s.set(ex + e.w - 2, ey, '●', 'light');
      } else {
        s.set(ex, ey, e.flash > 0 ? '*' : e.glyph, e.type === 2 ? 'dark' : 'darkest');
      }
    }
  }

  function drawEbullets(s) {
    for (var i = 0; i < ebullets.length; i++) {
      s.set(Math.round(ebullets[i].x) + shX, Math.round(ebullets[i].y) + shY, '↓', 'darkest');
    }
  }

  function drawBullets(s) {
    for (var i = 0; i < bullets.length; i++) {
      var by = Math.round(bullets[i].y);
      if (by >= 1) s.set(Math.round(bullets[i].x) + shX, by + shY, '|', 'darkest');
    }
  }

  function drawShip(s) {
    var blink = ship.invuln > 0 && Math.floor(ship.invuln / 90) % 2 === 0;
    if (blink) return;
    s.set(Math.round(ship.x) + shX, Math.round(ship.y) + shY, '↑', ship.hitFlash > 0 ? 'light' : 'darkest');
  }

  function drawParticles(s) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var frac = p.life / p.max;
      var ch = frac > 0.6 ? '*' : frac > 0.3 ? '+' : '.';
      s.set(Math.round(p.x) + shX, Math.round(p.y) + shY, ch, frac > 0.5 ? 'darkest' : 'dark');
    }
  }

  function drawHud(s) {
    s.fillRect(0, 0, COLS, 1, ' ', 'lightest', 'darkest');
    s.text(1, 0, String(score), 'lightest', 'darkest');
    var wl = 'W' + wave;
    s.text(10 - Math.floor(wl.length / 2), 0, wl, 'lightest', 'darkest');
    for (var i = 0; i < 3; i++) {
      s.set(COLS - 1 - i, 0, i < lives ? '♥' : ' ', 'lightest', 'darkest');
    }
  }

  function drawBanner(s) {
    if (bannerTimer <= 0) return;
    if (Math.floor(bannerTimer / 220) % 2 === 0) {
      s.textCentered(8, bannerText, bannerWarn ? 'darkest' : 'dark');
    }
  }

  function drawTitle(s) {
    s.textCentered(2, 'S H M U P', 'darkest');
    s.textCentered(4, 'SPACE SHOOTER', 'dark');
    s.set(9, 6, '↑', 'darkest');
    s.set(6, 6, '●', 'dark');
    s.set(13, 6, '■', 'dark');
    s.textCentered(9, 'D-PAD  MOVE', 'darkest');
    s.textCentered(10, 'A      FIRE', 'darkest');
    s.textCentered(12, 'DODGE + BLAST', 'dark');
    s.textCentered(14, 'BEST ' + best, 'dark');
    if (Math.floor(time / 400) % 2 === 0) s.textCentered(16, 'PRESS A', 'darkest');
  }

  function drawOver(s) {
    s.textCentered(4, 'GAME OVER', 'darkest');
    s.textCentered(6, 'SCORE ' + score, 'darkest');
    if (newBest && Math.floor(time / 300) % 2 === 0) {
      s.textCentered(8, 'NEW BEST!', 'darkest');
    } else {
      s.textCentered(8, 'BEST ' + best, 'dark');
    }
    s.textCentered(10, 'WAVE ' + wave, 'dark');
    if (Math.floor(time / 400) % 2 === 0) s.textCentered(13, 'PRESS A', 'darkest');
    s.textCentered(15, 'TO RETRY', 'dark');
  }

  // -- module ----------------------------------------------------------------

  var game = {
    id: 'shmup',
    title: 'SHMUP',

    init: function (context) {
      ctx = context;
      screen = context.screen;
      input = context.input;
      best = 0;
      try {
        best = ctx.arcade.getBestScore('shmup') || 0;
      } catch (e) {}
      resetGame();
      state = 'title';
    },

    update: function (dtMs) {
      var f = dtMs / 16.667;
      time += dtMs;

      updateStars(f);
      if (flash > 0) flash -= dtMs;
      if (shake > 0) shake -= dtMs;
      if (bannerTimer > 0) bannerTimer -= dtMs;

      if (state !== 'play') return;

      updateShip(f, dtMs);
      updateBullets(f);
      updateEnemies(f, dtMs);
      updateEbullets(f);
      updateParticles(f, dtMs);
      handleCollisions();
      if (state === 'play') updateWaves(dtMs);
    },

    render: function (s) {
      s.clear('lightest');
      computeShake();
      drawStars(s);
      drawEnemies(s);
      drawEbullets(s);
      drawBullets(s);
      if (state === 'play') drawShip(s);
      drawParticles(s);

      if (state === 'title') {
        drawTitle(s);
        return;
      }

      drawHud(s);
      if (state === 'play') drawBanner(s);
      if (state === 'over') drawOver(s);
    },

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (button === 'a' || button === 'start') {
        if (state === 'title') {
          resetGame();
          state = 'play';
          firePlayer();
        } else if (state === 'over') {
          resetGame();
          state = 'play';
        } else if (state === 'play') {
          // Snappy first shot on tap; auto-fire in update() handles held.
          if (ship.cooldown <= 0) firePlayer();
        }
      }
    },

    destroy: function () {
      // State is module-local; init() fully resets it. Nothing external to clean.
      bullets.length = 0;
      ebullets.length = 0;
      enemies.length = 0;
      particles.length = 0;
      spawnQueue.length = 0;
    },
  };

  window.Arcade.registerGame(game);
})();
