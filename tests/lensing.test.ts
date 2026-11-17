import { describe, it, expect } from 'vitest';
import * as L from '../src/physics/lensing';
import * as C from '../src/physics/cosmology';

describe('gravitational lensing', () => {
  it('singular isothermal sphere deflects by b everywhere', () => {
    for (const [x, y] of [[0.3, 0.1], [2, -1], [-5, 4]]) {
      const [ax, ay] = L.deflection(x, y, 1.7, 1, 0);
      expect(Math.hypot(ax, ay)).toBeCloseTo(1.7, 12);
      expect(ax * y - ay * x).toBeCloseTo(0, 12);
    }
  });
  it('divergence of the deflection is twice the convergence', () => {
    const b = 1.3, h = 1e-5;
    for (const [q, s] of [[0.6, 0], [0.8, 0.2], [0.35, 0.05], [1, 0.3]]) {
      for (const [x, y] of [[0.7, 0.4], [-1.5, 0.9], [0.2, -2.1]]) {
        const div = (L.deflection(x + h, y, b, q, s)[0] - L.deflection(x - h, y, b, q, s)[0]) / (2 * h)
          + (L.deflection(x, y + h, b, q, s)[1] - L.deflection(x, y - h, b, q, s)[1]) / (2 * h);
        expect(div / (2 * L.convergence(x, y, b, q, s))).toBeCloseTo(1, 6);
        // The deflection is a gradient, so its curl vanishes.
        const curl = (L.deflection(x + h, y, b, q, s)[1] - L.deflection(x - h, y, b, q, s)[1]) / (2 * h)
          - (L.deflection(x, y + h, b, q, s)[0] - L.deflection(x, y - h, b, q, s)[0]) / (2 * h);
        expect(curl).toBeCloseTo(0, 6);
      }
    }
  });
  it('elliptical deflection tends to the spherical one as q -> 1', () => {
    const a = L.deflection(0.8, 0.5, 1, 0.9999, 0.1), b = L.deflection(0.8, 0.5, 1, 1, 0.1);
    expect(a[0]).toBeCloseTo(b[0], 3); expect(a[1]).toBeCloseTo(b[1], 3);
  });
  it('SIS magnification is 1 / (1 - b/theta) and its critical curve is the Einstein ring', () => {
    expect(1 / L.jacobianDet(2.5, 0, 1, 1, 0)).toBeCloseTo(1 / (1 - 1 / 2.5), 5);
    const cc = L.criticalCurves(1, 1, 0, 24);
    for (const [x, y] of cc.critical) expect(Math.hypot(x, y)).toBeCloseTo(1, 5);
    for (const [x, y] of cc.caustic) expect(Math.hypot(x, y)).toBeCloseTo(0, 5);
    for (const [x, y] of cc.cut) expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
  });
  it('ray-shot magnification of a small source matches the SIS point-source value', () => {
    // Source at beta > b has one image, magnification 1 + b/beta.
    expect(L.magnification([2, 0], 0.15, 1, 1, 0, 700)).toBeCloseTo(1.5, 1);
    // Source at beta < b has two images, total magnification 2 b / beta.
    expect(L.magnification([0.5, 0], 0.08, 1, 1, 0, 900)).toBeCloseTo(4, 0);
  });
  it('an elliptical lens has an astroid caustic with four cusps inside the cut', () => {
    const cc = L.criticalCurves(1, 0.6, 0, 360);
    const r = cc.caustic.map(([x, y]) => Math.hypot(x, y));
    let cusps = 0;
    for (let i = 1; i < r.length - 1; i++) if (r[i] > r[i - 1] && r[i] >= r[i + 1] && r[i] > 0.05) cusps++;
    expect(cusps).toBeGreaterThanOrEqual(3); expect(cusps).toBeLessThanOrEqual(4);
    expect(L.inside([0, 0], cc.caustic)).toBe(true);
    expect(L.inside([0.02, 0.02], cc.cut)).toBe(true);
    expect(L.inside([3, 3], cc.cut)).toBe(false);
  });
  it('Einstein radius of a 1000 km/s cluster is tens of arcseconds', () => {
    const p = C.PLANCK18;
    const ratio = C.angularDistanceBetween(0.3, 2, p) / C.angularDistance(2, p);
    const arcsec = (L.einsteinRadiusSIS(1000, ratio) * 180 * 3600) / Math.PI;
    expect(arcsec).toBeGreaterThan(18); expect(arcsec).toBeLessThan(26);
    // D_A(0, z) from the two-redshift formula reduces to the ordinary one.
    expect(C.angularDistanceBetween(0, 1.3, p)).toBeCloseTo(C.angularDistance(1.3, p), 6);
  });
});
