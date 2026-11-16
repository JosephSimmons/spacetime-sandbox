/**
 * Interstellar flight. A periodic field of main-sequence stars at the density
 * of the solar neighbourhood; every star is a blackbody, so its Doppler-shifted
 * colour and brightness are exact. Scene units: light-years and years.
 */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { Panel, Readouts, Dial, button } from '../ui/kit';
import { Plot } from '../ui/plot';
import { makeRelUniforms, relStarMaterial, RelUniforms, blackbodyTexture, BLACKBODY_GLSL } from '../engine/relativistic';
import { stepProperVelocity, gammaFromW, flipAndBurn } from '../physics/relativity';
import { star } from '../physics/stellar';
import { blackbodyLuminance } from '../physics/color';
import { SI, Vec3, v3 } from '../physics/constants';
import { num, fixed, duration } from '../ui/format';

const N = 22000;
const DENSITY = 0.004; // stars per cubic light-year near the Sun
const SIDE = Math.cbrt(N / DENSITY);
const G_LY_YR2 = (9.80665 * SI.yr * SI.yr) / SI.ly; // one g in ly/yr^2: about 1.03
const T_CMB = 2.7255;

export class InterstellarStation extends Station {
  readonly id = 'interstellar';
  readonly name = 'Among the stars';
  readonly blurb = 'The solar neighbourhood at its real density, and a ship that can hold one g for as long as you like. One g for a year brings you close to light speed; after that the stars ahead crowd together and climb through the spectrum.';
  readonly reach: [number, number] = [1.3, 1.4];
  readonly uses: (keyof Consts)[] = ['c'];
  readonly hint = 'W A S D thrust · Q E down/up · drag to look · Space brake · scroll changes how fast time runs';
  centre() { return 17; }

  private u!: RelUniforms;
  private mats: THREE.ShaderMaterial[] = [];
  private cmb!: THREE.ShaderMaterial;
  pos: Vec3 = [0.4, 0.2, 0.3]; w: Vec3 = [0, 0, 0];
  yaw = 0.8; pitch = 0.1; tau = 0; t = 0;
  private thrustG = 1;
  private ro!: Readouts; private plan!: Readouts; private plot!: Plot;
  private dest = 4.25;
  private log: { tau: number; t: number }[] = [];

  build(ctx: Ctx) {
    const u = (this.u = makeRelUniforms());
    u.uPeriod.value.set(SIDE, SIDE, SIDE);
    this.camera.fov = 70; this.camera.near = 1e-3; this.camera.far = 1e7;
    let seed = 7654321;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pos = new Float32Array(3 * N), temp = new Float32Array(N), flux = new Float32Array(N);
    const a = Math.pow(0.1, -1.35), b = Math.pow(20, -1.35);
    for (let i = 0; i < N; i++) {
      // Salpeter-like initial mass function between 0.1 and 20 solar masses.
      const m = i === 0 ? 1 : Math.pow((1 - rnd()) * a + rnd() * b, -1 / 1.35);
      const s = star(m);
      pos.set(i === 0 ? [0, 0, 0] : [(rnd() - 0.5) * SIDE, (rnd() - 0.5) * SIDE, (rnd() - 0.5) * SIDE], 3 * i);
      temp[i] = s.T;
      // Visible flux at one light-year, scaled so the Sun at 10 ly is an easy naked-eye star.
      flux[i] = 150 * s.R * s.R * blackbodyLuminance(s.T);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aTemp', new THREE.BufferAttribute(temp, 1));
    g.setAttribute('aFlux', new THREE.BufferAttribute(flux, 1));
    const near = relStarMaterial(u, { sizeScale: 1.25 });
    const stars = new THREE.Points(g, near); stars.frustumCulled = false;
    this.scene.add(stars);

    // Distant background: the rest of the Galaxy, as points at infinity.
    const nb = 5000, bp = new Float32Array(3 * nb), bt = new Float32Array(nb), bf = new Float32Array(nb);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    for (let i = 0; i < nb; i++) {
      const th = rnd() * Math.PI * 2, lat = rnd() < 0.7 ? gauss() * 0.12 : Math.asin(rnd() * 2 - 1);
      bp.set([Math.cos(lat) * Math.cos(th), Math.sin(lat), Math.cos(lat) * Math.sin(th)], 3 * i);
      bt[i] = 3200 * Math.pow(6, rnd() * rnd()); bf[i] = 0.035 * Math.pow(rnd(), -0.6);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    bg.setAttribute('aTemp', new THREE.BufferAttribute(bt, 1));
    bg.setAttribute('aFlux', new THREE.BufferAttribute(bf, 1));
    const far = relStarMaterial(u, { atInfinity: true, far: 5e6 });
    const back = new THREE.Points(bg, far); back.frustumCulled = false;
    this.scene.add(back);
    this.mats = [near, far];
    for (const m of this.mats) m.uniforms.uPixelRatio.value = ctx.renderer.getPixelRatio();

    // Cosmic microwave background: a 2.7 K blackbody everywhere, seen at T * D.
    this.cmb = new THREE.ShaderMaterial({
      uniforms: { uBeta: u.uBeta, uOn: { value: 1 }, uBB: { value: blackbodyTexture() }, uDoppler: u.uDoppler },
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + position * 1e6, 1.0); }',
      fragmentShader: /* glsl */ `
uniform vec3 uBeta; uniform float uOn; uniform float uDoppler; varying vec3 vDir;
${BLACKBODY_GLSL}
void main(){
  // vDir is the direction in the ship frame; D = 1 / (gamma (1 - beta . n')).
  float b2 = dot(uBeta, uBeta);
  float D = sqrt(1.0 - b2) / max(1.0 - dot(uBeta, normalize(vDir)), 1e-9);
  float T = ${T_CMB.toFixed(4)} * (uDoppler > 0.5 ? D : 1.0);
  vec4 bb = blackbody(T);
  float lum = T < 300.0 ? 0.0 : min(pow(10.0, bb.a + 2.0), 1.6);
  gl_FragColor = vec4(pow(bb.rgb * lum * uOn, vec3(1.0 / 2.2)), 1.0);
}`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.cmb);
    sky.frustumCulled = false; sky.renderOrder = -1;
    this.scene.add(sky);
  }

  /** Years of ship time per second of play: light crosses the field of view in four seconds. */
  rate(ctx: Ctx) { return Math.pow(10, ctx.logScale) / SI.ly / 4; }

  reset() { this.pos = [0.4, 0.2, 0.3]; this.w = [0, 0, 0]; this.tau = 0; this.t = 0; this.log = []; }

  panels(left: Panel, right: Panel, ctx: Ctx) {
    const u = this.u;
    left.title(this.name).blurb(this.blurb);
    left.section('Ship');
    left.dial({ label: 'Thrust', min: 0.01, max: 100, value: this.thrustG, log: true, fmt: (v) => `${num(v, 3)} g`, onChange: (v) => (this.thrustG = v) });
    left.buttons(button('Brake to rest', () => (this.w = [0, 0, 0])), button('Return home', () => this.reset()));
    left.note('The scale axis sets how fast time runs. One g is 1.03 light-years per year squared, which is why a year of it is enough.');
    left.section('What to render');
    left.toggle('Aberration (where the stars appear)', true, (v) => (u.uAberr.value = v ? 1 : 0));
    left.toggle('Doppler shift (star temperature × D)', true, (v) => (u.uDoppler.value = v ? 1 : 0));
    left.toggle('Brightness change (beaming)', true, (v) => (u.uBeam.value = v ? 1 : 0));
    left.toggle('Cosmic microwave background', true, (v) => (this.cmb.uniforms.uOn.value = v ? 1 : 0));
    left.note('The microwave background is a 2.7 K blackbody. Ahead of you it is seen at 2.7 K × D, so it glows red once D passes about 700 and fills the forward sky with white light soon after.');
    left.note(`The star field repeats every ${fixed(SIDE, 0)} light-years, so you can fly forever.`);
    left.section('Flight planner');
    left.dial({ label: 'Destination', min: 1, max: 3e6, value: this.dest, log: true, fmt: (v) => (v < 1e3 ? `${num(v, 3)} ly` : v < 1e6 ? `${num(v / 1e3, 3)} kly` : `${num(v / 1e6, 3)} Mly`), onChange: (v) => (this.dest = v) });
    this.plan = left.readouts(['Ship time', 'Home time', 'Peak γ']);
    left.note('Accelerate at the thrust above to the midpoint, then decelerate to arrive at rest. 4.25 ly is Proxima Centauri; 26 kly is the Galactic centre; 2.5 Mly is Andromeda.');

    right.section('Motion');
    this.ro = right.readouts(['β = v/c', 'γ', 'Rapidity', 'Doppler ahead', 'Doppler behind', 'Ship time', 'Home time', 'Distance from home', 'Time rate', 'Sun-like star ahead', 'Microwave background ahead']);
    right.section('Clocks');
    this.plot = new Plot(170, 'Home time against ship time since the last reset. The dashed line is what clocks at rest would show.');
    right.add(this.plot.el);
  }

  update(dt: number, ctx: Ctx) {
    const input = ctx.input, u = this.u;
    this.yaw -= input.dragX * 0.004;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - input.dragY * 0.004));
    const c = ctx.consts.c; // light-years per year
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd: Vec3 = [-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp];
    const right: Vec3 = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    if (!ctx.paused) {
      const aMag = this.thrustG * G_LY_YR2;
      const f = input.axis(['s', 'ArrowDown'], ['w', 'ArrowUp']), r = input.axis(['a', 'ArrowLeft'], ['d', 'ArrowRight']), up = input.axis(['q'], ['e']);
      let alpha: Vec3 = [fwd[0] * f + right[0] * r, fwd[1] * f + up, fwd[2] * f + right[2] * r];
      const al = v3.len(alpha), wl = v3.len(this.w);
      const dTau = dt * this.rate(ctx);
      if (input.down(' ') && wl > 0) {
        alpha = v3.scale(this.w, -1 / wl);
        // Proper velocity falls by a per unit proper time when thrusting against the motion.
        if (wl < aMag * dTau * gammaFromW(this.w, c) * 1.2) { this.w = [0, 0, 0]; alpha = [0, 0, 0]; }
      } else if (al > 0) alpha = v3.scale(alpha, 1 / al);
      const sub = 8, h = dTau / sub;
      for (let i = 0; i < sub; i++) {
        this.w = stepProperVelocity(this.w, v3.scale(alpha, aMag), h, c);
        this.pos = v3.add(this.pos, v3.scale(this.w, h));
        this.t += gammaFromW(this.w, c) * h; this.tau += h;
      }
    }
    const g = gammaFromW(this.w, c);
    const beta = v3.scale(this.w, 1 / (g * c));
    u.uObs.value.set(this.pos[0], this.pos[1], this.pos[2]);
    u.uBeta.value.set(beta[0], beta[1], beta[2]);
    this.camera.position.set(this.pos[0], this.pos[1], this.pos[2]);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateProjectionMatrix();
    const home = Math.hypot(...this.pos);
    if (home < 40 && home > 0.05) ctx.labels.put('Sun', this.apparent(beta), this.camera, ctx.view, true);
  }

  /** Where the Sun appears from the ship, using the same transform as the shader. */
  private apparent(beta: Vec3): THREE.Vector3 {
    const r: Vec3 = [-this.pos[0], -this.pos[1], -this.pos[2]];
    const b2 = v3.dot(beta, beta);
    let ra = r;
    if (this.u.uAberr.value > 0.5 && b2 > 1e-12) {
      const g = 1 / Math.sqrt(1 - b2), k = ((g - 1) * v3.dot(r, beta)) / b2 + g * v3.len(r);
      ra = v3.add(r, v3.scale(beta, k));
    }
    return new THREE.Vector3(this.pos[0] + ra[0], this.pos[1] + ra[1], this.pos[2] + ra[2]);
  }

  refresh(ctx: Ctx) {
    const c = ctx.consts.c, g = gammaFromW(this.w, c);
    const wl = v3.len(this.w), b = wl / (g * c);
    // Doppler factors from proper velocity, which stays accurate at very high gamma.
    const dA = g + wl / c, dB = 1 / dA;
    const ro = this.ro;
    ro.set('β = v/c', b < 0.9999 ? fixed(b, 5) : `1 − ${num(1 / (2 * g * g), 2)}`);
    ro.set('γ', num(g, 4), g > 2 ? 'warm' : '');
    ro.set('Rapidity', fixed(Math.asinh(wl / c), 3));
    ro.set('Doppler ahead', `×${num(dA, 4)}`);
    ro.set('Doppler behind', `×${num(dB, 3)}`);
    ro.set('Ship time', duration(this.tau * SI.yr));
    ro.set('Home time', duration(this.t * SI.yr), this.t - this.tau > 0.5 ? 'warm' : '');
    ro.set('Distance from home', `${num(Math.hypot(...this.pos), 4)} ly`);
    ro.set('Time rate', `${num(this.rate(ctx), 3)} yr/s`);
    ro.set('Sun-like star ahead', `${num(5772 * dA, 4)} K`);
    const tc = T_CMB * dA;
    ro.set('Microwave background ahead', `${num(tc, 4)} K`, tc > 1500 ? 'bad' : tc > 300 ? 'warm' : '');

    // Flight planner: accelerate to the midpoint, then decelerate.
    const trip = flipAndBurn(this.thrustG * G_LY_YR2, this.dest, c);
    this.plan.set('Ship time', duration(trip.shipTime * SI.yr));
    this.plan.set('Home time', duration(trip.homeTime * SI.yr));
    this.plan.set('Peak γ', num(trip.peakGamma, 4));

    const last = this.log[this.log.length - 1];
    if (!last || this.tau - last.tau > Math.max(this.tau / 300, 1e-4)) this.log.push({ tau: this.tau, t: this.t });
    if (this.log.length > 600) this.log = this.log.filter((_, i) => i % 2 === 0);
    const xs = this.log.map((p) => p.tau), ys = this.log.map((p) => p.t);
    const m = Math.max(this.tau, 1e-3);
    this.plot.draw({ series: [{ x: [0, m], y: [0, m], color: 'rgba(140,170,200,0.5)', dash: [3, 3] }, { x: xs, y: ys }], xRange: [0, m], yRange: [0, Math.max(this.t, m)], xLabel: 'ship time (yr)', yLabel: 'home time (yr)' });
  }

  probe(ctx: Ctx) {
    const c = ctx.consts.c, g = gammaFromW(this.w, c);
    return { gamma: g, tau: this.tau, t: this.t, distance: Math.hypot(...this.pos), cmbAhead: T_CMB * (g + v3.len(this.w) / c) };
  }
}
