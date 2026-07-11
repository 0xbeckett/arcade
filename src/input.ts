import type { Button, InputState } from './types';
import { BUTTONS } from './types';

export type EdgeListener = (button: Button, pressed: boolean) => void;

/**
 * Central input state. Physical sources (touch cluster, keyboard) call
 * press()/release(); the shell reads InputState and routes edges to the active
 * view. Edge queries (justPressed/justReleased) are valid for exactly one
 * update tick — the loop calls endTick() after each update() to clear them.
 */
export class InputManager implements InputState {
  private down = new Set<Button>();
  private pressedEdge = new Set<Button>();
  private releasedEdge = new Set<Button>();
  private listener: EdgeListener | null = null;

  /** Route button edges (e.g. to the active view's onInput). */
  onEdge(listener: EdgeListener | null): void {
    this.listener = listener;
  }

  isDown(button: Button): boolean {
    return this.down.has(button);
  }
  justPressed(button: Button): boolean {
    return this.pressedEdge.has(button);
  }
  justReleased(button: Button): boolean {
    return this.releasedEdge.has(button);
  }

  press(button: Button): void {
    if (this.down.has(button)) return; // ignore auto-repeat / held
    this.down.add(button);
    this.pressedEdge.add(button);
    this.listener?.(button, true);
  }

  release(button: Button): void {
    if (!this.down.has(button)) return;
    this.down.delete(button);
    this.releasedEdge.add(button);
    this.listener?.(button, false);
  }

  /** Release everything (e.g. on blur / view switch) without stuck keys. */
  releaseAll(): void {
    for (const b of Array.from(this.down)) this.release(b);
  }

  /** Clear all state and edges WITHOUT firing the edge listener. Used when the
   * shell swaps scenes, so a held button doesn't leak a stray edge to the new
   * scene and no phantom releases fire on the old (torn-down) scene. */
  resetSilently(): void {
    this.down.clear();
    this.pressedEdge.clear();
    this.releasedEdge.clear();
  }

  /** Called by the loop after update() to expire one-tick edges. */
  endTick(): void {
    if (this.pressedEdge.size) this.pressedEdge.clear();
    if (this.releasedEdge.size) this.releasedEdge.clear();
  }
}

/** Desktop keyboard mapping: arrows/WASD + Z/X + Enter/Shift (+ handy extras). */
const KEY_MAP: Record<string, Button> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  z: 'a',
  x: 'b',
  k: 'a',
  l: 'b',
  ' ': 'a',
  Enter: 'start',
  Shift: 'select',
};

function resolveKey(e: KeyboardEvent): Button | undefined {
  // Prefer a case-insensitive letter match; fall back to the exact key.
  const k = e.key;
  if (k.length === 1) {
    const lower = k.toLowerCase();
    if (KEY_MAP[lower]) return KEY_MAP[lower];
  }
  return KEY_MAP[k];
}

/** Bind the keyboard to an InputManager. Returns an unbind function. */
export function bindKeyboard(input: InputManager): () => void {
  const onDown = (e: KeyboardEvent) => {
    const btn = resolveKey(e);
    if (!btn) return;
    e.preventDefault();
    if (e.repeat) return;
    input.press(btn);
  };
  const onUp = (e: KeyboardEvent) => {
    const btn = resolveKey(e);
    if (!btn) return;
    e.preventDefault();
    input.release(btn);
  };
  const onBlur = () => input.releaseAll();
  window.addEventListener('keydown', onDown, { passive: false });
  window.addEventListener('keyup', onUp, { passive: false });
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
  };
}

export { BUTTONS };
