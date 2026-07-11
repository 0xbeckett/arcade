import { Database } from "bun:sqlite";
import { basename, extname, resolve, sep } from "node:path";

function portFromEnvironment(): number {
  const candidate = Number(process.env.PORT ?? 8787);
  return Number.isInteger(candidate) && candidate > 0 && candidate < 65_536 ? candidate : 8787;
}

const port = portFromEnvironment();
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
  "INSERT INTO scores (game, name, score, ts) VALUES (?, ?, ?, ?)",
);
const bestScore = db.prepare(
  "SELECT MAX(score) AS best FROM scores WHERE game = ? AND name = ?",
);
const rankScore = db.prepare(
  "SELECT COUNT(*) AS higher FROM scores WHERE game = ? AND score > ?",
);
const leaderboard = db.prepare(
  "SELECT name, score, ts FROM scores WHERE game = ? ORDER BY score DESC, id ASC LIMIT ?",
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

function parseLimit(value: string | null): number {
  if (value === null || value === "") return 10;
  const limit = Number(value);
  if (!Number.isInteger(limit)) return 10;
  return Math.max(1, Math.min(50, limit));
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

  // The frozen game API documents `gameId`; accept `game` too for compatibility.
  const { game, gameId, name, score: value } = input as Record<string, unknown>;
  const gameKey = typeof game === "string" ? game : typeof gameId === "string" ? gameId : "";
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!gameSet.has(gameKey)) return badRequest("invalid game");
  const nameLength = Array.from(cleanName).length;
  if (nameLength < 1 || nameLength > 16) return badRequest("invalid name");
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100_000_000) {
    return badRequest("invalid score");
  }

  const now = Date.now();
  insertScore.run(gameKey, cleanName, value, now);
  const best = (bestScore.get(gameKey, cleanName) as { best: number }).best;
  const higher = (rankScore.get(gameKey, value) as { higher: number }).higher;
  const rank = higher + 1;

  return json({ rank, best, top: rank <= 10 });
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
  // Bind to a specific host when HOST is set (deploys bind loopback behind the
  // tunnel); default (unset) keeps Bun's all-interfaces bind for local dev.
  hostname: process.env.HOST || undefined,
  async fetch(request, server) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/api/health" && request.method === "GET") return json({ ok: true });
    if (pathname === "/api/score" && request.method === "POST") return score(request, server);
    if (pathname === "/api/leaderboard" && request.method === "GET") {
      const game = url.searchParams.get("game") ?? url.searchParams.get("gameId");
      const limit = parseLimit(url.searchParams.get("limit"));
      if (!gameSet.has(game ?? "")) return badRequest("invalid game");
      return json(leaderboard.all(game, limit), 200, true);
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
