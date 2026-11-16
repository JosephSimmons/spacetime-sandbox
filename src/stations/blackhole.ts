/**
 * Schwarzschild black hole. Each pixel traces a null geodesic backwards from a
 * static observer; the ray marcher is the GLSL twin of physics/schwarzschild.traceNull.
 * Lengths in the shader are in units of GM/c^2, so the horizon is at r = 2.
 */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { OrbitRig } from '../engine/orbit';
import { Panel, Readouts, Dial } from '../ui/kit';
import { Plot } from '../ui/plot';
import { blackbodyTexture, BLACKBODY_GLSL } from '../engine/relativistic';
import * as S from '../physics/schwarzschild';
import { SI } from '../physics/constants';
import { num, fixed, length, duration } from '../ui/format';

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uCam, uRight, uUp, uFwd;
uniform float uTanFov, uAspect, uRin, uRout, uTpeak, uDisk, uShift, uGridOn, uTime, uExposure, uObsF;
${BLACKBODY_GLSL}
float hash1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p){ return vec2(hash1(p), hash1(p + 19.19)); }

vec3 sky(vec3 d){
  float shift = uShift > 0.5 ? 1.0 / uObsF : 1.0;
  float lon = atan(d.z, d.x), lat = asin(clamp(d.y, -1.0, 1.0));
  vec3 c = vec3(0.0);
  // Stars live at random points in a 3D lattice; the unit sphere slices through them.
  for (int k = 0; k < 2; k++) {
    float s = k == 0 ? 22.0 : 47.0;
    vec3 q = d * s;
    vec3 id = floor(q);
    vec2 h = hash2(id.xy + id.z * 17.31);
    vec3 star = id + 0.5 + 0.5 * (vec3(h, hash1(id.yz + id.x * 5.7)) - 0.5);
    vec3 off = q - star;
    float T = mix(2800.0, 14000.0, pow(hash1(id.xz + 3.1 + id.y), 2.2)) * shift;
    float mag = (0.3 + 3.0 * pow(hash1(id.xy + 11.7 - id.z), 4.0)) * (k == 0 ? 1.0 : 0.5);
    c += blackbody(T).rgb * mag * exp(-dot(off, off) * (k == 0 ? 420.0 : 520.0));
  }
  // A faint band, tilted, so the lensing of extended structure is visible.
  vec3 pole = normalize(vec3(0.35, 0.86, 0.37));
  float bl = asin(clamp(dot(d, pole), -1.0, 1.0));
  c += blackbody(5200.0 * shift).rgb * 0.05 * exp(-bl * bl * 28.0) * (0.6 + 0.4 * hash1(floor(vec2(lon, lat) * 120.0)));
  if (uGridOn > 0.5) {
    vec2 g = vec2(lon, lat) / 0.2617994; // 15 degrees
    vec2 w = max(fwidth(g), 1e-5);
    vec2 l = abs(fract(g - 0.5) - 0.5) / w;
    float line = (1.0 - clamp(min(l.x, l.y) - 0.3, 0.0, 1.0)) * step(w.x, 0.5);
    c += vec3(0.13, 0.32, 0.42) * line;
  }
  return c * min(pow(shift, 3.0), 60.0);
}

vec3 disc(vec3 hit, float rr, float ly){
  float om = pow(rr, -1.5);
  float g = 1.0;
  if (uShift > 0.5) g = sqrt(max(1.0 - 3.0 / rr, 1e-4)) / (max(1.0 - om * ly, 0.02) * uObsF);
  float prof = pow(rr / uRin, -0.75) * pow(max(1.0 - sqrt(uRin / rr), 0.0), 0.25) / 0.488;
  float T = uTpeak * prof * g;
  vec4 bb = blackbody(T);
  float lum = pow(10.0, bb.a - blackbody(uTpeak).a);
  float ph = atan(hit.z, hit.x) - om * uTime * 6.0;
  float tex = 0.72 + 0.28 * sin(ph * 5.0 + sin(rr * 1.9) * 2.5) * sin(rr * 2.7 + ph * 2.0);
  float edge = smoothstep(uRout, uRout * 0.8, rr);
  return bb.rgb * lum * tex * edge;
}

void main(){
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0) * uTanFov;
  vec3 dl = normalize(uFwd + p.x * uRight + p.y * uUp);
  float r0 = length(uCam);
  vec3 rh = uCam / r0;
  float f0 = max(1.0 - 2.0 / r0, 1e-5);
  // Static observer's local direction -> coordinate direction (radial part scaled by sqrt f).
  vec3 v = normalize(dl + rh * dot(dl, rh) * (sqrt(f0) - 1.0));
  vec3 x = uCam;
  vec3 hv = cross(x, v);
  float h2 = dot(hv, hv);
  float cp = dot(v, rh);
  float b = r0 / sqrt(cp * cp / max(1.0 - cp * cp, 1e-9) + f0);
  float ly = -b * hv.y / max(sqrt(h2), 1e-9);
  float rEsc = max(70.0, r0 * 2.2);
  vec3 col = vec3(0.0);
  bool resolved = false;
  vec3 a = -3.0 * h2 * x / pow(dot(x, x), 2.5);
  for (int i = 0; i < 300; i++) {
    float r = length(x);
    if (r < 2.01) { resolved = true; break; }
    if (r > rEsc && dot(x, v) > 0.0) break;
    float dt = clamp(0.11 * (r - 1.85), 0.012, 0.16 * r) / max(length(v), 0.2);
    vec3 xo = x;
    v += a * (0.5 * dt); x += v * dt;
    a = -3.0 * h2 * x / pow(dot(x, x), 2.5);
    v += a * (0.5 * dt);
    if (uDisk > 0.5 && xo.y * x.y < 0.0) {
      vec3 hit = mix(xo, x, xo.y / (xo.y - x.y));
      float rr = length(hit);
      if (rr > uRin && rr < uRout) { col = disc(hit, rr, ly); resolved = true; break; }
    }
  }
  if (!resolved) col = sky(normalize(v));
  col = 1.0 - exp(-col * uExposure);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

export class BlackHoleStation extends Station {
  readonly id = 'blackhole';
  readonly name = 'Black hole';
  readonly blurb = 'A non-rotating black hole seen by an observer hovering at fixed radius. Every pixel is a light ray traced through the Schwarzschild geometry, so the shadow, the photon ring and the warped disc are computed, not painted.';
  readonly reach: [number, number] = [1.05, 1.4];
  readonly uses: (keyof Consts)[] = ['G', 'c', 'hbar'];
  readonly hint = 'drag to orbit · scroll in to descend toward the horizon';

  private massSun = 10;
  private rig = new OrbitRig();
  private mat!: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private ro!: Readouts; private orbRo!: Readouts;
  private potPlot!: Plot; private orbPlot!: Plot;
  private time = 0;
  private rPeri = 12; private rApo = 30;
  private orbitDirty = true;
  private orbit: ReturnType<typeof S.massiveOrbit> | null = null;
  rCam = 24;

  /** GM/c^2 in metres for the current mass and constants. */
  private rg(c: Consts) { return (SI.G * c.G * this.massSun * SI.Msun) / (SI.c * c.c) ** 2; }
  centre(c: Consts) { return Math.log10(40 * this.rg(c)); }

  build(_ctx: Ctx) {
    this.rig.phi = 1.42; this.rig.theta = 0.5;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector3() },
        uTanFov: { value: Math.tan((55 * Math.PI) / 360) }, uAspect: { value: 1 },
        uRin: { value: 6 }, uRout: { value: 22 }, uTpeak: { value: 7500 }, uDisk: { value: 1 }, uShift: { value: 1 }, uGridOn: { value: 0 },
        uTime: { value: 0 }, uExposure: { value: 0.55 }, uObsF: { value: 1 }, uBB: { value: blackbodyTexture() },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  panels(left: Panel, right: Panel, ctx: Ctx) {
    const u = this.mat.uniforms;
    left.title(this.name).blurb(this.blurb);
    left.section('The hole');
    left.dial({ label: 'Mass', min: 3, max: 100, value: this.massSun, log: true, fmt: (v) => `${num(v, 3)} M☉`, onChange: (v) => { const k = ctx.logScale - this.centre(ctx.consts); this.massSun = v; ctx.setLogScale(this.centre(ctx.consts) + k); } });
    left.note('The horizon radius is 2GM/c², so the G and c dials move this whole station along the scale axis. Slow light enough and a ten-solar-mass hole is the size of a galaxy.');
    left.section('Accretion disc');
    left.toggle('Show disc', true, (v) => (u.uDisk.value = v ? 1 : 0));
    left.dial({ label: 'Inner edge', min: 3.2, max: 20, value: 6, step: 0.1, fmt: (v) => `${fixed(v, 1)} GM/c²${Math.abs(v - 6) < 0.05 ? ' (ISCO)' : v < 6 ? ' (unstable)' : ''}`, onChange: (v) => (u.uRin.value = v) });
    left.dial({ label: 'Outer edge', min: 10, max: 60, value: 22, step: 0.5, fmt: (v) => `${fixed(v, 1)} GM/c²`, onChange: (v) => (u.uRout.value = v) });
    left.dial({ label: 'Peak temperature', min: 2000, max: 40000, value: 7500, log: true, fmt: (v) => `${num(v, 3)} K`, onChange: (v) => (u.uTpeak.value = v) });
    left.note('Real discs around stellar-mass holes peak in X-rays. The dial picks a temperature the eye can see; the shifts applied to it are exact.');
    left.section('What to render');
    left.toggle('Doppler and gravitational shifts', true, (v) => (u.uShift.value = v ? 1 : 0));
    left.toggle('Celestial grid (15° lines on the sky)', false, (v) => (u.uGridOn.value = v ? 1 : 0));
    left.dial({ label: 'Exposure', min: 0.05, max: 20, value: 0.55, log: true, fmt: (v) => fixed(v, 2), onChange: (v) => (u.uExposure.value = v) });

    right.section('Observer');
    this.ro = right.readouts(['Radius', 'In metres', 'Clock rate vs far away', 'Sky blueshift', 'Shadow angular radius', 'Orbital speed here', 'Tide across 2 m']);
    right.section('The hole');
    this.orbRo = right.readouts(['Horizon 2GM/c²', 'Photon sphere', 'ISCO', 'Hawking temperature', 'Evaporation time']);
    right.section('Effective potential');
    this.potPlot = new Plot(140, 'Massive particles: V² for the test orbit below (blue) and its energy (dashed). Photons (amber, scaled): the peak at 3 GM/c² is the photon sphere.');
    right.add(this.potPlot.el);
    right.section('Test orbit');
    right.dial({ label: 'Periapsis', min: 4.2, max: 60, value: this.rPeri, step: 0.1, fmt: (v) => `${fixed(v, 1)} GM/c²`, onChange: (v) => { this.rPeri = v; this.orbitDirty = true; } });
    right.dial({ label: 'Apoapsis', min: 6, max: 150, value: this.rApo, step: 0.5, fmt: (v) => `${fixed(v, 1)} GM/c²`, onChange: (v) => { this.rApo = v; this.orbitDirty = true; } });
    this.orbPlot = new Plot(240, '');
    right.add(this.orbPlot.el);
    this.orbitDirty = true;
  }

  update(dt: number, ctx: Ctx) {
    const u = this.mat.uniforms;
    this.rig.drag(ctx.input);
    this.rCam = Math.max(2.03, 24 * Math.pow(10, ctx.logScale - this.centre(ctx.consts)));
    this.rig.dist = this.rCam;
    this.rig.apply(this.camera);
    if (!ctx.paused) this.time += dt;
    const e = this.camera.matrixWorld.elements;
    u.uCam.value.copy(this.camera.position);
    u.uRight.value.set(e[0], e[1], e[2]); u.uUp.value.set(e[4], e[5], e[6]); u.uFwd.value.set(-e[8], -e[9], -e[10]);
    // Widen the field of view close in, where the shadow covers most of the sky.
    const fov = this.rCam < 6 ? 55 + (6 - this.rCam) * 12 : 55;
    u.uTanFov.value = Math.tan((fov * Math.PI) / 360);
    u.uAspect.value = ctx.view.w / ctx.view.h;
    u.uTime.value = this.time;
    u.uObsF.value = Math.sqrt(Math.max(1 - 2 / this.rCam, 1e-6));
  }

  render(ctx: Ctx) { ctx.renderer.render(this.quadScene, this.quadCam); }

  refresh(ctx: Ctx) {
    const c = ctx.consts, rg = this.rg(c), r = this.rCam;
    const cc = SI.c * c.c, G = SI.G * c.G, hb = SI.hbar * c.hbar, Mkg = this.massSun * SI.Msun;
    const f = Math.sqrt(Math.max(1 - 2 / r, 0));
    this.ro.set('Radius', `${fixed(r, 2)} GM/c² = ${fixed(r / 2, 2)} rₛ`);
    this.ro.set('In metres', length(r * rg));
    this.ro.set('Clock rate vs far away', fixed(f, 4), f < 0.5 ? 'warm' : '');
    this.ro.set('Sky blueshift', `×${fixed(1 / Math.max(f, 1e-4), 3)}`);
    const sinPsi = Math.min((Math.sqrt(27) * f) / r, 1);
    const shadow = r >= 3 ? Math.asin(sinPsi) : Math.PI - Math.asin(sinPsi);
    this.ro.set('Shadow angular radius', `${fixed((shadow * 180) / Math.PI, 1)}°`);
    this.ro.set('Orbital speed here', r > 3 ? `${fixed(S.orbitalSpeedLocal(r, 1), 3)} c${r < 6 ? ' (unstable)' : ''}` : 'no circular orbit', r < 6 ? 'warm' : '');
    const tide = (2 * G * Mkg * 2) / Math.pow(r * rg, 3);
    this.ro.set('Tide across 2 m', `${num(tide / 9.80665, 2)} g`, tide > 98 ? 'bad' : '');
    this.orbRo.set('Horizon 2GM/c²', length(2 * rg));
    this.orbRo.set('Photon sphere', length(3 * rg));
    this.orbRo.set('ISCO', length(6 * rg));
    this.orbRo.set('Hawking temperature', `${num((hb * cc ** 3) / (8 * Math.PI * G * Mkg * SI.kB), 3)} K`);
    this.orbRo.set('Evaporation time', duration((5120 * Math.PI * G * G * Mkg ** 3) / (hb * cc ** 4)));

    if (this.orbitDirty) {
      this.orbitDirty = false;
      const rp = this.rPeri, ra = Math.max(this.rApo, rp + 0.5);
      // A bound orbit needs the periapsis outside the centrifugal barrier: u3 > u2.
      const u3 = 0.5 - 1 / ra - 1 / rp;
      const ok = u3 > 1 / rp;
      this.orbit = ok ? S.massiveOrbit(rp, ra, 1, 4, 4e-3) : null;
      const xs: number[] = [], ys: number[] = [], nx: number[] = [], ny: number[] = [];
      if (this.orbit) for (const [x, y] of this.orbit.points) { xs.push(x); ys.push(y); }
      const a = (rp + ra) / 2, ecc = (ra - rp) / (ra + rp);
      for (let k = 0; k <= 200; k++) { const th = (k / 200) * 2 * Math.PI; const rr = (a * (1 - ecc * ecc)) / (1 + ecc * Math.cos(th)); nx.push(rr * Math.cos(th)); ny.push(rr * Math.sin(th)); }
      const hx: number[] = [], hy: number[] = [];
      for (let k = 0; k <= 60; k++) { const th = (k / 60) * 2 * Math.PI; hx.push(2 * Math.cos(th)); hy.push(2 * Math.sin(th)); }
      const R = ra * 1.08;
      this.orbPlot.draw({
        series: [
          { x: nx, y: ny, color: 'rgba(140,170,200,0.5)', dash: [3, 3], label: 'Newton' },
          { x: xs, y: ys, color: '#6fd3ff', label: 'Schwarzschild' },
          { x: hx, y: hy, color: '#ff7a7a' },
        ],
        xRange: [-R * 1.4, R * 1.4], yRange: [-R, R],
      });
      const o = this.orbit;
      this.orbPlot.caption.textContent = o
        ? `Periapsis advances ${fixed((o.precession * 180) / Math.PI, 2)}° per orbit (weak-field formula: ${fixed(((6 * Math.PI) / (a * (1 - ecc * ecc))) * (180 / Math.PI), 2)}°). Red circle: horizon.`
        : 'No bound orbit: with this periapsis the particle is inside the centrifugal barrier and plunges.';
      // Effective potential for this orbit's angular momentum.
      const L = o ? o.L : Math.sqrt(12);
      const pr: number[] = [], pv: number[] = [], pp: number[] = [];
      for (let k = 0; k <= 160; k++) { const rr = 2.05 * Math.pow(120 / 2.05, k / 160); pr.push(rr); pv.push(S.effectivePotential(rr, 1, L)); pp.push(S.photonPotential(rr, 1) * 27 * 0.9 + 0.1); }
      this.potPlot.draw({
        series: [{ x: pr, y: pv, label: 'massive' }, { x: pr, y: pp, color: '#ffb454', label: 'photon' }],
        xLog: true, yRange: [0.6, 1.25], hlines: o ? [{ y: o.E * o.E, label: 'E²' }] : [],
        vlines: [{ x: 3, color: 'rgba(255,180,84,0.35)' }, { x: 6, color: 'rgba(111,211,255,0.35)' }],
        xLabel: 'r (GM/c²)',
      });
    }
  }

  onConsts() { this.orbitDirty = true; }
  probe() { return { r: this.rCam, precessionDeg: this.orbit ? (this.orbit.precession * 180) / Math.PI : 0, rin: this.mat?.uniforms.uRin.value ?? 6 }; }
}
