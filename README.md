# ARCADE

A phone-first **Game Boy handheld** in the browser: a device shell, a
dot-matrix / CRT **ASCII LCD** render surface, touch + keyboard controls, a
small **game plugin API**, and **10 games** — all backed by a Bun + SQLite
leaderboard server. Live at **[arcade.0xbeckett.me](https://arcade.0xbeckett.me)**.

Vanilla TypeScript shell + WebGL (Canvas2D fallback), plain-JS games, zero
runtime dependencies. The shipped app lives in [`public/`](public/) and is
served by the backend.

## What's here

| Path                    | What it is                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| `server.ts`             | The backend: serves `public/` + the leaderboard API (Bun/SQLite).|
| `public/`               | The shipped app. Static + built bundle.                          |
| `public/index.html`     | Device chrome markup.                                             |
| `public/arcade.css`     | Device chrome styles (phone-first, no zoom/scroll/tap-delay).    |
| `public/arcade.js`      | The built shell bundle (from `src/`, via `bun run build`).       |
| `public/games/`         | The 10 game plugins: `<slug>.js` + `manifest.json` + types.      |
| `src/`                  | The shell (TypeScript): screen, shader, input, loop, scenes, API.|
| `docs/GAME_API.md`      | **The frozen game plugin contract + copy-paste template.**       |

## The shell

- **Device**: Game Boy body, bezel, branding, speaker, LED (`arcade.css`).
- **Controls** (`src/device.ts`, `src/input.ts`): touch d-pad (multi-touch,
  diagonals), A/B/Start/Select with visible press states, plus keyboard
  (Arrows/WASD, Z/X, Enter/Shift). Pointer Events, `touch-action: none`, no
  300 ms delay, no accidental scroll/zoom.
- **LCD** (`src/screen.ts`, `src/font.ts`, `src/renderer.ts`): a 20×18 character
  cell grid rasterized to a dot buffer, rendered through a WebGL dot-matrix/CRT
  shader — rounded LCD dots, scanlines, Game-Boy palette, glow, vignette.
- **Loop** (`src/loop.ts`): fixed 60 Hz timestep the shell drives.
- **Scenes** (`src/scenes/`): home **menu**, **leaderboard** overlay + high-score
  **name entry**, plus the game/loading scenes.
- **Scores** (`src/scores.ts`): browser client for `POST /api/score` +
  `GET /api/leaderboard`, with a `localStorage` fallback for offline play.

## The games

`snake`, `tetris`, `blocks2048`, `pong`, `minesweeper`, `breakout`, `flappy`,
`shmup`, `asteroids`, `runner`. Each is a self-contained `public/games/<slug>.js`
that calls `window.Arcade.registerGame({...})`, ends its run with
`ctx.arcade.gameOver(score)`, and is listed in `public/games/manifest.json`
(array order = menu order). See [`docs/GAME_API.md`](docs/GAME_API.md).

## Build & run

```sh
bun run build      # bundle src/ -> public/arcade.js  (games are plain JS, not bundled)
bun run typecheck  # tsc --noEmit over src/
bun run start      # serve public/ + the leaderboard API (server.ts)
```

The server listens on `PORT` (default `8787`) and serves `./public`; scores are
stored in `./scores.db` (created automatically):

```sh
PORT=3000 bun run start
```

### Backend API

```
POST /api/score            body: { "gameId"|"game": string, "name": string, "score": number }
                           -> 200 { rank, best, top }
GET  /api/leaderboard?gameId=<id>&limit=<n>   (or ?game=<id>)
                           -> 200 [ { name, score, ts }, ... ]   (top scores, high -> low)
GET  /api/health           -> 200 { ok: true }
```
