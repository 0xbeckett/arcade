import { Database } from "bun:sqlite";
import { basename, extname, resolve, sep } from "node:path";

const port = Number.parseInt(process.env.PORT ?? "8787", 10) || 8787;
const publicDir = resolve(import.meta.dir, "public");
const publicPrefix = `${publicDir}${sep}`;
const games = [
  "snake",
  "tetris",
  "blocks2048",
  "pong",
  "minesweeper",
  "breakout",
  "flappy",
  "shmup",
  "asteroids",
  "runner",
] as const;
const gameSet = new Set<string>(games);

const db = new Database("scores.db", { create: true });
db.run(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY,
    game TEXT NOT NULL,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    ts INTEGER NOT NULL
  )
`);
db.run("CREATE INDEX IF NOT EXISTS scores_game_score ON scores (game, score DESC)");

const insertScore = db.prepare(
  "INSERT INTO scores (game, name, score, ts) VALUES ($game, $name, $score, $ts)",
);
const bestScore = db.prepare(
  "SELECT MAX(score) AS best FROM scores WHERE game = $game AND name = $name",
);
const rankScore = db.prepare(
  "SELECT COUNT(*) AS higher FROM scores WHERE game = $game AND score > $score",
);
const leaderboard = db.prepare(
  "SELECT name, score, ts FROM scores WHERE game = $game ORDER BY score DESC, id ASC LIMIT $limit",
);

type RateWindow = { count: number; resetAt: number };
const rateLimits = new Map<string, RateWindow>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function json(body: unknown, status = 200, cors = false): Response {
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (cors) headers["access-control-allow-origin"] = "*";
  return new Response(JSON.stringify(body), { status, headers });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function parseLimit(value: string | null): number | null {
  if (value === null) return 10;
  if (!/^[0-9]+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 50 ? limit : null;
}

function clientIp(request: Request, server: ReturnType<typeof Bun.serve>): string {
  // The tunnel/proxy supplies this header; local development falls back to the socket address.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",", 1)[0].trim() || "unknown";
  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp) return cloudflareIp;
  return server.requestIP(request)?.address ?? "unknown";
}

function takeRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = rateLimits.get(ip);
  if (!existing || now >= existing.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (existing.count >= RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}

async function score(request: Request, server: ReturnType<typeof Bun.serve>): Promise<Response> {
  const rate = takeRateLimit(clientIp(request, server));
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "retry-after": String(rate.retryAfter),
      },
    });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return badRequest("invalid JSON");
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return badRequest("score payload must be an object");
  }

  const { game, name, score: value } = input as Record<string, unknown>;
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (typeof game !== "string" || !gameSet.has(game)) return badRequest("invalid game");
  if (cleanName.length < 1 || cleanName.length > 16) return badRequest("invalid name");
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100_000_000) {
    return badRequest("invalid score");
  }

  const now = Date.now();
  const params = { game, name: cleanName, score: value, ts: now };
  insertScore.run(params);
  const best = (bestScore.get(params) as { best: number }).best;
  const higher = (rankScore.get({ game, score: best }) as { higher: number }).higher;

  return json({ rank: higher + 1, best, top: value === best });
}

async function staticFile(pathname: string): Promise<Response> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const target = resolve(publicDir, `.${decoded}`);
  const isWithinPublic = target.startsWith(publicPrefix);
  const candidate = isWithinPublic ? Bun.file(target) : Bun.file(resolve(publicDir, "index.html"));
  const file = (await candidate.exists()) ? candidate : Bun.file(resolve(publicDir, "index.html"));
  const type = mimeTypes[extname(basename(file.name)).toLowerCase()] ?? "application/octet-stream";
  return new Response(file, { headers: { "content-type": type } });
}

const server = Bun.serve({
  port,
  async fetch(request, server) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/api/health" && request.method === "GET") return json({ ok: true });
    if (pathname === "/api/score" && request.method === "POST") return score(request, server);
    if (pathname === "/api/leaderboard" && request.method === "GET") {
      const game = url.searchParams.get("game");
      const limit = parseLimit(url.searchParams.get("limit"));
      if (!gameSet.has(game ?? "")) return badRequest("invalid game");
      if (limit === null) return badRequest("invalid limit");
      return json(leaderboard.all({ game, limit }), 200, true);
    }
    if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    const response = await staticFile(pathname);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
});

console.log(`Arcade listening on http://localhost:${server.port}`);
