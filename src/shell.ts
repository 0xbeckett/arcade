import type { ArcadeAPI, ArcadeContext, Button, GameModule } from './types';
import { CellScreen } from './screen';
import { createRenderer, type Renderer } from './renderer';
import { InputManager } from './input';
import { GameLoop } from './loop';
import { Scores } from './scores';
import { Registry } from './registry';
import { PALETTES, type Palette } from './palette';
import type { Scene, ShellHost } from './scenes/scene';
import { MenuScene } from './scenes/menu';
import { LeaderboardScene } from './scenes/leaderboard';
import { NameEntryScene } from './scenes/name-entry';
import { GameScene, LoadingScene } from './scenes/game-scene';

const API_VERSION = '1.0.0';

export interface ShellOptions {
  canvas: HTMLCanvasElement;
  apiBase?: string;
}

/**
 * The Arcade shell: owns the LCD, renderer, input, fixed-timestep loop, scores
 * service, game registry, and the current scene. Also exposes the public
 * `arcade` API (also installed on window.Arcade) that games plug into.
 */
export class Shell implements ShellHost {
  readonly screen = new CellScreen();
  readonly input = new InputManager();
  readonly registry = new Registry();
  readonly scores: Scores;
  readonly arcade: ArcadeAPI;

  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private loop: GameLoop;
  private scene: Scene;
  private palette: Palette = PALETTES[0];
  private paletteIndex = 0;

  private inGame = false;
  private playingId: string | null = null;
  private ending = false;

  constructor(opts: ShellOptions) {
    this.canvas = opts.canvas;
    this.scores = new Scores(opts.apiBase);
    this.renderer = createRenderer(this.canvas);

    this.arcade = {
      version: API_VERSION,
      Color: { LIGHTEST: 'lightest', LIGHT: 'light', DARK: 'dark', DARKEST: 'darkest' },
      registerGame: (game: GameModule) => this.registry.register(game),
      submitScore: (gameId, score, name) => this.scores.submitScore(gameId, score, name),
      getLeaderboard: (gameId, limit) => this.scores.getLeaderboard(gameId, limit),
      getBestScore: (gameId) => this.scores.getBestScore(gameId),
      setBestScore: (gameId, score) => this.scores.setBestScore(gameId, score),
      gameOver: (score) => this.handleGameOver(score),
    };

    this.scene = new MenuScene(this);
    this.loop = new GameLoop({
      update: (dt) => this.tick(dt),
      render: () => this.draw(),
    });

    this.input.onEdge((btn, pressed) => this.routeInput(btn, pressed));
    this.registry.onChange(() => {
      // If the menu is showing while games register, it picks them up on its
      // next render automatically (it reads the registry live). Nothing to do.
    });
  }

  /** Boot: size the LCD, start the loop, show the menu. */
  start(): void {
    this.attachResize();
    if (this.scene.enter) this.scene.enter();
    this.loop.start();
  }

  private attachResize(): void {
    const doResize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.renderer.resize(rect.width || 1, rect.height || 1, dpr);
    };
    doResize();
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(doResize);
      ro.observe(this.canvas);
    }
    window.addEventListener('resize', doResize);
    window.addEventListener('orientationchange', doResize);
  }

  private tick(dtMs: number): void {
    this.scene.update(dtMs);
    this.input.endTick();
  }

  private draw(): void {
    this.scene.render(this.screen);
    const raster = this.screen.rasterize(this.palette);
    this.renderer.render(raster, this.palette);
  }

  private setScene(next: Scene, inGame = false): void {
    if (this.scene && this.scene.exit) {
      try {
        this.scene.exit();
      } catch (e) {
        console.error(e);
      }
    }
    this.inGame = inGame;
    this.input.resetSilently();
    this.scene = next;
    if (next.enter) {
      try {
        next.enter();
      } catch (e) {
        console.error(e);
      }
    }
  }

  private routeInput(btn: Button, pressed: boolean): void {
    // Global escape: holding START + SELECT together quits a game to the menu.
    if (
      pressed &&
      this.inGame &&
      this.input.isDown('start') &&
      this.input.isDown('select')
    ) {
      this.abortToMenu();
      return;
    }
    this.scene.onInput(btn, pressed);
  }

  private abortToMenu(): void {
    this.playingId = null;
    this.ending = false;
    this.showMenu();
  }

  // --- ShellHost ---------------------------------------------------------

  play(gameId: string): void {
    const game = this.registry.get(gameId);
    if (!game) {
      console.warn('[arcade] play(): no such game', gameId);
      return;
    }
    this.ending = false;
    this.playingId = gameId;
    const ctx: ArcadeContext = {
      screen: this.screen,
      input: this.input,
      arcade: this.arcade,
      gameId,
    };
    this.setScene(new GameScene(game, ctx, () => this.showMenu()), true);
  }

  showMenu(): void {
    this.playingId = null;
    this.ending = false;
    this.setScene(new MenuScene(this), false);
  }

  showLeaderboard(gameId: string, highlight?: { name: string; score: number }): void {
    this.setScene(new LeaderboardScene(this, gameId, highlight), false);
  }

  cyclePalette(): void {
    this.paletteIndex = (this.paletteIndex + 1) % PALETTES.length;
    this.palette = PALETTES[this.paletteIndex];
  }

  /** Current scene's id ('menu' | 'game' | 'nameentry' | 'leaderboard' | ...). */
  currentSceneId(): string {
    return this.scene.id ?? 'unknown';
  }

  /** Current palette id (for debugging/tests). */
  currentPaletteId(): string {
    return this.palette.id;
  }

  /** Renderer backend actually in use ('webgl' | 'canvas2d'). */
  rendererKind(): string {
    return this.renderer.kind;
  }

  // --- game-over flow ----------------------------------------------------

  private handleGameOver(score: number): void {
    if (!this.inGame || this.ending) return;
    this.ending = true;
    const gameId = this.playingId;
    if (!gameId) return;
    // Defer teardown so we don't destroy the game while its own update/onInput
    // is still on the call stack.
    queueMicrotask(() => this.finishGame(gameId, score));
  }

  private async finishGame(gameId: string, score: number): Promise<void> {
    // Switching to a loading scene tears down the game (exit -> destroy).
    this.setScene(new LoadingScene('GAME OVER'), false);
    this.inGame = false;
    this.playingId = null;
    const finalScore = Math.floor(score) || 0;
    let qualifies = false;
    try {
      qualifies = await this.scores.qualifies(gameId, finalScore, 10);
    } catch {
      qualifies = finalScore > 0;
    }
    this.ending = false;
    if (qualifies && finalScore > 0) {
      this.setScene(new NameEntryScene(this, gameId, finalScore), false);
    } else {
      this.setScene(new LeaderboardScene(this, gameId), false);
    }
  }
}
