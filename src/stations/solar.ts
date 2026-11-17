/** Solar system: Newtonian N-body with a symplectic integrator. Units: AU, years, solar masses. */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { OrbitRig } from '../engine/orbit';
import { Panel, Dial, Readouts, button, select, el } from '../ui/kit';
import { Plot } from '../ui/plot';
import * as NB from '../physics/nbody';
import { SI, Vec3, v3 } from '../physics/constants';
import { num, fixed, length, duration, speed } from '../ui/format';

const MAXB = 40, TRAIL = 1400;
const AU_PER_YR = SI.AU / SI.yr; // m/s

interface Body { name: string; color: number; radiusAU: number; trail: Float32Array; trailLen: number; head: number; lastTrail: Vec3; }

export class SolarStation extends Station {
  readonly id = 'solar';
  readonly name = 'Solar system';
  readonly blurb = 'The Sun and eight planets from their J2000 orbital elements, integrated as a gravitational N-body problem. Change G or the Sun’s mass and the orbits respond; add bodies and watch the system cope.';
  readonly reach: [number, number] = [1.6, 1.5];
  readonly uses: (keyof Consts)[] = ['G', 'c'];
  readonly hint = 'drag to orbit · scroll to change scale · click the ecliptic to add a body (when armed)';
  centre() { return 12.2; }

  private rig = new OrbitRig();
  private state!: NB.NBodyState;
  private bodies: Body[] = [];
  private meshes: THREE.Mesh[] = [];
  private lines: THREE.Line[] = [];
  private time = 0;
  private rate = 0.5;
  private sunMass = 1;
  private e0 = 0; private l0 = 1;
  private selected = 3;
  private follow = false;
  private addArmed = false;
  private addMass = 1e-6; private addSpeed = 1;
  private ro!: Readouts; private el!: Readouts; private plot!: Plot;
  private warn!: HTMLElement;
  private sel!: HTMLSelectElement;
  private rings: THREE.LineLoop[] = [];
  private actualRate = 0;
  private pn = false;
  private figure8 = false;
  ejected = 0;

  private G(ctx: Ctx) { return NB.G_AU_YR * ctx.consts.G; }

  build(ctx: Ctx) {
    this.rig.up = 'z'; this.rig.phi = 0.9; this.rig.theta = -0.9;
    const sphere = new THREE.SphereGeometry(1, 24, 16);
    for (let i = 0; i < MAXB; i++) {
      const m = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false; this.meshes.push(m); this.scene.add(m);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      l.frustumCulled = false; l.visible = false; this.lines.push(l); this.scene.add(l);
    }
    const circle = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 180; i++) { const a = (i / 180) * Math.PI * 2; pts.push(Math.cos(a), Math.sin(a), 0); }
    circle.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    for (const r of [0.1, 1, 10, 100]) {
      const ring = new THREE.LineLoop(circle, new THREE.LineBasicMaterial({ color: 0x8cabc8, transparent: true, opacity: 0.16 }));
      ring.scale.setScalar(r); (ring as any).au = r; this.rings.push(ring); this.scene.add(ring);
    }
    this.init(ctx);
  }

  private init(ctx: Ctx) {
    const G = this.G(ctx);
    const base = NB.solarSystem(G);
    this.state = NB.createState(MAXB);
    this.state.n = base.n;
    this.state.pos.set(base.pos); this.state.vel.set(base.vel); this.state.mass.set(base.mass);
    this.state.mass[0] = this.sunMass;
    this.bodies = [{ name: 'Sun', color: 0xffd27a, radiusAU: SI.Rsun / SI.AU, trail: new Float32Array(TRAIL * 3), trailLen: 0, head: 0, lastTrail: [0, 0, 0] }];
    for (const p of NB.PLANETS) this.bodies.push({ name: p.name, color: p.color, radiusAU: (p.radiusKm * 1e3) / SI.AU, trail: new Float32Array(TRAIL * 3), trailLen: 0, head: 0, lastTrail: [1e9, 0, 0] });
    this.time = 0; this.ejected = 0; this.figure8 = false;
    NB.computeAccelerations(this.state, G, 1e-5);
    this.rebase(ctx);
    this.syncSelect();
  }

  private rebase(ctx: Ctx) {
    const G = this.G(ctx);
    NB.computeAccelerations(this.state, G, 1e-5);
    this.e0 = NB.totalEnergy(this.state, G, 1e-5);
    this.l0 = v3.len(NB.angularMomentum(this.state));
  }

  private syncSelect() {
    if (!this.sel) return;
    this.sel.replaceChildren(...this.bodies.map((b, i) => el('option', { value: String(i), text: b.name, selected: i === this.selected })));
  }

  onConsts(ctx: Ctx) { if (this.built) this.rebase(ctx); }
  reset(ctx: Ctx) { this.sunMass = 1; this.selected = 3; this.init(ctx); }

  panels(left: Panel, right: Panel, ctx: Ctx) {
    left.title(this.name).blurb(this.blurb);
    this.warn = left.warn();
    left.section('Time');
    left.dial({ label: 'Simulation speed', min: 0.01, max: 200, value: this.rate, log: true, fmt: (v) => `${num(v, 2)} yr/s`, onChange: (v) => (this.rate = v) });
    left.section('Gravity');
    left.dial({ label: 'Mass of the Sun', min: 0.1, max: 10, value: this.sunMass, log: true, fmt: (v) => `${num(v, 3)} M☉`, onChange: (v) => { this.sunMass = v; this.state.mass[0] = v; this.rebase(ctx); } });
    left.note('G is the dial at the top. Changing either one mid-flight leaves every body with its old velocity in a new potential.');
    left.toggle('Relativistic correction (first post-Newtonian, Sun’s field)', this.pn, (v) => { this.pn = v; this.rebase(ctx); });
    left.note('With it on, orbits precess as general relativity predicts: 43″ a century for Mercury. Turn c down to about 1,000 km/s and Mercury’s ellipse swings round by 2.6° every orbit.');
    left.section('Add a body');
    left.dial({ label: 'Mass', min: 1e-10, max: 2, value: this.addMass, log: true, fmt: (v) => (v < 1e-4 ? `${num(v / 3.0404e-6, 2)} M⊕` : `${num(v, 2)} M☉`), onChange: (v) => (this.addMass = v) });
    left.dial({ label: 'Launch speed', min: 0, max: 1.6, value: this.addSpeed, step: 0.01, fmt: (v) => `${fixed(v, 2)} × circular`, onChange: (v) => (this.addSpeed = v) });
    const arm = button('Arm: click to place', () => { this.addArmed = !this.addArmed; arm.classList.toggle('on', this.addArmed); });
    left.buttons(arm, button('Reset system', () => ctx.resetActive()));
    left.note('Bodies are placed in the ecliptic, moving prograde. Escape speed is 1.41 × circular.');
    left.section('Set pieces');
    left.buttons(button('Add Trojans', () => this.addTrojans(ctx)), button('Figure-eight', () => this.figureEight(ctx)));
    left.note('Trojans share Jupiter’s orbit 60° ahead and behind, at its stable Lagrange points. The figure-eight is a three-body orbit found numerically in 1993; nudge G and it falls apart.');

    right.section('Integrator');
    this.ro = right.readouts(['Elapsed', 'Actual speed', 'Energy drift', 'Ang. momentum drift', 'Bodies', 'Ejected']);
    right.section('Selected body');
    this.sel = select([['0', 'Sun']], '0', (v) => { this.selected = +v; });
    this.syncSelect();
    const fol = button('Follow', () => { this.follow = !this.follow; fol.classList.toggle('on', this.follow); });
    right.buttons(this.sel, fol);
    this.el = right.readouts(['Distance from Sun', 'Speed', 'v / c', 'Semi-major axis', 'Eccentricity', 'Period', 'Light time from Sun', 'GR precession']);
    this.plot = new Plot(150, 'Effective potential of the selected orbit about the Sun, with its energy (dashed) and current radius (dot).');
    right.add(this.plot.el);
    right.section('Relativity check');
    right.note('Orbits are Newtonian unless the relativistic correction is on. The precession figure is the first-order prediction of general relativity and scales as G/c². With the correction on, the Newtonian energy shown above is no longer exactly conserved.');
  }

  private spawn(x: number, y: number, ctx: Ctx) {
    const s = this.state;
    if (s.n >= MAXB) { ctx.toast('Body limit reached'); return; }
    const G = this.G(ctx);
    const rx = x - s.pos[0], ry = y - s.pos[1];
    const r = Math.hypot(rx, ry);
    if (r < 0.01) return;
    const vc = Math.sqrt((G * s.mass[0]) / r) * this.addSpeed;
    const i = s.n++;
    s.pos.set([x, y, 0], 3 * i);
    s.vel.set([s.vel[0] - (ry / r) * vc, s.vel[1] + (rx / r) * vc, s.vel[2]], 3 * i);
    s.mass[i] = this.addMass;
    const big = this.addMass > 1e-3;
    this.bodies.push({ name: `Body ${i - 8}`, color: big ? 0xffb454 : 0xd29bff, radiusAU: big ? SI.Rsun / SI.AU * Math.pow(this.addMass, 0.8) : 4.26e-5 * Math.cbrt(this.addMass / 3e-6), trail: new Float32Array(TRAIL * 3), trailLen: 0, head: 0, lastTrail: [1e9, 0, 0] });
    this.selected = i; this.syncSelect();
    this.rebase(ctx);
  }

  /** Add a trail point whenever a body has moved a small fraction of its distance from the Sun. */
  private sampleTrails() {
    const s = this.state;
    for (let i = this.figure8 ? 0 : 1; i < s.n; i++) {
      const b = this.bodies[i];
      const x = s.pos[3 * i], y = s.pos[3 * i + 1], z = s.pos[3 * i + 2];
      const lt = b.lastTrail, moved = Math.hypot(x - lt[0], y - lt[1], z - lt[2]);
      const dSun = this.figure8 ? 1 : Math.hypot(x - s.pos[0], y - s.pos[1], z - s.pos[2]);
      if (moved > Math.max(dSun * 0.04, 1e-4)) {
        // Ring buffer: head is the next slot to write.
        b.trail[3 * b.head] = x; b.trail[3 * b.head + 1] = y; b.trail[3 * b.head + 2] = z;
        b.head = (b.head + 1) % TRAIL;
        if (b.trailLen < TRAIL) b.trailLen++;
        lt[0] = x; lt[1] = y; lt[2] = z;
      }
    }
  }

  /** Relativistic correction from the Sun's field, applied as a velocity kick after each step. */
  private pnKick(h: number, G: number, c: number) {
    const s = this.state, mu = G * s.mass[0];
    for (let i = 1; i < s.n; i++) {
      const r: Vec3 = [s.pos[3 * i] - s.pos[0], s.pos[3 * i + 1] - s.pos[1], s.pos[3 * i + 2] - s.pos[2]];
      const v: Vec3 = [s.vel[3 * i] - s.vel[0], s.vel[3 * i + 1] - s.vel[1], s.vel[3 * i + 2] - s.vel[2]];
      const a = NB.pnAcceleration(r, v, mu, c);
      s.vel[3 * i] += a[0] * h; s.vel[3 * i + 1] += a[1] * h; s.vel[3 * i + 2] += a[2] * h;
    }
  }

  /** Twelve massless bodies around Jupiter's L4 and L5 points, 60 degrees ahead of and behind it. */
  private addTrojans(ctx: Ctx) {
    const s = this.state, j = this.bodies.findIndex((b) => b.name === 'Jupiter');
    if (j < 0) { ctx.toast('Jupiter is not in the system'); return; }
    let k = 0;
    for (const sign of [1, -1]) for (let n = 0; n < 6; n++) {
      if (s.n >= MAXB) break;
      const ang = sign * (Math.PI / 3 + (n - 2.5) * 0.045), c = Math.cos(ang), sn = Math.sin(ang);
      const rx = s.pos[3 * j] - s.pos[0], ry = s.pos[3 * j + 1] - s.pos[1], rz = s.pos[3 * j + 2] - s.pos[2];
      const vx = s.vel[3 * j] - s.vel[0], vy = s.vel[3 * j + 1] - s.vel[1], vz = s.vel[3 * j + 2] - s.vel[2];
      const i = s.n++;
      s.pos.set([s.pos[0] + rx * c - ry * sn, s.pos[1] + rx * sn + ry * c, s.pos[2] + rz], 3 * i);
      s.vel.set([s.vel[0] + vx * c - vy * sn, s.vel[1] + vx * sn + vy * c, s.vel[2] + vz], 3 * i);
      s.mass[i] = 1e-14;
      this.bodies.push({ name: `Trojan ${++k}`, color: sign > 0 ? 0x7be0a4 : 0xd29bff, radiusAU: 1e-6, trail: new Float32Array(TRAIL * 3), trailLen: 0, head: 0, lastTrail: [1e9, 0, 0] });
    }
    this.syncSelect(); this.rebase(ctx);
    ctx.toast('Trojans added at L4 (green) and L5 (violet)');
  }

  /** Replace the system with three equal masses on the Chenciner-Montgomery figure-eight orbit. */
  private figureEight(ctx: Ctx) {
    const s = this.state, G = this.G(ctx);
    // Standard initial conditions for G = m = 1; velocities rescale by sqrt(G m).
    const x = 0.97000436, y = 0.24308753, vx = 0.93240737, vy = 0.86473146, k = Math.sqrt(G);
    s.n = 3;
    s.pos.set([x, -y, 0, -x, y, 0, 0, 0, 0]);
    s.vel.set([(vx / 2) * k, (vy / 2) * k, 0, (vx / 2) * k, (vy / 2) * k, 0, -vx * k, -vy * k, 0]);
    s.mass[0] = s.mass[1] = s.mass[2] = 1;
    const mk = (name: string, color: number) => ({ name, color, radiusAU: SI.Rsun / SI.AU, trail: new Float32Array(TRAIL * 3), trailLen: 0, head: 0, lastTrail: [1e9, 0, 0] as Vec3 });
    this.bodies = [mk('Star A', 0xffd27a), mk('Star B', 0x6fd3ff), mk('Star C', 0xff7a7a)];
    this.time = 0; this.ejected = 0; this.selected = 1; this.sunMass = 1; this.figure8 = true;
    this.syncSelect(); this.rebase(ctx);
    ctx.setLogScale(11.75);
    ctx.toast('Three equal stars chasing each other round a figure of eight');
  }

  private remove(i: number) {
    const s = this.state, last = s.n - 1;
    for (let k = i; k < last; k++) {
      for (let d = 0; d < 3; d++) { s.pos[3 * k + d] = s.pos[3 * (k + 1) + d]; s.vel[3 * k + d] = s.vel[3 * (k + 1) + d]; }
      s.mass[k] = s.mass[k + 1];
    }
    s.n = last; this.bodies.splice(i, 1);
    if (this.selected >= s.n) this.selected = 0;
    this.syncSelect();
  }

  update(dt: number, ctx: Ctx) {
    const s = this.state, G = this.G(ctx);
    this.rig.drag(ctx.input);
    this.rig.dist = (Math.pow(10, ctx.logScale) / SI.AU) * 1.25;

    if (this.addArmed) for (const c of ctx.input.clicks) {
      const v = ctx.view;
      const ndc = new THREE.Vector2(((c.x - v.x) / v.w) * 2 - 1, -(((c.y - v.y) / v.h) * 2 - 1));
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
      const t = -ray.ray.origin.z / ray.ray.direction.z;
      if (t > 0) { const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t); this.spawn(p.x, p.y, ctx); }
    }

    if (!ctx.paused) {
      // Step small enough for the tightest orbit, with a cap on work per frame.
      let rMin = Infinity;
      for (let i = 1; i < s.n; i++) rMin = Math.min(rMin, Math.hypot(s.pos[3 * i] - s.pos[0], s.pos[3 * i + 1] - s.pos[1], s.pos[3 * i + 2] - s.pos[2]));
      if (this.figure8) rMin = Math.min(rMin, 0.3, Math.hypot(s.pos[6] - s.pos[3], s.pos[7] - s.pos[4], s.pos[8] - s.pos[5]));
      const tOrb = 2 * Math.PI * Math.sqrt(Math.max(rMin, 0.02) ** 3 / (G * Math.max(s.mass[0], 1e-3)));
      const h = Math.min(tOrb / 60, 0.02);
      const want = this.rate * dt;
      const steps = Math.min(Math.ceil(want / h), 500);
      const hh = Math.min(h, want / steps);
      const n0 = s.n;
      const cAU = NB.C_AU_YR * ctx.consts.c;
      for (let k = 0; k < steps; k++) {
        NB.yoshida4(s, hh, G, 1e-5);
        if (this.pn && !this.figure8) this.pnKick(hh, G, cAU);
        this.sampleTrails();
      }
      this.time += steps * hh; this.actualRate = (steps * hh) / dt;
      // Remove anything that has left for good or fallen into the Sun.
      for (let i = s.n - 1; i >= 1; i--) {
        const r: Vec3 = [s.pos[3 * i] - s.pos[0], s.pos[3 * i + 1] - s.pos[1], s.pos[3 * i + 2] - s.pos[2]];
        const d = v3.len(r);
        if (d > 3000 || d < 0.0047 * Math.pow(s.mass[0], 0.8)) { this.remove(i); this.ejected++; this.rebase(ctx); }
      }
      if (s.n !== n0) this.syncSelect();
    }

    if (this.follow && this.selected < s.n) this.rig.target.set(s.pos[3 * this.selected], s.pos[3 * this.selected + 1], s.pos[3 * this.selected + 2]);
    else if (this.figure8) this.rig.target.set(0, 0, 0);
    else this.rig.target.set(s.pos[0], s.pos[1], s.pos[2]);
    this.rig.apply(this.camera);

    const minR = this.rig.dist * 0.006;
    for (let i = 0; i < MAXB; i++) {
      const m = this.meshes[i], l = this.lines[i];
      if (i >= s.n) { m.visible = false; l.visible = false; continue; }
      const b = this.bodies[i];
      const x = s.pos[3 * i], y = s.pos[3 * i + 1], z = s.pos[3 * i + 2];
      m.visible = true; m.position.set(x, y, z);
      m.scale.setScalar(Math.max(b.radiusAU, minR * (i === 0 ? 1.8 : 1)));
      (m.material as THREE.MeshBasicMaterial).color.setHex(b.color);
      const attr = l.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      // Unroll the ring buffer, oldest first, and finish at the body itself.
      if (b.trailLen < TRAIL) arr.set(b.trail.subarray(0, b.trailLen * 3));
      else { arr.set(b.trail.subarray(3 * b.head), 0); arr.set(b.trail.subarray(0, 3 * b.head), 3 * (TRAIL - b.head)); }
      const end = Math.min(b.trailLen, TRAIL - 1);
      arr[3 * end] = x; arr[3 * end + 1] = y; arr[3 * end + 2] = z;
      attr.needsUpdate = true;
      l.geometry.setDrawRange(0, end + 1);
      l.visible = i > 0 || this.figure8; (l.material as THREE.LineBasicMaterial).color.setHex(b.color);
      const apparent = Math.max(b.radiusAU, minR) / this.rig.dist;
      if (apparent > 0.004) ctx.labels.put(b.name, m.position, this.camera, ctx.view, i === this.selected);
    }
    for (const ring of this.rings) {
      const au = (ring as any).au as number;
      ring.position.set(s.pos[0], s.pos[1], s.pos[2]);
      const vis = au / this.rig.dist;
      ring.visible = !this.figure8 && vis > 0.02 && vis < 3;
      if (ring.visible) ctx.labels.put(`${au} AU`, new THREE.Vector3(s.pos[0] + au * 0.707, s.pos[1] - au * 0.707, 0), this.camera, ctx.view);
    }
  }

  refresh(ctx: Ctx) {
    const s = this.state, G = this.G(ctx), c = SI.c * ctx.consts.c;
    const e = NB.totalEnergy(s, G, 1e-5), l = v3.len(NB.angularMomentum(s));
    const de = Math.abs((e - this.e0) / this.e0);
    // The figure-eight has zero total angular momentum, so report the absolute drift there.
    const dl = this.l0 > 1e-9 ? Math.abs((l - this.l0) / this.l0) : Math.abs(l - this.l0);
    this.ro.set('Elapsed', `${num(this.time, 4)} yr`);
    this.ro.set('Actual speed', `${num(this.actualRate, 2)} yr/s`, this.actualRate < this.rate * 0.9 ? 'warm' : '');
    this.ro.set('Energy drift', num(de, 2), de > 1e-3 ? 'bad' : de > 1e-5 ? 'warm' : 'good');
    this.ro.set('Ang. momentum drift', num(dl, 2), dl > 1e-6 ? 'warm' : 'good');
    this.ro.set('Bodies', String(s.n));
    this.ro.set('Ejected', String(this.ejected));

    const i = Math.min(this.selected, s.n - 1);
    let fastest = 0;
    for (let k = 1; k < s.n; k++) fastest = Math.max(fastest, Math.hypot(s.vel[3 * k] - s.vel[0], s.vel[3 * k + 1] - s.vel[1], s.vel[3 * k + 2] - s.vel[2]) * AU_PER_YR / c);
    const rsSun = (2 * SI.G * ctx.consts.G * s.mass[0] * SI.Msun) / (c * c);
    this.warn.textContent = fastest > 0.1
      ? `The fastest body is moving at ${num(fastest, 2)} c. Newtonian gravity is no longer a fair description: the Sun's Schwarzschild radius is now ${length(rsSun)}.`
      : '';
    if (i === 0) {
      for (const k of ['Distance from Sun', 'Speed', 'v / c', 'Semi-major axis', 'Eccentricity', 'Period', 'Light time from Sun', 'GR precession']) this.el.set(k, '—');
      this.plot.draw({ series: [] });
      return;
    }
    const r: Vec3 = [s.pos[3 * i] - s.pos[0], s.pos[3 * i + 1] - s.pos[1], s.pos[3 * i + 2] - s.pos[2]];
    const v: Vec3 = [s.vel[3 * i] - s.vel[0], s.vel[3 * i + 1] - s.vel[1], s.vel[3 * i + 2] - s.vel[2]];
    const mu = G * (s.mass[0] + s.mass[i]);
    const elem = NB.orbitalElements(r, v, mu);
    const d = v3.len(r), sp = v3.len(v) * AU_PER_YR;
    this.el.set('Distance from Sun', `${num(d, 4)} AU`);
    this.el.set('Speed', speed(sp));
    this.el.set('v / c', num(sp / c, 3), sp / c > 0.1 ? 'bad' : '');
    this.el.set('Semi-major axis', elem.bound ? `${num(elem.a, 4)} AU` : 'unbound', elem.bound ? '' : 'warm');
    this.el.set('Eccentricity', fixed(elem.e, 4));
    this.el.set('Period', elem.bound ? duration(elem.period * SI.yr) : '∞');
    this.el.set('Light time from Sun', duration((d * SI.AU) / c));
    if (elem.bound && elem.e < 1) {
      const perOrbit = (6 * Math.PI * mu * SI.AU ** 3 / SI.yr ** 2) / (elem.a * SI.AU * (1 - elem.e ** 2) * c * c);
      const arcsecCentury = (perOrbit * 206264.8 * 100) / elem.period;
      this.el.set('GR precession', `${num(arcsecCentury, 3)}″ / century`);
    } else this.el.set('GR precession', '—');

    // Effective potential U(r) = L^2 / (2 r^2) - mu / r, in (AU/yr)^2.
    const h = v3.len(v3.cross(r, v));
    const rp = Math.max(elem.periapsis, 1e-3), ra = elem.bound ? elem.apoapsis : d * 4;
    const xs: number[] = [], ys: number[] = [];
    const lo = rp * 0.45, hi = Math.max(ra * 1.8, d * 1.5);
    for (let k = 0; k <= 120; k++) { const rr = lo * Math.pow(hi / lo, k / 120); xs.push(rr); ys.push((h * h) / (2 * rr * rr) - mu / rr); }
    const uMin = -(mu * mu) / (2 * h * h || 1);
    this.plot.draw({
      series: [{ x: xs, y: ys }],
      xLog: true, yRange: [uMin * 1.25, Math.max(-uMin * 0.6, elem.energy * 1.3)],
      hlines: [{ y: elem.energy, label: 'E' }],
      markers: [{ x: d, y: (h * h) / (2 * d * d) - mu / d }],
      xLabel: 'r (AU)', yLabel: 'U_eff',
    });
  }

  probe(ctx: Ctx) {
    const s = this.state, G = this.G(ctx);
    // Report the most Earth-like added body: in the habitable band and near-circular.
    let best = 0;
    for (let i = 9; i < s.n; i++) {
      const r: Vec3 = [s.pos[3 * i] - s.pos[0], s.pos[3 * i + 1] - s.pos[1], s.pos[3 * i + 2] - s.pos[2]];
      const v: Vec3 = [s.vel[3 * i] - s.vel[0], s.vel[3 * i + 1] - s.vel[1], s.vel[3 * i + 2] - s.vel[2]];
      const e = NB.orbitalElements(r, v, G * (s.mass[0] + s.mass[i]));
      if (e.bound && e.e < 0.1 && e.a > 0.95 && e.a < 1.37) best = 1;
    }
    return { time: this.time, bodies: s.n, ejected: this.ejected, habitableAdded: best, sunMass: this.sunMass };
  }
}
