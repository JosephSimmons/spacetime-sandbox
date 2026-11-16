// Headless smoke test: loads the built page, runs optional setup code, saves a
// screenshot and reports console and in-app errors.
// Usage: node scripts/shot.mjs <name> [js-to-eval] [wait-ms]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [name = 'shot', code = '', wait = '1500'] = process.argv.slice(2);
fs.mkdirSync(path.join(root, 'scripts/shots'), { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('file://' + path.join(root, 'dist/index.html'));
await page.waitForTimeout(800);
if (code) { try { await page.evaluate(code); } catch (e) { logs.push(`[eval] ${e.message}`); } }
await page.waitForTimeout(+wait);
const errs = await page.evaluate(() => (window.__app ? window.__app.errors : ['no app']));
await page.screenshot({ path: path.join(root, `scripts/shots/${name}.png`) });
await browser.close();
const all = [...logs, ...errs.map((e) => `[app] ${e}`)];
console.log(all.length ? all.slice(0, 12).join('\n') : `${name}: ok`);
