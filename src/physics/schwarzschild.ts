/**
 * Schwarzschild spacetime in geometric units (G = c = 1). M is the mass, so
 * the horizon is at r = 2M. Lengths are in whatever unit M is given in.
 */
import { Vec3, v3 } from './constants';

export const horizon = (M: number) => 2 * M;
export const photonSphere = (M: number) => 3 * M;
export const isco = (M: number) => 6 * M;
/** Critical impact parameter: photons with b below this are captured. */
export const criticalImpact = (M: number) => 3 * Math.sqrt(3) * M;

/** Clock rate of a static observer at r relative to infinity. */
export const staticTimeDilation = (r: number, M: number) => Math.sqrt(1 - (2 * M) / r);
/** Clock rate of a circular-orbit observer at r relative to infinity. */
export const orbitTimeDilation = (r: number, M: number) => Math.sqrt(1 - (3 * M) / r);
/** Coordinate angular velocity of a circular geodesic (same as Kepler). */
export const orbitalOmega = (r: number, M: number) => Math.sqrt(M / (r * r * r));
/** Orbital speed measured by a static observer at the same radius (fraction of c). */
export const orbitalSpeedLocal = (r: number, M: number) => Math.sqrt(M / (r - 2 * M));
/** Specific energy and angular momentum of a circular geodesic. */
export const circularOrbit = (r: number, M: number) => ({
  E: (1 - (2 * M) / r) / Math.sqrt(1 - (3 * M) / r),
  L: Math.sqrt((M * r * r) / (r - 3 * M)),
});

/** Effective potential (squared energy) for a massive particle with angular momentum L. */
export const effectivePotential = (r: number, M: number, L: number) => (1 - (2 * M) / r) * (1 + (L * L) / (r * r));
/** Effective potential for photons, in units where b = L/E: 1/b^2 must exceed this. */
export const photonPotential = (r: number, M: number) => (1 - (2 * M) / r) / (r * r);

/**
 * Convert a direction measured by a static observer at position x (local
 * orthonormal frame aligned with the coordinate axes) into the direction to use
 * in the pseudo-flat ray equation below. A static observer measures proper
 * radial distance dr / sqrt(1 - 2M/r), so the radial part is scaled by sqrt(f).
 */
export function localToCoordinateDirection(x: Vec3, dLocal: Vec3, M: number): Vec3 {
  const r = v3.len(x);
  const rh = v3.scale(x, 1 / r);
  const f = Math.sqrt(Math.max(1 - (2 * M) / r, 0));
  const dr = v3.dot(dLocal, rh);
  const tang = v3.sub(dLocal, v3.scale(rh, dr));
  return v3.norm(v3.add(tang, v3.scale(rh, dr * f)));
}

/** Impact parameter b = L/E of a ray with coordinate direction d at position x. */
export function impactParameter(x: Vec3, d: Vec3, M: number): number {
  const r = v3.len(x);
  const rh = v3.scale(x, 1 / r);
  const cosPsi = v3.dot(d, rh);
  const sin2 = Math.max(1 - cosPsi * cosPsi, 1e-300);
  const cot2 = (cosPsi * cosPsi) / sin2;
  return r / Math.sqrt(cot2 + (1 - (2 * M) / r));
}

export interface RayResult {
  captured: boolean;
  dir: Vec3;
  pos: Vec3;
  minR: number;
  steps: number;
}

/**
 * Trace a null geodesic. In Schwarzschild coordinates treated as flat 3-space,
 * the spatial path obeys x'' = -3 M h^2 x / r^5 with h = |x cross x'| conserved;
 * this reproduces the exact orbit equation u'' + u = 3 M u^2. Integrated with
 * velocity Verlet and a step proportional to distance from the hole. The GLSL
 * ray marcher in the black hole station implements this same algorithm.
 */
export function traceNull(x0: Vec3, d0: Vec3, M: number, opts: { rMax?: number; maxSteps?: number; stepFrac?: number } = {}): RayResult {
  const rMax = opts.rMax ?? 200 * M, maxSteps = opts.maxSteps ?? 20000, stepFrac = opts.stepFrac ?? 0.02;
  let x: Vec3 = [x0[0], x0[1], x0[2]];
  let v: Vec3 = v3.norm(d0);
  const hv = v3.cross(x, v);
  const h2 = v3.dot(hv, hv);
  const k = -3 * M * h2;
  const accel = (p: Vec3): Vec3 => {
    const r2 = v3.dot(p, p);
    return v3.scale(p, k / (r2 * r2 * Math.sqrt(r2)));
  };
  let a = accel(x);
  let minR = v3.len(x);
  const rs = 2 * M;
  for (let i = 0; i < maxSteps; i++) {
    const r = v3.len(x);
    if (r < minR) minR = r;
    if (r <= rs * 1.0005) return { captured: true, dir: v3.norm(v), pos: x, minR, steps: i };
    if (r > rMax && v3.dot(x, v) > 0) return { captured: false, dir: v3.norm(v), pos: x, minR, steps: i };
    const dt = stepFrac * Math.max(r - rs, 0.02 * M) / (v3.len(v) || 1) + 1e-6 * M;
    v = v3.add(v, v3.scale(a, 0.5 * dt));
    x = v3.add(x, v3.scale(v, dt));
    a = accel(x);
    v = v3.add(v, v3.scale(a, 0.5 * dt));
  }
  return { captured: false, dir: v3.norm(v), pos: x, minR, steps: maxSteps };
}

/** Total bending angle of a ray arriving from infinity with impact parameter b. */
export function deflectionAngle(b: number, M: number): number {
  const far = Math.max(5000 * M, 2000 * b);
  const res = traceNull([-far, b, 0], [1, 0, 0], M, { rMax: far * 1.01, stepFrac: 0.005, maxSteps: 400000 });
  if (res.captured) return NaN;
  return Math.atan2(-res.dir[1], res.dir[0]);
}

/**
 * Frequency ratio (observed / emitted) for light from gas on a circular
 * equatorial orbit at radius rEmit, received by a static observer at rObs.
 * lz is the photon's angular momentum about the disc axis divided by its
 * energy, signed positive when it shares the disc's sense of rotation.
 */
export function discRedshift(rEmit: number, rObs: number, lz: number, M: number): number {
  const omega = orbitalOmega(rEmit, M);
  return Math.sqrt(1 - (3 * M) / rEmit) / ((1 - omega * lz) * Math.sqrt(1 - (2 * M) / rObs));
}

/**
 * Bound orbit of a massive particle: integrates u'' + u = M/L^2 + 3 M u^2
 * (u = 1/r) from periapsis and returns the path plus the advance of periapsis
 * per radial period.
 */
export function massiveOrbit(rPeri: number, rApo: number, M: number, turns = 3, dphi = 1e-3) {
  // Angular momentum and energy from the two turning points of
  // (du/dphi)^2 = (E^2 - 1)/L^2 + 2M u/L^2 - u^2 + 2M u^3.
  const u1 = 1 / rApo, u2 = 1 / rPeri;
  // The cubic 2M u^3 - u^2 + (2M/L^2) u + (E^2-1)/L^2 has roots u1, u2, u3 with
  // u1 + u2 + u3 = 1/(2M).
  const u3 = 1 / (2 * M) - u1 - u2;
  const L2 = 1 / (u1 * u2 + u1 * u3 + u2 * u3);
  const L = Math.sqrt(L2);
  const E2 = 1 - 2 * M * u1 * u2 * u3 * L2;
  const f = (u: number) => M / L2 + 3 * M * u * u - u;
  const pts: [number, number][] = [];
  let u = u2, du = 0, phi = 0;
  let lastPeri = 0, precession = NaN, prevDu = 0;
  const maxPhi = turns * 2 * Math.PI * 1.5;
  while (phi < maxPhi) {
    pts.push([Math.cos(phi) / u, Math.sin(phi) / u]);
    // RK4 on (u, du)
    const k1u = du, k1v = f(u);
    const k2u = du + 0.5 * dphi * k1v, k2v = f(u + 0.5 * dphi * k1u);
    const k3u = du + 0.5 * dphi * k2v, k3v = f(u + 0.5 * dphi * k2u);
    const k4u = du + dphi * k3v, k4v = f(u + dphi * k3u);
    prevDu = du;
    u += (dphi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
    du += (dphi / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    phi += dphi;
    if (prevDu > 0 && du <= 0 && phi > 1) {
      // Passed periapsis (u maximal). Interpolate the crossing.
      const frac = prevDu / (prevDu - du);
      const phiPeri = phi - dphi + frac * dphi;
      if (isNaN(precession)) precession = phiPeri - lastPeri - 2 * Math.PI;
      lastPeri = phiPeri;
    }
    if (u <= 0 || u > 1 / (2 * M)) break;
  }
  return { points: pts, precession, L, E: Math.sqrt(Math.max(E2, 0)) };
}
