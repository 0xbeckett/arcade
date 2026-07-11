# Arcade host

A small Bun + SQLite host for the arcade frontend and shared leaderboard API.

## Run

```sh
bun run start
```

The server listens on `PORT`, defaulting to `8787`:

```sh
PORT=3000 bun run start
```

Static files are served from `./public`; scores are stored in `./scores.db` (created automatically).
