import type { LeaderboardEntry } from './types';

/**
 * Score + leaderboard service. Talks to the backend contract:
 *
 *   POST /api/score          body: { gameId, name, score }
 *   GET  /api/leaderboard    query: ?gameId=<id>&limit=<n>
 *
 * Everything degrades gracefully: a localStorage mirror keeps best scores and a
 * per-game top list so games work fully offline and the leaderboard overlay
 * always has something to show. Response parsing is deliberately tolerant of a
 * few common JSON shapes so we don't break if the backend wraps its payload.
 *
 * The API base is same-origin by default (the backend serves ./public). Override
 * with `window.ARCADE_API_BASE = "https://host"` before the shell boots.
 */

const NETWORK_TIMEOUT_MS = 4000;
const LOCAL_TOP = 25;
const BEST_KEY = (id: string) => `arcade:best:${id}`;
const BOARD_KEY = (id: string) => `arcade:lb:${id}`;
const NAME_KEY = 'arcade:name';

// A storage wrapper that never throws (Safari private mode, quota, etc.).
const mem = new Map<string, string>();
const store = {
  get(key: string): string | null {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : mem.get(key) ?? null;
    } catch {
      return mem.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    mem.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* keep in-memory copy */
    }
  },
};

export function sanitizeName(raw: string | undefined | null): string {
  const s = (raw ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  return (s || 'AAA').slice(0, 6);
}

function toEntries(data: any): LeaderboardEntry[] {
  let arr: any[] | null = null;
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === 'object') {
    arr = data.entries || data.leaderboard || data.scores || data.top || data.results || null;
  }
  if (!Array.isArray(arr)) return [];
  const out: LeaderboardEntry[] = [];
  for (const e of arr) {
    if (!e) continue;
    const name = sanitizeName(String(e.name ?? e.initials ?? e.player ?? '???'));
    const score = Number(e.score ?? e.points ?? e.value ?? 0);
    if (!Number.isFinite(score)) continue;
    out.push({ name, score });
  }
  return out;
}

function rankAndSort(entries: LeaderboardEntry[], limit?: number): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const sliced = limit ? sorted.slice(0, limit) : sorted;
  return sliced.map((e, i) => ({ ...e, rank: i + 1 }));
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class Scores {
  private base: string;

  constructor(apiBase?: string) {
    const fromGlobal = typeof window !== 'undefined' ? (window as any).ARCADE_API_BASE : undefined;
    this.base = (apiBase ?? fromGlobal ?? '').replace(/\/$/, '');
  }

  lastName(): string {
    return sanitizeName(store.get(NAME_KEY) ?? 'AAA');
  }

  getBestScore(gameId: string): number {
    const raw = store.get(BEST_KEY(gameId));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  setBestScore(gameId: string, score: number): number {
    const best = Math.max(this.getBestScore(gameId), Math.floor(score) || 0);
    store.set(BEST_KEY(gameId), String(best));
    return best;
  }

  private readLocalBoard(gameId: string): LeaderboardEntry[] {
    const raw = store.get(BOARD_KEY(gameId));
    if (!raw) return [];
    try {
      return toEntries(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private writeLocalBoard(gameId: string, entries: LeaderboardEntry[]): LeaderboardEntry[] {
    const ranked = rankAndSort(entries, LOCAL_TOP);
    store.set(BOARD_KEY(gameId), JSON.stringify(ranked.map((e) => ({ name: e.name, score: e.score }))));
    return ranked;
  }

  private mergeLocal(gameId: string, name: string, score: number): LeaderboardEntry[] {
    const board = this.readLocalBoard(gameId);
    board.push({ name, score: Math.floor(score) || 0 });
    return this.writeLocalBoard(gameId, board);
  }

  async getLeaderboard(gameId: string, limit = 10): Promise<LeaderboardEntry[]> {
    try {
      const url = `${this.base}/api/leaderboard?gameId=${encodeURIComponent(gameId)}&limit=${limit}`;
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const entries = toEntries(await res.json());
        if (entries.length || this.readLocalBoard(gameId).length === 0) {
          this.writeLocalBoard(gameId, entries);
          return rankAndSort(entries, limit);
        }
      }
    } catch {
      /* fall through to local mirror */
    }
    return rankAndSort(this.readLocalBoard(gameId), limit);
  }

  async submitScore(gameId: string, score: number, name?: string): Promise<LeaderboardEntry[]> {
    const nm = sanitizeName(name ?? this.lastName());
    if (name) store.set(NAME_KEY, nm);
    this.setBestScore(gameId, score);
    // Always mirror locally first so offline play still records the score.
    const localBoard = this.mergeLocal(gameId, nm, Math.floor(score) || 0);

    try {
      const res = await fetchWithTimeout(`${this.base}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, name: nm, score: Math.floor(score) || 0 }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const entries = data ? toEntries(data) : [];
        if (entries.length) {
          this.writeLocalBoard(gameId, entries);
          return rankAndSort(entries, 10);
        }
        // Backend acknowledged but returned no board — fetch a fresh one.
        return await this.getLeaderboard(gameId);
      }
    } catch {
      /* offline — use local mirror */
    }
    return rankAndSort(localBoard, 10);
  }

  /** Would this score make the visible leaderboard (used to gate name entry)? */
  async qualifies(gameId: string, score: number, boardSize = 10): Promise<boolean> {
    if (score <= 0) return false;
    const board = await this.getLeaderboard(gameId, boardSize);
    if (board.length < boardSize) return true;
    return score > board[board.length - 1].score;
  }
}
