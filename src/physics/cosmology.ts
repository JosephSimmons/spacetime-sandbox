/**
 * Friedmann-Lemaitre-Robertson-Walker cosmology.
 * H0 in km/s/Mpc, times in Gyr, distances in Mpc.
 */
export interface CosmoParams { H0: number; Om: number; OL: number; Or: number; }

export const PLANCK18: CosmoParams = { H0: 67.4, Om: 0.315, OL: 0.685, Or: 9.2e-5 };
export const C_KMS = 299792.458;
/** 1/H0 in Gyr for H0 in km/s/Mpc. */
export const hubbleTimeGyr = (H0: number) => 977.7922 / H0;
export const hubbleDistanceMpc = (H0: number) => C_KMS / H0;

export const omegaK = (p: CosmoParams) => 1 - p.Om - p.OL - p.Or;

/** E(a)^2 = (H/H0)^2. Negative values mean that scale factor is never reached. */
export function E2(a: number, p: CosmoParams): number {
  return p.Or / a ** 4 + p.Om / a ** 3 + omegaK(p) / (a * a) + p.OL;
}

function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** True if the model has a Big Bang (E^2 stays positive for all a < 1). */
export function hasBigBang(p: CosmoParams): boolean {
  for (let i = 1; i <= 400; i++) {
    const a = Math.pow(10, -4 + (4 * i) / 400);
    if (E2(a, p) <= 0) return false;
  }
  return true;
}

/** Age of the universe today in Gyr (NaN if there was no Big Bang). */
export function age(p: CosmoParams): number {
  if (!hasBigBang(p)) return NaN;
  // t = (1/H0) * integral_0^1 da / (a E(a)); substitute a = x^2 to tame the origin.
  const f = (x: number) => {
    if (x === 0) return 0;
    const a = x * x;
    return (2 * x) / (a * Math.sqrt(E2(a, p)));
  };
  return hubbleTimeGyr(p.H0) * simpson(f, 0, 1, 4000);
}

/** Lookback time to redshift z in Gyr. */
export function lookbackTime(z: number, p: CosmoParams): number {
  const a1 = 1 / (1 + z);
  return hubbleTimeGyr(p.H0) * simpson((a) => 1 / (a * Math.sqrt(E2(a, p))), a1, 1, 1000);
}

/** Line-of-sight comoving distance in Mpc. */
export function comovingDistance(z: number, p: CosmoParams): number {
  if (z <= 0) return 0;
  return hubbleDistanceMpc(p.H0) * simpson((zz) => 1 / Math.sqrt(E2(1 / (1 + zz), p)), 0, z, 1000);
}

/** Transverse comoving distance (includes curvature). */
export function transverseDistance(z: number, p: CosmoParams): number {
  const dc = comovingDistance(z, p), dh = hubbleDistanceMpc(p.H0), ok = omegaK(p);
  if (Math.abs(ok) < 1e-8) return dc;
  const s = Math.sqrt(Math.abs(ok));
  return ok > 0 ? (dh / s) * Math.sinh((s * dc) / dh) : (dh / s) * Math.sin((s * dc) / dh);
}

export const luminosityDistance = (z: number, p: CosmoParams) => (1 + z) * transverseDistance(z, p);
export const angularDistance = (z: number, p: CosmoParams) => transverseDistance(z, p) / (1 + z);
export const distanceModulus = (z: number, p: CosmoParams) => 5 * Math.log10(luminosityDistance(z, p) * 1e5);

/** Deceleration parameter today. */
export const q0 = (p: CosmoParams) => p.Or + 0.5 * p.Om - p.OL;

export type Fate = 'expands forever' | 'recollapses' | 'no big bang';

export interface History { t: number[]; a: number[]; fate: Fate; tBang: number; tEnd: number; }

/**
 * Scale factor history a(t), with t = 0 today (Gyr). Integrates the
 * acceleration equation a'' = -H0^2 (Or/a^3 + Om/(2 a^2) - OL a) with RK4, which
 * passes smoothly through a turnaround, backwards to the Bang (or bounce) and
 * forwards to tFuture or a Big Crunch.
 */
export function history(p: CosmoParams, tFuture = 40, n = 600): History {
  const H0 = 1 / hubbleTimeGyr(p.H0); // per Gyr
  const acc = (a: number) => -H0 * H0 * (p.Or / (a * a * a) + (0.5 * p.Om) / (a * a) - p.OL * a);
  const run = (dir: 1 | -1, tMax: number) => {
    const ts: number[] = [], as: number[] = [];
    let a = 1, v = H0, t = 0;
    const base = (tMax / n) * dir;
    for (let i = 0; i < n * 40 && Math.abs(t) < tMax; i++) {
      // Shrink the step near a -> 0 where the acceleration diverges.
      const h = base * Math.min(1, Math.max(a, 0.002) ** 1.5 * 4);
      const k1a = v, k1v = acc(a);
      const k2a = v + 0.5 * h * k1v, k2v = acc(a + 0.5 * h * k1a);
      const k3a = v + 0.5 * h * k2v, k3v = acc(a + 0.5 * h * k2a);
      const k4a = v + h * k3v, k4v = acc(a + h * k3a);
      const an = a + (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
      if (!(an > 1e-3)) { t += h * (a / (a - an || 1)); ts.push(t); as.push(0); return { ts, as, hitZero: true }; }
      a = an; v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v); t += h;
      ts.push(t); as.push(a);
      if (a > 1e4) break;
    }
    return { ts, as, hitZero: false };
  };
  const past = run(-1, 60), fut = run(1, tFuture);
  const t = [...past.ts.reverse(), 0, ...fut.ts];
  const a = [...past.as.reverse(), 1, ...fut.as];
  const fate: Fate = !past.hitZero ? 'no big bang' : fut.hitZero || willRecollapse(p) ? 'recollapses' : 'expands forever';
  return { t, a, fate, tBang: past.hitZero ? t[0] : NaN, tEnd: fut.hitZero ? t[t.length - 1] : Infinity };
}

/** True if expansion halts at some a > 1 (E^2 reaches zero in the future). */
export function willRecollapse(p: CosmoParams): boolean {
  for (let i = 1; i <= 600; i++) {
    const a = Math.pow(10, (4 * i) / 600);
    if (E2(a, p) <= 0) return true;
  }
  return false;
}

/** Redshift at a given comoving distance (Mpc), by bisection. NaN beyond the horizon. */
export function redshiftAtDistance(d: number, p: CosmoParams, zMax = 1100): number {
  if (d <= 0) return 0;
  if (comovingDistance(zMax, p) < d) return NaN;
  let lo = 0, hi = zMax;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (comovingDistance(mid, p) < d) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Angular diameter distance between redshifts z1 < z2 (Mpc), as needed for
 * gravitational lensing. Uses the standard expression, valid for Omega_k >= 0
 * and an excellent approximation for small negative curvature.
 */
export function angularDistanceBetween(z1: number, z2: number, p: CosmoParams): number {
  const dh = hubbleDistanceMpc(p.H0), ok = omegaK(p);
  const m1 = transverseDistance(z1, p), m2 = transverseDistance(z2, p);
  const dm = m2 * Math.sqrt(1 + (ok * m1 * m1) / (dh * dh)) - m1 * Math.sqrt(1 + (ok * m2 * m2) / (dh * dh));
  return dm / (1 + z2);
}

export interface ConeDiagram { t: number[]; lightCone: number[]; hubble: number[]; horizon: number[]; }

/**
 * Proper-distance spacetime diagram for an observer today, from a history:
 * the past light cone, the Hubble sphere c/H and the particle horizon, all in
 * billions of light-years against time in Gyr (c = 1 Gly/Gyr).
 */
export function coneDiagram(h: History): ConeDiagram {
  const n = h.t.length;
  const today = h.t.findIndex((t) => t === 0);
  const out: ConeDiagram = { t: [], lightCone: [], hubble: [], horizon: [] };
  // Conformal time eta(t) = integral dt / a, by the trapezium rule, starting at the Bang.
  const eta = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const a0 = Math.max(h.a[i - 1], 1e-4), a1 = Math.max(h.a[i], 1e-4);
    // Near a -> 0 the integrand is singular but integrable; use the geometric mean there.
    eta[i] = eta[i - 1] + (h.t[i] - h.t[i - 1]) / Math.sqrt(a0 * a1);
  }
  for (let i = 1; i < n - 1; i++) {
    const a = h.a[i];
    if (!(a > 0)) continue;
    const adot = (h.a[i + 1] - h.a[i - 1]) / (h.t[i + 1] - h.t[i - 1]);
    out.t.push(h.t[i]);
    out.lightCone.push(i <= today ? a * (eta[today] - eta[i]) : NaN);
    out.hubble.push(adot > 1e-9 ? a / adot : NaN);
    out.horizon.push(h.fate === 'no big bang' ? NaN : a * eta[i]);
  }
  return out;
}
