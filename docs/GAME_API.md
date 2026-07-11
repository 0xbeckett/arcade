# Arcade Game API (v1.0.0 — FROZEN)

This is the contract every game plugs into. It is **frozen**: the 10 games are
built in parallel against exactly this surface. If it must change, bump the
version and coordinate — do not silently break it.

A game is a single self-contained file at `public/games/<slug>.js`. It calls
`window.Arcade.registerGame({...})` once at load. It never imports the shell and
never edits the menu, registry, or shell code.

- **You implement:** a [`GameModule`](#gamemodule) object.
- **You get:** an [`ArcadeContext`](#arcadecontext) in `init()`, and the global
  [`window.Arcade`](#windowarcade) API.
- **The LCD:** a **20 × 18** character/cell grid you draw through the
  [`Screen`](#screen-the-lcd) API. It is rendered through a dot-matrix / CRT
  shader (scanlines, Game-Boy palette, glow) — you just place characters.

Editor types (optional, via JSDoc): [`public/games/arcade.d.ts`](../public/games/arcade.d.ts).

---

## Quick start

1. Copy [`public/games/_template.js`](../public/games/_template.js) to
   `public/games/<your-slug>.js`.
2. Fill in `id`, `title`, and the lifecycle methods.
3. Add `"<your-slug>"` to the `games` array in
   [`public/games/manifest.json`](../public/games/manifest.json).
4. `bun run build` is **not** needed for games — they are plain JS, loaded at
   runtime. (Build is only for the shell itself.)

That's the whole registration hook. The menu is rebuilt from whatever registers.

---

## GameModule

```ts
interface GameModule {
  id: string;                              // unique slug, e.g. "snake". Also the score key.
  title: string;                           // shown in the menu, e.g. "SNAKE"
  init(ctx: ArcadeContext): void;          // called once on mount
  update(dtMs: number): void;              // fixed-timestep tick (dtMs is ALWAYS ~16.67)
  render(screen: Screen): void;            // draw the whole frame
  onInput(button: Button, pressed: boolean): void; // every button edge
  destroy(): void;                         // called once on unmount — clean up
}
```

### Lifecycle

```
registerGame(game)
      │  player selects it in the menu
      ▼
   init(ctx) ──▶ ┌───────────── loop (driven by the shell) ─────────────┐
                 │  update(16.67)  × N to catch up to real time          │
                 │  render(screen) once per animation frame             │
                 │  onInput(button, pressed) on each press/release edge  │
                 └──────────────────────────────────────────────────────┘
      │  you call ctx.arcade.gameOver(score)   (or the player quits)
      ▼
   destroy()
```

- **Fixed timestep.** `update(dtMs)` is called with a **constant** `dtMs`
  (`1000/60 ≈ 16.667`), possibly multiple times per frame to catch up. Advance
  simulation here; it is deterministic and frame-rate independent.
- **Stateless rendering.** `render(screen)` must draw the **entire** frame every
  call. Do not assume the previous frame persists.
- **End the run** by calling `ctx.arcade.gameOver(finalScore)`. The shell tears
  your game down (calls `destroy()`), saves the local best, prompts for initials
  if the score qualifies, submits it, and shows the leaderboard. Do not build
  your own end-screen/score-submit wiring — call `gameOver()`.
- Every lifecycle call is wrapped in a try/catch by the shell, so a thrown error
  logs instead of killing the whole arcade — but don't rely on that.

---

## ArcadeContext

Passed to `init(ctx)`; hold onto it for your game's lifetime.

```ts
interface ArcadeContext {
  screen: Screen;      // the LCD drawing API (also passed to render())
  input: InputState;   // poll held/edge input (see below)
  arcade: ArcadeAPI;   // scores, leaderboard, gameOver — same as window.Arcade
  gameId: string;      // === your module.id, for convenience
}
```

---

## Screen (the LCD)

A fixed **20 columns × 18 rows** grid of character cells. `(0,0)` is top-left.
Out-of-bounds writes are clipped silently. Each cell holds one glyph plus a
foreground and background [color](#colors).

```ts
interface Screen {
  readonly cols: number; // 20
  readonly rows: number; // 18

  clear(color?: Color): void;                     // fill everything (default: lightest)
  set(x, y, ch: string, fg?: Color, bg?: Color): void;   // one cell (first char of ch)
  get(x, y): string;                              // read the glyph at a cell
  text(x, y, str: string, fg?, bg?): void;        // write a string (clipped, no wrap)
  textCentered(y, str: string, fg?, bg?): void;   // centered on row y
  fillRect(x, y, w, h, ch: string, fg?, bg?): void;
  rect(x, y, w, h, fg?, bg?): void;               // 1-cell outline (+ - | corners)
  hline(x, y, w, ch: string, fg?): void;
  vline(x, y, h, ch: string, fg?): void;
}
```

Notes:

- Default `fg` is `darkest`, default `bg` is `lightest` (dark text on a pale
  green panel — classic Game Boy). Omit colors to use those.
- The bundled 5×7 font covers `A–Z`, `a–z` (folded to uppercase), `0–9`, common
  punctuation, and a few extras: `█ ▓ ▒ ░ ■ ● ♥ ← → ↑ ↓`. Unknown glyphs render
  as a hollow box, never an error.
- Draw order is last-write-wins per cell (there is no z-buffer).

### Colors

`Color` is one of the four Game-Boy tones, a tone index, or any CSS color:

| Value                                   | Meaning                                  |
| --------------------------------------- | ---------------------------------------- |
| `'lightest'` / `0`                      | lightest tone (default background)       |
| `'light'` / `1`                         | light tone                               |
| `'dark'` / `2`                          | dark tone                                |
| `'darkest'` / `3`                       | darkest tone (default text)              |
| any CSS string, e.g. `'#ff0000'`, `'red'` | passed through (shader still quantizes)  |

Prefer the tone names — the shell can re-theme the whole device (green / neon /
grayscale) and your game follows along. Convenience constants:
`window.Arcade.Color.LIGHTEST | LIGHT | DARK | DARKEST`.

---

## Input

```ts
type Button = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';

interface InputState {
  isDown(button): boolean;       // currently held — poll this in update()
  justPressed(button): boolean;  // true for exactly one update tick after press
  justReleased(button): boolean; // true for exactly one update tick after release
}
```

Two ways to read input, use whichever fits:

- **Poll** in `update()`: `if (ctx.input.isDown('left')) x -= 1;` — great for
  continuous movement. `justPressed`/`justReleased` are edge-accurate per tick.
- **Event** via `onInput(button, pressed)` — great for discrete actions
  (jump, fire, confirm). Called on every press (`pressed=true`) and release.

**Reserved combo:** holding **START + SELECT together** quits your game back to
the menu. Individual `start` and `select` presses are yours to use freely.

Sources (handled for you): the on-screen touch cluster (multi-touch, diagonals
on the d-pad, no tap delay) and the keyboard —
`Arrows`/`WASD` = d-pad, `Z` = A, `X` = B, `Enter` = START, `Shift` = SELECT
(`Space`/`K`/`L` also map to A/B).

---

## window.Arcade

Available globally (also as `ctx.arcade`). All score methods degrade gracefully:
network calls fall back to a `localStorage` mirror, so games work fully offline.

```ts
interface ArcadeAPI {
  registerGame(game: GameModule): void;   // THE plugin entry point (call once)

  gameOver(score: number): void;          // end the run; shell handles the rest

  submitScore(gameId, score, name?): Promise<LeaderboardEntry[]>;
  getLeaderboard(gameId, limit?): Promise<LeaderboardEntry[]>; // sorted high→low
  getBestScore(gameId): number;           // local personal best (0 if none)
  setBestScore(gameId, score): number;    // persist max; returns the best

  readonly Color: { LIGHTEST; LIGHT; DARK; DARKEST };
  readonly version: string;               // "1.0.0"
}

interface LeaderboardEntry { name: string; score: number; rank?: number }
```

- In almost every game you only need `gameOver(score)` and (optionally)
  `getBestScore(id)` to show a "BEST" number. The shell does submission and name
  entry for you.
- `getLeaderboard()` / `submitScore()` are there if you want an in-game
  scoreboard, but they are also what the shell's leaderboard overlay uses.
- The local best is saved automatically on every `gameOver()`.

### Backend contract

Same-origin by default (the backend serves `./public`). Override with
`window.ARCADE_API_BASE = "https://host"` before boot.

```
POST /api/score            body: { "gameId": string, "name": string, "score": number }
                           → 200 { ok, entries?: [{name, score}] }   (entries optional)

GET  /api/leaderboard?gameId=<id>&limit=<n>
                           → 200 { entries: [{name, score}] }        (or a bare array)
```

Response parsing is tolerant of a few shapes (`{entries}`, `{leaderboard}`,
`{scores}`, or a bare array). On any network failure the client uses its
`localStorage` mirror (`arcade:best:<id>`, `arcade:lb:<id>`).

---

## Copy-paste template

```js
// public/games/<slug>.js
(function () {
  'use strict';

  var ctx, score;

  var game = {
    id: 'slug',        // unique; also your leaderboard key
    title: 'MY GAME',  // shown in the menu

    init: function (context) {
      ctx = context;
      score = 0;
      // set up your state here
    },

    update: function (dtMs) {
      // dtMs is always ~16.67. Advance state; poll input:
      // if (ctx.input.isDown('left'))  { ... }
      // if (ctx.input.isDown('right')) { ... }
    },

    render: function (screen) {
      screen.clear('lightest');                 // draw the WHOLE frame every call
      screen.text(0, 0, 'SCORE ' + score, 'darkest');
      screen.textCentered(9, 'HELLO ARCADE', 'darkest');
    },

    onInput: function (button, pressed) {
      if (!pressed) return;
      if (button === 'a') { /* do a thing */ }
      // when the run ends:
      // ctx.arcade.gameOver(score);
    },

    destroy: function () {
      // clear timers/listeners you created (usually nothing)
    },
  };

  window.Arcade.registerGame(game);
})();
```

A full, working reference implementation ships as the self-test game:
[`public/games/demo.js`](../public/games/demo.js) (`DEMO: CATCH`).

---

## Rules of the road

- **Do** draw the entire frame in `render()`; **don't** rely on prior frames.
- **Do** advance simulation in `update()` with the fixed `dtMs`; **don't** run
  game logic off `requestAnimationFrame` yourself — the shell owns the loop.
- **Do** keep `update()`/`render()` allocation-light (they run 60×/sec).
- **Do** call `ctx.arcade.gameOver(score)` to end; **don't** build your own score
  submission or leaderboard screen.
- **Do** use tone names (`'lightest'`…`'darkest'`) so theming works.
- **Don't** touch the DOM, add global listeners you don't remove in `destroy()`,
  or edit the shell/menu/registry.
- **Don't** assume a screen size other than 20 × 18.
```
