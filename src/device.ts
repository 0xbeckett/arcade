import type { Button } from './types';
import type { InputManager } from './input';

/**
 * Wires the physical control cluster (already in the DOM) to the InputManager.
 * Uses Pointer Events so touch and mouse share one path with no 300ms tap delay
 * and full multi-touch (press A + a direction at once). touch-action:none in the
 * CSS kills scroll/zoom/double-tap; we also preventDefault to stop synthetic
 * mouse + text selection. Press states are reflected with a .pressed class.
 */
export function bindControls(input: InputManager, root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-btn]').forEach((el) => {
    bindButton(input, el, el.dataset.btn as Button);
  });
  const dpad = root.querySelector<HTMLElement>('#dpad');
  if (dpad) bindDpad(input, dpad);

  // Long-press context menu / callout gets in the way on mobile.
  root.addEventListener('contextmenu', (e) => e.preventDefault());
}

function haptic(): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(8);
  } catch {
    /* not supported / blocked */
  }
}

function bindButton(input: InputManager, el: HTMLElement, btn: Button): void {
  if (!btn) return;
  const down = (e: PointerEvent) => {
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!el.classList.contains('pressed')) {
      el.classList.add('pressed');
      haptic();
      input.press(btn);
    }
  };
  const up = (e: PointerEvent) => {
    if (!el.classList.contains('pressed')) return;
    el.classList.remove('pressed');
    input.release(btn);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}

type Dirs = { up: boolean; down: boolean; left: boolean; right: boolean };
const NO_DIRS: Dirs = { up: false, down: false, left: false, right: false };

function bindDpad(input: InputManager, dpad: HTMLElement): void {
  const cells: Partial<Record<keyof Dirs, HTMLElement>> = {};
  dpad.querySelectorAll<HTMLElement>('[data-dir]').forEach((c) => {
    cells[c.dataset.dir as keyof Dirs] = c;
  });

  let pointerId: number | null = null;
  let rect: DOMRect | null = null;
  let current: Dirs = { ...NO_DIRS };

  const DEAD = 0.32; // dead zone / diagonal threshold (fraction of half-size)

  const compute = (clientX: number, clientY: number): Dirs => {
    if (!rect) return { ...NO_DIRS };
    const nx = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const ny = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    return {
      up: ny < -DEAD,
      down: ny > DEAD,
      left: nx < -DEAD,
      right: nx > DEAD,
    };
  };

  const apply = (next: Dirs) => {
    (['up', 'down', 'left', 'right'] as (keyof Dirs)[]).forEach((d) => {
      if (next[d] && !current[d]) {
        input.press(d as Button);
        cells[d]?.classList.add('active');
        haptic();
      } else if (!next[d] && current[d]) {
        input.release(d as Button);
        cells[d]?.classList.remove('active');
      }
    });
    current = next;
  };

  const down = (e: PointerEvent) => {
    e.preventDefault();
    pointerId = e.pointerId;
    try {
      dpad.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    rect = dpad.getBoundingClientRect();
    apply(compute(e.clientX, e.clientY));
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    apply(compute(e.clientX, e.clientY));
  };
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    apply({ ...NO_DIRS });
    pointerId = null;
    rect = null;
  };

  dpad.addEventListener('pointerdown', down);
  dpad.addEventListener('pointermove', move);
  dpad.addEventListener('pointerup', end);
  dpad.addEventListener('pointercancel', end);
  dpad.addEventListener('lostpointercapture', end);
}
