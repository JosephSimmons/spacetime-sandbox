import * as THREE from 'three';
import type { ViewRect } from './types';

/** Pool of HTML labels pinned to world positions. Call begin(), put()..., end() each frame. */
export class Labels {
  private pool: HTMLDivElement[] = [];
  private used = 0;
  private v = new THREE.Vector3();
  constructor(private root: HTMLElement) {}

  begin() { this.used = 0; }

  put(text: string, pos: THREE.Vector3, cam: THREE.Camera, view: ViewRect, strong = false) {
    this.v.copy(pos).project(cam);
    if (this.v.z > 1 || this.v.z < -1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) return;
    this.at(text, view.x + (this.v.x * 0.5 + 0.5) * view.w, view.y + (-this.v.y * 0.5 + 0.5) * view.h, strong);
  }

  at(text: string, x: number, y: number, strong = false) {
    let d = this.pool[this.used];
    if (!d) { d = document.createElement('div'); this.root.append(d); this.pool.push(d); }
    this.used++;
    const cls = strong ? 'wlabel strong' : 'wlabel';
    if (d.className !== cls) d.className = cls;
    if (d.textContent !== text) d.textContent = text;
    d.style.display = '';
    d.style.left = `${x.toFixed(1)}px`; d.style.top = `${y.toFixed(1)}px`;
  }

  end() { for (let i = this.used; i < this.pool.length; i++) this.pool[i].style.display = 'none'; }
}
