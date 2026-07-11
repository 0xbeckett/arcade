import type { ArcadeAPI, Button, Screen } from '../types';
import type { Registry } from '../registry';
import type { Scores } from '../scores';

/**
 * A Scene is anything the shell can put on the LCD: the menu, the leaderboard,
 * the name-entry prompt, or a running game. The shell drives exactly one scene
 * at a time with the same lifecycle a game gets (enter/update/render/onInput/
 * exit), so games and built-in UI share one code path.
 */
export interface Scene {
  /** Fixed-timestep tick. */
  update(dtMs: number): void;
  /** Draw the frame. */
  render(screen: Screen): void;
  /** Button edge (press or release). */
  onInput(button: Button, pressed: boolean): void;
  /** Called when the scene becomes active. */
  enter?(): void;
  /** Called when the scene is replaced. */
  exit?(): void;
}

/**
 * The slice of the shell that scenes are allowed to drive. Keeps scenes
 * decoupled from the concrete Shell class (and avoids an import cycle).
 */
export interface ShellHost {
  readonly registry: Registry;
  readonly scores: Scores;
  readonly arcade: ArcadeAPI;
  /** Mount and start a registered game by id. */
  play(gameId: string): void;
  /** Return to the home menu. */
  showMenu(): void;
  /** Show a game's leaderboard, optionally highlighting a just-set score. */
  showLeaderboard(gameId: string, highlight?: { name: string; score: number }): void;
}
