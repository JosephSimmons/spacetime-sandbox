/**
 * Galaxy dynamics: test-particle stars orbiting in a bulge + disc + dark halo
 * potential. Units: kpc, km/s, 1e10 Msun.
 */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { OrbitRig } from '../engine/orbit';
import { Panel, Readouts, Dial, button } from '../ui/kit';
import { Plot } from '../ui/plot';
import * as GX from '../physics/galaxy';
import { SI } from '../physics/constants';
import { num, fixed } from '../ui/format';

const N = 26000;
const KPC = SI.pc * 1e3;
const R_SUN = 8.2;

export class GalaxyStation extends Station {
  readonly id = 'galaxy';
  readonly name = 'Galaxy';
  readonly blurb = 'Twenty-six thousand stars orbiting in the combined pull of a bulge, a disc and a dark matter halo. The rotation curve is the observable; the halo is the dial that makes it fit.';
  readonly reach: [number, number] = [1.3, 1.2];
  readonly uses: (keyof Consts)[] = ['G'];
  centre() { return 21.1; }

  params: GX.GalaxyParams = { ...GX.MILKY_WAY };
  private rig = new OrbitRig();
  private pos = new Float64Array(3 * N); private vel = new Float64Array(3 * N); private acc = new Float64Array(3 * N);
  private points!: THREE.Points;
  private sun = { x: R_SUN, y: 0, vx: 0, vy: 0 };
  private sunMesh!: THREE.Mesh;
  private rate = 40; // Myr per second
  private time = 0;
  private ro!: Readouts; private plot!: Plot;
  private dials: Record<string, Dial> = {};
  private accel!: ReturnType<typeof GX.makeAccelerator>;
  escaped = 0;

  private p(ctx: Ctx): GX.GalaxyParams { this.params.G = GX.G_GAL * ctx.consts.G; return this.params; }

  build(ctx: Ctx) {
    this.rig.up = 'z'; this.rig.phi = 0.75; this.rig.theta = 0.4;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb454 }));
    this.scene.add(this.sunMesh);
    this.seed(ctx);
  }

  /** Lay the stars down in approximate equilibrium for the current potential. */
  private seed(ctx: Ctx) {
    const p = this.p(ctx);
    let s = 987654321;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const c = col.array as Float32Array;
    const nBulge = Math.floor(N * 0.13);
    for (let i = 0; i < N; i++) {
      let x: number, y: number, z: number, vx: number, vy: number, vz: number;
      if (i < nBulge) {
        // Hernquist profile: r = a sqrt(u) / (1 - sqrt(u)).
        const u = rnd() * 0.85, sq = Math.sqrt(u);
        const r = (p.bulgeScale * sq) / (1 - sq) + 0.03;
        const ct = 2 * rnd() - 1, st = Math.sqrt(1 - ct * ct), ph = 2 * Math.PI * rnd();
        x = r * st * Math.cos(ph); y = r * st * Math.sin(ph); z = r * ct * 0.8;
        const sig = GX.circularSpeed(r, p).total / Math.SQRT2;
        vx = gauss() * sig * 0.75; vy = gauss() * sig * 0.75; vz = gauss() * sig * 0.6;
        c.set([0.62, 0.46, 0.28], 3 * i);
      } else {
        // Exponential disc, scale length 3 kpc, truncated at 32 kpc.
        let R = 0;
        do { R = -3.0 * Math.log((1 - rnd()) * (1 - rnd())); } while (R > 32 || R < 0.3);
        const arm = rnd() < 0.34;
        let ph = 2 * Math.PI * rnd();
        if (arm) {
          // Two logarithmic arms, pitch about 15 degrees, so their winding can be watched.
          ph = (rnd() < 0.5 ? 0 : Math.PI) + Math.log(R / 3) / Math.tan(0.26) + gauss() * 0.16;
        }
        x = R * Math.cos(ph); y = R * Math.sin(ph); z = gauss() * 0.25;
        const vc = GX.circularSpeed(R, p).total;
        const sr = arm ? 6 : 22 * Math.exp(-R / 12), vt = vc - (sr * sr) / (2 * vc + 1) + gauss() * sr * 0.7, vr = gauss() * sr;
        vx = vr * Math.cos(ph) - vt * Math.sin(ph); vy = vr * Math.sin(ph) + vt * Math.cos(ph); vz = gauss() * (arm ? 4 : 12);
        if (arm) c.set([0.45, 0.72, 1.0], 3 * i); else c.set([0.4, 0.37, 0.33], 3 * i);
      }
      this.pos.set([x, y, z], 3 * i); this.vel.set([vx, vy, vz], 3 * i);
    }
    col.needsUpdate = true;
    this.accel = GX.makeAccelerator(p);
    for (let i = 0; i < N; i++) this.accel(this.pos[3 * i], this.pos[3 * i + 1], this.pos[3 * i + 2], this.acc, 3 * i);
    const vs = GX.circularSpeed(R_SUN, p).total;
    this.sun = { x: R_SUN, y: 0, vx: 0, vy: vs };
    this.time = 0; this.escaped = 0;
  }

  onConsts(ctx: Ctx) { if (this.built) this.accel = GX.makeAccelerator(this.p(ctx)); }
  reset(ctx: Ctx) { this.params = { ...GX.MILKY_WAY }; for (const k in this.dials) this.dials[k].set((this.params as any)[k]); this.seed(ctx); }

  panels(left: Panel, right: Panel, ctx: Ctx) {
    const set = (k: keyof GX.GalaxyParams) => (v: number) => { (this.params as any)[k] = v; this.accel = GX.makeAccelerator(this.p(ctx)); };
    left.title(this.name).blurb(this.blurb);
    left.section('Time');
    left.dial({ label: 'Simulation speed', min: 1, max: 400, value: this.rate, log: true, fmt: (v) => `${num(v, 2)} Myr/s`, onChange: (v) => (this.rate = v) });
    left.section('Dark matter halo (NFW)');
    this.dials.haloMass = left.dial({ label: 'Halo mass M₂₀₀', min: 0, max: 400, value: this.params.haloMass, step: 1, fmt: (v) => `${num(v / 100, 3)}×10¹² M☉`, onChange: set('haloMass') });
    this.dials.haloConc = left.dial({ label: 'Concentration', min: 3, max: 30, value: this.params.haloConc, step: 0.5, fmt: (v) => fixed(v, 1), onChange: set('haloConc') });
    left.section('Visible matter');
    this.dials.discMass = left.dial({ label: 'Disc mass', min: 0.5, max: 20, value: this.params.discMass, step: 0.1, fmt: (v) => `${fixed(v, 1)}×10¹⁰ M☉`, onChange: set('discMass') });
    this.dials.bulgeMass = left.dial({ label: 'Bulge mass', min: 0, max: 5, value: this.params.bulgeMass, step: 0.05, fmt: (v) => `${fixed(v, 2)}×10¹⁰ M☉`, onChange: set('bulgeMass') });
    left.buttons(
      button('Remove dark matter', () => { this.dials.haloMass.set(0, true); ctx.toast('Halo removed: the stars keep their speeds, but the pull has gone'); }),
      button('Re-settle stars', () => this.seed(ctx)),
      button('Reset', () => this.reset(ctx)),
    );
    left.note('Changing the dials leaves every star with its current velocity. "Re-settle" starts them again on near-circular orbits for the current potential.');
    left.note('Blue stars start on two spiral arms. With no self-gravity, differential rotation winds them up: the winding problem.');

    right.section('Rotation curve');
    this.plot = new Plot(190, 'Circular speed by component. Dots: reference curve for a Milky-Way-like spiral (illustrative). White: mean rotation of the simulated stars.');
    right.add(this.plot.el);
    right.section('At the Sun’s radius (8.2 kpc)');
    this.ro = right.readouts(['Circular speed', 'Orbital period', 'Escape speed', 'κ / Ω', 'Dark matter inside', 'Curve misfit χ²', 'Elapsed', 'Stars beyond 150 kpc']);
  }

  update(dt: number, ctx: Ctx) {
    this.rig.drag(ctx.input);
    this.rig.dist = (Math.pow(10, ctx.logScale) / KPC) * 1.2;
    this.rig.apply(this.camera);
    const { pos, vel, acc } = this;
    if (!ctx.paused) {
      const total = (this.rate * dt) / (GX.TIME_UNIT_GYR * 1000); // code time units
      const steps = Math.max(1, Math.min(14, Math.ceil(total / 0.0007)));
      const h = total / steps, hh = 0.5 * h, f = this.accel;
      for (let k = 0; k < steps; k++) {
        for (let i = 0; i < 3 * N; i++) { vel[i] += acc[i] * hh; pos[i] += vel[i] * h; }
        for (let i = 0; i < N; i++) f(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], acc, 3 * i);
        for (let i = 0; i < 3 * N; i++) vel[i] += acc[i] * hh;
        // The Sun marker: a single orbit integrated the same way.
        const a = [0, 0, 0], sn = this.sun;
        f(sn.x, sn.y, 0, a, 0); sn.vx += a[0] * hh; sn.vy += a[1] * hh; sn.x += sn.vx * h; sn.y += sn.vy * h;
        f(sn.x, sn.y, 0, a, 0); sn.vx += a[0] * hh; sn.vy += a[1] * hh;
      }
      this.time += this.rate * dt;
    }
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    (attr.array as Float32Array).set(pos);
    attr.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).size = Math.max(1.2, Math.min(3, 60 / this.rig.dist));
    this.sunMesh.position.set(this.sun.x, this.sun.y, 0);
    this.sunMesh.scale.setScalar(this.rig.dist * 0.006);
    ctx.labels.put('Sun', this.sunMesh.position, this.camera, ctx.view, true);
  }

  refresh(ctx: Ctx) {
    const p = this.p(ctx);
    const rs: number[] = [], tot: number[] = [], bu: number[] = [], di: number[] = [], ha: number[] = [];
    for (let R = 0.5; R <= 32; R += 0.5) { const c = GX.circularSpeed(R, p); rs.push(R); tot.push(c.total); bu.push(c.bulge); di.push(c.disc); ha.push(c.halo); }
    // Mean tangential speed of the simulated stars in 2 kpc rings.
    const sum = new Float64Array(16), cnt = new Float64Array(16);
    let far = 0;
    for (let i = 0; i < N; i++) {
      const x = this.pos[3 * i], y = this.pos[3 * i + 1], R = Math.hypot(x, y);
      if (R > 150) far++;
      const b = Math.floor(R / 2);
      if (b < 16 && Math.abs(this.pos[3 * i + 2]) < 2) { sum[b] += (x * this.vel[3 * i + 1] - y * this.vel[3 * i]) / (R || 1); cnt[b]++; }
    }
    this.escaped = far;
    const mr: number[] = [], mv: number[] = [];
    for (let b = 0; b < 16; b++) if (cnt[b] > 30) { mr.push(b * 2 + 1); mv.push(sum[b] / cnt[b]); }
    this.plot.draw({
      series: [
        { x: rs, y: tot, color: '#6fd3ff', label: 'total', width: 1.8 },
        { x: rs, y: ha, color: '#d29bff', label: 'halo', dash: [4, 3] },
        { x: rs, y: di, color: '#7be0a4', label: 'disc', dash: [4, 3] },
        { x: rs, y: bu, color: '#ffb454', label: 'bulge', dash: [4, 3] },
        { x: mr, y: mv, color: '#ffffff', width: 1 },
        { x: GX.REFERENCE_CURVE.map((d) => d[0]), y: GX.REFERENCE_CURVE.map((d) => d[1]), color: '#ff7a7a', points: true },
      ],
      xRange: [0, 32], yRange: [0, 320], xLabel: 'R (kpc)', yLabel: 'v (km/s)',
    });
    const c = GX.circularSpeed(R_SUN, p);
    const period = ((2 * Math.PI * R_SUN) / c.total) * GX.TIME_UNIT_GYR * 1000;
    const chi = GX.curveMisfit(p);
    this.ro.set('Circular speed', `${fixed(c.total, 1)} km/s`);
    this.ro.set('Orbital period', `${fixed(period, 0)} Myr`);
    this.ro.set('Escape speed', `${fixed(GX.escapeSpeed(R_SUN, p), 0)} km/s`);
    this.ro.set('κ / Ω', fixed(GX.epicyclicFrequency(R_SUN, p) / (c.total / R_SUN), 3));
    this.ro.set('Dark matter inside', `${fixed((100 * c.halo ** 2) / c.total ** 2, 0)}% of the mass`);
    this.ro.set('Curve misfit χ²', fixed(chi, 2), chi < 1 ? 'good' : chi < 6 ? 'warm' : 'bad');
    this.ro.set('Elapsed', `${fixed(this.time / 1000, 2)} Gyr`);
    this.ro.set('Stars beyond 150 kpc', `${far} of ${N}`, far > N * 0.02 ? 'warm' : '');
  }

  probe(ctx: Ctx) { return { misfit: GX.curveMisfit(this.p(ctx)), halo: this.params.haloMass, escapedFrac: this.escaped / N }; }
}
