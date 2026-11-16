/**
 * Axisymmetric galaxy potential: Hernquist bulge + Miyamoto-Nagai disc + NFW halo.
 * Units: kpc, km/s, 1e10 Msun. The time unit is kpc/(km/s) = 0.9778 Gyr.
 */
export const G_GAL = 43009.1727; // kpc (km/s)^2 per 1e10 Msun
export const TIME_UNIT_GYR = 0.977792;

export interface GalaxyParams {
  bulgeMass: number; bulgeScale: number;
  discMass: number; discA: number; discB: number;
  haloMass: number; haloConc: number; // M200 and concentration
  h: number; // Hubble parameter H0/100, sets the critical density for r200
  G: number;
}

export const MILKY_WAY: GalaxyParams = {
  bulgeMass: 0.9, bulgeScale: 0.6,
  discMass: 6.0, discA: 3.0, discB: 0.3,
  haloMass: 100, haloConc: 12,
  h: 0.7, G: G_GAL,
};

/** Critical density in 1e10 Msun / kpc^3. */
export const rhoCrit = (h: number) => 2.775e-8 * h * h;

export function haloRadii(p: GalaxyParams) {
  const r200 = Math.cbrt((3 * p.haloMass) / (4 * Math.PI * 200 * rhoCrit(p.h)));
  return { r200, rs: r200 / p.haloConc };
}

const nfwM = (x: number) => Math.log(1 + x) - x / (1 + x);

/** Halo mass enclosed within radius r. */
export function haloEnclosed(r: number, p: GalaxyParams): number {
  if (p.haloMass <= 0) return 0;
  const { rs } = haloRadii(p);
  return (p.haloMass * nfwM(r / rs)) / nfwM(p.haloConc);
}

export interface Curve { bulge: number; disc: number; halo: number; total: number; }

/** Circular speed in the disc plane at radius R, split by component (km/s). */
export function circularSpeed(R: number, p: GalaxyParams): Curve {
  const vb2 = (p.G * p.bulgeMass * R) / ((R + p.bulgeScale) ** 2);
  const ab = p.discA + p.discB;
  const vd2 = (p.G * p.discMass * R * R) / Math.pow(R * R + ab * ab, 1.5);
  const vh2 = (p.G * haloEnclosed(R, p)) / R;
  return { bulge: Math.sqrt(vb2), disc: Math.sqrt(vd2), halo: Math.sqrt(vh2), total: Math.sqrt(vb2 + vd2 + vh2) };
}

/** Acceleration at (x, y, z); writes into out. */
export function acceleration(x: number, y: number, z: number, p: GalaxyParams, out: Float64Array | number[], o = 0): void {
  const R2 = x * x + y * y;
  const r = Math.sqrt(R2 + z * z) + 1e-9;
  // Bulge and halo are spherical: a = -G M(<r) / r^2 radially.
  const mb = (p.bulgeMass * r * r) / ((r + p.bulgeScale) ** 2);
  const sph = (-p.G * (mb + haloEnclosed(r, p))) / (r * r * r);
  // Miyamoto-Nagai disc.
  const zb = Math.sqrt(z * z + p.discB * p.discB);
  const az = p.discA + zb;
  const den = Math.pow(R2 + az * az, 1.5);
  const dR = (-p.G * p.discMass) / den;
  const dz = (-p.G * p.discMass * az) / (den * zb);
  out[o] = x * (sph + dR);
  out[o + 1] = y * (sph + dR);
  out[o + 2] = z * (sph + dz);
}

/** Epicyclic frequency kappa at radius R (km/s/kpc), from kappa^2 = R dOmega^2/dR + 4 Omega^2. */
export function epicyclicFrequency(R: number, p: GalaxyParams): number {
  const om2 = (r: number) => (circularSpeed(r, p).total / r) ** 2;
  const d = 1e-3 * R;
  const dOm2 = (om2(R + d) - om2(R - d)) / (2 * d);
  return Math.sqrt(Math.max(R * dOm2 + 4 * om2(R), 0));
}

/**
 * Illustrative rotation-curve points for a Milky-Way-like spiral: roughly flat
 * at ~220-230 km/s out to large radius. Synthetic, not survey data.
 */
export const REFERENCE_CURVE: [number, number][] = [
  [2, 205], [4, 222], [6, 228], [8, 229], [10, 228], [12, 226], [15, 224], [18, 222], [22, 219], [26, 216], [30, 213],
];

/** Reduced chi-squared of a model against the reference curve (10 km/s errors). */
export function curveMisfit(p: GalaxyParams): number {
  let s = 0;
  for (const [R, v] of REFERENCE_CURVE) s += ((circularSpeed(R, p).total - v) / 10) ** 2;
  return s / REFERENCE_CURVE.length;
}

/**
 * Acceleration function with the halo constants precomputed, for hot loops.
 * Returns the same values as `acceleration`.
 */
export function makeAccelerator(p: GalaxyParams): (x: number, y: number, z: number, out: Float64Array | number[], o: number) => void {
  const hasHalo = p.haloMass > 0;
  const rs = hasHalo ? haloRadii(p).rs : 1;
  const norm = hasHalo ? p.haloMass / nfwM(p.haloConc) : 0;
  const { G, bulgeMass, bulgeScale, discMass, discA, discB } = p;
  const b2 = discB * discB;
  return (x, y, z, out, o) => {
    const R2 = x * x + y * y;
    const r = Math.sqrt(R2 + z * z) + 1e-9;
    const rb = r + bulgeScale;
    let m = (bulgeMass * r * r) / (rb * rb);
    if (hasHalo) { const xx = r / rs; m += norm * (Math.log(1 + xx) - xx / (1 + xx)); }
    const sph = (-G * m) / (r * r * r);
    const zb = Math.sqrt(z * z + b2);
    const az = discA + zb;
    const q = R2 + az * az;
    const den = q * Math.sqrt(q);
    const dR = (-G * discMass) / den;
    out[o] = x * (sph + dR);
    out[o + 1] = y * (sph + dR);
    out[o + 2] = z * (sph + (dR * az) / zb);
  };
}

/** Escape speed from radius r in the plane (km/s), integrating the spherical part numerically. */
export function escapeSpeed(R: number, p: GalaxyParams): number {
  // Potential difference to infinity along the plane: integral of a_R dR.
  const acc = makeAccelerator(p), out = [0, 0, 0];
  let phi = 0;
  let r = R;
  for (let i = 0; i < 400; i++) {
    const r2 = r * 1.03, mid = 0.5 * (r + r2);
    acc(mid, 0, 0, out, 0);
    phi += -out[0] * (r2 - r);
    r = r2;
  }
  // Beyond the last radius treat the remainder as Keplerian.
  acc(r, 0, 0, out, 0);
  phi += -out[0] * r;
  return Math.sqrt(2 * phi);
}
