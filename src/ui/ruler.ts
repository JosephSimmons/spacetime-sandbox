/** The scale ruler along the bottom: a log axis with station bands and landmarks. */
import { SCALE_MIN, SCALE_MAX, LANDMARKS, DECADE_UNITS } from '../engine/scale';
import { length, sup } from './format';

export interface RulerBand { name: string; lo: number; hi: number; active: boolean; }

export class Ruler {
  private g: CanvasRenderingContext2D;
  private bands: RulerBand[] = [];
  private dragging = false;
  constructor(private canvas: HTMLCanvasElement, private onScrub: (logScale: number) => void, private onJump: (name: string) => void) {
    this.g = canvas.getContext('2d')!;
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return SCALE_MIN + ((e.clientX - r.left - 20) / (r.width - 40)) * (SCALE_MAX - SCALE_MIN);
    };
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; canvas.setPointerCapture(e.pointerId); this.onScrub(at(e)); });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.onScrub(at(e)); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('dblclick', (e) => {
      const v = at(e as PointerEvent);
      const hit = this.bands.filter((b) => v >= b.lo && v <= b.hi).sort((a, b) => Math.abs(v - (a.lo + a.hi) / 2) - Math.abs(v - (b.lo + b.hi) / 2))[0];
      if (hit) this.onJump(hit.name);
    });
  }

  draw(logScale: number, bands: RulerBand[]) {
    this.bands = bands;
    const c = this.canvas, g = this.g;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const X = (v: number) => 20 + ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * (w - 40);
    const axisY = 52;
    g.font = '10px ui-monospace, Menlo, Consolas, monospace';

    // Station bands in two lanes above the axis.
    const sorted = [...bands].sort((a, b) => a.lo - b.lo);
    const laneEnd = [-Infinity, -Infinity];
    for (const b of sorted) {
      const x0 = X(Math.max(b.lo, SCALE_MIN)), x1 = X(Math.min(b.hi, SCALE_MAX));
      if (x1 <= x0) continue;
      g.font = '10px ui-monospace, Menlo, Consolas, monospace';
      const tw = g.measureText(b.name).width;
      const lane = laneEnd[0] <= x0 - 6 ? 0 : laneEnd[1] <= x0 - 6 ? 1 : laneEnd[0] <= laneEnd[1] ? 0 : 1;
      laneEnd[lane] = Math.max(x1, x0 + tw + 8);
      const y = lane === 0 ? 30 : 10;
      g.fillStyle = b.active ? 'rgba(111,211,255,0.28)' : 'rgba(140,170,200,0.12)';
      g.fillRect(x0, y, x1 - x0, 16);
      g.strokeStyle = b.active ? '#6fd3ff' : 'rgba(140,170,200,0.35)'; g.lineWidth = 1;
      g.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, 15);
      g.fillStyle = b.active ? '#6fd3ff' : '#8496a8';
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(b.name, x0 + 4, y + 8.5);
    }

    // Axis, decades and unit names.
    g.strokeStyle = 'rgba(140,170,200,0.4)';
    g.beginPath(); g.moveTo(X(SCALE_MIN), axisY + 0.5); g.lineTo(X(SCALE_MAX), axisY + 0.5); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let d = Math.ceil(SCALE_MIN); d <= SCALE_MAX; d++) {
      const major = d % 3 === 0;
      g.strokeStyle = major ? 'rgba(140,170,200,0.5)' : 'rgba(140,170,200,0.22)';
      g.beginPath(); g.moveTo(X(d) + 0.5, axisY); g.lineTo(X(d) + 0.5, axisY + (major ? 7 : 4)); g.stroke();
      if (major && w > 900) { g.fillStyle = '#55657a'; g.fillText(`10${sup(d)}`, X(d), axisY + 20); }
    }
    g.fillStyle = '#8496a8';
    for (const [d, name] of DECADE_UNITS) g.fillText(name, X(d), axisY + 9);

    // Landmarks as dots on the axis.
    g.fillStyle = 'rgba(255,180,84,0.75)';
    for (const l of LANDMARKS) { g.beginPath(); g.arc(X(Math.log10(l.size)), axisY, 1.6, 0, 6.2832); g.fill(); }

    // Cursor.
    const cx = X(logScale);
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx, 4); g.lineTo(cx, axisY + 8); g.stroke();
    g.fillStyle = '#ffffff'; g.textBaseline = 'top';
    const text = `${length(Math.pow(10, logScale))}`;
    const right = cx > w - 120;
    g.textAlign = right ? 'right' : 'left';
    g.fillText(text, cx + (right ? -5 : 5), 0);
  }
}
