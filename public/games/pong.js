// public/games/pong.js — single-player PONG against a fallible CPU.
// D-pad UP/DOWN moves the left paddle. First player to 11 wins.
(function () {
  'use strict';

  var COLS = 20;
  var ROWS = 18;
  var COURT_TOP = 2;
  var COURT_BOTTOM = 17;
  var PADDLE_H = 3;
  var PADDLE_X = 1;
  var CPU_X = 18;
  var PADDLE_W = 0.7;
  var BALL_R = 0.28;
  var PLAYER_SPEED = 13;
  var CPU_SPEED = 6.8;
  var START_SPEED = 8.2;
  var SPEED_PER_RETURN = 0.48;
  var MAX_SPEED = 15.5;
  var WIN_SCORE = 11;
  var BLOCK = String.fromCharCode(0x2588); // █
  var DOT = String.fromCharCode(0x25CF);   // ●
  var SHADE = String.fromCharCode(0x2591); // ░

  var ctx, input;
  var state, score, cpuScore, rally, tick, serveDelay, serveDirection;
  var playerY, cpuY, playerVelocity, cpuTarget, cpuThink;
  var ball, ballSpeed, submitted, winner, best;

  function clamp(value, low, high) {
    return value < low ? low : (value > high ? high : value);
  }

  function randomBetween(low, high) {
    return low + Math.random() * (high - low);
  }

  function paddleMax() {
    return COURT_BOTTOM - PADDLE_H;
  }

  function newBall() {
    ball = { x: COLS / 2, y: (COURT_TOP + COURT_BOTTOM) / 2, vx: 0, vy: 0 };
    ballSpeed = START_SPEED;
    rally = 0;
  }

  function resetMatch() {
    score = 0;
    cpuScore = 0;
    playerY = (COURT_TOP + COURT_BOTTOM - PADDLE_H) / 2;
    cpuY = playerY;
    playerVelocity = 0;
    cpuTarget = cpuY + PADDLE_H / 2;
    cpuThink = 0;
    serveDirection = Math.random() < 0.5 ? -1 : 1;
    serveDelay = 0.75;
    submitted = false;
    winner = '';
    newBall();
    state = 'serve';
  }

  function launchBall() {
    // A slightly angled serve prevents long, dull horizontal openings.
    var angle = randomBetween(-0.38, 0.38);
    ball.vx = serveDirection * Math.cos(angle) * ballSpeed;
    ball.vy = Math.sin(angle) * ballSpeed;
    if (Math.abs(ball.vy) < 1.5) ball.vy = (Math.random() < 0.5 ? -1 : 1) * 1.5;
    state = 'play';
  }

  function reflectY(y) {
    var top = COURT_TOP + BALL_R;
    var bottom = COURT_BOTTOM - BALL_R;
    var span = bottom - top;
    // Triangle-wave reflection predicts where the ball will meet the CPU.
    var p = (y - top) % (span * 2);
    if (p < 0) p += span * 2;
    return p <= span ? top + p : bottom - (p - span);
  }

  function setCpuAim() {
    var target = (COURT_TOP + COURT_BOTTOM) / 2;
    if (ball.vx > 0.1) {
      var travel = (CPU_X - ball.x) / ball.vx;
      target = reflectY(ball.y + ball.vy * Math.max(0, travel));
      // It usually predicts well, but delayed reads and occasional bad guesses
      // leave human-sized openings rather than making a perfect wall.
      var miss = randomBetween(-1.25, 1.25);
      if (Math.random() < 0.13) miss += Math.random() < 0.5 ? -2.2 : 2.2;
      target += miss;
    }
    cpuTarget = clamp(target, COURT_TOP + PADDLE_H / 2, COURT_BOTTOM - PADDLE_H / 2);
    cpuThink = randomBetween(0.13, 0.27);
  }

  function movePaddles(dt) {
    var move = (input.isDown('up') ? -1 : 0) + (input.isDown('down') ? 1 : 0);
    playerVelocity = move * PLAYER_SPEED;
    playerY = clamp(playerY + playerVelocity * dt, COURT_TOP, paddleMax());

    cpuThink -= dt;
    if (cpuThink <= 0) setCpuAim();
    var cpuCenter = cpuY + PADDLE_H / 2;
    var step = clamp(cpuTarget - cpuCenter, -CPU_SPEED * dt, CPU_SPEED * dt);
    cpuY = clamp(cpuY + step, COURT_TOP, paddleMax());
  }

  function bounceFromPaddle(isPlayer) {
    var paddleY = isPlayer ? playerY : cpuY;
    var center = paddleY + PADDLE_H / 2;
    var relative = clamp((ball.y - center) / (PADDLE_H / 2), -0.92, 0.92);
    var angle = relative * 1.05; // position on paddle controls the outgoing angle
    var direction = isPlayer ? 1 : -1;

    rally++;
    ballSpeed = Math.min(MAX_SPEED, START_SPEED + rally * SPEED_PER_RETURN);
    ball.vx = direction * Math.cos(angle) * ballSpeed;
    ball.vy = Math.sin(angle) * ballSpeed;
    // A moving human paddle can put a little extra English on the ball.
    if (isPlayer) ball.vy += playerVelocity * 0.12;

    var magnitude = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    ball.vx *= ballSpeed / magnitude;
    ball.vy *= ballSpeed / magnitude;
    if (Math.abs(ball.vx) < ballSpeed * 0.34) {
      ball.vx = direction * ballSpeed * 0.34;
      ball.vy = (ball.vy < 0 ? -1 : 1) * Math.sqrt(ballSpeed * ballSpeed - ball.vx * ball.vx);
    }
  }

  function pointTo(playerWon) {
    if (playerWon) score++;
    else cpuScore++;

    if (score >= WIN_SCORE || cpuScore >= WIN_SCORE) {
      winner = score >= WIN_SCORE ? 'YOU WIN!' : 'CPU WINS';
      state = 'over';
      if (!submitted) {
        submitted = true;
        best = ctx.arcade.setBestScore('pong', score);
        // Hand off to the shell: high-score name entry, submit, leaderboard, menu.
        ctx.arcade.gameOver(score);
      }
      return;
    }

    serveDirection = playerWon ? 1 : -1;
    serveDelay = 0.8;
    newBall();
    state = 'serve';
  }

  function ballHitsPaddle(paddleY) {
    return ball.y + BALL_R >= paddleY && ball.y - BALL_R <= paddleY + PADDLE_H;
  }

  function stepBall(dt) {
    // Small substeps keep the fast late-rally ball from tunnelling through a paddle.
    var steps = Math.max(1, Math.ceil(ballSpeed * dt / 0.18));
    var part = dt / steps;
    for (var i = 0; i < steps; i++) {
      ball.x += ball.vx * part;
      ball.y += ball.vy * part;

      if (ball.y - BALL_R < COURT_TOP) {
        ball.y = COURT_TOP + BALL_R;
        ball.vy = Math.abs(ball.vy);
      } else if (ball.y + BALL_R > COURT_BOTTOM) {
        ball.y = COURT_BOTTOM - BALL_R;
        ball.vy = -Math.abs(ball.vy);
      }

      if (ball.vx < 0 && ball.x - BALL_R <= PADDLE_X + PADDLE_W &&
          ball.x + BALL_R >= PADDLE_X && ballHitsPaddle(playerY)) {
        ball.x = PADDLE_X + PADDLE_W + BALL_R;
        bounceFromPaddle(true);
      } else if (ball.vx > 0 && ball.x + BALL_R >= CPU_X &&
                 ball.x - BALL_R <= CPU_X + PADDLE_W && ballHitsPaddle(cpuY)) {
        ball.x = CPU_X - BALL_R;
        bounceFromPaddle(false);
      }

      if (ball.x < -BALL_R) {
        pointTo(false);
        return;
      }
      if (ball.x > COLS + BALL_R) {
        pointTo(true);
        return;
      }
    }
  }

  function drawCourt(screen) {
    screen.hline(0, COURT_TOP, COLS, '-', 'dark');
    screen.hline(0, COURT_BOTTOM, COLS, '-', 'dark');
    for (var y = COURT_TOP + 1; y < COURT_BOTTOM; y += 2) screen.set(9, y, '.', 'light');
  }

  function drawPaddle(screen, x, y, color) {
    var top = Math.round(y);
    screen.set(x, top, SHADE, color);
    screen.set(x, top + 1, BLOCK, color);
    screen.set(x, top + 2, SHADE, color);
  }

  function drawHeader(screen) {
    screen.fillRect(0, 0, COLS, 1, ' ', 'lightest', 'darkest');
    screen.text(1, 0, 'YOU ' + score, 'lightest', 'darkest');
    var cpu = 'CPU ' + cpuScore;
    screen.text(COLS - cpu.length - 1, 0, cpu, 'lightest', 'darkest');
    var rallyText = 'RALLY ' + rally;
    screen.textCentered(1, rallyText, 'dark');
  }

  function drawGame(screen) {
    drawHeader(screen);
    drawCourt(screen);
    drawPaddle(screen, PADDLE_X, playerY, 'darkest');
    drawPaddle(screen, CPU_X, cpuY, 'darkest');
    if (state === 'play') {
      screen.set(Math.round(ball.x), Math.round(ball.y), DOT, 'darkest');
      if (ballSpeed > 11) screen.set(Math.round(ball.x - Math.sign(ball.vx)), Math.round(ball.y), '.', 'dark');
    } else if (state === 'serve') {
      screen.set(10, 9, DOT, 'darkest');
      if ((tick >> 3) % 2 === 0) screen.textCentered(10, 'A: SERVE', 'darkest');
    }
  }

  function drawTitle(screen) {
    drawCourt(screen);
    drawPaddle(screen, PADDLE_X, 7, 'darkest');
    drawPaddle(screen, CPU_X, 7, 'darkest');
    screen.set(10, 8, DOT, 'darkest');
    screen.textCentered(4, 'PONG vs CPU', 'darkest');
    screen.textCentered(6, 'FIRST TO 11', 'dark');
    screen.textCentered(11, 'UP/DOWN: MOVE', 'dark');
    screen.textCentered(12, 'BEAT THE CPU', 'dark');
    if (best > 0) screen.textCentered(14, 'BEST ' + best, 'dark');
    if ((tick >> 4) % 2 === 0) screen.textCentered(16, 'START / A', 'darkest');
  }

  function drawOver(screen) {
    drawGame(screen);
    screen.fillRect(3, 6, 14, 7, ' ', 'lightest', 'darkest');
    screen.rect(3, 6, 14, 7, 'lightest', 'darkest');
    screen.textCentered(7, winner, 'lightest', 'darkest');
    screen.textCentered(9, 'FINAL ' + score + '-' + cpuScore, 'lightest', 'darkest');
    if ((tick >> 4) % 2 === 0) screen.textCentered(11, 'START/A: AGAIN', 'lightest', 'darkest');
  }

  var game = {
    id: 'pong',
    title: 'PONG vs CPU',

    init: function (context) {
      ctx = context;
      input = context.input;
      tick = 0;
      best = ctx.arcade.getBestScore('pong');
      state = 'title';
      score = 0;
      cpuScore = 0;
      rally = 0;
      playerY = cpuY = 7;
      newBall();
    },

    update: function (dtMs) {
      var dt = Math.min(dtMs / 1000, 0.05);
      tick++;
      if (state === 'title' || state === 'over') return;

      movePaddles(dt);
      if (state === 'serve') {
        serveDelay -= dt;
        if (serveDelay <= 0) launchBall();
      } else {
        stepBall(dt);
      }
    },

    render: function (screen) {
      screen.clear('lightest');
      if (state === 'title') drawTitle(screen);
      else if (state === 'over') drawOver(screen);
      else drawGame(screen);
    },

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (state === 'title' && (button === 'start' || button === 'a')) {
        resetMatch();
      } else if (state === 'serve' && (button === 'start' || button === 'a')) {
        launchBall();
      } else if (state === 'over' && (button === 'start' || button === 'a')) {
        resetMatch();
      }
    },

    destroy: function () {
      ball = null;
      ctx = null;
      input = null;
    },
  };

  window.Arcade.registerGame(game);
})();
