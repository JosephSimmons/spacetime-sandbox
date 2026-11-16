/**
 * Hydrogen atom (non-relativistic, infinite nuclear mass). Lengths are in Bohr
 * radii unless stated; the dependence on the constants is exposed separately.
 */
import { SI } from './constants';

const factorial = (n: number): number => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

/** Generalised Laguerre polynomial L_k^alpha(x) by recurrence. */
export function laguerre(k: number, alpha: number, x: number): number {
  if (k === 0) return 1;
  let l0 = 1, l1 = 1 + alpha - x;
  for (let i = 1; i < k; i++) {
    const l2 = ((2 * i + 1 + alpha - x) * l1 - (i + alpha) * l0) / (i + 1);
    l0 = l1; l1 = l2;
  }
  return l1;
}

/** Radial wavefunction R_nl(r), r in Bohr radii, normalised so int R^2 r^2 dr = 1. */
export function radial(n: number, l: number, r: number): number {
  const rho = (2 * r) / n;
  const norm = Math.sqrt(Math.pow(2 / n, 3) * factorial(n - l - 1) / (2 * n * factorial(n + l)));
  return norm * Math.exp(-rho / 2) * Math.pow(rho, l) * laguerre(n - l - 1, 2 * l + 1, rho);
}

/** Associated Legendre P_l^m(x) for m >= 0, with the Condon-Shortley phase. */
export function legendre(l: number, m: number, x: number): number {
  let pmm = 1;
  if (m > 0) {
    const s = Math.sqrt(Math.max(1 - x * x, 0));
    let f = 1;
    for (let i = 1; i <= m; i++) { pmm *= -f * s; f += 2; }
  }
  if (l === m) return pmm;
  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1; pmmp1 = pll;
  }
  return pll;
}

/** Theta part of Y_lm: Y_lm = thetaPart(l, |m|, cos theta) * exp(i m phi), with sign for m < 0. */
export function thetaPart(l: number, m: number, cosTheta: number): number {
  const am = Math.abs(m);
  const norm = Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (factorial(l - am) / factorial(l + am)));
  const v = norm * legendre(l, am, cosTheta);
  return m < 0 && am % 2 === 1 ? -v : v;
}

/** Complex wavefunction psi_nlm at a Cartesian point (Bohr radii). */
export function psi(n: number, l: number, m: number, x: number, y: number, z: number): [number, number] {
  const r = Math.sqrt(x * x + y * y + z * z);
  if (r === 0) return l === 0 ? [radial(n, 0, 0) * thetaPart(0, 0, 1), 0] : [0, 0];
  const amp = radial(n, l, r) * thetaPart(l, m, z / r);
  const phi = Math.atan2(y, x);
  return [amp * Math.cos(m * phi), amp * Math.sin(m * phi)];
}

/** Energy of level n in eV. hbarMul and cMul scale the constants (E scales as 1/hbar^2). */
export const energyEV = (n: number, hbarMul = 1): number => -SI.RydbergEV / (n * n * hbarMul * hbarMul);

/** Bohr radius in metres; scales as hbar^2. */
export const bohrRadius = (hbarMul = 1): number => SI.a0 * hbarMul * hbarMul;

/** Fine-structure constant; scales as 1/(hbar c). */
export const fineStructure = (hbarMul = 1, cMul = 1): number => 1 / (137.035999084 * hbarMul * cMul);

/** Vacuum wavelength (nm) of the n2 -> n1 transition. lambda = h c / dE scales as hbar^3 c. */
export function transitionWavelengthNm(n1: number, n2: number, hbarMul = 1, cMul = 1): number {
  const inv = SI.RydbergInvM * (1 / (n1 * n1) - 1 / (n2 * n2));
  return (1e9 / inv) * hbarMul ** 3 * cMul;
}

/** Expectation value of r in Bohr radii. */
export const meanRadius = (n: number, l: number): number => (3 * n * n - l * (l + 1)) / 2;

/** Angular frequency (rad/s) of the beat between levels n1 and n2. */
export const beatFrequency = (n1: number, n2: number, hbarMul = 1): number =>
  (Math.abs(energyEV(n1, hbarMul) - energyEV(n2, hbarMul)) * SI.e) / (SI.hbar * hbarMul);

/**
 * Draw `count` points distributed as |psi_nlm|^2. Radius by inverse-CDF on a
 * grid, polar angle by rejection, azimuth uniform (|Y_lm|^2 has no phi dependence).
 * Returns packed xyz in Bohr radii.
 */
export function sampleOrbital(n: number, l: number, m: number, count: number, rand: () => number = Math.random): Float32Array {
  const rMax = n * n * 4 + 10, N = 2048;
  const cdf = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    const r = (i / N) * rMax, R = radial(n, l, r);
    cdf[i] = cdf[i - 1] + R * R * r * r;
  }
  const total = cdf[N];
  let tMax = 0;
  for (let i = 0; i <= 200; i++) tMax = Math.max(tMax, thetaPart(l, m, -1 + i / 100) ** 2);
  const out = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const u = rand() * total;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid; else hi = mid; }
    const r = ((lo + (u - cdf[lo]) / (cdf[hi] - cdf[lo] || 1)) / N) * rMax;
    let ct = 0;
    for (let tries = 0; tries < 1000; tries++) {
      ct = 2 * rand() - 1;
      if (rand() * tMax <= thetaPart(l, m, ct) ** 2) break;
    }
    const st = Math.sqrt(1 - ct * ct), ph = 2 * Math.PI * rand();
    out[3 * k] = r * st * Math.cos(ph); out[3 * k + 1] = r * st * Math.sin(ph); out[3 * k + 2] = r * ct;
  }
  return out;
}

export const orbitalLabel = (n: number, l: number, m: number): string => `${n}${'spdfgh'[l]}${m === 0 ? '' : ` (m=${m > 0 ? '+' : ''}${m})`}`;
