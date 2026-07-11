import type { Button, Screen } from '../types';
import type { Scene, ShellHost } from './scene';
import { COLS, ROWS } from '../screen';

/**
 * The home menu. d-pad up/down to move, A or START to play, SELECT to open the
 * highlighted game's leaderboard. Built entirely from the registry, so adding a
 * game to public/games/manifest.json makes it appear here with no shell edits.
 */
export class MenuScene implements Scene {
  private sel = 0;
  private scroll = 0;
  private blink = 0;
  private readonly listTop = 5;
  private readonly listBottom = ROWS - 3; // leave 2 rows for footer
  private get windowH(): number {
    return this.listBottom - this.listTop; // visible game rows
  }

  constructor(private host: ShellHost) {}

  update(dtMs: number): void {
    this.blink = (this.blink + dtMs) % 1000;
    const n = this.host.registry.list().length;
    if (n === 0) this.sel = 0;
    else this.sel = Math.max(0, Math.min(this.sel, n - 1));
    this.clampScroll();
  }

  private clampScroll(): void {
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + this.windowH) this.scroll = this.sel - this.windowH + 1;
    if (this.scroll < 0) this.scroll = 0;
  }

  onInput(button: Button, pressed: boolean): void {
    if (!pressed) return;
    const games = this.host.registry.list();
    const n = games.length;
    if (n === 0) return;
    switch (button) {
      case 'up':
        this.sel = (this.sel - 1 + n) % n;
        this.clampScroll();
        break;
      case 'down':
        this.sel = (this.sel + 1) % n;
        this.clampScroll();
        break;
      case 'a':
      case 'start':
        this.host.play(games[this.sel].id);
        break;
      case 'select':
        this.host.showLeaderboard(games[this.sel].id);
        break;
    }
  }

  render(screen: Screen): void {
    screen.clear('lightest');

    // Header band.
    screen.fillRect(0, 0, COLS, 3, ' ', 'lightest', 'darkest');
    screen.textCentered(1, 'A R C A D E', 'lightest', 'darkest');
    screen.hline(0, 3, COLS, '=', 'dark');

    const games = this.host.registry.list();
    if (games.length === 0) {
      screen.textCentered(8, 'NO GAMES YET', 'dark');
      screen.textCentered(10, 'ADD SLUGS TO', 'dark');
      screen.textCentered(11, 'GAMES/MANIFEST', 'dark');
      return;
    }

    const show = this.blink < 650; // blink the cursor
    for (let row = 0; row < this.windowH; row++) {
      const i = this.scroll + row;
      if (i >= games.length) break;
      const y = this.listTop + row;
      const selected = i === this.sel;
      const label = games[i].title.toUpperCase().slice(0, COLS - 3);
      if (selected) {
        screen.fillRect(0, y, COLS, 1, ' ', 'lightest', 'dark');
        screen.set(1, y, show ? '>' : ' ', 'lightest', 'dark');
        screen.text(3, y, label, 'lightest', 'dark');
      } else {
        screen.text(3, y, label, 'darkest');
      }
    }

    // Scroll hints.
    if (this.scroll > 0) screen.set(COLS - 1, this.listTop, '^', 'dark');
    if (this.scroll + this.windowH < games.length)
      screen.set(COLS - 1, this.listBottom - 1, 'v', 'dark');

    // Footer.
    screen.hline(0, ROWS - 2, COLS, '-', 'dark');
    screen.text(0, ROWS - 1, 'A PLAY', 'dark');
    screen.text(COLS - 9, ROWS - 1, 'SEL SCORE', 'dark');
  }
}
