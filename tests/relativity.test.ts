import { describe, it, expect } from 'vitest';
import * as R from '../src/physics/relativity';
import { v3, Vec3 } from '../src/physics/constants';
import { blackbodyRGB, dopplerShiftRGB, dopplerShiftSurface, continuumRGB } from '../src/physics/color';

describe('special relativity', () => {
  it('gamma and rapidity', () => {
    expect(R.gamma(0.6)).toBeCloseTo(1.25, 12);
    expect(R.gamma(0.8)).toBeCloseTo(5 / 3, 12);
    expect(R.betaFromRapidity(R.rapidity(0.3) + R.rapidity(0.5))).toBeCloseTo(R.addBeta(0.3, 0.5), 12);
  });

  it('Doppler factor fore and aft', () => {
    const b = 0.6;
    expect(R.dopplerFactor([b, 0, 0], [1, 0, 0])).toBeCloseTo(Math.sqrt((1 + b) / (1 - b)), 12);
    expect(R.dopplerFactor([b, 0, 0], [-1, 0, 0])).toBeCloseTo(Math.sqrt((1 - b) / (1 + b)), 12);
  });

  it('apparent position reproduces the aberration formula', () => {
    const b = 0.7;
    for (const th of [0.2, 1.0, 1.5708, 2.4, 3.0]) {
      const r: Vec3 = [5 * Math.cos(th), 5 * Math.sin(th), 0];
      const rp = R.apparentPosition(r, [b, 0, 0]);
      const cosP = rp[0] / v3.len(rp);
      expect(cosP).toBeCloseTo(R.aberrateCos(Math.cos(th), b), 12);
      // Apparent distance scales by the Doppler factor.
      expect(v3.len(rp) / 5).toBeCloseTo(R.dopplerFactor([b, 0, 0], v3.norm(r)), 12);
    }
  });

  it('apparent position is the identity at rest', () => {
    expect(R.apparentPosition([1, 2, 3], [0, 0, 0])).toEqual([1, 2, 3]);
  });

  it('proper-velocity integrator matches hyperbolic motion', () => {
    const c = 30, a = 9.81;
    let w: Vec3 = [0, 0, 0], x = 0, t = 0;
    const dtau = 1e-4, tauEnd = 6;
    for (let tau = 0; tau < tauEnd - 1e-9; tau += dtau) {
      // midpoint in proper time
      const wMid = R.stepProperVelocity(w, [a, 0, 0], dtau / 2, c);
      const gMid = R.gammaFromW(wMid, c);
      w = R.stepProperVelocity(w, [a, 0, 0], dtau, c);
      x += R.velocityFromW(wMid, c)[0] * gMid * dtau;
      t += gMid * dtau;
    }
    const exact = R.hyperbolicMotion(a, tauEnd, c);
    expect(t).toBeCloseTo(exact.t, 2);
    expect(x).toBeCloseTo(exact.x, 1);
    expect(v3.len(R.velocityFromW(w, c)) / c).toBeCloseTo(exact.beta, 4);
    expect(v3.len(R.velocityFromW(w, c))).toBeLessThan(c);
  });

  it('transverse thrust is reduced by gamma in the scene frame', () => {
    const c = 1, w: Vec3 = [3, 0, 0];
    const g = R.gammaFromW(w, c);
    const w2 = R.stepProperVelocity(w, [0, 1, 0], 1e-6, c);
    // dw_perp/dtau = alpha, so dw_perp/dt = alpha / gamma
    expect((w2[1] - w[1]) / (1e-6 * g)).toBeCloseTo(1 / g, 6);
  });
});

describe('relativistic travel', () => {
  // One g in light-years per year squared.
  const g = (9.80665 * 3.15576e7 ** 2) / 9.4607304725808e15;
  it('one g is about 1.03 ly/yr^2', () => { expect(g).toBeCloseTo(1.032, 2); });
  it('flip-and-burn times at one g match the standard results', () => {
    const proxima = R.flipAndBurn(g, 4.25, 1);
    expect(proxima.shipTime).toBeGreaterThan(3.4); expect(proxima.shipTime).toBeLessThan(3.7);
    expect(proxima.homeTime).toBeGreaterThan(5.7); expect(proxima.homeTime).toBeLessThan(6.1);
    const centre = R.flipAndBurn(g, 26000, 1);
    expect(centre.shipTime).toBeGreaterThan(19); expect(centre.shipTime).toBeLessThan(21);
    const andromeda = R.flipAndBurn(g, 2.5e6, 1);
    expect(andromeda.shipTime).toBeGreaterThan(27); expect(andromeda.shipTime).toBeLessThan(30);
    expect(andromeda.homeTime / 2.5e6).toBeCloseTo(1, 4);
  });
  it('flip-and-burn agrees with two legs of hyperbolic motion', () => {
    const a = 2.3, d = 7.7, c = 1.4;
    const trip = R.flipAndBurn(a, d, c);
    const leg = R.hyperbolicMotion(a, trip.shipTime / 2, c);
    expect(2 * leg.x).toBeCloseTo(d, 9);
    expect(2 * leg.t).toBeCloseTo(trip.homeTime, 9);
    expect(leg.gamma).toBeCloseTo(trip.peakGamma, 9);
  });
});

describe('colour', () => {
  it('blackbody colours order correctly', () => {
    const cool = blackbodyRGB(3000), sun = blackbodyRGB(6500), hot = blackbodyRGB(20000);
    expect(cool[0]).toBeGreaterThan(cool[1]); expect(cool[1]).toBeGreaterThan(cool[2]);
    expect(hot[2]).toBeGreaterThan(hot[0]);
    expect(Math.max(...sun) - Math.min(...sun)).toBeLessThan(0.2);
  });
  it('Doppler shift is the identity at D = 1 and moves toward blue for D > 1', () => {
    const c: [number, number, number] = [0.8, 0.3, 0.1];
    const same = dopplerShiftRGB(c, 1);
    for (let i = 0; i < 3; i++) expect(same[i]).toBeCloseTo(c[i], 10);
    const blue = dopplerShiftRGB([1, 0, 0], 1.3);
    expect(blue[2] + blue[1]).toBeGreaterThan(blue[0]);
    const gone = dopplerShiftRGB([0, 0, 1], 2.5);
    expect(gone[0] + gone[1] + gone[2]).toBeLessThan(0.02);
  });
  it('surface model is the identity at D = 1 and brings infrared into view when blueshifted', () => {
    expect(continuumRGB(1)).toEqual([0, 0, 0]);
    const c: [number, number, number] = [0.5, 0.4, 0.3];
    const same = dopplerShiftSurface(c, 1);
    for (let i = 0; i < 3; i++) expect(same[i]).toBeCloseTo(c[i], 10);
    // Mild blueshift: infrared arrives in red first.
    const mild = continuumRGB(1.15);
    expect(mild[0]).toBeGreaterThan(mild[2]);
    // Strong blueshift: the whole visible band is filled by former infrared.
    expect(continuumRGB(4)).toEqual([1, 1, 1]);
    // Strong redshift: former ultraviolet, dimmer.
    for (const v of continuumRGB(0.3)) expect(v).toBeCloseTo(0.35, 10);
  });
});
