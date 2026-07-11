import type { ArcadeContext, Button, GameModule, Screen } from '../types';
import type { Scene } from './scene';

/**
 * Runs a registered GameModule as a scene. Every lifecycle call is guarded so a
 * throwing game can't take down the shell loop — it just logs and, on a fatal
 * init error, bails back via the provided onCrash handler.
 */
export class GameScene implements Scene {
  readonly id = 'game';
  private crashed = false;

  constructor(
    private game: GameModule,
    private ctx: ArcadeContext,
    private onCrash: (err: unknown) => void,
  ) {}

  enter(): void {
    try {
      this.game.init(this.ctx);
    } catch (err) {
      this.crashed = true;
      console.error(`[arcade] ${this.game.id}.init threw:`, err);
      this.onCrash(err);
    }
  }

  update(dtMs: number): void {
    if (this.crashed) return;
    try {
      this.game.update(dtMs);
    } catch (err) {
      console.error(`[arcade] ${this.game.id}.update threw:`, err);
    }
  }

  render(screen: Screen): void {
    if (this.crashed) return;
    try {
      this.game.render(screen);
    } catch (err) {
      console.error(`[arcade] ${this.game.id}.render threw:`, err);
    }
  }

  onInput(button: Button, pressed: boolean): void {
    if (this.crashed) return;
    try {
      this.game.onInput(button, pressed);
    } catch (err) {
      console.error(`[arcade] ${this.game.id}.onInput threw:`, err);
    }
  }

  exit(): void {
    try {
      this.game.destroy();
    } catch (err) {
      console.error(`[arcade] ${this.game.id}.destroy threw:`, err);
    }
  }
}

/** A trivial placeholder shown while the shell decides what to do next. */
export class LoadingScene implements Scene {
  readonly id = 'loading';
  private t = 0;
  constructor(private label = 'LOADING') {}
  update(dtMs: number): void {
    this.t += dtMs;
  }
  render(screen: Screen): void {
    screen.clear('lightest');
    const dots = '.'.repeat(1 + (Math.floor(this.t / 300) % 3));
    screen.textCentered(8, this.label + dots, 'dark');
  }
  onInput(): void {
    /* swallow input while transitioning */
  }
}
