/**
 * The view between stations: nested rings for landmark sizes and a
 * self-similar point field that streams as the scale changes. Scenery only.
 */
import * as THREE from 'three';
import { LANDMARKS } from './scale';
import type { Ctx } from './types';
import { length } from '../ui/format';

export class Corridor {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  private rings: THREE.LineLoop[] = [];
  private dust: THREE.Points;
  private dustLog: Float32Array;
  private dustDir: Float32Array;
  private spin = 0;
  extra: { name: string; size: number }[] = [];
  private extraRings: THREE.LineLoop[] = [];

  constructor() {
    const circle = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(Math.cos(a), Math.sin(a), 0); }
    circle.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mk = (color: number) => new THREE.LineLoop(circle, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthTest: false }));
    for (let i = 0; i < LANDMARKS.length; i++) { const r = mk(0xffb454); this.rings.push(r); this.scene.add(r); }
    for (let i = 0; i < 12; i++) { const r = mk(0x6fd3ff); r.visible = false; this.extraRings.push(r); this.scene.add(r); }

    const n = 2600;
    this.dustLog = new Float32Array(n); this.dustDir = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.dustLog[i] = Math.random() * 4;
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      this.dustDir.set([s * Math.cos(t), s * Math.sin(t), u * 0.6], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8fb4d4, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthTest: false }));
    this.scene.add(this.dust);
    this.camera.position.set(0, 0, 3);
  }

  update(dt: number, ctx: Ctx) {
    this.camera.aspect = ctx.view.w / ctx.view.h; this.camera.updateProjectionMatrix();
    this.spin += dt * 0.02;
    const field = Math.pow(10, ctx.logScale);
    const place = (ring: THREE.LineLoop, size: number, name: string, strong: boolean) => {
      const r = size / 2 / field * 2.2;
      const vis = r > 0.004 && r < 14;
      ring.visible = vis;
      if (!vis) return;
      ring.scale.setScalar(r);
      const fade = Math.min(1, r * 12) * Math.min(1, Math.max(0, (14 - r) / 10));
      (ring.material as THREE.LineBasicMaterial).opacity = (strong ? 0.95 : 0.7) * fade;
      if (r > 0.03 && r < 2.6) {
        const a = 0.5 + (Math.log10(size) % 1) * 0.9;
        ctx.labels.put(`${name} · ${length(size)}`, new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0), this.camera, ctx.view, strong);
      }
    };
    LANDMARKS.forEach((l, i) => place(this.rings[i], l.size, l.name, false));
    this.extraRings.forEach((ring, i) => {
      const e = this.extra[i];
      if (!e) { ring.visible = false; return; }
      place(ring, e.size, e.name, true);
    });
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.dustLog.length; i++) {
      const l = (((this.dustLog[i] - ctx.logScale) % 4) + 4) % 4;
      const r = Math.pow(10, l - 2.4);
      arr[3 * i] = this.dustDir[3 * i] * r; arr[3 * i + 1] = this.dustDir[3 * i + 1] * r; arr[3 * i + 2] = this.dustDir[3 * i + 2] * r;
    }
    pos.needsUpdate = true;
    this.dust.rotation.z = this.spin;
  }

  render(ctx: Ctx) { ctx.renderer.render(this.scene, this.camera); }
}
