import type { Button, LeaderboardEntry, Screen } from '../types';
import type { Scene, ShellHost } from './scene';
import { COLS, ROWS } from '../screen';

/**
 * The leaderboard overlay — and the arcade's GLOBAL leaderboard browser. It
 * opens on one game's board (fetched from the network with a localStorage
 * fallback) but LEFT/RIGHT flip through every registered game's board, so the
 * single SELECT button on the menu reaches every leaderboard in the arcade.
 *
 * UP/DOWN scroll the current board. If `highlight` is given (the score the
 * player just set) that row blinks — only on the game it belongs to. B / A /
 * START returns to the menu.
 */
export class LeaderboardScene implements Scene {
  readonly id = 'leaderboard';
  private entries: LeaderboardEntry[] | null = null;
  private blink = 0;
  private scroll = 0;
  private gameIds: string[];
  private idx = 0;
  private readonly originGameId: string;
  private loadToken = 0;

  constructor(
    private host: ShellHost,
    gameId: string,
    private highlight?: { name: string; score: number },
  ) {
    this.originGameId = gameId;
    // The full set of games, in menu order, so LEFT/RIGHT browses them all.
    this.gameIds = this.host.registry.list().map((g) => g.id);
    if (this.gameIds.length === 0) this.gameIds = [gameId];
    const found = this.gameIds.indexOf(gameId);
    this.idx = found >= 0 ? found : 0;
  }

  private get gameId(): string {
    return this.gameIds[this.idx];
  }

  private get title(): string {
    const game = this.host.registry.get(this.gameId);
    return (game?.title ?? this.gameId).toUpperCase();
  }

  enter(): void {
    this.load();
  }

  private load(): void {
    this.entries = null;
    this.scroll = 0;
    const token = ++this.loadToken;
    this.host.scores
      .getLeaderboard(this.gameId, 25)
      .then((e) => {
        if (token === this.loadToken) this.entries = e;
      })
      .catch(() => {
        if (token === this.loadToken) this.entries = [];
      });
  }

  private switchGame(delta: number): void {
    const n = this.gameIds.length;
    if (n <= 1) return;
    this.idx = (this.idx + delta + n) % n;
    this.load();
  }

  update(dtMs: number): void {
    this.blink = (this.blink + dtMs) % 700;
  }

  onInput(button: Button, pressed: boolean): void {
    if (!pressed) return;
    const list = this.entries ?? [];
    const windowH = ROWS - 5;
    switch (button) {
      case 'up':
        this.scroll = Math.max(0, this.scroll - 1);
        break;
      case 'down':
        this.scroll = Math.max(0, Math.min(this.scroll + 1, Math.max(0, list.length - windowH)));
        break;
      case 'left':
        this.switchGame(-1);
        break;
      case 'right':
        this.switchGame(1);
        break;
      case 'a':
      case 'b':
      case 'start':
        this.host.showMenu();
        break;
    }
  }

  render(screen: Screen): void {
    screen.clear('lightest');
    screen.fillRect(0, 0, COLS, 1, ' ', 'lightest', 'darkest');
    screen.textCentered(0, 'HIGH SCORES', 'lightest', 'darkest');

    // Title row doubles as the game switcher: ← TITLE → across all games.
    const browsable = this.gameIds.length > 1;
    screen.textCentered(1, this.title.slice(0, COLS - 4), 'dark');
    if (browsable) {
      const show = this.blink < 450;
      screen.set(0, 1, show ? '←' : ' ', 'dark');
      screen.set(COLS - 1, 1, show ? '→' : ' ', 'dark');
    }
    screen.hline(0, 2, COLS, '-', 'dark');

    if (this.entries === null) {
      screen.textCentered(8, 'LOADING...', 'dark');
    } else if (this.entries.length === 0) {
      screen.textCentered(8, 'NO SCORES YET', 'dark');
      screen.textCentered(10, 'BE THE FIRST!', 'dark');
    } else {
      const windowH = ROWS - 5; // rows 3..ROWS-3
      const show = this.blink < 450;
      const canHighlight = this.gameId === this.originGameId;
      for (let row = 0; row < windowH; row++) {
        const i = this.scroll + row;
        if (i >= this.entries.length) break;
        const e = this.entries[i];
        const y = 3 + row;
        const rank = String(e.rank ?? i + 1).padStart(2, ' ');
        const name = e.name.padEnd(6, ' ').slice(0, 6);
        const score = String(e.score).padStart(7, ' ');
        const line = `${rank} ${name} ${score}`;
        const isHi =
          canHighlight &&
          this.highlight &&
          e.name === this.highlight.name &&
          e.score === this.highlight.score;
        if (isHi && show) {
          screen.fillRect(0, y, COLS, 1, ' ', 'lightest', 'dark');
          screen.text(0, y, line, 'lightest', 'dark');
        } else {
          screen.text(0, y, line, isHi ? 'dark' : 'darkest');
        }
      }
      if (this.scroll > 0) screen.set(COLS - 1, 3, '^', 'dark');
      if (this.scroll + windowH < this.entries.length) screen.set(COLS - 1, ROWS - 3, 'v', 'dark');
    }

    screen.hline(0, ROWS - 2, COLS, '-', 'dark');
    if (browsable) screen.text(0, ROWS - 1, '←→ GAME', 'dark');
    screen.text(COLS - 6, ROWS - 1, 'B BACK', 'dark');
  }
}
