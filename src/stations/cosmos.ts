/** Cosmology: Friedmann models with tunable density parameters. Units: Mpc, Gyr. */
import * as THREE from 'three';
import { Station, Ctx } from '../engine/types';
import { OrbitRig } from '../engine/orbit';
import { Panel, Readouts, Dial, button } from '../ui/kit';
import { Plot } from '../ui/plot';
import * as C from '../physics/cosmology';
import { dopplerShiftSurface } from '../physics/color';
import { SI } from '../physics/constants';
import { num, fixed } from '../ui/format';

const N = 14000, R_BOX = 6000; // comoving Mpc
const MPC = SI.pc * 1e6;

export class CosmosStation extends Station {
  readonly id = 'cosmos';
  readonly name = 'Cosmos';
  readonly blurb = 'A patch of universe in comoving coordinates, with you at the centre. Set the density of matter and dark energy and the Friedmann equations decide the age, the geometry and the fate.';
  readonly reach: [number, number] = [2.0, 1.1];
  centre() { return 26.1; }

  params: C.CosmoParams = { ...C.PLANCK18 };
  private rig = new OrbitRig();
  private points!: THREE.Points;
  private comoving = new Float32Array(3 * N);
  private chi = new Float32Array(N);
  private spheres: { mesh: THREE.LineSegments; label: string; radius: () => number }[] = [];
  private hist!: C.History;
  private dirty = true;
  private epoch = 0; // Gyr relative to today
  private playing = false;
  private dials: Record<string, Dial> = {};
  private ro!: Readouts; private aPlot!: Plot; private hubble!: Plot;
  private epochDial!: Dial;
  private refZ: number[] = []; private refMu: number[] = [];
  private derived = { age: NaN, horizon: NaN };

  build(_ctx: Ctx) {
    this.rig.phi = 1.1; this.rig.theta = 0.7;
    // Illustrative clustering: nodes joined by filaments, plus a smooth background.
    let s = 424242;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const inBall = (): [number, number, number] => { for (;;) { const p: [number, number, number] = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; if (p[0] ** 2 + p[1] ** 2 + p[2] ** 2 < 1) return [p[0] * R_BOX, p[1] * R_BOX, p[2] * R_BOX]; } };
    const nodes = Array.from({ length: 420 }, inBall);
    for (let i = 0; i < N; i++) {
      let p: [number, number, number];
      const u = rnd();
      if (u < 0.3) { const n = nodes[Math.floor(rnd() * nodes.length)]; p = [n[0] + gauss() * 60, n[1] + gauss() * 60, n[2] + gauss() * 60]; }
      else if (u < 0.8) {
        const a = nodes[Math.floor(rnd() * nodes.length)];
        let b = a, best = Infinity;
        for (let k = 0; k < 14; k++) { const c = nodes[Math.floor(rnd() * nodes.length)]; const d = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]); if (c !== a && d < best) { best = d; b = c; } }
        const t = rnd();
        p = [a[0] + (b[0] - a[0]) * t + gauss() * 35, a[1] + (b[1] - a[1]) * t + gauss() * 35, a[2] + (b[2] - a[2]) * t + gauss() * 35];
      } else p = inBall();
      this.comoving.set(p, 3 * i);
      this.chi[i] = Math.hypot(p[0], p[1], p[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    // A sphere drawn as three great circles.
    const wire = (color: number) => {
      const pts: number[] = [];
      for (let axis = 0; axis < 3; axis++) for (let i = 0; i < 96; i++) {
        for (const k of [i, i + 1]) {
          const a = (k / 96) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
          pts.push(...(axis === 0 ? [0, c, sn] : axis === 1 ? [c, 0, sn] : [c, sn, 0]));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }));
      this.scene.add(m); return m;
    };
    this.spheres = [
      { mesh: wire(0x6fd3ff), label: 'Hubble radius c/H', radius: () => C.hubbleDistanceMpc(this.params.H0) / Math.sqrt(Math.max(C.E2(this.scaleFactor(), this.params), 1e-9)) },
      { mesh: wire(0xffb454), label: 'particle horizon', radius: () => this.derived.horizon * this.scaleFactor() },
    ];
    const you = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    you.name = 'you'; this.scene.add(you);
    for (let z = 0.02; z <= 2.0; z += 0.06) { this.refZ.push(z); this.refMu.push(C.distanceModulus(z, C.PLANCK18)); }
  }

  /** Scale factor at the displayed epoch, interpolated from the history. */
  private scaleFactor(): number {
    const h = this.hist;
    if (!h) return 1;
    const t = this.epoch;
    if (t <= h.t[0]) return h.a[0];
    if (t >= h.t[h.t.length - 1]) return h.a[h.a.length - 1];
    let lo = 0, hi = h.t.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (h.t[m] <= t) lo = m; else hi = m; }
    const f = (t - h.t[lo]) / (h.t[hi] - h.t[lo] || 1);
    return h.a[lo] + f * (h.a[hi] - h.a[lo]);
  }

  private recompute() {
    this.dirty = false;
    const p = this.params;
    this.hist = C.history(p, 60);
    this.derived.age = C.age(p);
    this.derived.horizon = C.hasBigBang(p) ? C.comovingDistance(1e4, p) : NaN;
    // Redshift of each galaxy as seen from the centre today, from a lookup of chi(z).
    const zs: number[] = [], ds: number[] = [];
    for (let k = 0; k <= 80; k++) { const z = Math.pow(10, -2.5 + (k / 80) * 3.8) - 0.003; zs.push(Math.max(z, 0)); ds.push(C.comovingDistance(Math.max(z, 0), p)); }
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const d = this.chi[i];
      let z = NaN;
      for (let k = 1; k < ds.length; k++) if (ds[k] >= d) { z = zs[k - 1] + ((d - ds[k - 1]) / (ds[k] - ds[k - 1] || 1)) * (zs[k] - zs[k - 1]); break; }
      if (!isFinite(z) || !isFinite(ds[1])) { arr.set([0.12, 0.03, 0.03], 3 * i); continue; }
      const rgb = dopplerShiftSurface([0.95, 0.9, 0.8], 1 / (1 + z));
      const dim = 1.25 / (1 + 0.35 * z);
      arr.set([Math.min(rgb[0] * dim + 0.08, 1), Math.min(rgb[1] * dim + 0.04, 1), Math.min(rgb[2] * dim + 0.04, 1)], 3 * i);
    }
    col.needsUpdate = true;
    if (this.epochDial) this.epochDial.refresh();
  }

  private preset(p: Partial<C.CosmoParams>) {
    Object.assign(this.params, p);
    for (const k of ['H0', 'Om', 'OL'] as const) this.dials[k]?.set(this.params[k]);
    this.dirty = true; this.epoch = 0; this.epochDial?.set(0);
  }
  reset() { this.preset({ ...C.PLANCK18 }); }

  panels(left: Panel, right: Panel, ctx: Ctx) {
    const set = (k: 'H0' | 'Om' | 'OL') => (v: number) => { this.params[k] = v; this.dirty = true; };
    left.title(this.name).blurb(this.blurb);
    left.section('Ingredients');
    this.dials.H0 = left.dial({ label: 'Hubble constant H₀', min: 40, max: 100, value: this.params.H0, step: 0.1, fmt: (v) => `${fixed(v, 1)} km/s/Mpc`, onChange: set('H0') });
    this.dials.Om = left.dial({ label: 'Matter Ωₘ', min: 0, max: 3, value: this.params.Om, step: 0.005, fmt: (v) => fixed(v, 3), onChange: set('Om') });
    this.dials.OL = left.dial({ label: 'Dark energy Ω_Λ', min: -1, max: 3, value: this.params.OL, step: 0.005, fmt: (v) => fixed(v, 3), onChange: set('OL') });
    left.note('Radiation is fixed at Ωᵣ = 9.2×10⁻⁵. Curvature is whatever is left: Ωₖ = 1 − Ωₘ − Ω_Λ − Ωᵣ.');
    left.section('Presets');
    left.buttons(
      button('Planck 2018', () => this.preset({ ...C.PLANCK18 })),
      button('Einstein–de Sitter', () => this.preset({ H0: 70, Om: 1 - 9.2e-5, OL: 0 })),
      button('Open', () => this.preset({ H0: 70, Om: 0.3, OL: 0 })),
      button('Closed', () => this.preset({ H0: 70, Om: 2.5, OL: 0 })),
      button('Loitering', () => this.preset({ H0: 70, Om: 0.3, OL: 1.713 })),
      button('No Big Bang', () => this.preset({ H0: 70, Om: 0.1, OL: 2.2 })),
    );
    left.section('Epoch');
    this.epochDial = left.dial({ label: 'Time shown', min: -1, max: 1, value: 0, step: 0.001, fmt: () => `${this.epoch >= 0 ? '+' : ''}${fixed(this.epoch, 2)} Gyr, a = ${num(this.scaleFactor(), 3)}`, onChange: (v) => { this.playing = false; this.epoch = this.epochFromDial(v); } });
    left.buttons(button('Play from the start', () => { this.epoch = this.hist.t[0]; this.playing = true; }), button('Today', () => { this.playing = false; this.epoch = 0; this.epochDial.set(0); }));
    left.note('Galaxy colours are the redshift each one has today as seen from the centre. The clustering pattern is illustrative, not a simulation of structure formation.');

    right.section('This universe');
    this.ro = right.readouts(['Geometry', 'Ωₖ', 'Age today', 'Fate', 'Deceleration q₀', 'Hubble time 1/H₀', 'Particle horizon', 'Lookback to z = 1', 'd_L at z = 1']);
    right.section('Scale factor');
    this.aPlot = new Plot(150, 'a(t), with today at t = 0. The dot is the epoch shown.');
    right.add(this.aPlot.el);
    right.section('Hubble diagram');
    this.hubble = new Plot(150, 'Distance modulus against redshift. Blue: this model. Dots: Planck 2018 ΛCDM, for reference.');
    right.add(this.hubble.el);
  }

  private epochFromDial(v: number): number {
    const h = this.hist; if (!h) return 0;
    return v < 0 ? -v * h.t[0] : v * Math.min(h.t[h.t.length - 1], 60);
  }

  update(dt: number, ctx: Ctx) {
    if (this.dirty) this.recompute();
    this.rig.drag(ctx.input);
    this.rig.dist = (Math.pow(10, ctx.logScale) / MPC) * 1.2;
    this.rig.apply(this.camera);
    const h = this.hist;
    if (this.playing && !ctx.paused) {
      const span = Math.min(h.t[h.t.length - 1], 40) - h.t[0];
      this.epoch += (dt * span) / 14;
      if (this.epoch >= Math.min(h.t[h.t.length - 1], 40)) { this.playing = false; }
      this.epochDial.set(this.epoch < 0 ? -this.epoch / h.t[0] : this.epoch / Math.min(h.t[h.t.length - 1], 60));
    }
    const a = this.scaleFactor();
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute, arr = attr.array as Float32Array;
    for (let i = 0; i < 3 * N; i++) arr[i] = this.comoving[i] * a;
    attr.needsUpdate = true;
    for (const s of this.spheres) {
      const r = s.radius();
      s.mesh.visible = isFinite(r) && r > 0 && r < this.rig.dist * 6;
      if (!s.mesh.visible) continue;
      s.mesh.scale.setScalar(r);
      ctx.labels.put(s.label, new THREE.Vector3(0, r, 0), this.camera, ctx.view);
    }
    const you = this.scene.getObjectByName('you')!;
    you.scale.setScalar(this.rig.dist * 0.005);
    ctx.labels.put('you', you.position, this.camera, ctx.view, true);
  }

  refresh(_ctx: Ctx) {
    const p = this.params, h = this.hist;
    if (!h) return;
    const ok = C.omegaK(p), big = C.hasBigBang(p);
    this.ro.set('Geometry', Math.abs(ok) < 0.005 ? 'flat' : ok > 0 ? 'open (hyperbolic)' : 'closed (spherical)');
    this.ro.set('Ωₖ', fixed(ok, 3));
    this.ro.set('Age today', big ? `${fixed(this.derived.age, 2)} Gyr` : 'no beginning', big ? '' : 'warm');
    this.ro.set('Fate', h.fate === 'recollapses' ? `recollapses${isFinite(h.tEnd) ? ` in ${fixed(h.tEnd, 1)} Gyr` : ''}` : h.fate, h.fate === 'expands forever' ? 'good' : 'warm');
    this.ro.set('Deceleration q₀', fixed(C.q0(p), 3));
    this.ro.set('Hubble time 1/H₀', `${fixed(C.hubbleTimeGyr(p.H0), 2)} Gyr`);
    this.ro.set('Particle horizon', big ? `${num(this.derived.horizon / 1000, 3)} Gpc` : '—');
    this.ro.set('Lookback to z = 1', big ? `${fixed(C.lookbackTime(1, p), 2)} Gyr` : '—');
    this.ro.set('d_L at z = 1', big ? `${num(C.luminosityDistance(1, p), 4)} Mpc` : '—');
    const tMax = Math.min(h.t[h.t.length - 1], 40);
    const aMax = Math.min(Math.max(...h.a.filter((_, i) => h.t[i] <= tMax)), 6);
    this.aPlot.draw({
      series: [{ x: h.t, y: h.a }], xRange: [Math.max(h.t[0], -40), tMax], yRange: [0, aMax * 1.05],
      vlines: [{ x: 0, label: 'today' }], markers: [{ x: this.epoch, y: this.scaleFactor() }], xLabel: 't (Gyr)', yLabel: 'a',
    });
    const zs: number[] = [], mu: number[] = [];
    if (big) for (let z = 0.02; z <= 2.0; z += 0.04) { zs.push(z); mu.push(C.distanceModulus(z, p)); }
    this.hubble.draw({ series: [{ x: zs, y: mu }, { x: this.refZ, y: this.refMu, color: '#ff7a7a', points: true }], xRange: [0, 2], yRange: [33, 47], xLabel: 'z', yLabel: 'μ' });
  }

  probe() {
    const p = this.params;
    return { age: this.derived.age, flat: Math.abs(C.omegaK(p)) < 0.01 ? 1 : 0, recollapses: this.hist?.fate === 'recollapses' ? 1 : 0, H0: p.H0 };
  }
}
