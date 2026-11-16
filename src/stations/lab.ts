/**
 * Relativity lab. A periodic lattice of gates and blocks at rest, which you fly
 * through. The scale axis sets the lattice spacing in metres; the c dial sets
 * how many cells per second light covers.
 */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { Panel, Dial, Readouts, button } from '../ui/kit';
import { Plot } from '../ui/plot';
import { makeRelUniforms, relSolidMaterial, relGroundMaterial, relStarMaterial, RelUniforms } from '../engine/relativistic';
import { stepProperVelocity, gammaFromW } from '../physics/relativity';
import { SI, Vec3, v3 } from '../physics/constants';
import { num, fixed, length, duration, speed } from '../ui/format';

const PERIOD = 400;

export interface MuonRun { active: boolean; startX: number; distance: number; lifetime: number; tau0: number; result: '' | 'arrived' | 'decayed'; }

export class LabStation extends Station {
  readonly id = 'lab';
  readonly name = 'Relativity lab';
  readonly blurb = 'A lattice at rest and a ship. Slow light down and the optics of special relativity appear at walking pace: the view ahead bunches up, colours shift, and your clock falls behind.';
  readonly reach: [number, number] = [2, 3];
  readonly uses: (keyof Consts)[] = ['c'];
  readonly hint = 'W A S D thrust · Q E down/up · drag to look · Space brake · scroll changes grid scale';
  centre() { return 1; }

  private u!: RelUniforms;
  private starMat!: THREE.ShaderMaterial;
  pos: Vec3 = [0, 2, 0];
  w: Vec3 = [0, 0, 0];
  yaw = -Math.PI / 2; pitch = 0;
  tau = 0; t = 0;
  private autoThrust = true;
  private autoExposure = true;
  private thrustG = 1;
  private thrustDial!: Dial;
  private ro!: Readouts;
  private diagram!: Plot;
  private trail: { x: number; ct: number }[] = [];
  private warn!: HTMLElement;
  private runRo!: Readouts;
  run: MuonRun = { active: false, startX: 0, distance: 60, lifetime: 0, tau0: 0, result: '' };
  private marker!: THREE.Mesh;

  build(ctx: Ctx) {
    const u = (this.u = makeRelUniforms());
    u.uPeriod.value.set(PERIOD, 0, PERIOD);
    this.camera.fov = 72; this.camera.near = 0.05; this.camera.far = 6000;

    // Ground: dense near the observer, coarse far away.
    const N = 160, half = 230;
    const verts: number[] = [], idx: number[] = [];
    const coord = (i: number) => { const s = (i / N) * 2 - 1; return Math.sign(s) * Math.pow(Math.abs(s), 2.2) * half; };
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) verts.push(coord(i), 0, coord(j));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    gg.setIndex(idx);
    const ground = new THREE.Mesh(gg, relGroundMaterial(u));
    ground.frustumCulled = false;
    this.scene.add(ground);

    const box = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    // Gates along the track: four beams each, cycling through three pure-ish colours.
    const gateColors = [0xe0483c, 0x3fc25a, 0x4a7cf0];
    const gates = PERIOD / 20;
    const beams = new THREE.InstancedMesh(box, relSolidMaterial(u), gates * 4);
    const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 16, 12), relSolidMaterial(u, { pulse: true }), gates);
    for (let g = 0; g < gates; g++) {
      const x = g * 20 + 10;
      col.setHex(gateColors[g % 3]).convertSRGBToLinear();
      const parts: [number, number, number, number, number, number][] = [
        [x, 3.5, -3.5, 0.5, 7, 0.5], [x, 3.5, 3.5, 0.5, 7, 0.5], [x, 7.25, 0, 0.5, 0.5, 7.5], [x, 0.1, 0, 0.5, 0.2, 7.5],
      ];
      parts.forEach((p, k) => {
        dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(p[3], p[4], p[5]); dummy.updateMatrix();
        beams.setMatrixAt(g * 4 + k, dummy.matrix); beams.setColorAt(g * 4 + k, col);
      });
      dummy.position.set(x, 8.4, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      beacons.setMatrixAt(g, dummy.matrix); beacons.setColorAt(g, col.setHex(0xffc060).convertSRGBToLinear());
    }
    beams.frustumCulled = false; beacons.frustumCulled = false;
    this.scene.add(beams, beacons);

    // Blocks either side of the track.
    let seed = 20261116;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const palette = [0x8fa3b8, 0xb9a27c, 0x6f8fae, 0xa7b59a, 0xc48a6a, 0x7d86a8, 0xd6c9a4];
    const nBlocks = 900;
    const blocks = new THREE.InstancedMesh(box, relSolidMaterial(u), nBlocks);
    for (let i = 0; i < nBlocks; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const z = side * (9 + Math.pow(rnd(), 1.6) * 185);
      const wdt = 2 + rnd() * 5, dep = 2 + rnd() * 5, hgt = 1.5 + Math.pow(rnd(), 3) * 26;
      dummy.position.set(Math.floor(rnd() * PERIOD), hgt / 2, Math.round(z));
      dummy.scale.set(wdt, hgt, dep); dummy.updateMatrix();
      blocks.setMatrixAt(i, dummy.matrix);
      blocks.setColorAt(i, col.setHex(palette[Math.floor(rnd() * palette.length)]).convertSRGBToLinear());
    }
    blocks.frustumCulled = false;
    this.scene.add(blocks);

    // Finish marker for timed runs.
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 10, 48), relSolidMaterial(u, { pulse: true }));
    this.marker.rotation.y = Math.PI / 2; this.marker.visible = false; this.marker.frustumCulled = false;
    this.scene.add(this.marker);

    // Sky.
    const ns = 1800, sp = new Float32Array(ns * 3), st = new Float32Array(ns), sf = new Float32Array(ns);
    for (let i = 0; i < ns; i++) {
      const uu = rnd() * 1.1 - 0.1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - uu * uu);
      sp.set([s * Math.cos(th), Math.max(uu, -0.05), s * Math.sin(th)], 3 * i);
      st[i] = 2600 * Math.pow(12, rnd() * rnd() + rnd() * 0.3);
      sf[i] = 0.05 * Math.pow(rnd(), -0.9);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sgeo.setAttribute('aTemp', new THREE.BufferAttribute(st, 1));
    sgeo.setAttribute('aFlux', new THREE.BufferAttribute(sf, 1));
    this.starMat = relStarMaterial(u, { atInfinity: true });
    const stars = new THREE.Points(sgeo, this.starMat);
    stars.frustumCulled = false;
    this.scene.add(stars);
    this.starMat.uniforms.uPixelRatio.value = ctx.renderer.getPixelRatio();
  }

  /** Metres per grid cell at the current scale. */
  cell(ctx: Ctx) { return Math.pow(10, ctx.logScale); }
  /** Light speed in cells per second. */
  cGrid(ctx: Ctx) { return (SI.c * ctx.consts.c) / this.cell(ctx); }

  panels(left: Panel, right: Panel, ctx: Ctx) {
    const u = this.u;
    left.title(this.name).blurb(this.blurb);
    this.warn = left.warn();
    left.section('Speed of light');
    const preset = (label: string, ms: number) => button(label, () => { ctx.consts.c = ms / SI.c; ctx.constsChanged(); });
    left.buttons(preset('Real c', SI.c), preset('3 km/s', 3000), preset('30 m/s', 30), preset('3 m/s', 3));
    left.note('The grid spacing follows the scale axis, so the same speed of light looks slower on a larger grid.');
    left.section('What to render');
    left.toggle('Aberration (where things appear)', true, (v) => (u.uAberr.value = v ? 1 : 0));
    left.toggle('Doppler shift (colour)', true, (v) => (u.uDoppler.value = v ? 1 : 0));
    left.toggle('Beaming (brightness, D⁴)', true, (v) => (u.uBeam.value = v ? 1 : 0));
    left.toggle('Sodium-lamp world (single 589 nm line)', false, (v) => (u.uMono.value = v ? 1 : 0));
    left.toggle('Auto exposure (adapt to the beamed view)', true, (v) => (this.autoExposure = v));
    left.section('Ship');
    left.toggle('Match thrust to c (reach 0.46c in one second)', true, (v) => { this.autoThrust = v; });
    this.thrustDial = left.dial({ label: 'Manual thrust', min: 0.01, max: 1e9, value: 1, log: true, fmt: (v) => `${num(v, 3)} g`, onChange: (v) => (this.thrustG = v) });
    left.buttons(button('Brake to rest', () => (this.w = [0, 0, 0])), button('Reset', () => this.reset(ctx)));
    left.section('Timed run');
    left.blurb('Carry a particle with a fixed proper lifetime to a ring 60 cells away. Light itself would need three lifetimes to get there.');
    left.buttons(button('Start muon run', () => this.startRun(ctx)));
    this.runRo = left.readouts(['Lifetime left', 'Distance left', 'Result']);

    right.section('Motion');
    this.ro = right.readouts(['Speed', 'β = v/c', 'γ', 'Rapidity', 'Doppler ahead', 'Doppler behind', 'Ship clock τ', 'Lattice clock t', 't − τ', 'Grid cell', 'Light per cell']);
    right.section('Spacetime diagram');
    this.diagram = new Plot(230, 'Lattice frame, x along the track. White: your worldline. Amber: light cone. Blue: your time axis and your line of simultaneity.');
    right.add(this.diagram.el);
  }

  startRun(ctx: Ctx) {
    const cg = this.cGrid(ctx);
    this.pos = [Math.floor(this.pos[0] / 20) * 20, 3, 0]; this.w = [0, 0, 0]; this.yaw = -Math.PI / 2; this.pitch = 0;
    this.run = { active: true, startX: this.pos[0], distance: 60, lifetime: 20 / cg, tau0: this.tau, result: '' };
    this.marker.position.set(this.pos[0] + 60, 4.5, 0); this.marker.visible = true;
    ctx.toast('Run started: reach the ring before the lifetime runs out');
  }

  reset(_ctx: Ctx) {
    this.pos = [0, 2, 0]; this.w = [0, 0, 0]; this.yaw = -Math.PI / 2; this.pitch = 0; this.tau = 0; this.t = 0; this.trail = [];
    this.run.active = false; this.run.result = ''; this.marker.visible = false;
  }

  update(dt: number, ctx: Ctx) {
    const input = ctx.input, u = this.u;
    this.yaw -= input.dragX * 0.004;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - input.dragY * 0.004));
    const cg = this.cGrid(ctx);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd: Vec3 = [Math.sin(this.yaw) * cp * -1, sp, Math.cos(this.yaw) * cp * -1];
    const right: Vec3 = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];

    if (!ctx.paused) {
      // Proper acceleration in cells per second squared.
      const aMag = this.autoThrust ? 0.5 * cg : (this.thrustG * 9.80665) / this.cell(ctx);
      const f = input.axis(['s', 'ArrowDown'], ['w', 'ArrowUp']), r = input.axis(['a', 'ArrowLeft'], ['d', 'ArrowRight']), up = input.axis(['q'], ['e']);
      let alpha: Vec3 = [fwd[0] * f + right[0] * r, fwd[1] * f + up, fwd[2] * f + right[2] * r];
      const al = v3.len(alpha);
      const wl = v3.len(this.w);
      if (input.down(' ') && wl > 0) {
        alpha = v3.scale(this.w, -1 / wl);
        if (wl < aMag * dt * 1.5) { this.w = [0, 0, 0]; alpha = [0, 0, 0]; }
      } else if (al > 0) alpha = v3.scale(alpha, 1 / al);
      // Sub-step in proper time for accuracy at high gamma.
      const sub = 4, dtau = dt / sub;
      for (let i = 0; i < sub; i++) {
        this.w = stepProperVelocity(this.w, v3.scale(alpha, aMag), dtau, cg);
        const g = gammaFromW(this.w, cg);
        // dx = v dt = (w / gamma)(gamma dtau) = w dtau
        this.pos = v3.add(this.pos, v3.scale(this.w, dtau));
        this.t += g * dtau; this.tau += dtau;
      }
      if (this.pos[1] < 0.6) { this.pos[1] = 0.6; if (this.w[1] < 0) this.w[1] = 0; }
      if (this.pos[1] > 120) { this.pos[1] = 120; if (this.w[1] > 0) this.w[1] = 0; }
    }

    const g = gammaFromW(this.w, cg);
    const beta = v3.scale(this.w, 1 / (g * cg));
    u.uObs.value.set(this.pos[0], this.pos[1], this.pos[2]);
    u.uBeta.value.set(beta[0], beta[1], beta[2]);
    u.uTime.value = this.t; u.uCGrid.value = cg;
    // Exposure follows the Doppler factor in the direction you are looking, as an eye or camera would adapt.
    const dLook = g * (1 + v3.dot(beta, fwd));
    u.uExposure.value = this.autoExposure && u.uBeam.value > 0.5 ? 1.6 / Math.pow(Math.max(dLook, 1), 3.4) : 1.6;
    this.camera.position.set(this.pos[0], this.pos[1], this.pos[2]);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateProjectionMatrix();

    // Timed run bookkeeping.
    const run = this.run;
    if (run.active) {
      if (this.pos[0] - run.startX >= run.distance) { run.active = false; run.result = 'arrived'; ctx.toast('Arrived with lifetime to spare'); }
      else if (this.tau - run.tau0 >= run.lifetime) { run.active = false; run.result = 'decayed'; ctx.toast('The particle decayed before arrival'); }
    }
  }

  refresh(ctx: Ctx) {
    const cg = this.cGrid(ctx), cell = this.cell(ctx);
    const g = gammaFromW(this.w, cg);
    const b = v3.len(this.w) / (g * cg);
    const ro = this.ro;
    ro.set('Speed', speed(b * SI.c * ctx.consts.c));
    ro.set('β = v/c', b < 0.999 ? fixed(b, 4) : `1 − ${num(1 - b, 2)}`);
    ro.set('γ', fixed(g, 3), g > 1.5 ? 'warm' : '');
    ro.set('Rapidity', fixed(Math.atanh(Math.min(b, 1 - 1e-15)), 3));
    ro.set('Doppler ahead', `×${fixed(Math.sqrt((1 + b) / (1 - b + 1e-15)), 3)}`);
    ro.set('Doppler behind', `×${fixed(Math.sqrt((1 - b) / (1 + b)), 3)}`);
    ro.set('Ship clock τ', duration(this.tau));
    ro.set('Lattice clock t', duration(this.t));
    ro.set('t − τ', duration(this.t - this.tau), this.t - this.tau > 0.5 ? 'warm' : '');
    ro.set('Grid cell', length(cell));
    ro.set('Light per cell', duration(1 / cg));
    this.warn.textContent = cg > 500
      ? `Light crosses ${num(cg, 2)} cells a second here, so nothing relativistic will show. Slow light with a preset below, or scroll out to a larger grid.`
      : '';
    const run = this.run;
    this.runRo.set('Lifetime left', run.active ? duration(Math.max(run.lifetime - (this.tau - run.tau0), 0)) : '—');
    this.runRo.set('Distance left', run.active ? `${fixed(Math.max(run.distance - (this.pos[0] - run.startX), 0), 1)} cells` : '—');
    this.runRo.set('Result', run.result || (run.active ? 'running' : '—'), run.result === 'arrived' ? 'good' : run.result === 'decayed' ? 'bad' : '');

    // Spacetime diagram in units of cells (x) and cells of light travel (ct).
    const x = this.pos[0], ct = this.t * cg;
    this.trail.push({ x, ct });
    if (this.trail.length > 400) this.trail.shift();
    const R = 40;
    const bx = this.w[0] / (g * cg);
    // Plotted relative to the present event so the numbers stay readable.
    const line = (dx0: number, dy0: number, dx1: number, dy1: number) => ({ x: [dx0, dx1], y: [dy0, dy1] });
    const series = [
      { ...line(-R, -R, R, R), color: 'rgba(255,180,84,0.8)' },
      { ...line(-R, R, R, -R), color: 'rgba(255,180,84,0.8)' },
      { ...line(-R * bx, -R, R * bx, R), color: '#6fd3ff', dash: [4, 3] },
      { ...line(-R, -R * bx, R, R * bx), color: '#6fd3ff', dash: [4, 3] },
      { x: this.trail.map((p) => p.x - x), y: this.trail.map((p) => p.ct - ct), color: '#ffffff', width: 1.8 },
    ];
    this.diagram.draw({ series, xRange: [-R, R], yRange: [-R, R], xLabel: 'Δx (cells)', yLabel: 'cΔt (cells)', markers: [{ x: 0, y: 0 }] });
  }

  probe(ctx: Ctx) {
    const cg = this.cGrid(ctx), g = gammaFromW(this.w, cg);
    return { beta: v3.len(this.w) / (g * cg), gamma: g, tau: this.tau, t: this.t, runArrived: this.run.result === 'arrived' ? 1 : 0 };
  }
}
