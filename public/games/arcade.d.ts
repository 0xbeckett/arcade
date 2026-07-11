/**
 * Arcade plugin API — type definitions for game authors.
 * These mirror the frozen runtime surface. They are OPTIONAL: reference them
 * from a plain-JS game with JSDoc for editor autocomplete, e.g.
 *
 *   /** @typedef {import('./arcade').GameModule} GameModule *\/
 *   /** @type {GameModule} *\/
 *   var game = { ... };
 *
 * See /docs/GAME_API.md for the full contract.
 */

export type Button = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';

export type PaletteTone = 'lightest' | 'light' | 'dark' | 'darkest';

/** A palette tone, a tone index (0..3), or any CSS color string. */
export type Color = PaletteTone | string | 0 | 1 | 2 | 3;

export interface Screen {
  readonly cols: number; // 20
  readonly rows: number; // 18
  clear(color?: Color): void;
  set(x: number, y: number, ch: string, fg?: Color, bg?: Color): void;
  get(x: number, y: number): string;
  text(x: number, y: number, str: string, fg?: Color, bg?: Color): void;
  textCentered(y: number, str: string, fg?: Color, bg?: Color): void;
  fillRect(x: number, y: number, w: number, h: number, ch: string, fg?: Color, bg?: Color): void;
  rect(x: number, y: number, w: number, h: number, fg?: Color, bg?: Color): void;
  hline(x: number, y: number, w: number, ch: string, fg?: Color): void;
  vline(x: number, y: number, h: number, ch: string, fg?: Color): void;
}

export interface InputState {
  isDown(button: Button): boolean;
  justPressed(button: Button): boolean;
  justReleased(button: Button): boolean;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  rank?: number;
}

export interface ArcadeAPI {
  registerGame(game: GameModule): void;
  submitScore(gameId: string, score: number, name?: string): Promise<LeaderboardEntry[]>;
  getLeaderboard(gameId: string, limit?: number): Promise<LeaderboardEntry[]>;
  getBestScore(gameId: string): number;
  setBestScore(gameId: string, score: number): number;
  gameOver(score: number): void;
  readonly Color: {
    LIGHTEST: PaletteTone;
    LIGHT: PaletteTone;
    DARK: PaletteTone;
    DARKEST: PaletteTone;
  };
  readonly version: string;
}

export interface ArcadeContext {
  screen: Screen;
  input: InputState;
  arcade: ArcadeAPI;
  gameId: string;
}

export interface GameModule {
  id: string;
  title: string;
  init(ctx: ArcadeContext): void;
  update(dtMs: number): void;
  render(screen: Screen): void;
  onInput(button: Button, pressed: boolean): void;
  destroy(): void;
}

declare global {
  interface Window {
    Arcade: ArcadeAPI;
    /** Optional: set before the shell boots to point score calls elsewhere. */
    ARCADE_API_BASE?: string;
  }
}
