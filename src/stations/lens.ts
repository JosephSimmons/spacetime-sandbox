/**
 * Gravitational lens: a galaxy cluster modelled as an isothermal ellipsoid,
 * imaging a field of background galaxies. Scene units: arcseconds on the sky.
 */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { Panel, Readouts, Dial, button } from '../ui/kit';
import { Plot } from '../ui/plot';
import * as L from '../physics/lensing';
import * as C from '../physics/cosmology';
import { SI } from '../physics/constants';
import { num, fixed, length } from '../ui/format';

const ARCSEC = Math.PI / (180 * 3600);
const MPC = SI.pc * 1e6;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uHalf;      // half field of view in arcsec (x, y)
uniform float uB, uQ, uS; // lens strength, axis ratio, core radius (arcsec)
uniform vec2 uSrc; uniform float uSrcR;
uniform float uLensOn, uCrit, uGrid, uLensLight, uTime;
float hash1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p){ return vec2(hash1(p), hash1(p + 19.19)); }

// Softened isothermal ellipsoid; same expressions as physics/lensing.deflection.
vec2 deflect(vec2 t){
  float e2 = 1.0 - uQ * uQ;
  if (e2 < 1e-5) { float r2 = dot(t, t); return r2 < 1e-12 ? vec2(0.0) : t * (uB * (sqrt(uS * uS + r2) - uS) / r2); }
  float e = sqrt(e2), psi = sqrt(uQ * uQ * (uS * uS + t.x * t.x) + t.y * t.y), k = uB * uQ / e;
  return k * vec2(atan(e * t.x / (psi + uS)), atanh(clamp(e * t.y / (psi + uQ * uQ * uS), -0.999999, 0.999999)));
}

// A random field of small galaxies in the source plane.
vec3 field(vec2 b){
  vec3 c = vec3(0.0);
  float cell = 7.0;
  vec2 g = b / cell, id = floor(g);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cid = id + vec2(float(i), float(j));
    vec2 h = hash2(cid);
    vec2 d = (g - cid - h) * cell;
    float ang = 6.2832 * hash1(cid + 3.7), ell = 0.35 + 0.65 * hash1(cid + 8.1), size = 0.25 + 0.9 * pow(hash1(cid + 1.3), 2.0);
    vec2 r = vec2(d.x * cos(ang) + d.y * sin(ang), (d.y * cos(ang) - d.x * sin(ang)) / ell);
    float t = hash1(cid + 5.5);
    vec3 col = mix(vec3(1.0, 0.72, 0.45), vec3(0.5, 0.7, 1.0), t);
    c += col * (0.25 + 0.9 * hash1(cid + 2.2)) * exp(-dot(r, r) / (size * size));
  }
  return c;
}

void main(){
  vec2 th = (vUv * 2.0 - 1.0) * uHalf;
  vec2 beta = uLensOn > 0.5 ? th - deflect(th) : th;
  vec3 col = field(beta) * 0.8;
  // The featured source: a bright core with a ring, so shear and parity are easy to read.
  vec2 d = beta - uSrc; float r = length(d) / uSrcR;
  float arm = 0.5 + 0.5 * cos(2.0 * atan(d.y, d.x) + 5.0 * r);
  col += vec3(0.55, 0.8, 1.0) * (1.6 * exp(-r * r * 3.0) + 0.7 * exp(-pow(r - 0.75, 2.0) * 40.0) * (0.4 + 0.6 * arm)) * step(r, 1.4);
  if (uGrid > 0.5) {
    vec2 q = beta / 5.0;
    vec2 l = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), 1e-6);
    col += vec3(0.12, 0.3, 0.38) * (1.0 - clamp(min(l.x, l.y), 0.0, 1.0));
  }
  if (uLensOn > 0.5 && uCrit > 0.5) {
    // det of d(beta)/d(theta) by central differences; it changes sign on a critical curve.
    float h = uHalf.y * 2e-3;
    vec2 ax = (deflect(th + vec2(h, 0.0)) - deflect(th - vec2(h, 0.0))) / (2.0 * h);
    vec2 ay = (deflect(th + vec2(0.0, h)) - deflect(th - vec2(0.0, h))) / (2.0 * h);
    float det = (1.0 - ax.x) * (1.0 - ay.y) - ax.y * ay.x;
    float w = fwidth(det);
    col += vec3(1.0, 0.45, 0.4) * (1.0 - clamp(abs(det) / max(w, 1e-6) - 0.4, 0.0, 1.0)) * step(w, 3.0);
  }
  if (uLensLight > 0.5) {
    // The lens itself: a diffuse glow following the mass, plus a few member galaxies.
    float m = uB / sqrt(uS * uS + th.x * th.x + th.y * th.y / (uQ * uQ) + 0.02 * uB * uB);
    col += vec3(1.0, 0.78, 0.5) * 0.05 * m;
    for (int i = 0; i < 9; i++) {
      vec2 h = hash2(vec2(float(i), 4.2)) - 0.5;
      vec2 p = th - h * uB * vec2(3.2, 3.2 * uQ) * (i == 0 ? 0.0 : 1.0);
      col += vec3(1.0, 0.8, 0.55) * (i == 0 ? 0.9 : 0.4) * exp(-dot(p, p) / (uB * uB * (i == 0 ? 0.012 : 0.003)));
    }
  }
  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

export class LensStation extends Station {
  readonly id = 'lens';
  readonly name = 'Gravitational lens';
  readonly blurb = 'A galaxy cluster bends the light of everything behind it. The lens is an isothermal ellipsoid; each pixel is mapped back to the source plane through the lens equation, so the arcs, rings and multiple images are computed.';
  readonly reach: [number, number] = [0.5, 0.9];
  readonly uses: (keyof Consts)[] = ['c'];
  readonly hint = 'drag to move the blue source galaxy behind the lens · scroll to change scale';

  private sigma = 1100; private zl = 0.5; private zs = 2.0; private q = 0.7; private core = 0;
  private src: [number, number] = [3, 2];
  private mat!: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private ro!: Readouts; private plot!: Plot;
  private dirty = true;
  private curves: L.CausticSet | null = null;
  private b = 20; private dl = 1; private time = 0;
  private mu = 1; private images = 1;
  private tick = 0;

  private distances() {
    const p = C.PLANCK18;
    const dl = C.angularDistance(this.zl, p), ds = C.angularDistance(this.zs, p), dls = C.angularDistanceBetween(this.zl, this.zs, p);
    return { dl, ds, dls };
  }
  /** Field of view of 120 arcsec at the lens distance. */
  centre() { return Math.log10(120 * ARCSEC * C.angularDistance(this.zl, C.PLANCK18) * MPC); }

  build(_ctx: Ctx) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uHalf: { value: new THREE.Vector2(60, 60) }, uB: { value: 20 }, uQ: { value: this.q }, uS: { value: 0 },
        uSrc: { value: new THREE.Vector2(3, 2) }, uSrcR: { value: 2.2 },
        uLensOn: { value: 1 }, uCrit: { value: 0 }, uGrid: { value: 0 }, uLensLight: { value: 1 }, uTime: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false; this.quadScene.add(quad);
  }

  onConsts() { this.dirty = true; }
  reset() { this.src = [3, 2]; this.sigma = 1100; this.zl = 0.5; this.zs = 2.0; this.q = 0.7; this.core = 0; this.dirty = true; }

  panels(left: Panel, right: Panel, ctx: Ctx) {
    const u = this.mat.uniforms;
    const touch = (f: (v: number) => void) => (v: number) => { f(v); this.dirty = true; };
    left.title(this.name).blurb(this.blurb);
    left.section('The lens');
    left.dial({ label: 'Velocity dispersion', min: 150, max: 1600, value: this.sigma, step: 10, fmt: (v) => `${v} km/s${v < 350 ? ' (a galaxy)' : v > 800 ? ' (a rich cluster)' : ' (a group)'}`, onChange: touch((v: number) => (this.sigma = v)) });
    left.dial({ label: 'Axis ratio', min: 0.3, max: 1, value: this.q, step: 0.01, fmt: (v) => (v > 0.995 ? '1.00 (round)' : fixed(v, 2)), onChange: touch((v: number) => (this.q = v)) });
    left.dial({ label: 'Core radius', min: 0, max: 0.6, value: this.core, step: 0.01, fmt: (v) => (v === 0 ? 'none (singular)' : `${fixed(v, 2)} × lens strength`), onChange: touch((v: number) => (this.core = v)) });
    left.section('Distances');
    left.dial({ label: 'Lens redshift', min: 0.05, max: 1.5, value: this.zl, step: 0.01, fmt: (v) => fixed(v, 2), onChange: touch((v: number) => { this.zl = v; }) });
    left.dial({ label: 'Source redshift', min: 0.2, max: 8, value: this.zs, step: 0.05, fmt: (v) => fixed(v, 2), onChange: touch((v: number) => (this.zs = v)) });
    left.note('Distances are angular diameter distances in the Planck 2018 cosmology. The lens strength is 4π(σ/c)² D_ls/D_s, so it vanishes as the source approaches the lens and grows quadratically as c is turned down.');
    left.section('What to render');
    left.toggle('Lensing on', true, (v) => (u.uLensOn.value = v ? 1 : 0));
    left.toggle('Light of the cluster itself', true, (v) => (u.uLensLight.value = v ? 1 : 0));
    left.toggle('Critical curves', false, (v) => (u.uCrit.value = v ? 1 : 0));
    left.toggle('Source-plane grid (5″ squares)', false, (v) => (u.uGrid.value = v ? 1 : 0));
    left.buttons(button('Centre the source', () => { this.src = [0, 0]; this.dirty = true; }), button('Reset', () => ctx.resetActive()));
    left.note('The background galaxies are a random field, there to show the distortion. They are not a catalogue.');

    right.section('The lens');
    this.ro = right.readouts(['Lens strength', 'Einstein radius at the lens', 'Mass inside it', 'Distance to lens', 'Distance to source', 'D_ls / D_s', 'Images of the source', 'Total magnification']);
    right.section('Source plane');
    this.plot = new Plot(250, 'Caustics in the source plane. Inside the diamond (red) the source has four bright images; inside the outer curve (amber), two; outside, one. The dot is the source.');
    right.add(this.plot.el);
  }

  update(dt: number, ctx: Ctx) {
    const u = this.mat.uniforms;
    if (!ctx.paused) this.time += dt;
    const { dl, ds, dls } = this.distances();
    this.dl = dl;
    const ok = this.zs > this.zl + 0.02;
    this.b = ok ? L.einsteinRadiusSIS(this.sigma, dls / ds, ctx.consts.c) / ARCSEC : 0;
    const fieldArcsec = Math.pow(10, ctx.logScale) / (dl * MPC) / ARCSEC;
    const halfY = fieldArcsec / 2, halfX = halfY * (ctx.view.w / ctx.view.h);
    u.uHalf.value.set(halfX, halfY);
    // Dragging moves the source in the source plane.
    if (ctx.input.dragX || ctx.input.dragY) {
      this.src[0] += (ctx.input.dragX / ctx.view.w) * 2 * halfX;
      this.src[1] -= (ctx.input.dragY / ctx.view.h) * 2 * halfY;
      this.dirty = true;
    }
    u.uB.value = Math.max(this.b, 1e-4); u.uQ.value = this.q; u.uS.value = this.core * this.b;
    u.uSrc.value.set(this.src[0], this.src[1]);
    u.uSrcR.value = Math.max(0.08 * this.b, 0.6);
    u.uTime.value = this.time;
  }

  render(ctx: Ctx) { ctx.renderer.render(this.quadScene, this.quadCam); }

  refresh(ctx: Ctx) {
    const { dl, ds, dls } = this.distances();
    const b = this.b, s = this.core * b;
    const cc = SI.c * ctx.consts.c;
    this.ro.set('Lens strength', b > 0 ? `${fixed(b, 1)}″` : 'source in front of lens', b > 0 ? '' : 'warm');
    this.ro.set('Einstein radius at the lens', length(b * ARCSEC * dl * MPC));
    // Mass of a singular isothermal sphere inside its Einstein radius: pi sigma^2 theta_E D_l / G.
    const mass = (Math.PI * (this.sigma * 1e3) ** 2 * b * ARCSEC * dl * MPC) / SI.G / SI.Msun;
    this.ro.set('Mass inside it', `${num(mass, 3)} M☉`);
    this.ro.set('Distance to lens', `${num(dl, 4)} Mpc`);
    this.ro.set('Distance to source', `${num(ds, 4)} Mpc`);
    this.ro.set('D_ls / D_s', fixed(Math.max(dls / ds, 0), 3));
    if (this.dirty && b > 0) {
      this.dirty = false;
      this.curves = L.criticalCurves(b, this.q, s, 120);
      const inA = L.inside(this.src, this.curves.caustic), inC = L.inside(this.src, this.curves.cut);
      this.images = (inA && inC ? 4 : inA || inC ? 2 : 1);
      // A round lens has a point caustic: on axis the image is a full Einstein ring.
      this.tick = 0;
    }
    if (b > 0 && this.tick++ % 5 === 0) this.mu = L.magnification(this.src, Math.max(0.08 * b, 0.6), b, this.q, s, 260);
    const ring = this.q > 0.995 && Math.hypot(...this.src) < 0.05 * b;
    this.ro.set('Images of the source', b > 0 ? (ring ? 'an Einstein ring' : `${this.images}${s > 0 && this.images > 1 ? ' + faint central' : ''}`) : '1', this.images >= 4 ? 'good' : '');
    this.ro.set('Total magnification', b > 0 ? `×${num(this.mu, 3)}` : '×1', this.mu > 10 ? 'warm' : '');
    const cu = this.curves;
    if (cu && b > 0) {
      const R = Math.max(1.25 * b, Math.hypot(...this.src) * 1.15);
      this.plot.draw({
        series: [
          { x: cu.cut.map((p) => p[0]), y: cu.cut.map((p) => p[1]), color: '#ffb454' },
          { x: cu.caustic.map((p) => p[0]), y: cu.caustic.map((p) => p[1]), color: '#ff7a7a' },
        ],
        xRange: [-R * 1.25, R * 1.25], yRange: [-R, R], markers: [{ x: this.src[0], y: this.src[1], color: '#6fd3ff' }], xLabel: 'β (arcsec)',
      });
    }
  }

  probe() { return { images: this.images, mu: this.mu, b: this.b, ring: this.q > 0.995 && Math.hypot(...this.src) < 0.05 * this.b ? 1 : 0 }; }
}
