/**
 * Special relativity. Velocities are expressed as beta = v/c unless stated.
 *
 * Convention for optics: the observer moves with velocity `beta` through the
 * rest frame of the scene. `n` is the unit vector from the observer to a source,
 * measured in the scene frame.
 */
import { Vec3, v3 } from './constants';

export const gamma = (beta: number): number => 1 / Math.sqrt(1 - beta * beta);
export const rapidity = (beta: number): number => Math.atanh(beta);
export const betaFromRapidity = (phi: number): number => Math.tanh(phi);

/** Collinear velocity addition. */
export const addBeta = (a: number, b: number): number => (a + b) / (1 + a * b);

/** Observed/emitted frequency ratio for a source in direction n (scene frame). */
export function dopplerFactor(beta: Vec3, n: Vec3): number {
  const b2 = v3.dot(beta, beta);
  return (1 + v3.dot(beta, n)) / Math.sqrt(1 - b2);
}

/**
 * Where a static scene point appears to an observer moving with velocity beta.
 * `r` is the displacement from observer to the point in the scene frame. The
 * light arriving now left the point at t = -|r|/c; Lorentz-transforming that
 * emission event into the observer's frame gives the apparent displacement.
 * This single transform produces aberration, apparent length contraction and
 * Terrell rotation together. Note |r'| = D |r| with D the Doppler factor.
 */
export function apparentPosition(r: Vec3, beta: Vec3): Vec3 {
  const b2 = v3.dot(beta, beta);
  if (b2 < 1e-24) return [r[0], r[1], r[2]];
  const g = 1 / Math.sqrt(1 - b2);
  const rl = v3.len(r);
  const rPar = v3.dot(r, beta) / b2; // component along beta, in units of beta
  // r' = r + [(g - 1) * (r.b)/b^2 + g |r|] * beta
  const k = (g - 1) * rPar + g * rl;
  return [r[0] + k * beta[0], r[1] + k * beta[1], r[2] + k * beta[2]];
}

/** Aberrated polar angle: cos(theta') for a source at cos(theta) from the velocity. */
export const aberrateCos = (cosTheta: number, beta: number): number =>
  (cosTheta + beta) / (1 + beta * cosTheta);

/**
 * Advance a ship's proper velocity w = gamma * v (same units as c) by a proper
 * time step dtau under proper acceleration alpha (felt in the ship's own frame).
 * In the scene frame the force per unit rest mass is alpha_par + alpha_perp / gamma,
 * and dt = gamma dtau, so dw = (gamma alpha_par + alpha_perp) dtau.
 */
export function stepProperVelocity(w: Vec3, alpha: Vec3, dtau: number, c: number): Vec3 {
  const w2 = v3.dot(w, w);
  const g = Math.sqrt(1 + w2 / (c * c));
  if (w2 < 1e-30) return v3.add(w, v3.scale(alpha, dtau));
  const wHat = v3.scale(w, 1 / Math.sqrt(w2));
  const aParMag = v3.dot(alpha, wHat);
  const aPar = v3.scale(wHat, aParMag);
  const aPerp = v3.sub(alpha, aPar);
  return [
    w[0] + (g * aPar[0] + aPerp[0]) * dtau,
    w[1] + (g * aPar[1] + aPerp[1]) * dtau,
    w[2] + (g * aPar[2] + aPerp[2]) * dtau,
  ];
}

export const gammaFromW = (w: Vec3, c: number): number => Math.sqrt(1 + v3.dot(w, w) / (c * c));
export const velocityFromW = (w: Vec3, c: number): Vec3 => v3.scale(w, 1 / gammaFromW(w, c));

/** Hyperbolic motion from rest under constant proper acceleration a. */
export function hyperbolicMotion(a: number, tau: number, c: number) {
  const k = (a * tau) / c;
  return {
    t: (c / a) * Math.sinh(k),
    x: ((c * c) / a) * (Math.cosh(k) - 1),
    beta: Math.tanh(k),
    gamma: Math.cosh(k),
  };
}
