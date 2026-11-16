/** Lennard-Jones argon: molecular dynamics you can heat, cool and squeeze. Scene units: sigma. */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { OrbitRig } from '../engine/orbit';
import { Panel, Readouts, Dial, button } from '../ui/kit';
import { Plot } from '../ui/plot';
import * as MD from '../physics/md';
import { num, fixed, length, duration } from '../ui/format';

const EPS_K = MD.ARGON.epsOverK;
const P_UNIT_MPA = 41.9; // epsilon / sigma^3 for argon
const RHO_UNIT = 1.68; // g/cm^3 per reduced density unit
const DT = 0.004;

export class MDStation extends Station {
  readonly id = 'md';
  readonly name = 'Atoms in motion';
  readonly blurb = 'Five hundred argon atoms interacting through the Lennard-Jones potential, integrated with velocity Verlet in a periodic box. Temperature and pressure are measured from the motion, not set.';
  readonly reach: [number, number] = [0.45, 0.9];
  readonly uses: (keyof Consts)[] = ['hbar'];
  centre(c: Consts) { return Math.log10(MD.ARGON.sigma * c.hbar * c.hbar * 16); }

  private rig = new OrbitRig();
  private s!: MD.MDState;
  private atoms!: THREE.InstancedMesh; private box!: THREE.LineSegments;
  private targetT = 90 / EPS_K; private targetRho = 0.84;
  private thermostat = true; private stepsPerFrame = 4;
  private ro!: Readouts; private gr!: Plot; private vh!: Plot;
  private gAvg: number[] = []; private gR: number[] = [];
  private e0 = NaN;
  private dials: Record<string, Dial> = {};
  private tAvg = 0; private pAvg = 0;
  private dummy = new THREE.Object3D(); private col = new THREE.Color();
  gPeak = 0; gMin = 1;

  build(_ctx: Ctx) {
    this.rig.phi = 1.1; this.rig.theta = 0.6;
    this.s = MD.createFCC(5, this.targetRho, this.targetT, 11);
    this.atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.s.n);
    this.atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.atoms.frustumCulled = false;
    this.scene.add(this.atoms);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(0.5, 1, 0.8); this.scene.add(sun);
    this.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x8cabc8, transparent: true, opacity: 0.5 }));
    this.scene.add(this.box);
    this.tAvg = this.targetT; this.pAvg = MD.pressure(this.s);
  }

  private preset(TK: number, rho: number) {
    this.targetT = TK / EPS_K; this.targetRho = rho;
    this.dials.T?.set(TK); this.dials.rho?.set(rho);
    this.gAvg = [];
  }
  reset() { this.s = MD.createFCC(5, 0.84, 90 / EPS_K, 11); this.preset(90, 0.84); this.e0 = NaN; }

  panels(left: Panel, right: Panel, _ctx: Ctx) {
    left.title(this.name).blurb(this.blurb);
    left.section('Conditions');
    this.dials.T = left.dial({ label: 'Thermostat temperature', min: 5, max: 500, value: this.targetT * EPS_K, log: true, fmt: (v) => `${num(v, 3)} K`, onChange: (v) => (this.targetT = v / EPS_K) });
    this.dials.rho = left.dial({ label: 'Density', min: 0.01, max: 1.15, value: this.targetRho, log: true, fmt: (v) => `${num(v * RHO_UNIT, 3)} g/cm³`, onChange: (v) => (this.targetRho = v) });
    left.toggle('Thermostat on (off conserves energy)', true, (v) => { this.thermostat = v; this.e0 = NaN; });
    left.dial({ label: 'Steps per frame', min: 1, max: 12, value: this.stepsPerFrame, step: 1, fmt: (v) => `${v} × ${fixed(DT * MD.ARGON.tauPs * 1000, 1)} fs`, onChange: (v) => (this.stepsPerFrame = v) });
    left.section('Presets');
    left.buttons(
      button('Solid, 40 K', () => this.preset(40, 1.02)),
      button('Liquid, 90 K', () => this.preset(90, 0.84)),
      button('Gas, 300 K', () => this.preset(300, 0.03)),
      button('Near critical', () => this.preset(155, 0.32)),
    );
    left.note('Atoms are coloured by speed. The box is periodic: an atom leaving one face re-enters through the opposite one.');
    left.note('Argon’s triple point is 83.8 K and its critical point 150.7 K, 0.53 g/cm³. The Lennard-Jones model lands close to both.');

    right.section('Measured');
    this.ro = right.readouts(['Temperature', 'Pressure', 'Ideal-gas pressure', 'Z = P / ρkT', 'Kinetic energy / atom', 'Potential energy / atom', 'Energy drift', 'Structure', 'Simulated time']);
    right.section('Radial distribution g(r)');
    this.gr = new Plot(150, 'How much more likely than chance it is to find a neighbour at distance r. Sharp repeated peaks mean a crystal; one broad peak, a gas.');
    right.add(this.gr.el);
    right.section('Speed distribution');
    this.vh = new Plot(130, 'Histogram of atomic speeds against the Maxwell–Boltzmann curve for the measured temperature.');
    right.add(this.vh.el);
  }

  update(dt: number, ctx: Ctx) {
    const s = this.s;
    this.rig.drag(ctx.input);
    const sigmaM = MD.ARGON.sigma * ctx.consts.hbar ** 2;
    this.rig.dist = (Math.pow(10, ctx.logScale) / sigmaM) * 1.2;
    this.rig.apply(this.camera);
    if (!ctx.paused) {
      // Approach the target density gradually so atoms are never forced to overlap.
      const rho = MD.density(s);
      if (Math.abs(rho - this.targetRho) / this.targetRho > 1e-3) {
        const next = rho * Math.min(1.012, Math.max(0.985, this.targetRho / rho));
        MD.setDensity(s, next); this.e0 = NaN;
      }
      for (let k = 0; k < this.stepsPerFrame; k++) {
        MD.step(s, DT);
        if (this.thermostat) MD.berendsen(s, this.targetT, DT, 0.25);
      }
      this.tAvg += 0.05 * (MD.temperature(s) - this.tAvg);
      this.pAvg += 0.05 * (MD.pressure(s) - this.pAvg);
    }
    const half = s.box / 2, vRef = Math.sqrt(3 * Math.max(this.tAvg, 0.02));
    for (let i = 0; i < s.n; i++) {
      this.dummy.position.set(s.pos[3 * i] - half, s.pos[3 * i + 1] - half, s.pos[3 * i + 2] - half);
      this.dummy.updateMatrix();
      this.atoms.setMatrixAt(i, this.dummy.matrix);
      const v = Math.hypot(s.vel[3 * i], s.vel[3 * i + 1], s.vel[3 * i + 2]) / vRef;
      this.col.setHSL(0.62 - 0.6 * Math.min(v / 2, 1), 0.75, 0.55);
      this.atoms.setColorAt(i, this.col);
    }
    this.atoms.instanceMatrix.needsUpdate = true;
    if (this.atoms.instanceColor) this.atoms.instanceColor.needsUpdate = true;
    this.box.scale.setScalar(s.box);
  }

  private tick = 0;
  refresh(_ctx: Ctx) {
    const s = this.s, T = this.tAvg, rho = MD.density(s);
    const ke = MD.kinetic(s) / s.n, pe = s.potential / s.n;
    if (!this.thermostat && isNaN(this.e0)) this.e0 = ke + pe;
    this.ro.set('Temperature', `${fixed(T * EPS_K, 1)} K`);
    this.ro.set('Pressure', `${num(this.pAvg * P_UNIT_MPA, 3)} MPa`);
    this.ro.set('Ideal-gas pressure', `${num(rho * T * P_UNIT_MPA, 3)} MPa`);
    this.ro.set('Z = P / ρkT', fixed(this.pAvg / (rho * T), 3));
    this.ro.set('Kinetic energy / atom', `${fixed(ke, 3)} ε`);
    this.ro.set('Potential energy / atom', `${fixed(pe, 3)} ε`);
    this.ro.set('Energy drift', this.thermostat ? 'thermostat on' : `${num(Math.abs(ke + pe - this.e0), 2)} ε / atom`, this.thermostat ? '' : Math.abs(ke + pe - this.e0) < 5e-3 ? 'good' : 'warm');
    this.ro.set('Simulated time', duration(s.time * MD.ARGON.tauPs * 1e-12));
    if (this.tick++ % 4 === 0) {
      const { r, g } = MD.radialDistribution(s, 70);
      this.gR = r;
      this.gAvg = this.gAvg.length === g.length ? this.gAvg.map((v, i) => v + 0.3 * (g[i] - v)) : g;
      const peakI = this.gAvg.indexOf(Math.max(...this.gAvg));
      this.gPeak = this.gAvg[peakI];
      let gmin = Infinity;
      for (let i = peakI; i < this.gAvg.length && r[i] < r[peakI] * 1.45; i++) gmin = Math.min(gmin, this.gAvg[i]);
      this.gMin = gmin;
      this.gr.draw({ series: [{ x: r, y: this.gAvg }], hlines: [{ y: 1, color: 'rgba(140,170,200,0.4)' }], xLabel: 'r (σ)', yRange: [0, Math.max(3.5, this.gPeak * 1.1)] });
    }
    const structure = this.gPeak > 3.6 && this.gMin < 0.25 ? 'solid-like' : this.gPeak > 2 && rho > 0.45 ? 'liquid-like' : rho < 0.2 ? 'gas-like' : 'dense fluid';
    this.ro.set('Structure', `${structure} (from g(r))`);
    const bins = 28, vMax = Math.sqrt(T) * 4.2;
    const hist = MD.speedHistogram(s, bins, vMax);
    const hx: number[] = [], hy: number[] = [], mx: number[] = [], my: number[] = [];
    for (let b = 0; b < bins; b++) { const v0 = (b / bins) * vMax, v1 = ((b + 1) / bins) * vMax; hx.push(v0, v0, v1, v1); hy.push(0, hist[b], hist[b], 0); }
    for (let i = 0; i <= 80; i++) { const v = (i / 80) * vMax; mx.push(v); my.push(MD.maxwellSpeed(v, T)); }
    this.vh.draw({ series: [{ x: hx, y: hy, color: 'rgba(111,211,255,0.7)', width: 1 }, { x: mx, y: my, color: '#ffb454' }], xLabel: 'speed (√(ε/m))', yRange: [0, Math.max(...my) * 1.5] });
  }

  probe() { return { T: this.tAvg * EPS_K, rho: MD.density(this.s) * RHO_UNIT, gPeak: this.gPeak, gMin: this.gMin, solid: this.gPeak > 3.6 && this.gMin < 0.25 ? 1 : 0 }; }
}
