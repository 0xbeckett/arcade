/**
 * ARCADE — FROZEN PUBLIC API
 * ==========================
 * These types define the contract every game plugs into. They are FROZEN:
 * 10 games are built in parallel against this surface. Do not make breaking
 * changes here without coordinating a version bump in docs/GAME_API.md.
 *
 * The same shapes exist at runtime on `window.Arcade`. A plain-JS game at
 * public/games/<slug>.js never imports this file; it uses the runtime global
 * and the `ctx` handed to init(). This file is the source of truth for the
 * TypeScript typings shipped alongside the docs.
 */

/** The eight logical inputs. Every device/keyboard event normalizes to one. */
export type Button =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'start'
  | 'select';

export const BUTTONS: readonly Button[] = [
  'up',
  'down',
  'left',
  'right',
  'a',
  'b',
  'start',
  'select',
];

/**
 * A drawable color. Either one of the four Game Boy palette tones (authentic
 * dot-matrix look, snapped by the shader) or any CSS color string (passed
 * through, still quantized/tinted by the shader). Numbers 0..3 are also
 * accepted as tone indices (0 = lightest ... 3 = darkest).
 */
export type Color = PaletteTone | (string & {}) | 0 | 1 | 2 | 3;

/** The four canonical Game Boy tones, lightest to darkest. */
export type PaletteTone = 'lightest' | 'light' | 'dark' | 'darkest';

/**
 * The LCD drawing surface. A fixed character/cell grid (20x18, matching the
 * original Game Boy's 20x18 tile grid). All coordinates are cell coordinates
 * with (0,0) at the top-left. Out-of-bounds writes are clipped silently.
 *
 * A game only ever draws through this API inside render(). The shell owns the
 * canvas, the shader, and when render() is called.
 */
export interface Screen {
  /** Number of columns (cells wide). Always 20. */
  readonly cols: number;
  /** Number of rows (cells tall). Always 18. */
  readonly rows: number;

  /** Clear the whole screen to a single color (default: lightest tone). */
  clear(color?: Color): void;

  /** Set a single cell. `ch` should be one printable character. */
  set(x: number, y: number, ch: string, fg?: Color, bg?: Color): void;

  /** Read the glyph currently at a cell (space if empty/out of bounds). */
  get(x: number, y: number): string;

  /** Write a string starting at (x,y). Clipped to the row; no wrapping. */
  text(x: number, y: number, str: string, fg?: Color, bg?: Color): void;

  /** Write a string centered on the given row. */
  textCentered(y: number, str: string, fg?: Color, bg?: Color): void;

  /** Draw a filled rectangle of `ch`. */
  fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    ch: string,
    fg?: Color,
    bg?: Color,
  ): void;

  /** Draw a 1-cell outlined rectangle using box-drawing characters. */
  rect(x: number, y: number, w: number, h: number, fg?: Color, bg?: Color): void;

  /** Horizontal line of `ch`, length `w`. */
  hline(x: number, y: number, w: number, ch: string, fg?: Color): void;

  /** Vertical line of `ch`, length `h`. */
  vline(x: number, y: number, h: number, ch: string, fg?: Color): void;
}

/**
 * Live input state, sampled by the shell. Edge queries ("just...") are true
 * for exactly one update() tick after the transition, so they are safe to read
 * inside update(). isDown() reflects the current held state at any time.
 */
export interface InputState {
  /** Is this button currently held down? */
  isDown(button: Button): boolean;
  /** Did this button transition to down since the previous update tick? */
  justPressed(button: Button): boolean;
  /** Did this button transition to up since the previous update tick? */
  justReleased(button: Button): boolean;
}

/** A single leaderboard row. */
export interface LeaderboardEntry {
  name: string;
  score: number;
  /** 1-based rank when known (server-assigned or computed locally). */
  rank?: number;
}

/**
 * The Arcade services API. Also exposed globally as `window.Arcade` so plain-JS
 * games can register themselves. All score methods degrade gracefully: network
 * calls fall back to a localStorage mirror so games work fully offline.
 */
export interface ArcadeAPI {
  /**
   * Register a game with the shell. This is THE plugin entry point. A game file
   * (public/games/<slug>.js) calls this exactly once at load time. Duplicate
   * ids replace the earlier registration. The home menu is rebuilt from the
   * set of registered games — the shell never hardcodes the game list.
   */
  registerGame(game: GameModule): void;

  /**
   * Submit a score to the backend (POST /api/score) and return the updated
   * leaderboard. Also updates the local best-score and local leaderboard mirror
   * so the value survives offline. `name` defaults to the last-used initials.
   */
  submitScore(
    gameId: string,
    score: number,
    name?: string,
  ): Promise<LeaderboardEntry[]>;

  /**
   * Fetch the leaderboard (GET /api/leaderboard?gameId=...). Falls back to the
   * local mirror when the network is unavailable. Sorted high-to-low.
   */
  getLeaderboard(gameId: string, limit?: number): Promise<LeaderboardEntry[]>;

  /** Best score for a game from localStorage (0 if none). */
  getBestScore(gameId: string): number;

  /** Persist a new best (keeps the max). Returns the resulting best score. */
  setBestScore(gameId: string, score: number): number;

  /**
   * End the currently-running game. The shell tears the game down and runs the
   * high-score flow: if `score` qualifies, it prompts for initials and submits;
   * then it shows the leaderboard overlay. Games call this instead of managing
   * their own end-screen wiring.
   */
  gameOver(score: number): void;

  /** The four Game Boy palette tones, for convenience in games. */
  readonly Color: {
    LIGHTEST: PaletteTone;
    LIGHT: PaletteTone;
    DARK: PaletteTone;
    DARKEST: PaletteTone;
  };

  /** Semantic version of this API surface. */
  readonly version: string;
}

/**
 * Everything a game receives in init(). Held for the game's lifetime.
 */
export interface ArcadeContext {
  /** The LCD drawing surface. Draw here inside render(). */
  screen: Screen;
  /** Live input state. Poll here inside update(). */
  input: InputState;
  /** Arcade services (scores, leaderboard, gameOver). Same as window.Arcade. */
  arcade: ArcadeAPI;
  /** This game's id (=== module.id), for convenience in score calls. */
  gameId: string;
}

/**
 * THE FROZEN GAME INTERFACE. Every game implements this object shape and passes
 * it to Arcade.registerGame(). The shell drives the lifecycle:
 *
 *   register -> (player selects) -> init -> [ loop: update, render ] -> destroy
 *
 * The loop is a FIXED TIMESTEP driven by the shell. update(dtMs) is called with
 * a constant dt (16.6667ms, 60Hz). render(screen) is called once per animation
 * frame. Games must be pure w.r.t. the screen: draw the full frame every
 * render() call; do not assume the previous frame persists.
 */
export interface GameModule {
  /** Stable unique id, e.g. "snake". Also the localStorage/leaderboard key. */
  id: string;
  /** Human title shown in the menu, e.g. "SNAKE". */
  title: string;
  /** Called once when the game is mounted. Set up state here. */
  init(ctx: ArcadeContext): void;
  /** Fixed-timestep tick. dtMs is constant (~16.67). Advance game state here. */
  update(dtMs: number): void;
  /** Draw the current frame. Called ~once per animation frame. */
  render(screen: Screen): void;
  /** Called on every button edge (press and release) while mounted. */
  onInput(button: Button, pressed: boolean): void;
  /** Called once when the game is unmounted. Release resources here. */
  destroy(): void;
}
