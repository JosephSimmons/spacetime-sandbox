/**
 * Main-sequence scaling relations and polytropic stellar structure.
 * Masses, radii and luminosities are in solar units unless stated.
 */
import { SI } from './constants';

/** Piecewise empirical mass-luminosity relation for the main sequence. */
export function luminosity(M: number): number {
  if (M < 0.43) return 0.23 * Math.pow(M, 2.3);
  if (M < 2) return Math.pow(M, 4);
  if (M < 55) return 1.4 * Math.pow(M, 3.5);
  return 32000 * M;
}

/** Empirical mass-radius relation for the main sequence. */
export const radius = (M: number): number => (M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57));

export const effectiveTemperature = (L: number, R: number): number => SI.Tsun * Math.pow(L / (R * R), 0.25);

/** Main-sequence lifetime in Gyr: fuel over burn rate, normalised to 10 Gyr for the Sun. */
export const lifetimeGyr = (M: number, L: number): number => (10 * M) / L;

export function spectralClass(T: number): string {
  if (T >= 30000) return 'O';
  if (T >= 10000) return 'B';
  if (T >= 7500) return 'A';
  if (T >= 6000) return 'F';
  if (T >= 5200) return 'G';
  if (T >= 3700) return 'K';
  return 'M';
}

/** Conservative habitable zone bounds in AU (Kasting et al. 1993 flux limits). */
export const habitableZone = (L: number): [number, number] => [0.95 * Math.sqrt(L), 1.37 * Math.sqrt(L)];

export function remnant(M: number): string {
  if (M < 0.08) return 'brown dwarf (never fuses hydrogen)';
  if (M < 8) return 'white dwarf';
  if (M < 20) return 'neutron star (core-collapse supernova)';
  return 'black hole';
}

export interface Star {
  M: number; L: number; R: number; T: number; lifetime: number;
  cls: string; hz: [number, number]; remnant: string;
}

/**
 * A main-sequence star of mass M. gMul scales Newton's constant: by homology
 * with electron-scattering opacity, L scales as G^4 at fixed mass and
 * composition; the radius relation is held fixed (see DECISIONS.md).
 */
export function star(M: number, gMul = 1): Star {
  const L = luminosity(M) * Math.pow(gMul, 4);
  const R = radius(M);
  const T = effectiveTemperature(L, R);
  return { M, L, R, T, lifetime: lifetimeGyr(M, L), cls: spectralClass(T), hz: habitableZone(L), remnant: remnant(M) };
}

export interface Polytrope {
  n: number; xi1: number; dtheta1: number;
  xi: number[]; theta: number[];
  /** Central density over mean density. */
  concentration: number;
}

/** Solve the Lane-Emden equation theta'' + (2/xi) theta' + theta^n = 0 by RK4. */
export function laneEmden(n: number, h = 1e-3): Polytrope {
  const xi: number[] = [], theta: number[] = [];
  // Series start to avoid the coordinate singularity at the centre.
  let x = h;
  let th = 1 - (x * x) / 6 + (n * x ** 4) / 120;
  let dth = -x / 3 + (n * x ** 3) / 30;
  const f = (xx: number, t: number, d: number) => -(2 / xx) * d - Math.pow(Math.max(t, 0), n);
  xi.push(0); theta.push(1);
  let xPrev = x, thPrev = th, dPrev = dth;
  for (let i = 0; i < 2e6; i++) {
    xi.push(x); theta.push(th);
    xPrev = x; thPrev = th; dPrev = dth;
    const k1t = dth, k1d = f(x, th, dth);
    const k2t = dth + 0.5 * h * k1d, k2d = f(x + 0.5 * h, th + 0.5 * h * k1t, dth + 0.5 * h * k1d);
    const k3t = dth + 0.5 * h * k2d, k3d = f(x + 0.5 * h, th + 0.5 * h * k2t, dth + 0.5 * h * k2d);
    const k4t = dth + h * k3d, k4d = f(x + h, th + h * k3t, dth + h * k3d);
    th += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    dth += (h / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
    x += h;
    if (th <= 0) break;
    if (x > 200) break;
  }
  // Linear interpolation to the first zero.
  const frac = thPrev / (thPrev - th);
  const xi1 = xPrev + frac * (x - xPrev);
  const dtheta1 = dPrev + frac * (dth - dPrev);
  xi.push(xi1); theta.push(0);
  return { n, xi1, dtheta1, xi, theta, concentration: xi1 / (-3 * dtheta1) };
}

/**
 * Central conditions of a polytropic star of mass M and radius R (solar units),
 * for an ideal gas of mean molecular weight mu. Returns SI values.
 */
export function centralConditions(poly: Polytrope, M: number, R: number, mu = 0.61, gMul = 1) {
  const G = SI.G * gMul, Mk = M * SI.Msun, Rk = R * SI.Rsun;
  const rhoMean = Mk / ((4 / 3) * Math.PI * Rk ** 3);
  const rhoC = poly.concentration * rhoMean;
  const Pc = (G * Mk * Mk) / (Rk ** 4 * 4 * Math.PI * (poly.n + 1) * poly.dtheta1 ** 2);
  const Tc = (Pc * mu * SI.mp) / (rhoC * SI.kB);
  return { rhoC, Pc, Tc, rhoMean };
}
