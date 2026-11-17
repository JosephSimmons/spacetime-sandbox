import { describe, it, expect } from 'vitest';
import * as N from '../src/physics/nbody';

describe('n-body gravity', () => {
  it('circular two-body orbit closes with the Kepler period', () => {
    const G = N.G_AU_YR;
    const s = N.createState(2);
    s.mass[0] = 1; s.mass[1] = 1e-9;
    s.pos.set([1, 0, 0], 3); s.vel.set([0, 2 * Math.PI, 0], 3);
    N.computeAccelerations(s, G);
    const steps = 2000;
    for (let i = 0; i < steps; i++) N.yoshida4(s, 1 / steps, G);
    expect(s.pos[3]).toBeCloseTo(1, 6);
    expect(s.pos[4]).toBeCloseTo(0, 5);
  });

  it('conserves energy and angular momentum for the solar system over 100 years', () => {
    const G = N.G_AU_YR;
    const s = N.solarSystem();
    const e0 = N.totalEnergy(s, G), l0 = N.angularMomentum(s);
    const dt = 1 / 365.25;
    for (let i = 0; i < 36525; i++) N.leapfrog(s, dt, G);
    const e1 = N.totalEnergy(s, G), l1 = N.angularMomentum(s);
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-5);
    expect(Math.abs((l1[2] - l0[2]) / l0[2])).toBeLessThan(1e-10);
  });

  it('recovers planetary periods from the J2000 elements', () => {
    const G = N.G_AU_YR;
    const s = N.solarSystem();
    const expected = [0.2408, 0.6152, 1.0, 1.8808, 11.862, 29.457, 84.01, 164.8];
    N.PLANETS.forEach((p, i) => {
      const k = 3 * (i + 1);
      const r: [number, number, number] = [s.pos[k] - s.pos[0], s.pos[k + 1] - s.pos[1], s.pos[k + 2] - s.pos[2]];
      const v: [number, number, number] = [s.vel[k] - s.vel[0], s.vel[k + 1] - s.vel[1], s.vel[k + 2] - s.vel[2]];
      const el = N.orbitalElements(r, v, G * (1 + p.mass));
      expect(el.period / expected[i]).toBeCloseTo(1, 2);
      expect(el.e).toBeCloseTo(p.e, 4);
    });
  });

  it('elements round-trip through a state vector', () => {
    const mu = 39.5;
    const { r, v } = N.elementsToState(2.3, 0.4, 0.3, 1.1, 0.7, 2.0, mu);
    const el = N.orbitalElements(r, v, mu);
    expect(el.a).toBeCloseTo(2.3, 9);
    expect(el.e).toBeCloseTo(0.4, 9);
    expect(el.inc).toBeCloseTo(0.3, 9);
  });

  it('Yoshida integrator is fourth order', () => {
    const G = 1;
    const run = (steps: number) => {
      const s = N.createState(2);
      s.mass[0] = 1; s.mass[1] = 1e-9;
      s.pos.set([1, 0, 0], 3); s.vel.set([0, 1.2, 0], 3);
      N.computeAccelerations(s, G);
      const e0 = N.totalEnergy(s, G);
      let worst = 0;
      for (let i = 0; i < steps; i++) { N.yoshida4(s, 10 / steps, G); worst = Math.max(worst, Math.abs(N.totalEnergy(s, G) - e0)); }
      return worst;
    };
    const ratio = run(500) / run(1000);
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });

  it('post-Newtonian term gives the relativistic periapsis advance', () => {
    const mu = 4 * Math.PI ** 2, a = 1, e = 0.3;
    const c = Math.sqrt(mu / (a * 1e-4)); // so that GM / (a c^2) = 1e-4
    const start = N.elementsToState(a, e, 0, 0, 0, 0, mu);
    let r = start.r, v = start.v;
    const acc = (rr: [number, number, number], vv: [number, number, number]) => {
      const d = Math.hypot(...rr), pn = N.pnAcceleration(rr, vv, mu, c);
      return [-mu * rr[0] / d ** 3 + pn[0], -mu * rr[1] / d ** 3 + pn[1], -mu * rr[2] / d ** 3 + pn[2]] as [number, number, number];
    };
    const add = (p: number[], q: number[], k: number) => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k] as [number, number, number];
    const h = 2e-4, orbits = 5;
    let prevR = Math.hypot(...r), prevPrev = prevR, peri: number[] = [];
    for (let i = 0; i < (orbits + 0.5) / h; i++) {
      const k1v = acc(r, v), k1r = v;
      const k2r = add(v, k1v, h / 2), k2v = acc(add(r, k1r, h / 2), k2r);
      const k3r = add(v, k2v, h / 2), k3v = acc(add(r, k2r, h / 2), k3r);
      const k4r = add(v, k3v, h), k4v = acc(add(r, k3r, h), k4r);
      const rn = add(r, [0, 1, 2].map((j) => (k1r[j] + 2 * k2r[j] + 2 * k3r[j] + k4r[j]) / 6), h);
      v = add(v, [0, 1, 2].map((j) => (k1v[j] + 2 * k2v[j] + 2 * k3v[j] + k4v[j]) / 6), h);
      const d = Math.hypot(...rn);
      // At each periapsis passage, read the direction of the eccentricity vector.
      if (prevR < prevPrev && d > prevR && i > 10) {
        const hv = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
        const ex = (v[1] * hv[2] - v[2] * hv[1]) / mu - r[0] / prevR, ey = (v[2] * hv[0] - v[0] * hv[2]) / mu - r[1] / prevR;
        peri.push(Math.atan2(ey, ex));
      }
      prevPrev = prevR; prevR = d; r = rn;
    }
    const advance = (peri[peri.length - 1] - peri[0]) / (peri.length - 1);
    const expected = (6 * Math.PI * mu) / (a * (1 - e * e) * c * c);
    expect(advance / expected).toBeCloseTo(1, 2);
  });
  it('Mercury precesses by 43 arcseconds a century', () => {
    const m = N.PLANETS[0];
    const perOrbit = (6 * Math.PI * N.G_AU_YR) / (m.a * (1 - m.e ** 2) * N.C_AU_YR ** 2);
    const period = Math.sqrt(m.a ** 3);
    expect((perOrbit * 206264.806 * 100) / period).toBeCloseTo(43.0, 0);
  });
});
