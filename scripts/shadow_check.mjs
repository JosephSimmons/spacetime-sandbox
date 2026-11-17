// Cross-checks the GLSL ray marcher against the analytic shadow size seen by a
// static observer: sin(psi) = sqrt(27) (GM/c^2) sqrt(1 - 2GM/(r c^2)) / r.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--disable-background-networking', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
await page.goto('file://' + path.join(root, 'dist/index.html'));
await page.waitForTimeout(600);
await page.keyboard.press('Escape');
await page.evaluate(() => { const a = window.__app; a.jump('blackhole'); });
await page.waitForTimeout(1500);
let ok = true;
for (const r of [40, 24, 10, 6, 4]) {
  const m = await page.evaluate((rr) => {
    const a = window.__app, s = a.active, v = a.ctx.view;
    s.mat.uniforms.uDisk.value = 0; s.mat.uniforms.uFlatSky.value = 1;
    a.ctx.setLogScale(s.centre(a.ctx.consts) + Math.log10(rr / 24));
    s.update(0, a.ctx); s.render(a.ctx);
    // Read the row through the view centre straight after rendering.
    const gl = a.ctx.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, k = W / window.innerWidth;
    const row = new Uint8Array(W * 4);
    gl.readPixels(0, Math.round(H - (v.y + v.h / 2) * k), W, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
    const x0 = Math.round((v.x + v.w / 2) * k), x1 = Math.round((v.x + v.w) * k);
    let px = 0;
    for (let x = x0; x < x1; x++) { if (row[4 * x] > 40) break; px++; }
    return { px: px / k, half: v.h / 2, tanFov: s.mat.uniforms.uTanFov.value, r: s.rCam, edge: (x1 - x0) / k };
  }, r);
  if (m.px >= m.edge - 1) { console.log(`r = ${m.r.toFixed(2)}: shadow fills the view, skipped`); continue; }
  const measured = Math.atan((m.px / m.half) * m.tanFov);
  const analytic = Math.asin((Math.sqrt(27) * Math.sqrt(1 - 2 / m.r)) / m.r);
  const err = Math.abs(measured - analytic) / analytic;
  if (err > 0.02) ok = false;
  console.log(`r = ${m.r.toFixed(2)} GM/c^2: shadow ${(measured * 180 / Math.PI).toFixed(2)} deg rendered, ${(analytic * 180 / Math.PI).toFixed(2)} deg analytic (${(err * 100).toFixed(2)}% off)`);
}
await browser.close();
console.log(ok ? 'shadow check passed' : 'shadow check FAILED');
process.exit(ok ? 0 : 1);
