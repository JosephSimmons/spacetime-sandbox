/** SI values of the constants and unit conversions used across the physics core. */
export const SI = {
  c: 299792458,
  G: 6.6743e-11,
  hbar: 1.054571817e-34,
  h: 6.62607015e-34,
  kB: 1.380649e-23,
  e: 1.602176634e-19,
  me: 9.1093837015e-31,
  mp: 1.67262192369e-27,
  u: 1.6605390666e-27,
  eps0: 8.8541878128e-12,
  sigmaSB: 5.670374419e-8,
  AU: 1.495978707e11,
  Msun: 1.98847e30,
  Rsun: 6.957e8,
  Lsun: 3.828e26,
  Tsun: 5772,
  pc: 3.0856775814913673e16,
  ly: 9.4607304725808e15,
  yr: 3.15576e7,
  a0: 5.29177210903e-11,
  RydbergEV: 13.605693122994,
  RydbergInvM: 1.0973731568160e7,
} as const;

export type Vec3 = [number, number, number];

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};
