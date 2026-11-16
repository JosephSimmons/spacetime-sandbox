/** Hydrogen orbitals as probability clouds, coloured by phase. Scene units: Bohr radii. */
import * as THREE from 'three';
import { Station, Ctx, Consts } from '../engine/types';
import { OrbitRig } from '../engine/orbit';
import { Panel, Readouts, el, select, Dial } from '../ui/kit';
import { Plot } from '../ui/plot';
import * as H from '../physics/hydrogen';
import { SI } from '../physics/constants';
import { cmf, xyzToLinearRGB } from '../physics/color';
import { num, fixed, length, duration } from '../ui/format';

const N = 60000;
type QN = { n: number; l: number; m: number };

export class HydrogenStation extends Station {
  readonly id = 'hydrogen';
  readonly name = 'Hydrogen atom';
  readonly blurb = 'The electron in a hydrogen atom, drawn as sixty thousand samples of |ψ|². Colour is the phase of the wavefunction. Mix two states and the cloud sloshes at the frequency of the light the transition would emit.';
  readonly reach: [number, number] = [0.9, 0.7];
  readonly uses: (keyof Consts)[] = ['hbar', 'c'];
  centre(c: Consts) { return Math.log10(H.bohrRadius(c.hbar) * 25); }

  private rig = new OrbitRig();
  private a: QN = { n: 2, l: 1, m: 0 };
  private b: QN = { n: 1, l: 0, m: 0 };
  private mix = 0;
  private points!: THREE.Points; private mat!: THREE.ShaderMaterial;
  private dirty = true; private time = 0;
  private ro!: Readouts; private warn!: HTMLElement;
  private radial!: Plot; private levels!: Plot;
  private selects: HTMLElement[] = [];
  private swatch!: HTMLElement;

  build(_ctx: Ctx) {
    this.rig.up = 'z'; this.rig.phi = 1.15; this.rig.theta = 0.7;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aPsi', new THREE.BufferAttribute(new Float32Array(4 * N), 4));
    g.setAttribute('aQ', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Vector2(1, 0) }, uPh: { value: new THREE.Vector2() }, uSize: { value: 2 }, uGain: { value: 0.5 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
attribute vec4 aPsi; attribute float aQ;
uniform vec2 uC; uniform vec2 uPh; uniform float uSize; uniform float uGain;
varying vec3 vCol; varying float vA;
vec3 hue(float h){ return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
vec2 rot(vec2 z, float a){ float c = cos(a), s = sin(a); return vec2(z.x * c + z.y * s, z.y * c - z.x * s); }
void main(){
  // psi = c1 psi1 exp(-i phi1) + c2 psi2 exp(-i phi2)
  vec2 psi = uC.x * rot(aPsi.xy, uPh.x) + uC.y * rot(aPsi.zw, uPh.y);
  float w = dot(psi, psi) / max(aQ, 1e-12);
  vCol = mix(vec3(1.0), hue(atan(psi.y, psi.x) / 6.2831853), 0.8);
  vA = clamp(w * uGain, 0.0, 1.0);
  gl_PointSize = uSize * (0.6 + 0.8 * clamp(w, 0.0, 2.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: 'varying vec3 vCol; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)) * vA; gl_FragColor = vec4(vCol * a, a); }',
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    const axis = new THREE.BufferGeometry();
    axis.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -400, 0, 0, 400], 3));
    this.scene.add(new THREE.Line(axis, new THREE.LineBasicMaterial({ color: 0x8cabc8, transparent: true, opacity: 0.25 })));
    const nuc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a7a }));
    this.scene.add(nuc);
  }

  private resample() {
    this.dirty = false;
    const { a, b } = this, mixed = this.mix > 0;
    const geo = this.points.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute, psi = geo.getAttribute('aPsi') as THREE.BufferAttribute, q = geo.getAttribute('aQ') as THREE.BufferAttribute;
    const half = mixed ? N / 2 : N;
    const pa = H.sampleOrbital(a.n, a.l, a.m, half);
    (pos.array as Float32Array).set(pa, 0);
    if (mixed) (pos.array as Float32Array).set(H.sampleOrbital(b.n, b.l, b.m, N - half), 3 * half);
    const P = pos.array as Float32Array, S = psi.array as Float32Array, Q = q.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      const p1 = H.psi(a.n, a.l, a.m, x, y, z), p2 = H.psi(b.n, b.l, b.m, x, y, z);
      S[4 * i] = p1[0]; S[4 * i + 1] = p1[1]; S[4 * i + 2] = p2[0]; S[4 * i + 3] = p2[1];
      const d1 = p1[0] ** 2 + p1[1] ** 2, d2 = p2[0] ** 2 + p2[1] ** 2;
      Q[i] = mixed ? 0.5 * (d1 + d2) : d1;
    }
    pos.needsUpdate = true; psi.needsUpdate = true; q.needsUpdate = true;
  }

  private stateSelect(q: QN, label: string): HTMLElement {
    const mk = () => {
      const ns = select([1, 2, 3, 4, 5].map((n) => [String(n), `n = ${n}`] as [string, string]), String(q.n), (v) => { q.n = +v; q.l = Math.min(q.l, q.n - 1); q.m = Math.max(-q.l, Math.min(q.l, q.m)); refresh(); });
      const ls = select(Array.from({ length: q.n }, (_, l) => [String(l), `l = ${l} (${'spdfg'[l]})`] as [string, string]), String(q.l), (v) => { q.l = +v; q.m = Math.max(-q.l, Math.min(q.l, q.m)); refresh(); });
      const ms = select(Array.from({ length: 2 * q.l + 1 }, (_, i) => [String(i - q.l), `m = ${i - q.l}`] as [string, string]), String(q.m), (v) => { q.m = +v; refresh(); });
      return [ns, ls, ms];
    };
    const row = el('div', { class: 'btnrow' });
    const refresh = () => { row.replaceChildren(el('span', { text: label, style: { color: 'var(--dim)', alignSelf: 'center', width: '14px' } }), ...mk()); this.dirty = true; };
    refresh(); this.dirty = true;
    return row;
  }

  reset() { this.a = { n: 2, l: 1, m: 0 }; this.b = { n: 1, l: 0, m: 0 }; this.mix = 0; this.dirty = true; }
  onConsts() { /* geometry is in Bohr radii, so only the readouts change */ }

  panels(left: Panel, right: Panel, _ctx: Ctx) {
    left.title(this.name).blurb(this.blurb);
    this.warn = left.warn();
    left.section('State A');
    left.add(this.stateSelect(this.a, 'A'));
    left.section('State B');
    left.add(this.stateSelect(this.b, 'B'));
    left.dial({ label: 'Amount of B mixed in', min: 0, max: 1, value: this.mix, step: 0.01, fmt: (v) => (v === 0 ? 'none (pure A)' : `|c_B|² = ${fixed(v, 2)}`), onChange: (v) => { const was = this.mix > 0; this.mix = v; if (was !== v > 0) this.dirty = true; } });
    left.note('A pure state is stationary: only its phase turns, so the colours cycle but the cloud does not move. A mixture of two energies beats at (E_A − E_B)/ħ, slowed here so one beat takes four seconds.');
    left.section('Display');
    left.dial({ label: 'Brightness', min: 0.05, max: 3, value: 0.5, log: true, fmt: (v) => fixed(v, 2), onChange: (v) => (this.mat.uniforms.uGain.value = v) });
    left.note('Raising ħ makes the atom bigger (a₀ ∝ ħ²) and its binding weaker (E ∝ 1/ħ²), so this station slides up the scale axis. At ħ × 10⁵ the atom is half a metre across.');

    right.section('The atom');
    this.ro = right.readouts(['Bohr radius a₀', 'Energy of A', 'Energy of B', 'Mean radius of A', 'A ↔ B wavelength', 'Band', 'True beat period', 'Fine-structure α', 'Ground-state speed']);
    this.swatch = el('div', { style: { height: '10px', margin: '6px 0', border: '1px solid var(--line)' } });
    right.add(this.swatch);
    right.section('Radial probability');
    this.radial = new Plot(140, 'r²|R(r)|² for A (blue) and B (amber): where the electron is likely to be found, by distance.');
    right.add(this.radial.el);
    right.section('Energy levels');
    this.levels = new Plot(150, 'Levels −13.6 eV / n², scaled by 1/ħ². Dots mark A and B.');
    right.add(this.levels.el);
  }

  update(dt: number, ctx: Ctx) {
    if (this.dirty) this.resample();
    if (!ctx.paused) this.time += dt;
    this.rig.drag(ctx.input);
    this.rig.dist = (Math.pow(10, ctx.logScale) / H.bohrRadius(ctx.consts.hbar)) * 1.2;
    this.rig.apply(this.camera);
    const u = this.mat.uniforms;
    const cB = Math.sqrt(this.mix);
    u.uC.value.set(Math.sqrt(1 - this.mix), cB);
    // Phases advance in proportion to the energies; one beat lasts four seconds.
    const ea = -1 / this.a.n ** 2, eb = -1 / this.b.n ** 2, dE = Math.abs(ea - eb);
    const k = (2 * Math.PI * this.time) / 4 / (dE > 0 && this.mix > 0 ? dE : 0.75);
    u.uPh.value.set(ea * k, eb * k);
    u.uSize.value = Math.max(1.5, Math.min(4, 90 / this.rig.dist)) * ctx.renderer.getPixelRatio();
  }

  refresh(ctx: Ctx) {
    const hb = ctx.consts.hbar, cm = ctx.consts.c, { a, b } = this;
    const alpha = H.fineStructure(hb, cm);
    this.ro.set('Bohr radius a₀', length(H.bohrRadius(hb)));
    this.ro.set('Energy of A', `${num(H.energyEV(a.n, hb), 4)} eV`);
    this.ro.set('Energy of B', `${num(H.energyEV(b.n, hb), 4)} eV`);
    this.ro.set('Mean radius of A', `${fixed(H.meanRadius(a.n, a.l), 1)} a₀ = ${length(H.meanRadius(a.n, a.l) * H.bohrRadius(hb))}`);
    if (a.n !== b.n) {
      const lam = H.transitionWavelengthNm(Math.min(a.n, b.n), Math.max(a.n, b.n), hb, cm);
      this.ro.set('A ↔ B wavelength', length(lam * 1e-9, 4));
      this.ro.set('Band', lam < 10 ? 'X-ray' : lam < 380 ? 'ultraviolet' : lam < 750 ? 'visible' : lam < 1e6 ? 'infrared' : lam < 1e9 ? 'microwave' : 'radio');
      this.ro.set('True beat period', duration((2 * Math.PI) / H.beatFrequency(a.n, b.n, hb)));
      const rgb = lam > 380 && lam < 750 ? xyzToLinearRGB(...cmf(lam)).map((v) => Math.round(255 * Math.pow(Math.min(Math.max(v, 0), 1), 1 / 2.2))) : [20, 24, 30];
      this.swatch.style.background = `rgb(${rgb.join(',')})`;
    } else {
      this.ro.set('A ↔ B wavelength', 'same energy'); this.ro.set('Band', '—'); this.ro.set('True beat period', '—');
      this.swatch.style.background = 'transparent';
    }
    this.ro.set('Fine-structure α', `1 / ${num(1 / alpha, 4)}`, alpha > 0.3 ? 'bad' : '');
    this.ro.set('Ground-state speed', `${num(alpha, 3)} c`, alpha > 0.3 ? 'bad' : '');
    this.warn.textContent = alpha > 0.3 ? 'With these constants the electron would move at a large fraction of c. The non-relativistic wavefunctions shown here stop being a good description.' : '';

    const rMax = Math.max(a.n, b.n) ** 2 * 2.6 + 6;
    const rs: number[] = [], pa: number[] = [], pb: number[] = [];
    for (let i = 0; i <= 240; i++) { const r = (i / 240) * rMax; rs.push(r); pa.push(H.radial(a.n, a.l, r) ** 2 * r * r); pb.push(H.radial(b.n, b.l, r) ** 2 * r * r); }
    this.radial.draw({ series: [{ x: rs, y: pa, label: H.orbitalLabel(a.n, a.l, a.m) }, { x: rs, y: pb, color: '#ffb454', dash: [4, 3], label: H.orbitalLabel(b.n, b.l, b.m) }], xLabel: 'r (a₀)', yRange: [0, Math.max(...pa, ...pb) * 1.1] });
    const series = [1, 2, 3, 4, 5, 6].map((n) => ({ x: [0.15, 0.85], y: [H.energyEV(n, hb), H.energyEV(n, hb)], color: 'rgba(140,170,200,0.7)' }));
    this.levels.draw({
      series, xRange: [0, 1], yRange: [H.energyEV(1, hb) * 1.12, -H.energyEV(1, hb) * 0.06], yLabel: 'E (eV)',
      markers: [{ x: 0.35, y: H.energyEV(a.n, hb), color: '#6fd3ff', label: 'A' }, { x: 0.65, y: H.energyEV(b.n, hb), color: '#ffb454', label: 'B' }],
    });
  }

  probe(ctx: Ctx) {
    const { a, b } = this;
    return {
      lambda: a.n !== b.n ? H.transitionWavelengthNm(Math.min(a.n, b.n), Math.max(a.n, b.n), ctx.consts.hbar, ctx.consts.c) : 0,
      mix: this.mix, a0: H.bohrRadius(ctx.consts.hbar), nA: a.n, nB: b.n,
    };
  }
}
