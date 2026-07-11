# ARCADE

A phone-first **Game Boy handheld** in the browser: a gorgeous device shell, a
dot-matrix / CRT **ASCII LCD** render surface, fully-working touch + keyboard
controls, and a small **game plugin API** that 10 games drop into independently.

Vanilla TypeScript + WebGL (with a Canvas2D fallback). No runtime dependencies.
The build output lives in [`public/`](public/) and is served by the backend.

## What's here

| Path                    | What it is                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| `public/`               | The shipped app (served by the backend). Static + built bundle.  |
| `public/index.html`     | Device chrome markup.                                             |
| `public/arcade.css`     | Device chrome styles (phone-first, no zoom/scroll/tap-delay).    |
| `public/arcade.js`      | The built shell bundle (from `src/`, via `bun run build`).       |
| `public/games/`         | Game plugins: `<slug>.js`, `manifest.json`, `_template.js`, types. |
| `src/`                  | The shell (TypeScript): screen, shader, input, loop, scenes, API. |
| `docs/GAME_API.md`      | **The frozen game plugin contract + copy-paste template.**       |

## The shell

- **Device**: Game Boy body, bezel, branding, speaker, LED (`arcade.css`).
- **Controls** (`src/device.ts`, `src/input.ts`): touch d-pad (multi-touch,
  diagonals), A/B/Start/Select with visible press states, plus keyboard
  (Arrows/WASD, Z/X, Enter/Shift). Pointer Events, `touch-action: none`, no
  300 ms delay, no accidental scroll/zoom.
- **LCD** (`src/screen.ts`, `src/font.ts`, `src/renderer.ts`): a 20×18 character
  cell grid rasterized to a 120×144 dot buffer, rendered through a WebGL
  dot-matrix/CRT shader — rounded LCD dots, scanlines, Game-Boy palette, glow,
  vignette. Bundled 5×7 bitmap font for consistent crisp glyphs on every device.
- **Loop** (`src/loop.ts`): fixed 60 Hz timestep the shell drives.
- **Scenes** (`src/scenes/`): home **menu** (d-pad + A), **leaderboard** overlay
  (top scores + high-score name entry), plus the game/loading scenes.
- **Scores** (`src/scores.ts`): `POST /api/score` + `GET /api/leaderboard` with a
  `localStorage` fallback (best score + local leaderboard mirror) for offline.

## Build & run

```sh
bun run build      # bundle src/ -> public/arcade.js  (games are plain JS, not bundled)
bun run typecheck  # tsc --noEmit over src/
bun run serve      # dev static server + MOCK score API (serve.ts), for local testing
bun run dev        # build then serve
```

The production backend (separate ticket) serves `public/` and implements the
real `/api/score` + `/api/leaderboard`. `serve.ts` is a local dev convenience
only and is not part of `public/`.

## Adding games

Games are plain JS files at `public/games/<slug>.js` that call
`window.Arcade.registerGame({...})`. Add the slug to `public/games/manifest.json`
— that's the only registration hook; the shell/menu never hardcodes games. The
bundled `demo` self-test (`DEMO: CATCH`) always loads and is a working reference.

**Full contract:** [`docs/GAME_API.md`](docs/GAME_API.md).
