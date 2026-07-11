# public/games — the game plugin folder

Each game is a single self-contained file: `public/games/<slug>.js`. It calls
`window.Arcade.registerGame({...})` once at load time. Nothing else in the shell
needs to change.

## Adding a game (the registration hook)

1. Copy [`_template.js`](./_template.js) to `public/games/<your-slug>.js`.
2. Implement the [`GameModule`](./arcade.d.ts) (`id`, `title`, `init`, `update`,
   `render`, `onInput`, `destroy`) and `window.Arcade.registerGame(game)`.
3. Add `"<your-slug>"` to the `games` array in
   [`manifest.json`](./manifest.json). Array order = menu order.

That's it. The shell fetches `manifest.json` at boot and loads each listed file.
The menu is built from whatever registers — **do not edit the shell/menu/registry
to add a game.**

- `arcade.d.ts` — optional TypeScript types for JSDoc autocomplete.
- `demo.js` — the bundled self-test (`DEMO: CATCH`). A working reference; not one
  of the 10 games. Loaded only as a fallback when the manifest is empty.

Full contract and Screen/Arcade reference: [`/docs/GAME_API.md`](../../docs/GAME_API.md).
