/** Keyboard and pointer state for the 3D view. */
export class Input {
  keys = new Set<string>();
  dragX = 0; dragY = 0; wheel = 0;
  clicks: { x: number; y: number; button: number }[] = [];
  dragging = false;
  mouseX = 0; mouseY = 0;
  pressed = new Set<string>();
  private moved = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.moved = 0; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (this.dragging) { this.dragX += e.movementX; this.dragY += e.movementY; this.moved += Math.abs(e.movementX) + Math.abs(e.movementY); }
    });
    canvas.addEventListener('pointerup', (e) => {
      this.dragging = false;
      if (this.moved < 4) this.clicks.push({ x: e.clientX, y: e.clientY, button: e.button });
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** True once per key press. */
  hit(k: string): boolean { return this.pressed.has(k); }
  down(...ks: string[]): boolean { return ks.some((k) => this.keys.has(k)); }
  axis(neg: string[], pos: string[]): number { return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0); }
  endFrame() { this.dragX = 0; this.dragY = 0; this.wheel = 0; this.clicks.length = 0; this.pressed.clear(); }
}
