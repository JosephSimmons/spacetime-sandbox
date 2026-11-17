/**
 * Gravitational lensing in the thin-lens approximation, for a softened
 * isothermal ellipsoid (Kormann, Schneider & Bartelmann 1994; Keeton 2001).
 * Angles are in any consistent unit; b is the lens strength, equal to the
 * Einstein radius when the lens is round and singular.
 */
import { C_KMS } from './cosmology';

/** Convergence kappa = (b/2) / sqrt(s^2 + x^2 + y^2/q^2). */
export function convergence(x: number, y: number, b: number, q: number, s: number): number {
  return (0.5 * b) / Math.sqrt(s * s + x * x + (y * y) / (q * q));
}

/** Deflection angle alpha(theta). q is the axis ratio (0 < q <= 1), s the core radius. */
export function deflection(x: number, y: number, b: number, q: number, s: number): [number, number] {
  const e2 = 1 - q * q;
  if (e2 < 1e-6) {
    const r2 = x * x + y * y;
    if (r2 < 1e-24) return [0, 0];
    const f = (b * (Math.sqrt(s * s + r2) - s)) / r2;
    return [f * x, f * y];
  }
  const e = Math.sqrt(e2);
  const psi = Math.sqrt(q * q * (s * s + x * x) + y * y);
  const k = (b * q) / e;
  return [k * Math.atan((e * x) / (psi + s)), k * Math.atanh((e * y) / (psi + q * q * s))];
}

/** Source-plane position beta = theta - alpha(theta). */
export function sourcePosition(x: number, y: number, b: number, q: number, s: number): [number, number] {
  const [ax, ay] = deflection(x, y, b, q, s);
  return [x - ax, y - ay];
}

/** Determinant of the lensing Jacobian d(beta)/d(theta); magnification is its inverse. */
export function jacobianDet(x: number, y: number, b: number, q: number, s: number, h = 1e-4): number {
  const hx = h * Math.max(b, 1e-6);
  const [bx1, by1] = sourcePosition(x + hx, y, b, q, s), [bx0, by0] = sourcePosition(x - hx, y, b, q, s);
  const [cx1, cy1] = sourcePosition(x, y + hx, b, q, s), [cx0, cy0] = sourcePosition(x, y - hx, b, q, s);
  const axx = (bx1 - bx0) / (2 * hx), ayx = (by1 - by0) / (2 * hx), axy = (cx1 - cx0) / (2 * hx), ayy = (cy1 - cy0) / (2 * hx);
  return axx * ayy - axy * ayx;
}

/**
 * Einstein radius of a singular isothermal sphere in radians:
 * theta_E = 4 pi (sigma/c)^2 D_ls / D_s.
 */
export const einsteinRadiusSIS = (sigmaKms: number, dlsOverDs: number, cMul = 1): number =>
  4 * Math.PI * (sigmaKms / (C_KMS * cMul)) ** 2 * dlsOverDs;

export interface CausticSet {
  /** Tangential critical curve in the image plane and its caustic in the source plane. */
  critical: [number, number][]; caustic: [number, number][];
  /** The cut (singular lens) or radial caustic (cored lens). */
  cut: [number, number][];
}

/** Trace the tangential critical curve by bisection along rays from the centre. */
export function criticalCurves(b: number, q: number, s: number, n = 180): CausticSet {
  const critical: [number, number][] = [], caustic: [number, number][] = [], cut: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const ph = (i / n) * 2 * Math.PI, cx = Math.cos(ph), cy = Math.sin(ph);
    // det is positive far out and negative just inside the tangential curve.
    let hi = 6 * b + 6 * s, lo = hi;
    for (let k = 0; k < 400; k++) { lo = hi * 0.97; if (jacobianDet(lo * cx, lo * cy, b, q, s) < 0) break; hi = lo; if (lo < 1e-3 * b) break; }
    for (let k = 0; k < 40; k++) { const mid = 0.5 * (lo + hi); if (jacobianDet(mid * cx, mid * cy, b, q, s) < 0) lo = mid; else hi = mid; }
    const r = 0.5 * (lo + hi);
    critical.push([r * cx, r * cy]);
    caustic.push(sourcePosition(r * cx, r * cy, b, q, s));
    if (s < 1e-6 * b) {
      // Singular lens: images disappear when the source crosses beta = -alpha(theta -> 0).
      const [ax, ay] = deflection(1e-7 * b * cx, 1e-7 * b * cy, b, q, 0);
      cut.push([-ax, -ay]);
    } else {
      // Cored lens: continue inward to the radial critical curve (det returns to positive).
      let a = r * 0.999, c = a;
      for (let k = 0; k < 600; k++) { c = a * 0.97; if (jacobianDet(c * cx, c * cy, b, q, s) > 0) break; a = c; if (c < 1e-4 * b) break; }
      for (let k = 0; k < 40; k++) { const mid = 0.5 * (a + c); if (jacobianDet(mid * cx, mid * cy, b, q, s) > 0) c = mid; else a = mid; }
      const rr = 0.5 * (a + c);
      cut.push(sourcePosition(rr * cx, rr * cy, b, q, s));
    }
  }
  return { critical, caustic, cut };
}

/** Even-odd point-in-polygon test. */
export function inside(p: [number, number], poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Total magnification of a circular source of radius rs at beta, by inverse
 * ray shooting: the ratio of lensed image area to source area.
 */
export function magnification(beta: [number, number], rs: number, b: number, q: number, s: number, n = 360): number {
  const half = 3.2 * b + Math.hypot(beta[0], beta[1]) + 3 * rs;
  const d = (2 * half) / n, r2 = rs * rs;
  let hits = 0;
  for (let j = 0; j < n; j++) {
    const y = -half + (j + 0.5) * d;
    for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * d;
      const [bx, by] = sourcePosition(x, y, b, q, s);
      const dx = bx - beta[0], dy = by - beta[1];
      if (dx * dx + dy * dy < r2) hits++;
    }
  }
  return (hits * d * d) / (Math.PI * r2);
}
