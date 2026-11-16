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
});
