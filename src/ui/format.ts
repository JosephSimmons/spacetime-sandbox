/** Number and unit formatting shared by the panels and the scale ruler. */
import { SI } from '../physics/constants';

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const sup = (n: number | string): string => String(n).split('').map((c) => SUP[c] ?? c).join('');

/** Significant-figure formatting that switches to ×10ⁿ outside a readable range. */
export function num(x: number, sig = 3): string {
  if (!isFinite(x)) return isNaN(x) ? '—' : x > 0 ? '∞' : '−∞';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e5 || ax < 1e-3) {
    let e = Math.floor(Math.log10(ax));
    let m = x / Math.pow(10, e);
    if (Math.abs(m).toPrecision(sig).startsWith('10')) { m /= 10; e += 1; }
    return `${m.toPrecision(sig)}×10${sup(e)}`;
  }
  return Number(x.toPrecision(sig)).toString();
}

export const fixed = (x: number, d = 2): string => (isFinite(x) ? x.toFixed(d) : num(x));

const LEN_UNITS: [number, string][] = [
  [1e-15, 'fm'], [1e-12, 'pm'], [1e-9, 'nm'], [1e-6, 'µm'], [1e-3, 'mm'], [1, 'm'], [1e3, 'km'],
];

/** Length with a sensible unit, from femtometres to gigalight-years. */
export function length(m: number, sig = 3): string {
  const a = Math.abs(m);
  if (a === 0) return '0 m';
  if (a < 1e-15) return `${num(m / 1e-15, sig)} fm`;
  if (a < 3e8) {
    let u = LEN_UNITS[0];
    for (const cand of LEN_UNITS) if (a >= cand[0]) u = cand;
    return `${num(m / u[0], sig)} ${u[1]}`;
  }
  if (a < 3e14) return `${num(m / SI.AU, sig)} AU`;
  const ly = m / SI.ly;
  const al = Math.abs(ly);
  if (al < 1e3) return `${num(ly, sig)} ly`;
  if (al < 1e6) return `${num(ly / 1e3, sig)} kly`;
  if (al < 1e9) return `${num(ly / 1e6, sig)} Mly`;
  return `${num(ly / 1e9, sig)} Gly`;
}

export function duration(s: number, sig = 3): string {
  const a = Math.abs(s);
  if (a === 0) return '0 s';
  if (a < 1e-12) return `${num(s / 1e-15, sig)} fs`;
  if (a < 1e-9) return `${num(s / 1e-12, sig)} ps`;
  if (a < 1e-6) return `${num(s / 1e-9, sig)} ns`;
  if (a < 1e-3) return `${num(s / 1e-6, sig)} µs`;
  if (a < 1) return `${num(s / 1e-3, sig)} ms`;
  if (a < 120) return `${num(s, sig)} s`;
  if (a < 7200) return `${num(s / 60, sig)} min`;
  if (a < 172800) return `${num(s / 3600, sig)} h`;
  if (a < SI.yr) return `${num(s / 86400, sig)} d`;
  const y = s / SI.yr, ay = Math.abs(y);
  if (ay < 1e3) return `${num(y, sig)} yr`;
  if (ay < 1e6) return `${num(y / 1e3, sig)} kyr`;
  if (ay < 1e9) return `${num(y / 1e6, sig)} Myr`;
  return `${num(y / 1e9, sig)} Gyr`;
}

export function speed(v: number, sig = 3): string {
  const a = Math.abs(v);
  if (a < 1e3) return `${num(v, sig)} m/s`;
  return `${num(v / 1e3, sig)} km/s`;
}

export const pow10 = (logv: number): string => `10${sup(logv.toFixed(1))} m`;
