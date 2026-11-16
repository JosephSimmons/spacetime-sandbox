import * as THREE from 'three';
import type { Panel } from '../ui/kit';
import type { Input } from './input';
import type { Labels } from './labels';

/** Multipliers applied to the SI values of the constants of nature. */
export interface Consts { c: number; G: number; hbar: number; }

export interface ViewRect { x: number; y: number; w: number; h: number; }

export interface Ctx {
  renderer: THREE.WebGLRenderer;
  consts: Consts;
  /** log10 of the field of view in metres: the position on the scale axis. */
  logScale: number;
  input: Input;
  labels: Labels;
  view: ViewRect;
  paused: boolean;
  /** Seconds since start (real time). */
  clock: number;
  toast(msg: string): void;
  setLogScale(v: number): void;
  constsChanged(): void;
}

/**
 * A station is a self-contained simulation anchored at a band of the scale
 * axis. It owns a scene in its own natural units, a pair of panels, and a
 * probe of named numbers that challenges can read.
 */
export abstract class Station {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly blurb: string;
  /** Extent of the band below and above its centre, in decades. */
  abstract readonly reach: [number, number];
  /** Which global constants this station responds to. */
  readonly uses: (keyof Consts)[] = [];
  readonly hint: string = 'drag to orbit · scroll to change scale';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1e6);
  built = false;

  /** Centre of the band on the scale axis; may move when constants change. */
  abstract centre(c: Consts): number;
  band(c: Consts): [number, number] { const m = this.centre(c); return [m - this.reach[0], m + this.reach[1]]; }

  abstract build(ctx: Ctx): void;
  abstract panels(left: Panel, right: Panel, ctx: Ctx): void;
  abstract update(dt: number, ctx: Ctx): void;
  enter(_ctx: Ctx): void {}
  leave(_ctx: Ctx): void {}
  /** Low-rate refresh for readouts and plots. */
  refresh(_ctx: Ctx): void {}
  reset(_ctx: Ctx): void {}
  render(ctx: Ctx): void { ctx.renderer.render(this.scene, this.camera); }
  /** Named values for the challenge layer. */
  probe(_ctx: Ctx): Record<string, number> { return {}; }
  onConsts(_ctx: Ctx): void {}
}
