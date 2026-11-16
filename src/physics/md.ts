/**
 * Lennard-Jones molecular dynamics in reduced units (sigma = epsilon = m = kB = 1)
 * in a periodic cubic box, integrated with velocity Verlet.
 */
export interface MDState {
  n: number; box: number;
  pos: Float64Array; vel: Float64Array; force: Float64Array;
  potential: number; virial: number;
  rc: number; time: number;
}

/** Argon parameters for converting reduced units to SI. */
export const ARGON = { sigma: 3.405e-10, epsOverK: 119.8, massU: 39.948, tauPs: 2.156 };

/** Place cells^3 * 4 atoms on an FCC lattice at number density rho, with temperature T. */
export function createFCC(cells: number, rho: number, T: number, seed = 1): MDState {
  const n = 4 * cells ** 3;
  const box = Math.cbrt(n / rho);
  const a = box / cells;
  const s: MDState = {
    n, box, pos: new Float64Array(3 * n), vel: new Float64Array(3 * n), force: new Float64Array(3 * n),
    potential: 0, virial: 0, rc: Math.min(2.5, box / 2), time: 0,
  };
  const basis = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
  let k = 0;
  for (let x = 0; x < cells; x++) for (let y = 0; y < cells; y++) for (let z = 0; z < cells; z++)
    for (const b of basis) {
      s.pos[3 * k] = (x + b[0] + 0.25) * a; s.pos[3 * k + 1] = (y + b[1] + 0.25) * a; s.pos[3 * k + 2] = (z + b[2] + 0.25) * a;
      k++;
    }
  let st = seed >>> 0 || 1;
  const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const mean = [0, 0, 0];
  for (let i = 0; i < 3 * n; i++) { s.vel[i] = gauss(); mean[i % 3] += s.vel[i] / n; }
  for (let i = 0; i < 3 * n; i++) s.vel[i] -= mean[i % 3];
  rescale(s, T);
  computeForces(s);
  return s;
}

export function computeForces(s: MDState): void {
  const { n, box, pos, force, rc } = s;
  force.fill(0);
  const rc2 = rc * rc, half = box / 2;
  const irc6 = 1 / (rc2 * rc2 * rc2);
  const shift = 4 * (irc6 * irc6 - irc6);
  let pot = 0, vir = 0;
  for (let i = 0; i < n - 1; i++) {
    const ix = 3 * i;
    const xi = pos[ix], yi = pos[ix + 1], zi = pos[ix + 2];
    let fx = 0, fy = 0, fz = 0;
    for (let j = i + 1; j < n; j++) {
      const jx = 3 * j;
      let dx = xi - pos[jx], dy = yi - pos[jx + 1], dz = zi - pos[jx + 2];
      if (dx > half) dx -= box; else if (dx < -half) dx += box;
      if (dy > half) dy -= box; else if (dy < -half) dy += box;
      if (dz > half) dz -= box; else if (dz < -half) dz += box;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < rc2) {
        const ir2 = 1 / r2, ir6 = ir2 * ir2 * ir2;
        const ff = 48 * ir2 * ir6 * (ir6 - 0.5);
        fx += ff * dx; fy += ff * dy; fz += ff * dz;
        force[jx] -= ff * dx; force[jx + 1] -= ff * dy; force[jx + 2] -= ff * dz;
        pot += 4 * ir6 * (ir6 - 1) - shift;
        vir += ff * r2;
      }
    }
    force[ix] += fx; force[ix + 1] += fy; force[ix + 2] += fz;
  }
  s.potential = pot; s.virial = vir;
}

export function step(s: MDState, dt: number): void {
  const { n, box, pos, vel, force } = s;
  const h = 0.5 * dt;
  for (let i = 0; i < 3 * n; i++) {
    vel[i] += force[i] * h;
    let p = pos[i] + vel[i] * dt;
    if (p >= box) p -= box; else if (p < 0) p += box;
    pos[i] = p;
  }
  computeForces(s);
  for (let i = 0; i < 3 * n; i++) vel[i] += force[i] * h;
  s.time += dt;
}

export function kinetic(s: MDState): number {
  let k = 0;
  for (let i = 0; i < 3 * s.n; i++) k += s.vel[i] * s.vel[i];
  return 0.5 * k;
}

/** Instantaneous temperature (3N - 3 degrees of freedom). */
export const temperature = (s: MDState): number => (2 * kinetic(s)) / (3 * s.n - 3);

/** Pressure from the virial theorem. */
export const pressure = (s: MDState): number => {
  const V = s.box ** 3;
  return (s.n * temperature(s)) / V + s.virial / (3 * V);
};

export const density = (s: MDState): number => s.n / s.box ** 3;

/** Rescale velocities to an exact temperature. */
export function rescale(s: MDState, T: number): void {
  const t = temperature(s);
  if (t <= 0) return;
  const f = Math.sqrt(T / t);
  for (let i = 0; i < 3 * s.n; i++) s.vel[i] *= f;
}

/** Berendsen weak-coupling thermostat step toward T with relaxation time tau. */
export function berendsen(s: MDState, T: number, dt: number, tau: number): void {
  const t = temperature(s);
  if (t <= 0) return;
  const f = Math.sqrt(1 + (dt / tau) * (T / t - 1));
  for (let i = 0; i < 3 * s.n; i++) s.vel[i] *= f;
}

/** Uniformly rescale the box (and positions) to a new number density. */
export function setDensity(s: MDState, rho: number): void {
  const nb = Math.cbrt(s.n / rho), f = nb / s.box;
  for (let i = 0; i < 3 * s.n; i++) s.pos[i] *= f;
  s.box = nb; s.rc = Math.min(2.5, nb / 2);
  computeForces(s);
}

/** Radial distribution function g(r) on `bins` bins out to half the box. */
export function radialDistribution(s: MDState, bins = 80): { r: number[]; g: number[] } {
  const { n, box, pos } = s;
  const half = box / 2, dr = half / bins;
  const hist = new Float64Array(bins);
  for (let i = 0; i < n - 1; i++)
    for (let j = i + 1; j < n; j++) {
      let dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2];
      if (dx > half) dx -= box; else if (dx < -half) dx += box;
      if (dy > half) dy -= box; else if (dy < -half) dy += box;
      if (dz > half) dz -= box; else if (dz < -half) dz += box;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r < half) hist[Math.floor(r / dr)] += 2;
    }
  const rho = n / box ** 3;
  const r: number[] = [], g: number[] = [];
  for (let b = 0; b < bins; b++) {
    const r0 = b * dr, r1 = r0 + dr;
    const shell = (4 / 3) * Math.PI * (r1 ** 3 - r0 ** 3);
    r.push(r0 + dr / 2); g.push(hist[b] / (n * rho * shell));
  }
  return { r, g };
}

/** Maxwell-Boltzmann speed distribution f(v) at temperature T (m = kB = 1). */
export const maxwellSpeed = (v: number, T: number): number =>
  4 * Math.PI * Math.pow(1 / (2 * Math.PI * T), 1.5) * v * v * Math.exp((-v * v) / (2 * T));

export function speedHistogram(s: MDState, bins = 30, vMax = 6): number[] {
  const h = new Array(bins).fill(0);
  const dv = vMax / bins;
  for (let i = 0; i < s.n; i++) {
    const v = Math.hypot(s.vel[3 * i], s.vel[3 * i + 1], s.vel[3 * i + 2]);
    const b = Math.floor(v / dv);
    if (b < bins) h[b] += 1 / (s.n * dv);
  }
  return h;
}
