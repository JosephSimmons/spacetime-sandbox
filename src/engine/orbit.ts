import * as THREE from 'three';
import type { Input } from './input';

/** Drag-to-orbit camera rig. Distance is set by the station from the scale axis. */
export class OrbitRig {
  theta = 0.6; phi = 1.1; dist = 10;
  target = new THREE.Vector3();
  up: 'y' | 'z' = 'y';
  minPhi = 0.02; maxPhi = Math.PI - 0.02;

  drag(input: Input, speed = 0.005) {
    this.theta -= input.dragX * speed;
    this.phi = Math.min(this.maxPhi, Math.max(this.minPhi, this.phi - input.dragY * speed));
  }

  apply(cam: THREE.PerspectiveCamera) {
    const s = Math.sin(this.phi), c = Math.cos(this.phi);
    if (this.up === 'y') {
      cam.up.set(0, 1, 0);
      cam.position.set(this.target.x + this.dist * s * Math.sin(this.theta), this.target.y + this.dist * c, this.target.z + this.dist * s * Math.cos(this.theta));
    } else {
      cam.up.set(0, 0, 1);
      cam.position.set(this.target.x + this.dist * s * Math.cos(this.theta), this.target.y + this.dist * s * Math.sin(this.theta), this.target.z + this.dist * c);
    }
    cam.lookAt(this.target);
    cam.near = Math.max(this.dist * 1e-3, 1e-6); cam.far = this.dist * 1e4;
    cam.updateProjectionMatrix();
  }
}
