import type { GameModule } from './types';

/**
 * Holds every registered game. This is the single source of truth the home menu
 * is built from — the shell never hardcodes a game list. Games (including the
 * bundled self-test demo) all arrive through register(), keyed by id, in
 * registration order. Re-registering an id replaces it (handy for hot reloads).
 */
export class Registry {
  private games = new Map<string, GameModule>();
  private order: string[] = [];
  private listeners = new Set<() => void>();

  register(game: GameModule): void {
    if (!isValidGame(game)) {
      console.error('[arcade] ignored invalid game module:', game);
      return;
    }
    if (!this.games.has(game.id)) this.order.push(game.id);
    this.games.set(game.id, game);
    this.emit();
  }

  get(id: string): GameModule | undefined {
    return this.games.get(id);
  }

  list(): GameModule[] {
    return this.order.map((id) => this.games.get(id)!).filter(Boolean);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

function isValidGame(g: any): g is GameModule {
  return (
    g &&
    typeof g.id === 'string' &&
    g.id.length > 0 &&
    typeof g.title === 'string' &&
    typeof g.init === 'function' &&
    typeof g.update === 'function' &&
    typeof g.render === 'function' &&
    typeof g.onInput === 'function' &&
    typeof g.destroy === 'function'
  );
}
