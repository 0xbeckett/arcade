// public/games/tetris.js -- a compact falling-block game for Arcade's 20 x 18 LCD.
(function () {
  'use strict';

  var WIDTH = 10;
  var HEIGHT = 16;
  var BOARD_X = 1;
  var BOARD_Y = 2;
  var LINE_POINTS = [0, 100, 300, 500, 800];
  var BLOCK = String.fromCharCode(0x2588); // █
  var SHADE = String.fromCharCode(0x2593); // ▓

  // Each entry contains its four clockwise orientations.  Coordinates are
  // deliberately small so the pieces fit naturally in the character-cell LCD.
  var PIECES = [
    { name: 'I', cells: [
      [[0, 1], [1, 1], [2, 1], [3, 1]], [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]], [[1, 0], [1, 1], [1, 2], [1, 3]]
    ] },
    { name: 'J', cells: [
      [[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]]
    ] },
    { name: 'L', cells: [
      [[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]]
    ] },
    { name: 'O', cells: [
      [[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]]
    ] },
    { name: 'S', cells: [
      [[1, 0], [2, 0], [0, 1], [1, 1]], [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]], [[0, 0], [0, 1], [1, 1], [1, 2]]
    ] },
    { name: 'T', cells: [
      [[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]]
    ] },
    { name: 'Z', cells: [
      [[0, 0], [1, 0], [1, 1], [2, 1]], [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]], [[1, 0], [0, 1], [1, 1], [0, 2]]
    ] }
  ];

  var ctx;
  var board;
  var bag;
  var next;
  var piece;
  var score;
  var lines;
  var level;
  var state;
  var best;
  var gravityTimer;
  var repeatTimer;
  var ticks;
  var submitted;

  function newBoard() {
    board = [];
    for (var y = 0; y < HEIGHT; y++) {
      var row = [];
      for (var x = 0; x < WIDTH; x++) row.push(0);
      board.push(row);
    }
  }

  // A shuffled seven-bag means every tetromino appears before any repeats.
  function refillBag() {
    bag = [0, 1, 2, 3, 4, 5, 6];
    for (var i = bag.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var swap = bag[i];
      bag[i] = bag[j];
      bag[j] = swap;
    }
  }

  function takePiece() {
    if (!bag.length) refillBag();
    return bag.pop();
  }

  function cellsFor(testPiece) {
    return PIECES[testPiece.kind].cells[testPiece.rotation];
  }

  function fits(testPiece) {
    var cells = cellsFor(testPiece);
    for (var i = 0; i < cells.length; i++) {
      var x = testPiece.x + cells[i][0];
      var y = testPiece.y + cells[i][1];
      if (x < 0 || x >= WIDTH || y >= HEIGHT) return false;
      if (y >= 0 && board[y][x]) return false;
    }
    return true;
  }

  function finishGame() {
    if (state === 'over') return;
    state = 'over';
    if (submitted) return;
    submitted = true;
    try {
      if (ctx.arcade.setBestScore) best = ctx.arcade.setBestScore('tetris', score);
    } catch (ignoreBest) {}
    // Hand off to the shell: high-score name entry, submit, leaderboard, menu.
    ctx.arcade.gameOver(score);
  }

  function spawn() {
    piece = { kind: next, rotation: 0, x: 3, y: -1 };
    next = takePiece();
    if (!fits(piece)) finishGame();
  }

  function clearCompleteLines() {
    var count = 0;
    for (var y = HEIGHT - 1; y >= 0; y--) {
      var full = true;
      for (var x = 0; x < WIDTH; x++) {
        if (!board[y][x]) { full = false; break; }
      }
      if (full) {
        board.splice(y, 1);
        var empty = [];
        for (x = 0; x < WIDTH; x++) empty.push(0);
        board.unshift(empty);
        count++;
        y++; // Recheck the row which just fell into this position.
      }
    }
    if (count) {
      score += LINE_POINTS[count] * level;
      lines += count;
      level = 1 + ((lines / 10) | 0);
    }
  }

  function lockPiece() {
    var cells = cellsFor(piece);
    var aboveTop = false;
    for (var i = 0; i < cells.length; i++) {
      var x = piece.x + cells[i][0];
      var y = piece.y + cells[i][1];
      if (y < 0) aboveTop = true;
      else board[y][x] = piece.kind + 1;
    }
    if (aboveTop) { finishGame(); return; }
    clearCompleteLines();
    spawn();
  }

  function move(dx, dy) {
    if (state !== 'play') return false;
    var test = { kind: piece.kind, rotation: piece.rotation, x: piece.x + dx, y: piece.y + dy };
    if (!fits(test)) return false;
    piece = test;
    return true;
  }

  function softDrop() {
    if (move(0, 1)) score++;
    else lockPiece();
  }

  function rotate(direction) {
    if (state !== 'play') return;
    var rotation = (piece.rotation + direction + 4) % 4;
    // Small wall kicks retain the familiar Tetris feel at either edge.
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      var test = { kind: piece.kind, rotation: rotation, x: piece.x + kicks[i], y: piece.y };
      if (fits(test)) { piece = test; return; }
    }
  }

  function dropDelay() {
    return Math.max(85, 800 - (level - 1) * 65);
  }

  function resetGame() {
    newBoard();
    bag = [];
    refillBag();
    next = takePiece();
    score = 0;
    lines = 0;
    level = 1;
    gravityTimer = 0;
    repeatTimer = 0;
    submitted = false;
    state = 'play';
    spawn();
  }

  function drawCell(screen, x, y, value, active) {
    if (!value) {
      screen.set(x, y, '░', 'light', 'darkest');
      return;
    }
    // Checker shading makes individual blocks readable through the CRT shader.
    var glyph = ((x + y + value) & 1) ? BLOCK : SHADE;
    screen.set(x, y, glyph, active ? 'lightest' : 'light', 'darkest');
  }

  function drawPiece(screen, drawPieceValue, preview) {
    var cells = cellsFor(drawPieceValue);
    for (var i = 0; i < cells.length; i++) {
      var x = drawPieceValue.x + cells[i][0];
      var y = drawPieceValue.y + cells[i][1];
      if (preview) { x += 13; y += 3; }
      else { x += BOARD_X; y += BOARD_Y; }
      if (x >= 0 && x < 20 && y >= 0 && y < 18) drawCell(screen, x, y, drawPieceValue.kind + 1, !preview);
    }
  }

  function shortNumber(value) {
    var text = String(value);
    return text.length > 6 ? text.slice(-6) : text;
  }

  function drawBoard(screen) {
    screen.fillRect(0, 1, 12, 17, ' ', 'darkest', 'darkest');
    screen.hline(0, 1, 12, BLOCK, 'lightest');
    screen.vline(0, 1, 17, BLOCK, 'lightest');
    screen.vline(11, 1, 17, BLOCK, 'lightest');
    for (var y = 0; y < HEIGHT; y++) {
      for (var x = 0; x < WIDTH; x++) drawCell(screen, BOARD_X + x, BOARD_Y + y, board[y][x], false);
    }
    if (state === 'play') drawPiece(screen, piece, false);
  }

  function drawSidebar(screen) {
    var high = Math.max(best || 0, score);
    screen.text(13, 2, 'NEXT', 'darkest');
    drawPiece(screen, { kind: next, rotation: 0, x: 0, y: 0 }, true);
    screen.text(13, 8, 'LINES', 'dark');
    screen.text(13, 9, String(lines), 'darkest');
    screen.text(13, 11, 'LEVEL', 'dark');
    screen.text(13, 12, String(level), 'darkest');
    screen.text(13, 14, 'A:CW', 'darkest');
    screen.text(13, 15, 'B:CCW', 'darkest');
    screen.text(13, 16, 'DN:DROP', 'dark');
    if (high > score) screen.text(13, 17, 'HI ' + shortNumber(high), 'dark');
  }

  function render(screen) {
    screen.clear('lightest');
    screen.fillRect(0, 0, 20, 1, ' ', 'lightest', 'darkest');
    screen.text(1, 0, 'TETRIS', 'lightest', 'darkest');
    var scoreText = 'S' + shortNumber(score);
    screen.text(19 - scoreText.length, 0, scoreText, 'lightest', 'darkest');
    drawBoard(screen);
    drawSidebar(screen);

    if (state === 'over') {
      screen.fillRect(1, 6, 18, 6, ' ', 'lightest', 'lightest');
      screen.rect(1, 6, 18, 6, 'darkest', 'lightest');
      screen.textCentered(7, 'TOP OUT!', 'darkest', 'lightest');
      screen.textCentered(8, 'FINAL ' + shortNumber(score), 'darkest', 'lightest');
      if ((ticks % 40) < 28) screen.textCentered(10, 'START/A: AGAIN', 'dark', 'lightest');
    }
  }

  var game = {
    id: 'tetris',
    title: 'TETRIS',

    init: function (context) {
      ctx = context;
      ticks = 0;
      try { best = ctx.arcade.getBestScore ? ctx.arcade.getBestScore('tetris') : 0; } catch (ignore) { best = 0; }
      resetGame();
    },

    update: function (dtMs) {
      ticks++;
      if (state !== 'play') return;
      var dt = Math.min(dtMs, 100);
      gravityTimer += dt;
      // Holding DOWN is a true soft-drop, while its input edge acts instantly.
      if (ctx.input.isDown('down')) {
        repeatTimer += dt;
        while (repeatTimer >= 55 && state === 'play') {
          repeatTimer -= 55;
          softDrop();
        }
      } else {
        repeatTimer = 0;
      }
      while (gravityTimer >= dropDelay() && state === 'play') {
        gravityTimer -= dropDelay();
        if (!move(0, 1)) lockPiece();
      }
    },

    render: render,

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (state === 'over') {
        if (button === 'start' || button === 'a') resetGame();
        return;
      }
      if (button === 'start') { resetGame(); return; }
      if (button === 'left') move(-1, 0);
      else if (button === 'right') move(1, 0);
      else if (button === 'down') softDrop();
      else if (button === 'a') rotate(1);
      else if (button === 'b') rotate(-1);
    },

    destroy: function () {
      board = [];
      bag = [];
      piece = null;
      ctx = null;
    }
  };

  window.Arcade.registerGame(game);
})();
