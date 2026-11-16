/** A main-sequence star you can tune by mass, with a polytropic interior. Scene units: solar radii. */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { OrbitRig } from '../engine/orbit';
import { Panel, Readouts } from '../ui/kit';
import { Plot } from '../ui/plot';
import * as ST from '../physics/stellar';
import { blackbodyRGB } from '../physics/color';
import { SI } from '../physics/constants';
import { num, fixed, length, speed } from '../ui/format';

const AU_RSUN = SI.AU / SI.Rsun;

export class StarStation extends Station {
  readonly id = 'star';
  readonly name = 'Star';
  readonly blurb = 'A main-sequence star set by one number: its mass. Luminosity, size, colour and lifetime follow from the scaling relations; the interior is a polytrope solved from the Lane–Emden equation.';
  readonly reach: [number, number] = [1.1, 2.3];
  readonly uses: (keyof Consts)[] = ['G', 'c'];
  centre() { return 9.6; }

  private rig = new OrbitRig();
  private mass = 1; private n = 3;
  private star!: ST.Star;
  private poly!: ST.Polytrope;
  private polyCache = new Map<number, ST.Polytrope>();
  private mesh!: THREE.Mesh; private mat!: THREE.ShaderMaterial;
  private rings: { line: THREE.LineLoop; r: () => number; label: () => string; billboard: boolean }[] = [];
  private ro!: Readouts; private core!: Readouts; private hr!: Plot; private prof!: Plot;
  private dirty = true; private time = 0;
  private msT: number[] = []; private msL: number[] = [];

  build(_ctx: Ctx) {
    this.rig.phi = 1.25; this.rig.theta = 0.6;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 }, uLimb: { value: 0.6 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uLimb;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float gran = 0.88 + 0.12 * noise(vP * 38.0 + uTime * 0.25) + 0.07 * (noise(vP * 9.0 - uTime * 0.05) - 0.5);
  vec3 c = uColor * (1.0 - uLimb * (1.0 - mu)) * gran;
  gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.mat);
    this.scene.add(this.mesh);
    const circle = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 200; i++) { const a = (i / 200) * Math.PI * 2; pts.push(Math.cos(a), 0, Math.sin(a)); }
    circle.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ring = (color: number, r: () => number, label: () => string, billboard = false) => {
      const line = new THREE.LineLoop(circle, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      this.scene.add(line); this.rings.push({ line, r, label, billboard });
    };
    ring(0xffb454, () => 1, () => 'the Sun, for scale', true);
    ring(0x7be0a4, () => this.star.hz[0] * AU_RSUN, () => `habitable zone, inner ${fixed(this.star.hz[0], 2)} AU`);
    ring(0x7be0a4, () => this.star.hz[1] * AU_RSUN, () => `outer ${fixed(this.star.hz[1], 2)} AU`);
    ring(0x6fd3ff, () => AU_RSUN, () => '1 AU');
    for (let m = 0.08; m <= 60; m *= 1.12) { const s = ST.star(m); this.msT.push(s.T); this.msL.push(s.L); }
  }

  private polytrope(n: number): ST.Polytrope {
    const key = Math.round(n * 10);
    let p = this.polyCache.get(key);
    if (!p) { p = ST.laneEmden(key / 10, 2e-3); this.polyCache.set(key, p); }
    return p;
  }

  onConsts() { this.dirty = true; }
  reset() { this.mass = 1; this.n = 3; this.dirty = true; }

  panels(left: Panel, right: Panel, _ctx: Ctx) {
    left.title(this.name).blurb(this.blurb);
    left.section('The star');
    left.dial({ label: 'Mass', min: 0.08, max: 60, value: this.mass, log: true, fmt: (v) => `${num(v, 3)} M☉`, onChange: (v) => { this.mass = v; this.dirty = true; } });
    left.section('Interior model');
    left.dial({ label: 'Polytropic index n', min: 0.5, max: 4.5, value: this.n, step: 0.1, fmt: (v) => `${fixed(v, 1)}${Math.abs(v - 3) < 0.05 ? ' (radiative, Eddington)' : Math.abs(v - 1.5) < 0.05 ? ' (convective)' : ''}`, onChange: (v) => { this.n = v; this.dirty = true; } });
    left.note('n = 3 suits a Sun-like star in radiative equilibrium; n = 1.5 suits a fully convective one such as a red dwarf.');
    left.note('The G dial scales the luminosity as G⁴ (homology with electron-scattering opacity) and the central pressure and temperature directly. A slightly stronger gravity burns stars out very quickly.');

    right.section('Surface');
    this.ro = right.readouts(['Luminosity', 'Radius', 'Temperature', 'Spectral class', 'Peak wavelength', 'Main-sequence lifetime', 'Habitable zone', 'Surface gravity', 'Escape speed', 'End state']);
    right.section('Hertzsprung–Russell diagram');
    this.hr = new Plot(170, 'The main sequence (blue) and this star (dot). Temperature runs right to left, by convention.');
    right.add(this.hr.el);
    right.section('Centre');
    this.core = right.readouts(['Central density', 'Central pressure', 'Central temperature', 'ρ_centre / ρ_mean']);
    this.prof = new Plot(140, 'Density (blue), pressure (amber) and temperature (green) relative to the centre.');
    right.add(this.prof.el);
    this.dirty = true;
  }

  update(dt: number, ctx: Ctx) {
    if (this.dirty) { this.star = ST.star(this.mass, ctx.consts.G); this.poly = this.polytrope(this.n); }
    if (!ctx.paused) this.time += dt;
    this.rig.drag(ctx.input);
    this.rig.dist = (Math.pow(10, ctx.logScale) / SI.Rsun) * 1.2;
    this.rig.apply(this.camera);
    const s = this.star;
    this.mesh.scale.setScalar(s.R);
    const [r, g, b] = blackbodyRGB(Math.min(Math.max(s.T, 1000), 60000));
    this.mat.uniforms.uColor.value.setRGB(r, g, b);
    this.mat.uniforms.uTime.value = this.time;
    for (const ring of this.rings) {
      const rad = ring.r(), app = rad / this.rig.dist;
      ring.line.visible = app > 0.02 && app < 2.5;
      if (!ring.line.visible) continue;
      ring.line.scale.setScalar(rad);
      if (ring.billboard) { ring.line.quaternion.copy(this.camera.quaternion); ring.line.rotateX(Math.PI / 2); }
      const p = ring.billboard ? new THREE.Vector3(0.7 * rad, 0.7 * rad, 0).applyQuaternion(this.camera.quaternion) : new THREE.Vector3(rad * 0.7, 0, rad * 0.7);
      ctx.labels.put(ring.label(), p, this.camera, ctx.view);
    }
  }

  refresh(ctx: Ctx) {
    if (!this.dirty) return;
    this.dirty = false;
    const s = this.star, G = SI.G * ctx.consts.G;
    const Mk = s.M * SI.Msun, Rk = s.R * SI.Rsun;
    this.ro.set('Luminosity', `${num(s.L, 3)} L☉`);
    this.ro.set('Radius', `${num(s.R, 3)} R☉`);
    this.ro.set('Temperature', `${num(s.T, 4)} K`);
    this.ro.set('Spectral class', s.cls);
    this.ro.set('Peak wavelength', `${fixed(2.897771955e6 / s.T, 0)} nm`);
    this.ro.set('Main-sequence lifetime', s.lifetime >= 1 ? `${num(s.lifetime, 3)} Gyr` : `${num(s.lifetime * 1000, 3)} Myr`, s.lifetime > 13.8 ? 'good' : s.lifetime < 0.5 ? 'warm' : '');
    this.ro.set('Habitable zone', `${num(s.hz[0], 2)}–${num(s.hz[1], 2)} AU`);
    this.ro.set('Surface gravity', `${num((G * Mk) / (Rk * Rk) / 9.80665, 3)} g`);
    this.ro.set('Escape speed', speed(Math.sqrt((2 * G * Mk) / Rk)));
    this.ro.set('End state', s.remnant);
    const c = ST.centralConditions(this.poly, s.M, s.R, 0.61, ctx.consts.G);
    this.core.set('Central density', `${num(c.rhoC / 1000, 3)} g/cm³`);
    this.core.set('Central pressure', `${num(c.Pc, 3)} Pa`);
    this.core.set('Central temperature', `${num(c.Tc, 3)} K`, c.Tc < 4e6 ? 'warm' : '');
    this.core.set('ρ_centre / ρ_mean', fixed(this.poly.concentration, 2));
    this.hr.draw({
      series: [{ x: this.msT, y: this.msL }], xLog: true, yLog: true, invertX: true,
      xRange: [2200, 50000], yRange: [1e-4, 1e6], markers: [{ x: s.T, y: s.L, label: `${s.cls} star` }], xLabel: 'T (K)', yLabel: 'L / L☉',
    });
    const p = this.poly, x: number[] = [], rho: number[] = [], pr: number[] = [], tt: number[] = [];
    const stride = Math.max(1, Math.floor(p.xi.length / 200));
    for (let i = 0; i < p.xi.length; i += stride) { const th = Math.max(p.theta[i], 0); x.push(p.xi[i] / p.xi1); rho.push(Math.pow(th, p.n)); pr.push(Math.pow(th, p.n + 1)); tt.push(th); }
    this.prof.draw({ series: [{ x, y: rho, label: 'ρ' }, { x, y: pr, label: 'P' }, { x, y: tt, label: 'T' }], xRange: [0, 1], yRange: [0, 1], xLabel: 'r / R' });
  }

  probe() { return { mass: this.mass, lifetime: this.star?.lifetime ?? 0, hzIn: this.star?.hz[0] ?? 0, hzOut: this.star?.hz[1] ?? 0, T: this.star?.T ?? 0 }; }
}
