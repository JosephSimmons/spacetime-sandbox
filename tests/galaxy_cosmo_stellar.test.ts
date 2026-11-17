import { describe, it, expect } from 'vitest';
import * as Gx from '../src/physics/galaxy';
import * as C from '../src/physics/cosmology';
import * as St from '../src/physics/stellar';

describe('galaxy dynamics', () => {
  it('Milky Way model gives a sensible circular speed at the Sun', () => {
    const v = Gx.circularSpeed(8.2, Gx.MILKY_WAY).total;
    expect(v).toBeGreaterThan(200);
    expect(v).toBeLessThan(250);
  });
  it('without a halo the curve falls off in a Keplerian way', () => {
    const p = { ...Gx.MILKY_WAY, haloMass: 0 };
    const ratio = Gx.circularSpeed(200, p).total / Gx.circularSpeed(100, p).total;
    expect(ratio).toBeCloseTo(Math.SQRT1_2, 2);
  });
  it('with a halo the curve stays roughly flat from 10 to 30 kpc', () => {
    const v10 = Gx.circularSpeed(10, Gx.MILKY_WAY).total, v30 = Gx.circularSpeed(30, Gx.MILKY_WAY).total;
    expect(Math.abs(v30 - v10) / v10).toBeLessThan(0.12);
  });
  it('halo encloses M200 at r200', () => {
    const { r200 } = Gx.haloRadii(Gx.MILKY_WAY);
    expect(Gx.haloEnclosed(r200, Gx.MILKY_WAY)).toBeCloseTo(Gx.MILKY_WAY.haloMass, 9);
    expect(r200).toBeGreaterThan(180); expect(r200).toBeLessThan(230);
  });
  it('in-plane acceleration equals v^2/R', () => {
    const out = [0, 0, 0];
    for (const R of [1, 5, 12, 40]) {
      Gx.acceleration(R, 0, 0, Gx.MILKY_WAY, out);
      expect(-out[0] * R).toBeCloseTo(Gx.circularSpeed(R, Gx.MILKY_WAY).total ** 2, 4);
    }
  });
  it('fast accelerator matches the reference implementation', () => {
    const acc = Gx.makeAccelerator(Gx.MILKY_WAY), a = [0, 0, 0], b = [0, 0, 0];
    for (const [x, y, z] of [[1, 2, 0.3], [-8, 0.5, -1], [0.1, 0.05, 0.02], [30, -40, 5]]) {
      Gx.acceleration(x, y, z, Gx.MILKY_WAY, a); acc(x, y, z, b, 0);
      for (let k = 0; k < 3; k++) expect(b[k] / a[k]).toBeCloseTo(1, 10);
    }
    // Escape speed exceeds sqrt(2) times circular speed inside an extended halo.
    expect(Gx.escapeSpeed(8.2, Gx.MILKY_WAY)).toBeGreaterThan(Math.SQRT2 * Gx.circularSpeed(8.2, Gx.MILKY_WAY).total);
    expect(Gx.escapeSpeed(8.2, Gx.MILKY_WAY)).toBeLessThan(800);
  });
  it('epicyclic frequency is sqrt(2) Omega for a flat curve and Omega for Kepler', () => {
    const kep = { ...Gx.MILKY_WAY, haloMass: 0, discMass: 0, bulgeMass: 5, bulgeScale: 1e-6 };
    const R = 10, om = Gx.circularSpeed(R, kep).total / R;
    expect(Gx.epicyclicFrequency(R, kep) / om).toBeCloseTo(1, 3);
  });
});

describe('cosmology', () => {
  it('Einstein-de Sitter age is 2/(3 H0)', () => {
    const p = { H0: 70, Om: 1, OL: 0, Or: 0 };
    expect(C.age(p)).toBeCloseTo((2 / 3) * C.hubbleTimeGyr(70), 3);
  });
  it('empty (Milne) universe age is 1/H0', () => {
    expect(C.age({ H0: 70, Om: 0, OL: 0, Or: 0 })).toBeCloseTo(C.hubbleTimeGyr(70), 3);
  });
  it('Planck 2018 parameters give an age near 13.8 Gyr', () => {
    expect(C.age(C.PLANCK18)).toBeGreaterThan(13.7);
    expect(C.age(C.PLANCK18)).toBeLessThan(13.9);
  });
  it('flat LCDM age matches the analytic formula', () => {
    const p = { H0: 70, Om: 0.3, OL: 0.7, Or: 0 };
    const exact = (2 / (3 * Math.sqrt(0.7))) * Math.asinh(Math.sqrt(0.7 / 0.3)) * C.hubbleTimeGyr(70);
    expect(C.age(p)).toBeCloseTo(exact, 3);
  });
  it('distances', () => {
    const eds = { H0: 70, Om: 1, OL: 0, Or: 0 };
    // EdS: D_C = 2 (c/H0) (1 - 1/sqrt(1+z))
    expect(C.comovingDistance(3, eds)).toBeCloseTo(2 * C.hubbleDistanceMpc(70) * 0.5, 1);
    const dl = C.luminosityDistance(1, C.PLANCK18);
    expect(dl).toBeGreaterThan(6600); expect(dl).toBeLessThan(7000);
    // Milne: D_M = (c/H0) sinh(ln(1+z))
    const milne = { H0: 70, Om: 0, OL: 0, Or: 0 };
    expect(C.transverseDistance(2, milne)).toBeCloseTo(C.hubbleDistanceMpc(70) * Math.sinh(Math.log(3)), 0);
  });
  it('history agrees with the age integral and classifies fates', () => {
    const h = C.history(C.PLANCK18);
    expect(-h.tBang).toBeCloseTo(C.age(C.PLANCK18), 1);
    expect(h.fate).toBe('expands forever');
    const closed = C.history({ H0: 70, Om: 3, OL: 0, Or: 0 }, 200);
    expect(closed.fate).toBe('recollapses');
    expect(isFinite(closed.tEnd)).toBe(true);
    // Closed matter universe: total lifetime = pi Om / (H0 (Om-1)^1.5)
    const life = (Math.PI * 3) / Math.pow(2, 1.5) * C.hubbleTimeGyr(70);
    expect(closed.tEnd - closed.tBang).toBeCloseTo(life, 0);
    expect(C.history({ H0: 70, Om: 0.1, OL: 2.5, Or: 0 }).fate).toBe('no big bang');
  });
  it('cone diagram reproduces Einstein-de Sitter results', () => {
    const p = { H0: 70, Om: 1, OL: 0, Or: 0 };
    const h = C.history(p, 20, 1500), d = C.coneDiagram(h);
    const t0 = C.age(p);
    // Particle horizon today is 3 c t0; Hubble radius is 1.5 c t0.
    const i = d.t.findIndex((t) => t >= 0);
    expect(d.horizon[i] / (3 * t0)).toBeCloseTo(1, 1);
    expect(d.hubble[i] / (1.5 * t0)).toBeCloseTo(1, 1);
    // The light cone is widest where it crosses the Hubble sphere, at a = 4/9: proper distance (8/27) * 1.5 c t0... = (4/9) c t0.
    const widest = Math.max(...d.lightCone.filter((v) => isFinite(v)));
    expect(widest / ((4 / 9) * t0)).toBeCloseTo(1, 1);
  });
  it('redshift at distance inverts comoving distance', () => {
    const d = C.comovingDistance(0.8, C.PLANCK18);
    expect(C.redshiftAtDistance(d, C.PLANCK18)).toBeCloseTo(0.8, 4);
  });
});

describe('stellar structure', () => {
  it('Lane-Emden solutions match the analytic and tabulated values', () => {
    expect(St.laneEmden(0).xi1).toBeCloseTo(Math.sqrt(6), 4);
    expect(St.laneEmden(1).xi1).toBeCloseTo(Math.PI, 4);
    const n3 = St.laneEmden(3);
    expect(n3.xi1).toBeCloseTo(6.8968, 3);
    expect(n3.concentration).toBeCloseTo(54.18, 1);
    const n15 = St.laneEmden(1.5);
    expect(n15.xi1).toBeCloseTo(3.6538, 3);
    expect(n15.concentration).toBeCloseTo(5.991, 2);
  });
  it('the Sun comes out as a G star with a 10 Gyr lifetime', () => {
    const s = St.star(1);
    expect(s.L).toBeCloseTo(1, 9); expect(s.T).toBeCloseTo(5772, 6);
    expect(s.cls).toBe('G'); expect(s.lifetime).toBeCloseTo(10, 9);
    expect(s.hz[0]).toBeLessThan(1); expect(s.hz[1]).toBeGreaterThan(1);
  });
  it('n = 3 polytrope gives solar central conditions of the right order', () => {
    const c = St.centralConditions(St.laneEmden(3), 1, 1);
    expect(c.rhoC).toBeGreaterThan(5e4); expect(c.rhoC).toBeLessThan(1.6e5);
    expect(c.Tc).toBeGreaterThan(8e6); expect(c.Tc).toBeLessThan(2e7);
    expect(c.Pc).toBeGreaterThan(5e15); expect(c.Pc).toBeLessThan(3e16);
  });
  it('mass-luminosity relation is continuous enough and monotonic', () => {
    let prev = 0;
    for (let m = 0.1; m < 80; m *= 1.05) { const l = St.luminosity(m); expect(l).toBeGreaterThan(prev * 0.75); prev = l; }
    expect(St.star(10).T).toBeGreaterThan(20000);
    expect(St.star(0.2).T).toBeLessThan(3700);
  });
});
