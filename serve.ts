/**
 * DEV-ONLY static server + MOCK backend, so the shell can be run and tested
 * end-to-end locally without the real backend. It serves ./public and provides
 * an in-memory implementation of the frozen score API:
 *
 *   GET  /api/leaderboard?gameId=<id>&limit=<n>  -> { entries: [{name,score}] }
 *   POST /api/score  { gameId, name, score }     -> { ok, entries }
 *
 * The production backend (separate ticket) owns the real implementation; this
 * file is a convenience for local development only and is NOT part of ./public.
 *
 *   bun run serve.ts [port]
 */
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const ROOT = new URL('./public/', import.meta.url);

/** gameId -> entries (unsorted); tiny in-memory leaderboard. */
const boards = new Map<string, { name: string; score: number }[]>();

function topOf(gameId: string, limit = 25) {
  const list = (boards.get(gameId) ?? []).slice().sort((a, b) => b.score - a.score).slice(0, limit);
  return list.map((e, i) => ({ ...e, rank: i + 1 }));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/api/leaderboard' && req.method === 'GET') {
      const gameId = url.searchParams.get('gameId') ?? '';
      const limit = Number(url.searchParams.get('limit') ?? 25);
      return json({ entries: topOf(gameId, limit) });
    }
    if (path === '/api/score' && req.method === 'POST') {
      try {
        const body = (await req.json()) as { gameId?: string; name?: string; score?: number };
        const gameId = String(body.gameId ?? '');
        const name = String(body.name ?? 'AAA').toUpperCase().slice(0, 6);
        const score = Math.floor(Number(body.score) || 0);
        if (!gameId) return json({ ok: false, error: 'missing gameId' }, 400);
        const list = boards.get(gameId) ?? [];
        list.push({ name, score });
        boards.set(gameId, list);
        return json({ ok: true, entries: topOf(gameId) });
      } catch {
        return json({ ok: false, error: 'bad body' }, 400);
      }
    }
    if (path === '/api/_reset' && req.method === 'POST') {
      boards.clear();
      return json({ ok: true });
    }
    if (path === '/api/score' && req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,GET,OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
    }

    // Static files.
    let rel = decodeURIComponent(path).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = Bun.file(new URL(rel, ROOT));
    if (await file.exists()) return new Response(file);

    // Fallback to index.html for the app root.
    if (!rel.startsWith('api/')) return new Response(Bun.file(new URL('index.html', ROOT)));
    return new Response('not found', { status: 404 });
  },
});

console.log(`arcade dev server → http://localhost:${server.port}`);
