/** Small 2D canvas line/scatter plot for the instrument panel. */
import { el } from './kit';
import { num } from './format';

export interface Series {
  x: ArrayLike<number>; y: ArrayLike<number>;
  color?: string; dash?: number[]; points?: boolean; width?: number; label?: string;
}
export interface PlotSpec {
  series: Series[];
  xRange?: [number, number]; yRange?: [number, number];
  xLog?: boolean; yLog?: boolean;
  xLabel?: string; yLabel?: string;
  markers?: { x: number; y: number; color?: string; label?: string }[];
  vlines?: { x: number; color?: string; label?: string }[];
  hlines?: { y: number; color?: string; label?: string }[];
  invertX?: boolean; invertY?: boolean;
}

const COLORS = ['#6fd3ff', '#ffb454', '#7be0a4', '#d29bff', '#ff7a7a', '#d7e1ea'];

export class Plot {
  canvas: HTMLCanvasElement; caption: HTMLElement; el: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  constructor(public height = 150, caption = '') {
    this.canvas = el('canvas', { class: 'plot' });
    this.canvas.style.height = `${height}px`;
    this.caption = el('p', { class: 'plotcap', text: caption });
    this.el = el('div', {}, this.canvas, this.caption);
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(spec: PlotSpec) {
    const c = this.canvas, g = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth || 300, h = this.height;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const padL = 44, padR = 8, padT = 8, padB = 24;
    const tx = (v: number) => (spec.xLog ? Math.log10(Math.max(v, 1e-300)) : v);
    const ty = (v: number) => (spec.yLog ? Math.log10(Math.max(v, 1e-300)) : v);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of spec.series) for (let i = 0; i < s.x.length; i++) {
      const xv = tx(s.x[i]), yv = ty(s.y[i]);
      if (!isFinite(xv) || !isFinite(yv)) continue;
      if (xv < x0) x0 = xv; if (xv > x1) x1 = xv; if (yv < y0) y0 = yv; if (yv > y1) y1 = yv;
    }
    if (spec.xRange) { x0 = tx(spec.xRange[0]); x1 = tx(spec.xRange[1]); }
    if (spec.yRange) { y0 = ty(spec.yRange[0]); y1 = ty(spec.yRange[1]); }
    if (!isFinite(x0) || x0 === x1) { x0 = (isFinite(x0) ? x0 : 0) - 1; x1 = x0 + 2; }
    if (!isFinite(y0) || y0 === y1) { y0 = (isFinite(y0) ? y0 : 0) - 1; y1 = y0 + 2; }
    if (!spec.yRange) { const m = (y1 - y0) * 0.06; y0 -= m; y1 += m; }
    const px = (v: number) => { const f = (tx(v) - x0) / (x1 - x0); return padL + (spec.invertX ? 1 - f : f) * (w - padL - padR); };
    const py = (v: number) => { const f = (ty(v) - y0) / (y1 - y0); return h - padB - (spec.invertY ? 1 - f : f) * (h - padT - padB); };

    g.font = '10px ui-monospace, Menlo, Consolas, monospace';
    g.strokeStyle = 'rgba(140,170,200,0.14)'; g.fillStyle = '#8496a8'; g.lineWidth = 1;
    const ticks = (a: number, b: number, n: number) => {
      const span = b - a, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => span / s <= n) ?? raw;
      const out: number[] = [];
      for (let v = Math.ceil(a / step) * step; v <= b + 1e-9 * span; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
      return out;
    };
    const lab = (v: number, log?: boolean) => (log ? `10${Number.isInteger(v) ? supInt(v) : '^' + v.toFixed(1)}` : num(v, 3));
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const t of ticks(x0, x1, 5)) {
      const X = padL + ((spec.invertX ? x1 - t : t - x0) / (x1 - x0)) * (w - padL - padR);
      g.beginPath(); g.moveTo(X, padT); g.lineTo(X, h - padB); g.stroke();
      g.fillText(lab(t, spec.xLog), X, h - padB + 3);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const t of ticks(y0, y1, 4)) {
      const Y = h - padB - ((spec.invertY ? y1 - t : t - y0) / (y1 - y0)) * (h - padT - padB);
      g.beginPath(); g.moveTo(padL, Y); g.lineTo(w - padR, Y); g.stroke();
      g.fillText(lab(t, spec.yLog), padL - 4, Y);
    }
    g.fillStyle = '#55657a'; g.textAlign = 'right'; g.textBaseline = 'bottom';
    if (spec.xLabel) g.fillText(spec.xLabel, w - padR, h - 1);
    if (spec.yLabel) { g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(spec.yLabel, padL + 4, padT + 1); }

    g.save(); g.beginPath(); g.rect(padL, padT, w - padL - padR, h - padT - padB); g.clip();
    for (const l of spec.vlines ?? []) {
      g.strokeStyle = l.color ?? 'rgba(255,180,84,0.6)'; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(px(l.x), padT); g.lineTo(px(l.x), h - padB); g.stroke(); g.setLineDash([]);
      if (l.label) { g.fillStyle = l.color ?? '#ffb454'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(l.label, px(l.x) + 3, padT + 12); }
    }
    for (const l of spec.hlines ?? []) {
      g.strokeStyle = l.color ?? 'rgba(255,180,84,0.6)'; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(padL, py(l.y)); g.lineTo(w - padR, py(l.y)); g.stroke(); g.setLineDash([]);
      if (l.label) { g.fillStyle = l.color ?? '#ffb454'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(l.label, w - padR - 3, py(l.y) - 2); }
    }
    spec.series.forEach((s, k) => {
      const col = s.color ?? COLORS[k % COLORS.length];
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s.width ?? 1.4; g.setLineDash(s.dash ?? []);
      if (s.points) {
        for (let i = 0; i < s.x.length; i++) { const X = px(s.x[i]), Y = py(s.y[i]); if (isFinite(X) && isFinite(Y)) { g.beginPath(); g.arc(X, Y, 2.2, 0, 6.2832); g.fill(); } }
      } else {
        g.beginPath(); let pen = false;
        for (let i = 0; i < s.x.length; i++) {
          const X = px(s.x[i]), Y = py(s.y[i]);
          if (!isFinite(X) || !isFinite(Y)) { pen = false; continue; }
          if (pen) g.lineTo(X, Y); else { g.moveTo(X, Y); pen = true; }
        }
        g.stroke();
      }
    });
    g.setLineDash([]);
    for (const m of spec.markers ?? []) {
      const X = px(m.x), Y = py(m.y);
      g.fillStyle = m.color ?? '#ffffff'; g.beginPath(); g.arc(X, Y, 3.5, 0, 6.2832); g.fill();
      if (m.label) { g.textAlign = X > w * 0.7 ? 'right' : 'left'; g.textBaseline = 'bottom'; g.fillText(m.label, X + (X > w * 0.7 ? -6 : 6), Y - 3); }
    }
    g.restore();
    // Legend
    const labelled = spec.series.filter((s) => s.label);
    if (labelled.length) {
      let lx = padL + 6; const lyy = h - padB - 8;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      labelled.forEach((s) => {
        const col = s.color ?? COLORS[spec.series.indexOf(s) % COLORS.length];
        g.fillStyle = col; g.fillRect(lx, lyy - 1, 10, 2);
        g.fillText(s.label!, lx + 13, lyy);
        lx += 19 + g.measureText(s.label!).width;
      });
    }
  }
}

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const supInt = (n: number) => (n < 0 ? '⁻' : '') + String(Math.abs(n)).split('').map((d) => SUPS[+d]).join('');
