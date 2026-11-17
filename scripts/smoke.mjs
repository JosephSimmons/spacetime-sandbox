// Visits every station and the corridor, exercises a few controls, and fails on any error.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The help overlay opens on a first visit; it does not block the checks.
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('file://' + path.join(root, 'dist/index.html'));
await page.waitForTimeout(600);
await page.keyboard.press('Escape'); // dismiss the first-visit help
const ids = await page.evaluate(() => window.__app.stations.map((s) => s.id));
for (const id of ids) {
  await page.evaluate((i) => window.__app.jump(i), id);
  await page.waitForTimeout(1200);
  // Wiggle every slider and click every panel button once.
  await page.evaluate(() => {
    for (const inp of document.querySelectorAll('#left input[type=range], #right input[type=range]')) {
      const old = inp.value; inp.value = String(Math.min(1000, +old + 37)); inp.dispatchEvent(new Event('input')); inp.value = old; inp.dispatchEvent(new Event('input'));
    }
    for (const b of document.querySelectorAll('#left button, #right button')) b.click();
    for (const c of document.querySelectorAll('#left input[type=checkbox]')) { c.click(); c.click(); }
  });
  await page.waitForTimeout(900);
  // Constants.
  await page.evaluate(() => { const a = window.__app; a.ctx.consts.c = 1e-3; a.ctx.consts.G = 2; a.ctx.consts.hbar = 3; a.ctx.constsChanged(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const a = window.__app; a.ctx.consts.c = 1; a.ctx.consts.G = 1; a.ctx.consts.hbar = 1; a.ctx.constsChanged(); if (a.active) a.active.reset(a.ctx); });
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ active: window.__app.active?.id, errs: window.__app.errors.length }));
  console.log(`${id}: active=${st.active} errors=${st.errs}`);
}
// Sweep the whole scale axis.
for (let s = -15; s <= 27; s += 0.7) { await page.evaluate((v) => window.__app.ctx.setLogScale(v), s); await page.waitForTimeout(120); }
await page.click('#btnChallenges'); await page.waitForTimeout(200);
const errs = await page.evaluate(() => window.__app.errors);
await browser.close();
const all = [...logs, ...errs.map((e) => `[app] ${e}`)];
if (all.length) { console.log(all.slice(0, 10).join('\n')); process.exit(1); }
console.log('smoke test passed');
