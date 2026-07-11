import type { Button, Screen } from '../types';
import type { Scene, ShellHost } from './scene';
import { COLS, ROWS } from '../screen';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const LEN = 3;

/**
 * Classic arcade high-score initials entry. UP/DOWN cycles the current letter,
 * LEFT/RIGHT moves between the three slots, A confirms (advances, then submits
 * on the last slot), B backs up. On submit it calls Arcade.submitScore and
 * hands off to the leaderboard with the new entry highlighted.
 */
export class NameEntryScene implements Scene {
  readonly id = 'nameentry';
  private chars: number[];
  private cursor = 0;
  private blink = 0;
  private saving = false;

  constructor(
    private host: ShellHost,
    private gameId: string,
    private score: number,
  ) {
    // Seed from the last-used name for convenience.
    const last = host.scores.lastName().padEnd(LEN, 'A').slice(0, LEN);
    this.chars = [];
    for (let i = 0; i < LEN; i++) {
      const idx = ALPHABET.indexOf(last[i].toUpperCase());
      this.chars.push(idx >= 0 ? idx : 0);
    }
  }

  private get name(): string {
    return this.chars.map((i) => ALPHABET[i]).join('').replace(/ /g, '').trim() || 'AAA';
  }

  update(dtMs: number): void {
    this.blink = (this.blink + dtMs) % 600;
  }

  onInput(button: Button, pressed: boolean): void {
    if (!pressed || this.saving) return;
    switch (button) {
      case 'up':
        this.chars[this.cursor] = (this.chars[this.cursor] + 1) % ALPHABET.length;
        break;
      case 'down':
        this.chars[this.cursor] = (this.chars[this.cursor] - 1 + ALPHABET.length) % ALPHABET.length;
        break;
      case 'left':
        this.cursor = (this.cursor - 1 + LEN) % LEN;
        break;
      case 'right':
        this.cursor = (this.cursor + 1) % LEN;
        break;
      case 'a':
        if (this.cursor < LEN - 1) this.cursor++;
        else this.submit();
        break;
      case 'b':
        if (this.cursor > 0) this.cursor--;
        break;
      case 'start':
        this.submit();
        break;
    }
  }

  private submit(): void {
    if (this.saving) return;
    this.saving = true;
    const name = this.name;
    this.host.scores
      .submitScore(this.gameId, this.score, name)
      .catch(() => {})
      .then(() => {
        this.host.showLeaderboard(this.gameId, { name, score: Math.floor(this.score) || 0 });
      });
  }

  render(screen: Screen): void {
    screen.clear('lightest');
    screen.fillRect(0, 0, COLS, 1, ' ', 'lightest', 'darkest');
    screen.textCentered(0, 'NEW HIGH SCORE', 'lightest', 'darkest');
    screen.textCentered(3, 'SCORE', 'dark');
    screen.textCentered(4, String(Math.floor(this.score) || 0), 'darkest');

    if (this.saving) {
      screen.textCentered(9, 'SAVING...', 'dark');
      return;
    }

    screen.textCentered(7, 'ENTER YOUR NAME', 'dark');

    // Three big slots, centered. Each slot is 3 cells wide with a gap.
    const slotW = 4;
    const totalW = LEN * slotW - 1;
    const startX = Math.floor((COLS - totalW) / 2);
    const midY = 10;
    const show = this.blink < 400;
    for (let i = 0; i < LEN; i++) {
      const x = startX + i * slotW;
      const ch = ALPHABET[this.chars[i]];
      const active = i === this.cursor;
      if (active) {
        screen.set(x + 1, midY - 1, show ? '^' : ' ', 'dark');
        screen.set(x + 1, midY + 1, show ? 'v' : ' ', 'dark');
        screen.fillRect(x, midY, 3, 1, ' ', 'lightest', 'dark');
        screen.set(x + 1, midY, ch === ' ' ? '_' : ch, 'lightest', 'dark');
      } else {
        screen.set(x + 1, midY, ch === ' ' ? '_' : ch, 'darkest');
      }
    }

    screen.hline(0, ROWS - 2, COLS, '-', 'dark');
    screen.text(0, ROWS - 1, 'A OK', 'dark');
    screen.text(COLS - 8, ROWS - 1, 'B BACK', 'dark');
  }
}
