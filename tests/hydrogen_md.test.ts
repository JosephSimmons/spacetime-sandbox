import { describe, it, expect } from 'vitest';
import * as H from '../src/physics/hydrogen';
import * as MD from '../src/physics/md';

const integrate = (f: (r: number) => number, a: number, b: number, n = 20000) => {
  const h = (b - a) / n; let s = 0;
  for (let i = 0; i <= n; i++) s += f(a + i * h) * (i === 0 || i === n ? 0.5 : 1);
  return s * h;
};

describe('hydrogen atom', () => {
  it('radial functions are normalised and orthogonal', () => {
    for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 2], [4, 1], [5, 3]]) {
      expect(integrate((r) => H.radial(n, l, r) ** 2 * r * r, 0, 150)).toBeCloseTo(1, 5);
    }
    expect(integrate((r) => H.radial(1, 0, r) * H.radial(2, 0, r) * r * r, 0, 150)).toBeCloseTo(0, 6);
    expect(integrate((r) => H.radial(2, 1, r) * H.radial(3, 1, r) * r * r, 0, 150)).toBeCloseTo(0, 6);
  });
  it('mean radius matches (3n^2 - l(l+1))/2', () => {
    for (const [n, l] of [[1, 0], [2, 1], [3, 0], [4, 3]]) {
      expect(integrate((r) => H.radial(n, l, r) ** 2 * r ** 3, 0, 200)).toBeCloseTo(H.meanRadius(n, l), 4);
    }
  });
  it('spherical harmonics are normalised', () => {
    for (const [l, m] of [[0, 0], [1, 0], [1, 1], [2, -1], [3, 2], [4, 0]]) {
      const v = 2 * Math.PI * integrate((ct) => H.thetaPart(l, m, ct) ** 2, -1, 1, 4000);
      expect(v).toBeCloseTo(1, 5);
    }
  });
  it('known values', () => {
    // psi_100(0) = 1/sqrt(pi)
    expect(H.psi(1, 0, 0, 0, 0, 0)[0]).toBeCloseTo(1 / Math.sqrt(Math.PI), 10);
    expect(H.energyEV(2)).toBeCloseTo(-3.4014, 3);
    expect(H.transitionWavelengthNm(2, 3)).toBeCloseTo(656.1, 0);
    expect(H.transitionWavelengthNm(1, 2)).toBeCloseTo(121.5, 0);
    expect(H.bohrRadius(2) / H.bohrRadius(1)).toBe(4);
  });
  it('sampled cloud reproduces the mean radius', () => {
    let st = 12345;
    const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    const pts = H.sampleOrbital(3, 1, 1, 40000, rnd);
    let s = 0, z2 = 0;
    for (let i = 0; i < 40000; i++) { s += Math.hypot(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]); z2 += pts[3 * i + 2] ** 2 / (pts[3 * i] ** 2 + pts[3 * i + 1] ** 2 + pts[3 * i + 2] ** 2); }
    expect(s / 40000 / H.meanRadius(3, 1)).toBeCloseTo(1, 1);
    // <cos^2 theta> for |Y_11|^2 is 1/5.
    expect(z2 / 40000).toBeCloseTo(0.2, 1);
  });
});

describe('Lennard-Jones molecular dynamics', () => {
  it('conserves energy and momentum without a thermostat', () => {
    const s = MD.createFCC(3, 0.8, 1.0, 7);
    const e0 = MD.kinetic(s) + s.potential;
    for (let i = 0; i < 1500; i++) MD.step(s, 0.004);
    const e1 = MD.kinetic(s) + s.potential;
    expect(Math.abs(e1 - e0) / s.n).toBeLessThan(5e-3);
    const p = [0, 0, 0];
    for (let i = 0; i < 3 * s.n; i++) p[i % 3] += s.vel[i];
    expect(Math.hypot(...p)).toBeLessThan(1e-9);
  });
  it('dilute gas pressure approaches the virial expansion', () => {
    const rho = 0.02, T = 2.5;
    const s = MD.createFCC(4, rho, T, 3);
    let pAcc = 0, tAcc = 0, cnt = 0;
    for (let i = 0; i < 3000; i++) {
      MD.step(s, 0.005);
      if (i < 1000) MD.berendsen(s, T, 0.005, 0.1);
      else { pAcc += MD.pressure(s); tAcc += MD.temperature(s); cnt++; }
    }
    const P = pAcc / cnt, Tm = tAcc / cnt;
    // Ideal gas with a small negative second-virial correction at this T.
    expect(P / (rho * Tm)).toBeGreaterThan(0.93);
    expect(P / (rho * Tm)).toBeLessThan(1.02);
  });
  it('thermostat reaches the target temperature and a dense cold system stays ordered', () => {
    const s = MD.createFCC(3, 1.0, 0.3, 5);
    for (let i = 0; i < 1500; i++) { MD.step(s, 0.004); MD.berendsen(s, 0.3, 0.004, 0.2); }
    expect(MD.temperature(s)).toBeCloseTo(0.3, 1);
    const { r, g } = MD.radialDistribution(s, 60);
    const peak = r[g.indexOf(Math.max(...g))];
    expect(peak).toBeGreaterThan(1.0); expect(peak).toBeLessThan(1.2);
    expect(Math.max(...g)).toBeGreaterThan(3);
  });
});
