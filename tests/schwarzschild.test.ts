import { describe, it, expect } from 'vitest';
import * as S from '../src/physics/schwarzschild';

describe('Schwarzschild geometry', () => {
  const M = 1;
  it('weak-field light deflection approaches 4M/b', () => {
    for (const b of [100, 300, 1000]) {
      const alpha = S.deflectionAngle(b, M);
      // Post-Minkowskian expansion to third order in M/b.
      const u = M / b;
      const expected = 4 * u + ((15 * Math.PI) / 4) * u ** 2 + (128 / 3) * u ** 3;
      expect(alpha / expected).toBeCloseTo(1, 3);
    }
  });

  it('photons are captured below the critical impact parameter', () => {
    const bc = S.criticalImpact(M);
    const far = 500;
    const below = S.traceNull([-far, bc * 0.99, 0], [1, 0, 0], M, { rMax: 600, stepFrac: 0.005, maxSteps: 400000 });
    const above = S.traceNull([-far, bc * 1.01, 0], [1, 0, 0], M, { rMax: 600, stepFrac: 0.005, maxSteps: 400000 });
    expect(below.captured).toBe(true);
    expect(above.captured).toBe(false);
    expect(above.minR).toBeGreaterThan(S.photonSphere(M));
    expect(above.minR).toBeLessThan(S.photonSphere(M) * 1.25);
  });

  it('a tangential photon at r = 3M stays on the photon sphere for a full turn', () => {
    let x: [number, number, number] = [3, 0, 0];
    const res = S.traceNull(x, [0, 1, 0], M, { rMax: 1e9, stepFrac: 0.002, maxSteps: 3000 });
    // After 3000 small steps it has neither fallen in nor escaped far.
    expect(res.captured).toBe(false);
    expect(Math.hypot(...res.pos)).toBeGreaterThan(2.9);
    expect(Math.hypot(...res.pos)).toBeLessThan(3.1);
  });

  it('impact parameter of a static observer ray', () => {
    // Far away, b = r sin(psi).
    expect(S.impactParameter([1e6, 0, 0], [Math.cos(0.3), Math.sin(0.3), 0], M)).toBeCloseTo(1e6 * Math.sin(0.3), 0);
    // Shadow edge for a static observer at r: sin(psi_local) = sqrt(27) M sqrt(1 - 2M/r) / r.
    const r = 10;
    const sinPsi = (Math.sqrt(27) * M * Math.sqrt(1 - (2 * M) / r)) / r;
    const psi = Math.PI - Math.asin(sinPsi); // looking inward
    const dCoord = S.localToCoordinateDirection([r, 0, 0], [Math.cos(psi), Math.sin(psi), 0], M);
    expect(S.impactParameter([r, 0, 0], dCoord, M)).toBeCloseTo(S.criticalImpact(M), 6);
  });

  it('shadow edge traced from a static observer matches the analytic angle', () => {
    const r = 10;
    const sinPsi = (Math.sqrt(27) * M * Math.sqrt(1 - (2 * M) / r)) / r;
    const edge = Math.asin(sinPsi);
    const shoot = (ang: number) => {
      const psi = Math.PI - ang;
      const d = S.localToCoordinateDirection([r, 0, 0], [Math.cos(psi), Math.sin(psi), 0], M);
      return S.traceNull([r, 0, 0], d, M, { rMax: 300, stepFrac: 0.004, maxSteps: 400000 }).captured;
    };
    expect(shoot(edge * 0.98)).toBe(true);
    expect(shoot(edge * 1.02)).toBe(false);
  });

  it('circular orbit quantities', () => {
    expect(S.isco(M)).toBe(6);
    expect(S.circularOrbit(6, M).E).toBeCloseTo(Math.sqrt(8 / 9), 12);
    expect(S.circularOrbit(6, M).L).toBeCloseTo(Math.sqrt(12), 12);
    expect(S.orbitalSpeedLocal(6, M)).toBeCloseTo(0.5, 12);
    expect(S.orbitalSpeedLocal(3, M)).toBeCloseTo(1, 12);
    // ISCO is the inflection point of the effective potential at L^2 = 12 M^2.
    const L = Math.sqrt(12), h = 1e-3;
    const V = (r: number) => S.effectivePotential(r, M, L);
    expect((V(6 + h) - V(6 - h)) / (2 * h)).toBeCloseTo(0, 6);
    expect((V(6 + h) - 2 * V(6) + V(6 - h)) / (h * h)).toBeCloseTo(0, 4);
  });

  it('periapsis precession matches the weak-field formula', () => {
    const a = 2000, e = 0.3;
    const orbit = S.massiveOrbit(a * (1 - e), a * (1 + e), M, 2, 2e-4);
    const expected = (6 * Math.PI * M) / (a * (1 - e * e));
    expect(orbit.precession / expected).toBeCloseTo(1, 2);
  });

  it('disc redshift limits', () => {
    // Face-on (no angular momentum about the axis): pure gravitational + transverse Doppler.
    expect(S.discRedshift(6, 1e9, 0, M)).toBeCloseTo(Math.sqrt(0.5), 8);
    // Approaching side is brighter than receding side.
    expect(S.discRedshift(10, 1e9, 5, M)).toBeGreaterThan(S.discRedshift(10, 1e9, -5, M));
  });
});
