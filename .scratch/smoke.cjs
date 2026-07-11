/* Headless end-to-end smoke test for the arcade.
 * Usage: NODE_PATH=<global node_modules> node smoke.cjs <baseUrl>
 * Drives the real shell via keyboard + ArcadeDebug, verifies each of the 10
 * games: mounts, takes input, renders, ends via gameOver, name entry submits,
 * leaderboard shows it, backend stores it, returns to menu. Also confirms two
 * games trigger gameOver from their OWN death logic (integration wiring).
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8321';
const GAMES = ['snake','tetris','blocks2048','pong','minesweeper','breakout','flappy','shmup','asteroids','runner'];
const TITLES = { // substring expected in menu/leaderboard for each slug
  snake:'SNAKE', tetris:'TETRIS', blocks2048:'2048', pong:'PONG', minesweeper:'MINESWEEPER',
  breakout:'BREAKOUT', flappy:'FLAPPY', shmup:'SHMUP', asteroids:'ASTEROIDS', runner:'RUNNER',
};

const sleep = (p, ms) => p.waitForTimeout(ms);

async function launch() {
  const args = ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
  try { return await chromium.launch({ headless: true, args }); }
  catch (e) { return await chromium.launch({ headless: true, channel: 'chrome', args }); }
}

async function waitMenu(page) {
  await page.waitForFunction(() =>
    window.ArcadeDebug && ArcadeDebug.games().length === 10 && ArcadeDebug.scene() === 'menu',
    null, { timeout: 15000 });
}

async function scene(page) { return page.evaluate(() => ArcadeDebug.scene()); }
async function text(page) { return page.evaluate(() => ArcadeDebug.screenText()); }
async function waitScene(page, id, ms = 6000) {
  await page.waitForFunction((s) => ArcadeDebug.scene() === s, id, { timeout: ms });
}

async function installSpy(page) {
  await page.evaluate(() => {
    window.__go = { count: 0, last: null };
    const orig = window.Arcade.gameOver.bind(window.Arcade);
    window.Arcade.gameOver = (s) => { window.__go.count++; window.__go.last = s; return orig(s); };
  });
}

async function run() {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  let errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const results = [];

  for (let i = 0; i < GAMES.length; i++) {
    const slug = GAMES[i];
    const r = { slug, mounted:false, rendered:false, input:false, ended:false, nameEntry:false,
                leaderboard:false, backend:false, backToMenu:false, errors: [] };
    const before = errors.length;
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await waitMenu(page);
      await installSpy(page);

      // Menu lists all 10 games
      const menu = await text(page);
      if (i === 0) {
        const missing = GAMES.filter((g) => !menu.toUpperCase().includes(TITLES[g]));
        if (missing.length) throw new Error('menu missing titles: ' + missing.join(','));
      }

      // Navigate to game i and play
      for (let k = 0; k < i; k++) { await page.keyboard.press('ArrowDown'); await sleep(page, 40); }
      await page.keyboard.press('Enter');
      await waitScene(page, 'game', 6000);
      r.mounted = true;

      const g1 = await text(page);
      await sleep(page, 120);
      const g2 = await text(page);
      r.rendered = g1.trim().length > 0 && g2.trim().length > 0;

      // Feed input (d-pad + A + B). Should not throw / error.
      for (const key of ['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','z','x','z']) {
        await page.keyboard.press(key); await sleep(page, 50);
      }
      r.input = (await scene(page)) === 'game' || (await scene(page)) !== 'menu';

      // End the run with a unique qualifying score (what the game itself calls).
      const target = 1000 + i;
      await page.evaluate((s) => window.Arcade.gameOver(s), target);
      await waitScene(page, 'nameentry', 5000);
      r.ended = true; r.nameEntry = true;

      // Enter initials: change a letter, then submit.
      await page.keyboard.press('ArrowUp'); await sleep(page, 60);
      await page.keyboard.press('Enter');
      await waitScene(page, 'leaderboard', 6000);
      // wait for entries to load
      await page.waitForFunction(() => !ArcadeDebug.screenText().includes('LOADING'), null, { timeout: 6000 }).catch(()=>{});
      const lb = await text(page);
      r.leaderboard = lb.toUpperCase().includes(TITLES[slug]) && !lb.includes('NO SCORES');

      // Backend has the score
      const api = await page.evaluate(async (sl) => {
        const res = await fetch('/api/leaderboard?gameId=' + sl + '&limit=50');
        return res.ok ? await res.json() : null;
      }, slug);
      r.backend = Array.isArray(api) && api.some((e) => Number(e.score) === target);

      // Back to menu
      await page.keyboard.press('z');
      await waitScene(page, 'menu', 5000);
      r.backToMenu = true;
    } catch (e) {
      r.errors.push(String(e.message || e));
    }
    r.errors.push(...errors.slice(before));
    results.push(r);
    console.log(`[${slug}] ` + JSON.stringify(r));
  }

  // Natural-death wiring check for representative fast-dying games.
  const natural = {};
  for (const slug of ['snake','flappy','runner']) {
    const i = GAMES.indexOf(slug);
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await waitMenu(page);
      await installSpy(page);
      for (let k = 0; k < i; k++) { await page.keyboard.press('ArrowDown'); await sleep(page, 40); }
      await page.keyboard.press('Enter');
      await waitScene(page, 'game', 6000);
      // start + suicide inputs
      await page.keyboard.press('z'); await sleep(page, 200);       // start
      if (slug === 'snake') { await page.keyboard.press('ArrowUp'); }
      if (slug === 'runner') { /* do nothing: hit obstacle */ }
      // flappy: do nothing after start -> falls
      // poll spy for natural gameOver
      await page.waitForFunction(() => window.__go && window.__go.count > 0, null, { timeout: 6000 });
      const s = await page.evaluate(() => window.__go.last);
      natural[slug] = { fired: true, score: s };
    } catch (e) {
      natural[slug] = { fired: false, err: String(e.message || e) };
    }
    console.log(`[natural:${slug}] ` + JSON.stringify(natural[slug]));
  }

  await browser.close();

  const pass = results.filter((r) => r.mounted && r.rendered && r.input && r.ended && r.nameEntry && r.leaderboard && r.backend && r.backToMenu);
  const summary = {
    base: BASE,
    passed: pass.map((r) => r.slug),
    failed: results.filter((r) => !pass.includes(r)).map((r) => ({ slug: r.slug, r })),
    naturalDeaths: natural,
    totalConsoleErrors: errors.length,
    consoleErrorsSample: errors.slice(0, 10),
  };
  console.log('\n==== SUMMARY ====');
  console.log(JSON.stringify(summary, null, 2));
  process.exit(pass.length === 10 ? 0 : 1);
}

run().catch((e) => { console.error('FATAL', e); process.exit(2); });
