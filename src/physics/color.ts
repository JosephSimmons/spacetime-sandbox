/**
 * Colour science: CIE 1931 colour-matching functions (Wyman, Sloan & Shirley
 * 2013 analytic fit), Planck spectra, and a three-band model for Doppler-shifting
 * arbitrary RGB colours.
 */
import { SI } from './constants';

const lobe = (l: number, mu: number, s1: number, s2: number): number => {
  const t = (l - mu) / (l < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};

/** CIE XYZ colour-matching functions at wavelength l (nm). */
export function cmf(l: number): [number, number, number] {
  const x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

export function xyzToLinearRGB(X: number, Y: number, Z: number): [number, number, number] {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ];
}

/** Planck spectral radiance B_lambda(T), wavelength in nm, arbitrary overall scale. */
export function planck(lnm: number, T: number): number {
  const l = lnm * 1e-9;
  const x = (SI.h * SI.c) / (l * SI.kB * T);
  return 1 / (Math.pow(l, 5) * Math.expm1(x)) * 1e-30;
}

/**
 * Linear sRGB chromaticity of a blackbody at temperature T, scaled so the
 * largest channel is 1. Negative (out-of-gamut) channels are clipped to zero.
 */
export function blackbodyRGB(T: number): [number, number, number] {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const b = planck(l, T);
    const [x, y, z] = cmf(l);
    X += b * x; Y += b * y; Z += b * z;
  }
  let [r, g, b] = xyzToLinearRGB(X, Y, Z);
  r = Math.max(r, 0); g = Math.max(g, 0); b = Math.max(b, 0);
  const m = Math.max(r, g, b) || 1;
  return [r / m, g / m, b / m];
}

/** Visible-band luminance of a blackbody relative to one at Tref (per unit area). */
export function blackbodyLuminance(T: number, Tref = SI.Tsun): number {
  const lum = (t: number) => {
    let Y = 0;
    for (let l = 380; l <= 780; l += 5) Y += planck(l, t) * cmf(l)[1];
    return Y;
  };
  return lum(T) / lum(Tref);
}

/** A row of blackbody colours on a log-temperature axis, for use as a lookup texture. */
export function blackbodyTable(n = 256, tMin = 500, tMax = 80000): Float32Array {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const T = tMin * Math.pow(tMax / tMin, i / (n - 1));
    const [r, g, b] = blackbodyRGB(T);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 1;
  }
  return out;
}

/** Band centres (nm) used to treat an RGB colour as a three-line spectrum. */
export const BAND_NM: [number, number, number] = [610, 550, 465];

/**
 * Doppler-shift a linear RGB colour by frequency factor D (observed/emitted).
 * The colour is modelled as three narrow bands; each is moved to lambda/D and
 * re-projected through the CIE functions. The basis is normalised so D = 1
 * returns the input exactly. Intensity scaling (beaming) is applied separately.
 */
export function dopplerShiftRGB(rgb: [number, number, number], D: number): [number, number, number] {
  const basis = (d: number) => BAND_NM.map((l) => xyzToLinearRGB(...cmf(l / d)));
  const M = basis(1); // M[i] = RGB of band i at rest
  // Solve M^T w = rgb for band weights w (3x3 via Cramer's rule).
  const a = [
    [M[0][0], M[1][0], M[2][0]],
    [M[0][1], M[1][1], M[2][1]],
    [M[0][2], M[1][2], M[2][2]],
  ];
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d0 = det3(a);
  const w = [0, 1, 2].map((k) => {
    const m = a.map((row, i) => row.map((v, j) => (j === k ? rgb[i] : v)));
    return det3(m) / d0;
  });
  const S = basis(D);
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) for (let ch = 0; ch < 3; ch++) out[ch] += w[i] * S[i][ch];
  return [Math.max(out[0], 0), Math.max(out[1], 0), Math.max(out[2], 0)];
}

/** Inverse of the band matrix, column-major, for the GLSL implementation. */
export function bandInverseMatrix(): number[] {
  const M = BAND_NM.map((l) => xyzToLinearRGB(...cmf(l)));
  // A = columns M[i]; return A^-1 as column-major array of 9.
  const A = [
    [M[0][0], M[1][0], M[2][0]],
    [M[0][1], M[1][1], M[2][1]],
    [M[0][2], M[1][2], M[2][2]],
  ];
  const d =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const inv = [
    [(A[1][1] * A[2][2] - A[1][2] * A[2][1]) / d, (A[0][2] * A[2][1] - A[0][1] * A[2][2]) / d, (A[0][1] * A[1][2] - A[0][2] * A[1][1]) / d],
    [(A[1][2] * A[2][0] - A[1][0] * A[2][2]) / d, (A[0][0] * A[2][2] - A[0][2] * A[2][0]) / d, (A[0][2] * A[1][0] - A[0][0] * A[1][2]) / d],
    [(A[1][0] * A[2][1] - A[1][1] * A[2][0]) / d, (A[0][1] * A[2][0] - A[0][0] * A[2][1]) / d, (A[0][0] * A[1][1] - A[0][1] * A[1][0]) / d],
  ];
  return [inv[0][0], inv[1][0], inv[2][0], inv[0][1], inv[1][1], inv[2][1], inv[0][2], inv[1][2], inv[2][2]];
}
