/**
 * Relativistic rendering. Every vertex is moved to where its light appears to
 * come from in the observer's frame (see physics/relativity.apparentPosition),
 * and every fragment is Doppler-shifted and beamed by its own Doppler factor.
 */
import * as THREE from 'three';
import { bandInverseMatrix, blackbodyRGB, blackbodyLuminance, surfaceTable, SURF_LOGD } from '../physics/color';

/** GLSL: CIE colour-matching fit, band-model Doppler shift, tone mapping. */
export const COLOR_GLSL = /* glsl */ `
float cmfLobe(float l, float mu, float s1, float s2){ float t = (l - mu) / (l < mu ? s1 : s2); return exp(-0.5 * t * t); }
vec3 cmf(float l){
  return vec3(
    1.056 * cmfLobe(l, 599.8, 37.9, 31.0) + 0.362 * cmfLobe(l, 442.0, 16.0, 26.7) - 0.065 * cmfLobe(l, 501.1, 20.4, 26.2),
    0.821 * cmfLobe(l, 568.8, 46.9, 40.5) + 0.286 * cmfLobe(l, 530.9, 16.3, 31.1),
    1.217 * cmfLobe(l, 437.0, 11.8, 36.0) + 0.681 * cmfLobe(l, 459.0, 26.0, 13.8));
}
vec3 xyz2rgb(vec3 c){
  return vec3(dot(c, vec3(3.2406, -1.5372, -0.4986)), dot(c, vec3(-0.9689, 1.8758, 0.0415)), dot(c, vec3(0.0557, -0.2040, 1.0570)));
}
vec3 lineRGB(float nm){ return max(xyz2rgb(cmf(nm)), 0.0); }
uniform mat3 uBandInv;
vec3 dopplerShift(vec3 rgb, float D){
  vec3 w = uBandInv * rgb;
  return max(w.x * xyz2rgb(cmf(610.0 / D)) + w.y * xyz2rgb(cmf(550.0 / D)) + w.z * xyz2rgb(cmf(465.0 / D)), 0.0);
}
// Smooth-spectrum surface model (physics/color.surfaceMatrix), read from a lookup texture.
uniform sampler2D uSurf;
vec3 dopplerSurface(vec3 rgb, float D){
  float u = clamp((log(D) / 2.302585 + ${SURF_LOGD.toFixed(2)}) / ${(2 * SURF_LOGD).toFixed(2)}, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0;
  vec3 r0 = texture2D(uSurf, vec2(u, 1.0 / 6.0)).rgb, r1 = texture2D(uSurf, vec2(u, 0.5)).rgb, r2 = texture2D(uSurf, vec2(u, 5.0 / 6.0)).rgb;
  return max(vec3(dot(r0, rgb), dot(r1, rgb), dot(r2, rgb)), 0.0);
}
vec3 toneMap(vec3 c, float exposure){ c = 1.0 - exp(-c * exposure); return pow(c, vec3(1.0 / 2.2)); }
`;

/** GLSL: apparent position of a scene-frame displacement r for observer velocity beta. */
export const ABERRATION_GLSL = /* glsl */ `
uniform vec3 uBeta;
uniform float uAberr;
vec3 apparent(vec3 r){
  float b2 = dot(uBeta, uBeta);
  if (uAberr < 0.5 || b2 < 1e-12) return r;
  float g = inversesqrt(1.0 - b2);
  float k = (g - 1.0) * dot(r, uBeta) / b2 + g * length(r);
  return r + k * uBeta;
}
float dopplerOf(vec3 dir){
  float b2 = dot(uBeta, uBeta);
  return (1.0 + dot(uBeta, dir)) * inversesqrt(1.0 - b2);
}
`;

export interface RelUniforms {
  [k: string]: THREE.IUniform;
  uObs: { value: THREE.Vector3 }; uBeta: { value: THREE.Vector3 };
  uAberr: { value: number }; uDoppler: { value: number }; uBeam: { value: number };
  uMono: { value: number }; uMonoNm: { value: number };
  uTime: { value: number }; uCGrid: { value: number };
  uPeriod: { value: THREE.Vector3 }; uFog: { value: number }; uBg: { value: THREE.Color };
  uBandInv: { value: THREE.Matrix3 }; uExposure: { value: number }; uSun: { value: THREE.Vector3 }; uSurf: { value: THREE.DataTexture };
}

let surfTex: THREE.DataTexture | null = null;
function surfaceTexture(): THREE.DataTexture {
  if (surfTex) return surfTex;
  const n = 256, f = surfaceTable(n);
  const data = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) data[i] = THREE.DataUtils.toHalfFloat(f[i]);
  surfTex = new THREE.DataTexture(data, n, 3, THREE.RGBAFormat, THREE.HalfFloatType);
  surfTex.minFilter = THREE.LinearFilter; surfTex.magFilter = THREE.LinearFilter;
  surfTex.wrapS = surfTex.wrapT = THREE.ClampToEdgeWrapping; surfTex.needsUpdate = true;
  return surfTex;
}

export function makeRelUniforms(): RelUniforms {
  const m = new THREE.Matrix3(); m.fromArray(bandInverseMatrix());
  return {
    uObs: { value: new THREE.Vector3() }, uBeta: { value: new THREE.Vector3() },
    uAberr: { value: 1 }, uDoppler: { value: 1 }, uBeam: { value: 1 },
    uMono: { value: 0 }, uMonoNm: { value: 589 },
    uTime: { value: 0 }, uCGrid: { value: 1 },
    uPeriod: { value: new THREE.Vector3() }, uFog: { value: 190 }, uBg: { value: new THREE.Color(0x06080c) },
    uBandInv: { value: m }, uSurf: { value: surfaceTexture() }, uExposure: { value: 1.6 }, uSun: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
  };
}

const VERT_COMMON = /* glsl */ `
uniform vec3 uObs; uniform vec3 uPeriod;
${ABERRATION_GLSL}
vec3 wrapRel(vec3 d){
  if (uPeriod.x > 0.0) d.x = mod(d.x + 0.5 * uPeriod.x, uPeriod.x) - 0.5 * uPeriod.x;
  if (uPeriod.y > 0.0) d.y = mod(d.y + 0.5 * uPeriod.y, uPeriod.y) - 0.5 * uPeriod.y;
  if (uPeriod.z > 0.0) d.z = mod(d.z + 0.5 * uPeriod.z, uPeriod.z) - 0.5 * uPeriod.z;
  return d;
}
`;

const FRAG_COMMON = /* glsl */ `
uniform vec3 uBeta; uniform float uDoppler; uniform float uBeam; uniform float uMono; uniform float uMonoNm;
uniform float uFog; uniform vec3 uBg; uniform float uExposure; uniform vec3 uSun;
uniform float uTime; uniform float uCGrid;
${COLOR_GLSL}
vec3 shade(vec3 base, vec3 rel){
  float dist = length(rel);
  vec3 dir = rel / max(dist, 1e-6);
  float D = (1.0 + dot(uBeta, dir)) * inversesqrt(1.0 - dot(uBeta, uBeta));
  vec3 col = base;
  if (uMono > 0.5) {
    float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
    col = lineRGB(uDoppler > 0.5 ? uMonoNm / D : uMonoNm) * lum * 1.6;
  } else if (uDoppler > 0.5) {
    col = dopplerSurface(base, D);
  }
  if (uBeam > 0.5) col *= D * D * D * D;
  col = toneMap(col, uExposure);
  return mix(col, uBg, smoothstep(0.55 * uFog, uFog, dist));
}
`;

/** Lit, optionally instanced solid with per-instance colour and light-delayed pulsing. */
export function relSolidMaterial(u: RelUniforms, opts: { pulse?: boolean } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uPulse: { value: opts.pulse ? 1 : 0 } },
    vertexShader: /* glsl */ `
${VERT_COMMON}
varying vec3 vRel; varying vec3 vN; varying vec3 vCol;
void main(){
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vec3 wp = (m * vec4(position, 1.0)).xyz;
  vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 o = origin - uObs;
  vec3 r = (wp - origin) + wrapRel(o);
  vRel = r;
  vN = normalize(mat3(m) * normal);
  vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #endif
  gl_Position = projectionMatrix * viewMatrix * vec4(uObs + apparent(r), 1.0);
}`,
    fragmentShader: /* glsl */ `
${FRAG_COMMON}
varying vec3 vRel; varying vec3 vN; varying vec3 vCol;
uniform float uPulse;
void main(){
  vec3 n = normalize(vN);
  vec3 base = vCol * (0.32 + 0.68 * max(dot(n, uSun), 0.0));
  if (uPulse > 0.5) {
    // The flash you see left the beacon |r|/c ago.
    float ph = fract((uTime - length(vRel) / uCGrid) / 2.0);
    base = vCol * (0.25 + 2.2 * smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.12, 0.3, ph)));
  }
  gl_FragColor = vec4(shade(base, vRel), 1.0);
}`,
  });
}

/** Ground plane that follows the observer; grid lines are drawn from scene coordinates. */
export function relGroundMaterial(u: RelUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
${VERT_COMMON}
varying vec3 vRel;
void main(){
  vec3 r = vec3(position.x, -uObs.y, position.z);
  vRel = r;
  gl_Position = projectionMatrix * viewMatrix * vec4(uObs + apparent(r), 1.0);
}`,
    fragmentShader: /* glsl */ `
${FRAG_COMMON}
uniform vec3 uObs;
varying vec3 vRel;
float gridLine(vec2 p, float spacing, float width){
  vec2 q = p / spacing;
  vec2 f = abs(fract(q - 0.5) - 0.5) / fwidth(q);
  return 1.0 - clamp(min(f.x, f.y) - width, 0.0, 1.0);
}
void main(){
  vec2 p = vRel.xz + uObs.xz;
  float fine = gridLine(p, 1.0, 0.0) * 0.5;
  float coarse = gridLine(p, 10.0, 0.6);
  float lane = (1.0 - smoothstep(2.6, 3.0, abs(mod(p.y + 200.0, 400.0) - 200.0))) * 0.06;
  vec3 base = vec3(0.035, 0.045, 0.06) + lane + vec3(0.25, 0.5, 0.62) * fine + vec3(0.45, 0.8, 0.95) * coarse;
  gl_FragColor = vec4(shade(base, vRel), 1.0);
}`,
  });
}

/**
 * Blackbody lookup: RGB chromaticity in rgb and log10 of visible-band surface
 * brightness (relative to the Sun's) in alpha, along a log-temperature axis.
 */
export const BB_TMIN = 300, BB_TMAX = 3e5;
let bbTex: THREE.DataTexture | null = null;
export function blackbodyTexture(): THREE.DataTexture {
  if (bbTex) return bbTex;
  const n = 512;
  const data = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    const T = BB_TMIN * Math.pow(BB_TMAX / BB_TMIN, i / (n - 1));
    const [r, g, b] = blackbodyRGB(T);
    const lum = Math.max(blackbodyLuminance(T), 1e-30);
    data[4 * i] = THREE.DataUtils.toHalfFloat(r); data[4 * i + 1] = THREE.DataUtils.toHalfFloat(g);
    data[4 * i + 2] = THREE.DataUtils.toHalfFloat(b); data[4 * i + 3] = THREE.DataUtils.toHalfFloat(Math.log10(lum));
  }
  bbTex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  bbTex.minFilter = THREE.LinearFilter; bbTex.magFilter = THREE.LinearFilter;
  bbTex.wrapS = THREE.ClampToEdgeWrapping; bbTex.needsUpdate = true;
  return bbTex;
}

export const BLACKBODY_GLSL = /* glsl */ `
uniform sampler2D uBB;
vec4 blackbody(float T){
  float u = log(clamp(T, ${BB_TMIN.toFixed(1)}, ${BB_TMAX.toFixed(1)}) / ${BB_TMIN.toFixed(1)}) / log(${(BB_TMAX / BB_TMIN).toFixed(1)});
  return texture2D(uBB, vec2(u, 0.5));
}
`;

/**
 * Point stars. Attributes: position (scene frame), aTemp (K), aFlux (visible
 * flux at rest, arbitrary units). A star is a blackbody, so in the moving frame
 * it is a blackbody at D*T; its solid angle shrinks by D^2, which gives the
 * exact visible flux ratio Y(DT) / (D^2 Y(T)).
 */
export function relStarMaterial(u: RelUniforms, opts: { atInfinity?: boolean; sizeScale?: number; far?: number } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uBB: { value: blackbodyTexture() }, uSizeScale: { value: opts.sizeScale ?? 1 }, uPixelRatio: { value: 1 }, uFar: { value: opts.far ?? 900 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
${VERT_COMMON}
${BLACKBODY_GLSL}
uniform float uDoppler; uniform float uBeam; uniform float uSizeScale; uniform float uPixelRatio; uniform float uFar;
attribute float aTemp; attribute float aFlux;
varying vec3 vCol; varying float vAlpha;
void main(){
  ${opts.atInfinity ? 'vec3 r = position;' : 'vec3 r = wrapRel(position - uObs);'}
  float d0 = length(r);
  vec3 dir = r / d0;
  float D = dopplerOf(dir);
  float T = aTemp, flux = aFlux ${opts.atInfinity ? '' : '/ (d0 * d0)'};
  vec4 rest = blackbody(aTemp);
  vec4 bb = rest;
  if (uDoppler > 0.5) { T = aTemp * D; bb = blackbody(T); }
  if (uBeam > 0.5) flux *= pow(10.0, bb.a - rest.a) / (D * D);
  vCol = bb.rgb;
  float mag = clamp(flux, 0.0, 400.0);
  float size = clamp(1.2 + 1.6 * sqrt(mag), 1.2, 22.0);
  vAlpha = clamp(mag * 3.0, 0.0, 1.0) * clamp(mag / 0.02, 0.0, 1.0);
  gl_PointSize = size * uSizeScale * uPixelRatio;
  vec3 ra = apparent(r);
  ${opts.atInfinity ? 'ra = normalize(ra) * uFar;' : ''}
  gl_Position = projectionMatrix * viewMatrix * vec4(uObs + ra, 1.0);
}`,
    fragmentShader: /* glsl */ `
varying vec3 vCol; varying float vAlpha;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float a = exp(-dot(q, q) * 14.0) * vAlpha;
  gl_FragColor = vec4(pow(vCol, vec3(1.0 / 2.2)) * a, a);
}`,
  });
}
