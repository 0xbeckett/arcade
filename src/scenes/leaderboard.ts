import type { Button, LeaderboardEntry, Screen } from '../types';
import type { Scene, ShellHost } from './scene';
import { COLS, ROWS } from '../screen';

/**
 * The leaderboard overlay. Fetches the top scores for a game (network with a
 * localStorage fallback) and lists them. If `highlight` is given (the score the
 * player just set) that row blinks. B / A / START returns to the menu.
 */
export class LeaderboardScene implements Scene {
  private entries: LeaderboardEntry[] | null = null;
  private blink = 0;
  private scroll = 0;
  private readonly title: string;

  constructor(
    private host: ShellHost,
    private gameId: string,
    private highlight?: { name: string; score: number },
  ) {
    const game = host.registry.get(gameId);
    this.title = (game?.title ?? gameId).toUpperCase();
  }

  enter(): void {
    this.host.scores
      .getLeaderboard(this.gameId, 25)
      .then((e) => {
        this.entries = e;
      })
      .catch(() => {
        this.entries = [];
      });
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
    screen.textCentered(1, this.title.slice(0, COLS), 'dark');
    screen.hline(0, 2, COLS, '-', 'dark');

    if (this.entries === null) {
      screen.textCentered(8, 'LOADING...', 'dark');
      return;
    }
    if (this.entries.length === 0) {
      screen.textCentered(8, 'NO SCORES YET', 'dark');
      screen.textCentered(10, 'BE THE FIRST!', 'dark');
    }

    const windowH = ROWS - 5; // rows 3..ROWS-3
    const show = this.blink < 450;
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
        this.highlight && e.name === this.highlight.name && e.score === this.highlight.score;
      if (isHi && show) {
        screen.fillRect(0, y, COLS, 1, ' ', 'lightest', 'dark');
        screen.text(0, y, line, 'lightest', 'dark');
      } else {
        screen.text(0, y, line, isHi ? 'dark' : 'darkest');
      }
    }

    screen.hline(0, ROWS - 2, COLS, '-', 'dark');
    screen.textCentered(ROWS - 1, 'B  BACK', 'dark');
  }
}
