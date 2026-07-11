/**
 * Build: bundle the TypeScript shell (src/main.ts) into public/arcade.js with
 * Bun's bundler. Zero third-party build deps. Games in public/games/*.js are
 * plain JS and are NOT bundled — they load at runtime.
 *
 *   bun run build.ts          one-shot
 *   bun run build.ts --watch  rebuild on src changes
 */
import { watch } from 'node:fs';

const OUT = 'public/arcade.js';

async function build(): Promise<boolean> {
  const t0 = performance.now();
  const result = await Bun.build({
    entrypoints: ['src/main.ts'],
    target: 'browser',
    minify: true,
    sourcemap: 'none',
  });
  if (!result.success) {
    console.error('✗ build failed:');
    for (const log of result.logs) console.error(log);
    return false;
  }
  await Bun.write(OUT, result.outputs[0]);
  const size = (await Bun.file(OUT).arrayBuffer()).byteLength;
  const ms = (performance.now() - t0).toFixed(0);
  console.log(`✓ ${OUT}  ${(size / 1024).toFixed(1)} KB  (${ms}ms)`);
  return true;
}

const ok = await build();

if (process.argv.includes('--watch')) {
  console.log('watching src/ …');
  let timer: ReturnType<typeof setTimeout> | null = null;
  watch('src', { recursive: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(build, 80);
  });
} else if (!ok) {
  process.exit(1);
}
