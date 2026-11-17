/**
 * Newtonian N-body gravity with symplectic integrators.
 * Units are caller-defined; G is passed in. Positions and velocities are packed
 * as [x0,y0,z0,x1,...] in Float64Arrays.
 */
import { Vec3, v3 } from './constants';

export interface NBodyState {
  n: number;
  pos: Float64Array;
  vel: Float64Array;
  mass: Float64Array;
  acc: Float64Array;
}

export function createState(n: number): NBodyState {
  return {
    n,
    pos: new Float64Array(3 * n),
    vel: new Float64Array(3 * n),
    mass: new Float64Array(n),
    acc: new Float64Array(3 * n),
  };
}

export function computeAccelerations(s: NBodyState, G: number, soft = 0): void {
  const { n, pos, mass, acc } = s;
  acc.fill(0);
  const e2 = soft * soft;
  for (let i = 0; i < n; i++) {
    const ix = 3 * i;
    for (let j = i + 1; j < n; j++) {
      const jx = 3 * j;
      const dx = pos[jx] - pos[ix], dy = pos[jx + 1] - pos[ix + 1], dz = pos[jx + 2] - pos[ix + 2];
      const r2 = dx * dx + dy * dy + dz * dz + e2;
      const inv = G / (r2 * Math.sqrt(r2));
      const fi = inv * mass[j], fj = inv * mass[i];
      acc[ix] += dx * fi; acc[ix + 1] += dy * fi; acc[ix + 2] += dz * fi;
      acc[jx] -= dx * fj; acc[jx + 1] -= dy * fj; acc[jx + 2] -= dz * fj;
    }
  }
}

/** Kick-drift-kick leapfrog. Assumes s.acc is current on entry; leaves it current. */
export function leapfrog(s: NBodyState, dt: number, G: number, soft = 0): void {
  const { n, pos, vel, acc } = s;
  const h = 0.5 * dt;
  for (let k = 0; k < 3 * n; k++) { vel[k] += acc[k] * h; pos[k] += vel[k] * dt; }
  computeAccelerations(s, G, soft);
  for (let k = 0; k < 3 * n; k++) vel[k] += acc[k] * h;
}

const W1 = 1 / (2 - Math.cbrt(2));
const W0 = 1 - 2 * W1;
/** Fourth-order Yoshida composition of three leapfrog steps. */
export function yoshida4(s: NBodyState, dt: number, G: number, soft = 0): void {
  leapfrog(s, W1 * dt, G, soft);
  leapfrog(s, W0 * dt, G, soft);
  leapfrog(s, W1 * dt, G, soft);
}

export function kineticEnergy(s: NBodyState): number {
  let k = 0;
  for (let i = 0; i < s.n; i++) {
    const ix = 3 * i;
    k += 0.5 * s.mass[i] * (s.vel[ix] ** 2 + s.vel[ix + 1] ** 2 + s.vel[ix + 2] ** 2);
  }
  return k;
}

export function potentialEnergy(s: NBodyState, G: number, soft = 0): number {
  let u = 0;
  for (let i = 0; i < s.n; i++)
    for (let j = i + 1; j < s.n; j++) {
      const dx = s.pos[3 * j] - s.pos[3 * i], dy = s.pos[3 * j + 1] - s.pos[3 * i + 1], dz = s.pos[3 * j + 2] - s.pos[3 * i + 2];
      u -= (G * s.mass[i] * s.mass[j]) / Math.sqrt(dx * dx + dy * dy + dz * dz + soft * soft);
    }
  return u;
}

export const totalEnergy = (s: NBodyState, G: number, soft = 0): number =>
  kineticEnergy(s) + potentialEnergy(s, G, soft);

export function angularMomentum(s: NBodyState): Vec3 {
  const L: Vec3 = [0, 0, 0];
  for (let i = 0; i < s.n; i++) {
    const ix = 3 * i, m = s.mass[i];
    L[0] += m * (s.pos[ix + 1] * s.vel[ix + 2] - s.pos[ix + 2] * s.vel[ix + 1]);
    L[1] += m * (s.pos[ix + 2] * s.vel[ix] - s.pos[ix] * s.vel[ix + 2]);
    L[2] += m * (s.pos[ix] * s.vel[ix + 1] - s.pos[ix + 1] * s.vel[ix]);
  }
  return L;
}

/** Shift to the centre-of-mass frame. */
export function toBarycentre(s: NBodyState): void {
  let M = 0; const c = [0, 0, 0], v = [0, 0, 0];
  for (let i = 0; i < s.n; i++) {
    M += s.mass[i];
    for (let k = 0; k < 3; k++) { c[k] += s.mass[i] * s.pos[3 * i + k]; v[k] += s.mass[i] * s.vel[3 * i + k]; }
  }
  for (let i = 0; i < s.n; i++)
    for (let k = 0; k < 3; k++) { s.pos[3 * i + k] -= c[k] / M; s.vel[3 * i + k] -= v[k] / M; }
}

export interface Elements {
  a: number; e: number; inc: number; period: number; energy: number;
  periapsis: number; apoapsis: number; bound: boolean;
}

/** Osculating two-body elements from a relative state vector. mu = G (m1 + m2). */
export function orbitalElements(r: Vec3, v: Vec3, mu: number): Elements {
  const rl = v3.len(r), v2 = v3.dot(v, v);
  const energy = 0.5 * v2 - mu / rl;
  const h = v3.cross(r, v);
  const hl = v3.len(h);
  const eVec = v3.sub(v3.scale(v3.cross(v, h), 1 / mu), v3.scale(r, 1 / rl));
  const e = v3.len(eVec);
  const a = -mu / (2 * energy);
  const bound = energy < 0;
  return {
    a, e, energy, bound,
    inc: Math.acos(Math.max(-1, Math.min(1, h[2] / (hl || 1)))),
    period: bound ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity,
    periapsis: bound ? a * (1 - e) : (hl * hl) / (mu * (1 + e)),
    apoapsis: bound ? a * (1 + e) : Infinity,
  };
}

/** Solve Kepler's equation M = E - e sin E. */
export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/**
 * State vector from classical elements (angles in radians).
 * Omega: longitude of ascending node; omega: argument of periapsis; M: mean anomaly.
 */
export function elementsToState(a: number, e: number, inc: number, Omega: number, omega: number, M: number, mu: number): { r: Vec3; v: Vec3 } {
  const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), e);
  const cE = Math.cos(E), sE = Math.sin(E);
  const b = Math.sqrt(1 - e * e);
  const xp = a * (cE - e), yp = a * b * sE;
  const n = Math.sqrt(mu / (a * a * a));
  const rd = 1 - e * cE;
  const vxp = (-a * n * sE) / rd, vyp = (a * n * b * cE) / rd;
  const cO = Math.cos(Omega), sO = Math.sin(Omega), co = Math.cos(omega), so = Math.sin(omega), ci = Math.cos(inc), si = Math.sin(inc);
  const rot = (x: number, y: number): Vec3 => [
    (cO * co - sO * so * ci) * x + (-cO * so - sO * co * ci) * y,
    (sO * co + cO * so * ci) * x + (-sO * so + cO * co * ci) * y,
    so * si * x + co * si * y,
  ];
  return { r: rot(xp, yp), v: rot(vxp, vyp) };
}

/** J2000 mean elements (JPL approximate positions table) and masses in solar masses. */
export const PLANETS = [
  { name: 'Mercury', a: 0.38709927, e: 0.20563593, I: 7.00497902, L: 252.2503235, varpi: 77.45779628, Omega: 48.33076593, mass: 1.6601e-7, radiusKm: 2439.7, color: 0x9a8f85 },
  { name: 'Venus', a: 0.72333566, e: 0.00677672, I: 3.39467605, L: 181.9790995, varpi: 131.60246718, Omega: 76.67984255, mass: 2.4478e-6, radiusKm: 6051.8, color: 0xe3c28a },
  { name: 'Earth', a: 1.00000261, e: 0.01671123, I: -0.00001531, L: 100.46457166, varpi: 102.93768193, Omega: 0, mass: 3.0404e-6, radiusKm: 6371, color: 0x4f8fd6 },
  { name: 'Mars', a: 1.52371034, e: 0.0933941, I: 1.84969142, L: -4.55343205, varpi: -23.94362959, Omega: 49.55953891, mass: 3.2272e-7, radiusKm: 3389.5, color: 0xc86a45 },
  { name: 'Jupiter', a: 5.202887, e: 0.04838624, I: 1.30439695, L: 34.39644051, varpi: 14.72847983, Omega: 100.47390909, mass: 9.5479e-4, radiusKm: 69911, color: 0xd9b48a },
  { name: 'Saturn', a: 9.53667594, e: 0.05386179, I: 2.48599187, L: 49.95424423, varpi: 92.59887831, Omega: 113.66242448, mass: 2.8589e-4, radiusKm: 58232, color: 0xe6d3a0 },
  { name: 'Uranus', a: 19.18916464, e: 0.04725744, I: 0.77263783, L: 313.23810451, varpi: 170.9542763, Omega: 74.01692503, mass: 4.3662e-5, radiusKm: 25362, color: 0x9fd8e0 },
  { name: 'Neptune', a: 30.06992276, e: 0.00859048, I: 1.77004347, L: -55.12002969, varpi: 44.96476227, Omega: 131.78422574, mass: 5.1514e-5, radiusKm: 24622, color: 0x4f6fd9 },
] as const;

/** G in AU^3 / (Msun yr^2). */
export const G_AU_YR = 4 * Math.PI * Math.PI;

/** Sun plus eight planets at J2000, heliocentric then shifted to the barycentre. */
export function solarSystem(G = G_AU_YR): NBodyState {
  const s = createState(PLANETS.length + 1);
  s.mass[0] = 1;
  const d = Math.PI / 180;
  PLANETS.forEach((p, i) => {
    const mu = G * (1 + p.mass);
    const { r, v } = elementsToState(p.a, p.e, p.I * d, p.Omega * d, (p.varpi - p.Omega) * d, (p.L - p.varpi) * d, mu);
    s.mass[i + 1] = p.mass;
    s.pos.set(r, 3 * (i + 1));
    s.vel.set(v, 3 * (i + 1));
  });
  toBarycentre(s);
  computeAccelerations(s, G);
  return s;
}

/** Speed of light in AU per year. */
export const C_AU_YR = 63241.07708;

/**
 * First post-Newtonian correction to the acceleration of a test body orbiting a
 * mass with mu = GM (harmonic coordinates):
 *   a = mu / (c^2 r^3) [ (4 mu / r - v^2) r + 4 (r . v) v ].
 * Added to Newtonian gravity it reproduces the relativistic advance of
 * periapsis, 6 pi mu / (a (1 - e^2) c^2) per orbit.
 */
export function pnAcceleration(r: Vec3, v: Vec3, mu: number, c: number): Vec3 {
  const d = v3.len(r), v2 = v3.dot(v, v), rv = v3.dot(r, v);
  const k = mu / (c * c * d * d * d), f = (4 * mu) / d - v2;
  return [k * (f * r[0] + 4 * rv * v[0]), k * (f * r[1] + 4 * rv * v[1]), k * (f * r[2] + 4 * rv * v[2])];
}
