const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8321';
const sleep = (p, ms) => p.waitForTimeout(ms);
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ArcadeDebug && ArcadeDebug.games().length === 10, null, { timeout: 15000 });
  await sleep(page, 400);
  console.log('renderer:', await page.evaluate(() => ArcadeDebug.renderer()));
  await page.screenshot({ path: '.scratch/shot_menu.png' });
  // enter snake
  await page.keyboard.press('Enter'); await sleep(page, 200);
  await page.keyboard.press('z'); await sleep(page, 600); // start snake, let it run
  await page.screenshot({ path: '.scratch/shot_snake.png' });
  // trigger name entry
  await page.evaluate(() => window.Arcade.gameOver(4242)); await sleep(page, 400);
  await page.screenshot({ path: '.scratch/shot_name.png' });
  await page.keyboard.press('Enter'); await sleep(page, 600); // submit
  await page.screenshot({ path: '.scratch/shot_lb.png' });
  await browser.close();
  console.log('shots done');
})().catch(e => { console.error(e); process.exit(1); });
