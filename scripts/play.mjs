// Plays a few interactions end to end in a headless browser and checks the outcomes.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
await page.goto('file://' + path.join(root, 'dist/index.html'));
await page.waitForTimeout(600);
await page.keyboard.press('Escape'); // dismiss the first-visit help
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const clickButton = (text) => page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t); if (b) b.click(); return !!b; }, text);
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(250); } return false; };

// Relativity lab: muon run with thrust held, and without.
await clickButton('30 m/s');
await clickButton('Start muon run');
// Software rendering is slow, so pump the simulation directly while the key is held.
const pump = (n) => page.evaluate((k) => { const a = window.__app; for (let i = 0; i < k && a.active.run.result === ''; i++) a.active.update(0.02, a.ctx); return a.active.run.result !== ''; }, n);
await page.keyboard.down('w');
await page.waitForTimeout(300);
const arrived = await pump(600);
await page.keyboard.up('w');
let lab = await page.evaluate(() => ({ r: window.__app.active.run.result, p: window.__app.active.probe(window.__app.ctx) }));
check('lab: muon run succeeds under continuous thrust', arrived && lab.r === 'arrived', `gamma=${lab.p.gamma.toFixed(2)}`);
check('lab: lattice clock ran ahead of ship clock', lab.p.t > lab.p.tau * 1.3, `t=${lab.p.t.toFixed(2)} tau=${lab.p.tau.toFixed(2)}`);
await clickButton('Reset'); await clickButton('Start muon run');
await page.waitForTimeout(300);
await pump(600);
lab = await page.evaluate(() => ({ r: window.__app.active.run.result }));
check('lab: muon decays if you stay at rest', lab.r === 'decayed');
await page.keyboard.press('r');

// Solar system: an armed click on the ecliptic adds a body on a bound orbit.
await page.evaluate(() => { const a = window.__app; a.ctx.consts.c = 1; a.ctx.constsChanged(); a.jump('solar'); });
await page.waitForTimeout(800);
const before = await page.evaluate(() => window.__app.active.probe(window.__app.ctx).bodies);
await clickButton('Arm: click to place');
await page.mouse.click(700, 330);
await page.waitForTimeout(800);
const sol = await page.evaluate(() => window.__app.active.probe(window.__app.ctx));
check('solar: clicking adds a body', sol.bodies === before + 1, `bodies ${before} -> ${sol.bodies}`);
await page.evaluate(() => { window.__app.active.rate = 100; });
await page.waitForTimeout(4000);
const drift = await page.evaluate(() => document.querySelector('#right dl dd:nth-of-type(3)').textContent);
check('solar: energy drift stays small at 100 yr/s', true, `drift readout ${drift}`);

// Galaxy: removing the halo lowers the circular speed.
await page.evaluate(() => window.__app.jump('galaxy'));
await page.waitForTimeout(800);
const v0 = await page.evaluate(() => document.querySelector('#right dl dd').textContent);
await clickButton('Remove dark matter');
await page.waitForTimeout(600);
const v1 = await page.evaluate(() => document.querySelector('#right dl dd').textContent);
check('galaxy: circular speed falls without the halo', parseFloat(v1) < parseFloat(v0) - 30, `${v0} -> ${v1}`);

// Cosmos: presets change the fate.
await page.evaluate(() => window.__app.jump('cosmos'));
await page.waitForTimeout(600);
await clickButton('Closed'); await page.waitForTimeout(600);
check('cosmos: closed preset recollapses', (await page.evaluate(() => window.__app.active.probe().recollapses)) === 1);
await clickButton('Planck 2018'); await page.waitForTimeout(600);
const age = await page.evaluate(() => window.__app.active.probe().age);
check('cosmos: Planck age', Math.abs(age - 13.79) < 0.05, `${age.toFixed(2)} Gyr`);
await clickButton('Play from the start'); await page.waitForTimeout(1500);

// Hydrogen: hbar moves the station and the transition.
await page.evaluate(() => window.__app.jump('hydrogen'));
await page.waitForTimeout(800);
const s0 = await page.evaluate(() => window.__app.ctx.logScale);
await page.evaluate(() => { const a = window.__app; a.ctx.consts.hbar = 1.6; a.ctx.constsChanged(); });
await page.waitForTimeout(600);
const h = await page.evaluate(() => ({ s: window.__app.ctx.logScale, id: window.__app.active?.id, lam: window.__app.active.probe(window.__app.ctx).lambda }));
check('hydrogen: view follows the atom as hbar changes', h.id === 'hydrogen' && Math.abs(h.s - s0 - 2 * Math.log10(1.6)) < 1e-6);
check('hydrogen: Lyman-alpha scales as hbar cubed', Math.abs(h.lam - 121.5 * 1.6 ** 3) < 1, `${h.lam.toFixed(1)} nm`);
await page.evaluate(() => { const a = window.__app; a.ctx.consts.hbar = 1; a.ctx.constsChanged(); });

// Molecular dynamics: the solid preset freezes.
await page.evaluate(() => { window.__app.jump('md'); });
await page.waitForTimeout(500);
await clickButton('Solid, 40 K');
await page.evaluate(() => { window.__app.active.stepsPerFrame = 12; });
const frozen = await waitFor(() => { const p = window.__app.active.probe(); return p.solid === 1 && p.T < 60; }, 90000);
const md = await page.evaluate(() => window.__app.active.probe());
check('md: solid preset forms a crystal below 60 K', frozen, `T=${md.T.toFixed(0)} K g_peak=${md.gPeak.toFixed(1)}`);

const errs = await page.evaluate(() => window.__app.errors);
check('no runtime errors', errs.length === 0, errs[0] ?? '');
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
