import * as THREE from 'three';
import { Ctx, Consts, Station } from './types';
import { Input } from './input';
import { Labels } from './labels';
import { Corridor } from './corridor';
import { SCALE_MIN, SCALE_MAX, LANDMARKS } from './scale';
import { Panel, el, button } from '../ui/kit';
import { Ruler } from '../ui/ruler';
import { num, length, duration, speed } from '../ui/format';
import { SI } from '../physics/constants';

const $ = (id: string) => document.getElementById(id)!;

export class App {
  ctx: Ctx;
  active: Station | null = null;
  corridor = new Corridor();
  left = new Panel($('left'));
  right = new Panel($('right'));
  private ruler: Ruler;
  private last = 0;
  private sinceRefresh = 0;
  private constEls: Record<keyof Consts, { root: HTMLElement; input: HTMLInputElement; out: HTMLElement }> = {} as any;
  private corridorReadouts: ReturnType<Panel['readouts']> | null = null;
  private fadeTimer = 0;
  frameHooks: ((dt: number) => void)[] = [];
  refreshHooks: (() => void)[] = [];
  errors: string[] = [];

  constructor(public stations: Station[], startScale = 1) {
    const canvas = $('view') as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x06080c, 1);
    renderer.autoClear = false;
    const input = new Input(canvas);
    this.ctx = {
      renderer, input, labels: new Labels($('labels')),
      consts: { c: 1, G: 1, hbar: 1 },
      logScale: startScale, view: { x: 0, y: 0, w: 1, h: 1 }, paused: false, clock: 0,
      toast: (m) => this.toast(m),
      setLogScale: (v) => { this.ctx.logScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)); },
      constsChanged: () => this.syncConsts(),
    };
    this.ruler = new Ruler($('ruler') as HTMLCanvasElement, (v) => this.ctx.setLogScale(v), (name) => this.jump(name));
    this.buildConstDials();
    this.buildHelp();
    $('btnHelp').addEventListener('click', () => $('help').classList.toggle('hidden'));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start() { requestAnimationFrame((t) => this.frame(t)); }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.ctx.renderer.setSize(w, h, false);
    const wide = w > 1000;
    const lx = wide ? 300 : 0, rx = wide ? 340 : 0;
    $('left').style.display = wide ? '' : 'none';
    this.ctx.view = { x: lx, y: 44, w: Math.max(w - lx - rx, 50), h: Math.max(h - 44 - 86, 50) };
  }

  private buildConstDials() {
    const root = $('consts');
    const spec: [keyof Consts, string, number, number, string][] = [
      ['c', 'c', 1e-8, 1, 'Speed of light. Double-click to reset.'],
      ['G', 'G', 1e-3, 1e3, 'Gravitational constant. Double-click to reset.'],
      ['hbar', 'ħ', 0.1, 1e5, 'Reduced Planck constant. Double-click to reset.'],
    ];
    for (const [key, sym, min, max, title] of spec) {
      const input = el('input', { type: 'range', min: '0', max: '1000', step: '1', title });
      const out = el('output');
      const wrap = el('div', { class: 'cdial', title }, el('b', { text: sym }), input, out);
      const toPos = (v: number) => Math.round((Math.log(v / min) / Math.log(max / min)) * 1000);
      input.value = String(toPos(1));
      input.addEventListener('input', () => {
        let v = min * Math.pow(max / min, +input.value / 1000);
        if (Math.abs(Math.log10(v)) < 0.02) v = 1;
        this.ctx.consts[key] = v; this.syncConsts();
      });
      input.addEventListener('dblclick', () => { this.ctx.consts[key] = 1; this.syncConsts(); });
      (wrap as any)._toPos = toPos;
      this.constEls[key] = { root: wrap, input, out };
      root.append(wrap);
    }
    this.syncConsts();
  }

  private syncConsts() {
    const c = this.ctx.consts;
    const fmt: Record<keyof Consts, string> = {
      c: `×${num(c.c, 3)} = ${speed(SI.c * c.c)}`,
      G: `×${num(c.G, 3)}`,
      hbar: `×${num(c.hbar, 3)}`,
    };
    (Object.keys(this.constEls) as (keyof Consts)[]).forEach((k) => {
      const e = this.constEls[k];
      e.out.textContent = fmt[k];
      e.input.value = String((e.root as any)._toPos(c[k]));
      e.root.classList.toggle('off', !!this.active && !this.active.uses.includes(k));
    });
    this.active?.onConsts(this.ctx);
  }

  private buildHelp() {
    const h = $('help');
    h.innerHTML = `
<h2>How it works</h2>
<p class="blurb">One axis runs through everything: scale. Scroll, or drag the ruler at the bottom, to move from the hydrogen atom to the cosmic web. Where the ruler shows a band there is a station with a working simulation. Between stations you pass landmark sizes.</p>
<p class="blurb">The three dials at the top multiply the constants of nature. Each station reacts to the ones that matter to it; the others are greyed out.</p>
<h3>Controls</h3>
<table>
<tr><td><kbd>scroll</kbd></td><td>Move along the scale axis</td></tr>
<tr><td><kbd>drag</kbd></td><td>Orbit the view (or look around, when flying)</td></tr>
<tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <kbd>Q</kbd><kbd>E</kbd></td><td>Thrust when flying: forward, left, back, right, down, up</td></tr>
<tr><td><kbd>Space</kbd></td><td>Brake to rest (flying)</td></tr>
<tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>Jump to a station</td></tr>
<tr><td><kbd>P</kbd></td><td>Pause the simulation</td></tr>
<tr><td><kbd>R</kbd></td><td>Reset the current station</td></tr>
<tr><td><kbd>H</kbd></td><td>Show or hide this help</td></tr>
<tr><td>double-click a slider</td><td>Reset it to its default</td></tr>
<tr><td>double-click a ruler band</td><td>Jump to that station</td></tr>
</table>
<p class="note">Modelling choices and approximations are listed in DECISIONS.md in the repository.</p>`;
    h.append(el('div', { class: 'btnrow' }, button('Close', () => h.classList.add('hidden'))));
  }

  toast(msg: string) {
    const t = $('toast');
    t.textContent = msg; t.style.opacity = '1';
    window.setTimeout(() => (t.style.opacity = '0'), 3200);
  }

  jump(idOrName: string) {
    const st = this.stations.find((s) => s.id === idOrName || s.name === idOrName);
    if (!st) return;
    this.ctx.setLogScale(st.centre(this.ctx.consts));
    this.switchTo(st);
  }

  private pick(): Station | null {
    const s = this.ctx.logScale, c = this.ctx.consts;
    if (this.active) { const [lo, hi] = this.active.band(c); if (s >= lo && s <= hi) return this.active; }
    let best: Station | null = null, bd = Infinity;
    for (const st of this.stations) {
      const [lo, hi] = st.band(c);
      if (s < lo || s > hi) continue;
      const d = Math.abs(s - st.centre(c));
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  private switchTo(st: Station | null) {
    if (st === this.active) return;
    this.active?.leave(this.ctx);
    this.active = st;
    const fade = $('fade');
    fade.style.transition = 'none'; fade.style.opacity = '0.85';
    window.clearTimeout(this.fadeTimer);
    this.fadeTimer = window.setTimeout(() => { fade.style.transition = 'opacity 0.35s'; fade.style.opacity = '0'; }, 30);
    this.left.clear(); this.right.clear();
    this.corridorReadouts = null;
    if (st) {
      if (!st.built) { st.build(this.ctx); st.built = true; }
      st.panels(this.left, this.right, this.ctx);
      st.enter(this.ctx);
      $('stationName').textContent = st.name;
      $('hint').textContent = st.hint;
    } else {
      this.corridorPanels();
      $('stationName').textContent = 'Between stations';
      $('hint').textContent = 'scroll to change scale · double-click a band on the ruler to jump';
    }
    this.syncConsts();
  }

  private corridorPanels() {
    this.left.title('Between stations').blurb('Nothing is simulated here. The rings are real sizes, drawn to scale against the current field of view, to show what lives between the stations.');
    this.left.section('Stations');
    for (const st of this.stations) this.left.buttons(button(st.name, () => this.jump(st.id)));
    this.right.section('Where you are');
    this.corridorReadouts = this.right.readouts(['Field of view', 'log₁₀ metres', 'Light crossing time', 'Nearest below', 'Nearest above']);
  }

  private frame(t: number) {
    requestAnimationFrame((tt) => this.frame(tt));
    const ctx = this.ctx;
    const dt = Math.min((t - this.last) / 1000 || 0.016, 0.05);
    this.last = t; ctx.clock += dt;
    const input = ctx.input;

    if (input.wheel) ctx.setLogScale(ctx.logScale + input.wheel * 0.0012);
    if (input.hit('h')) $('help').classList.toggle('hidden');
    if (input.hit('Escape')) { $('help').classList.add('hidden'); $('challenges').classList.add('hidden'); }
    if (input.hit('p')) { ctx.paused = !ctx.paused; this.toast(ctx.paused ? 'Paused' : 'Running'); }
    if (input.hit('r') && this.active) { this.active.reset(ctx); this.toast('Station reset'); }
    for (let i = 0; i < Math.min(9, this.stations.length); i++) if (input.hit(String(i + 1))) this.jump(this.stations[i].id);

    this.switchTo(this.pick());

    const r = ctx.renderer;
    const H = window.innerHeight;
    r.setScissorTest(false); r.setViewport(0, 0, window.innerWidth, H); r.clear();
    const v = ctx.view;
    r.setViewport(v.x, H - v.y - v.h, v.w, v.h);
    r.setScissor(v.x, H - v.y - v.h, v.w, v.h);
    r.setScissorTest(true);
    ctx.labels.begin();
    try {
      if (this.active) {
        this.active.camera.aspect = v.w / v.h;
        this.active.update(dt, ctx);
        this.active.render(ctx);
      } else {
        this.corridor.extra = this.stations.map((s) => ({ name: `${s.name} station`, size: Math.pow(10, s.centre(ctx.consts)) }));
        this.corridor.update(dt, ctx);
        this.corridor.render(ctx);
      }
      for (const h of this.frameHooks) h(dt);
    } catch (e: any) {
      const msg = String(e?.stack || e);
      if (!this.errors.includes(msg)) { this.errors.push(msg); console.error(e); }
    }
    ctx.labels.end();

    this.sinceRefresh += dt;
    if (this.sinceRefresh > 0.12) {
      this.sinceRefresh = 0;
      try {
        this.active?.refresh(ctx);
        this.refreshCorridor();
        for (const h of this.refreshHooks) h();
      } catch (e: any) {
        const msg = String(e?.stack || e);
        if (!this.errors.includes(msg)) { this.errors.push(msg); console.error(e); }
      }
      this.ruler.draw(ctx.logScale, this.stations.map((s) => { const [lo, hi] = s.band(ctx.consts); return { name: s.name, lo, hi, active: s === this.active }; }));
    }
    input.endFrame();
  }

  private refreshCorridor() {
    const ro = this.corridorReadouts;
    if (!ro) return;
    const ctx = this.ctx, field = Math.pow(10, ctx.logScale);
    ro.set('Field of view', length(field));
    ro.set('log₁₀ metres', ctx.logScale.toFixed(2));
    ro.set('Light crossing time', duration(field / (SI.c * ctx.consts.c)));
    const below = [...LANDMARKS].reverse().find((l) => l.size <= field), above = LANDMARKS.find((l) => l.size > field);
    ro.set('Nearest below', below ? below.name : '—');
    ro.set('Nearest above', above ? above.name : '—');
  }
}
