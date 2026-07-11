import { Shell } from './shell';
import { bindControls } from './device';
import { bindKeyboard } from './input';

/**
 * Boot the Arcade. Creates the shell, installs the public `window.Arcade` API,
 * wires the physical controls + keyboard, then loads games. The bundled demo
 * self-test is always loaded; the integration ticket adds the real games by
 * listing their slugs in public/games/manifest.json (nothing here is hardcoded).
 */

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // keep execution order deterministic
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function loadGames(): Promise<void> {
  let slugs: string[] = [];
  try {
    const res = await fetch('games/manifest.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      const raw = Array.isArray(data) ? data : data?.games;
      if (Array.isArray(raw)) slugs = raw.filter((s) => typeof s === 'string');
    }
  } catch (err) {
    console.warn('[arcade] no games manifest:', err);
  }

  // The demo is the bundled self-test — always present, even if the manifest is
  // empty or missing. Registration dedupes by id, so listing it is harmless.
  if (!slugs.includes('demo')) slugs.push('demo');

  for (const slug of slugs) {
    try {
      await loadScript(`games/${slug}.js`);
    } catch (err) {
      console.warn(`[arcade] game "${slug}" failed to load:`, err);
    }
  }
}

/** Belt-and-suspenders against mobile gesture zoom (CSS handles scroll/pan). */
function preventGestureZoom(): void {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', stop as EventListener, { passive: false });
  document.addEventListener('gesturechange', stop as EventListener, { passive: false });
  let lastTouch = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault(); // double-tap zoom
      lastTouch = now;
    },
    { passive: false },
  );
}

function boot(): void {
  const canvas = document.getElementById('lcd') as HTMLCanvasElement | null;
  const device = document.getElementById('arcade') as HTMLElement | null;
  if (!canvas || !device) {
    console.error('[arcade] missing #lcd or #arcade in the DOM');
    return;
  }

  const apiBase = (window as any).ARCADE_API_BASE as string | undefined;
  const shell = new Shell({ canvas, apiBase });

  // Public plugin surface: games call window.Arcade.registerGame(...).
  (window as any).Arcade = shell.arcade;

  bindControls(shell.input, device);
  bindKeyboard(shell.input);
  preventGestureZoom();

  shell.start();
  void loadGames();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
