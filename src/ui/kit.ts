/** Minimal DOM toolkit for the instrument panels. */
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(e.style, v);
    else (e as any)[k] = v;
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

export interface DialOpts {
  label: string; min: number; max: number; value: number;
  log?: boolean; step?: number;
  fmt?: (v: number) => string;
  onChange?: (v: number) => void;
}

export class Dial {
  el: HTMLElement; value: number; readonly def: number;
  private input: HTMLInputElement; private out: HTMLElement;
  constructor(private o: DialOpts) {
    this.value = o.value; this.def = o.value;
    this.out = el('output');
    this.input = el('input', { type: 'range', min: '0', max: '1000', step: '1' });
    this.el = el('div', { class: 'dial' }, el('div', { class: 'row' }, el('label', { text: o.label }), this.out), this.input);
    this.input.addEventListener('input', () => { this.value = this.fromPos(+this.input.value / 1000); this.sync(false); o.onChange?.(this.value); });
    this.input.addEventListener('dblclick', () => this.set(this.def, true));
    this.input.title = 'Double-click to reset';
    this.sync(true);
  }
  private fromPos(p: number): number {
    const { min, max, log, step } = this.o;
    let v = log ? min * Math.pow(max / min, p) : min + (max - min) * p;
    if (step) v = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, v));
  }
  private toPos(v: number): number {
    const { min, max, log } = this.o;
    return log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  }
  private sync(moveThumb: boolean) {
    if (moveThumb) this.input.value = String(Math.round(this.toPos(this.value) * 1000));
    this.out.textContent = this.o.fmt ? this.o.fmt(this.value) : String(this.value);
  }
  set(v: number, fire = false) { this.value = Math.min(this.o.max, Math.max(this.o.min, v)); this.sync(true); if (fire) this.o.onChange?.(this.value); }
  refresh() { this.sync(false); }
}

export class Readouts {
  el = el('dl', { class: 'readouts' });
  private cells = new Map<string, HTMLElement>();
  constructor(labels: string[]) {
    for (const l of labels) {
      const dd = el('dd', { text: '—' });
      this.el.append(el('dt', { text: l }), dd);
      this.cells.set(l, dd);
    }
  }
  set(label: string, value: string, cls = '') {
    const c = this.cells.get(label);
    if (!c) return;
    if (c.textContent !== value) c.textContent = value;
    if (c.className !== cls) c.className = cls;
  }
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'toggle' }, input, label);
}

export function button(label: string, onClick: () => void): HTMLButtonElement {
  return el('button', { text: label, onclick: onClick });
}

export function select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = el('select');
  for (const [v, l] of options) s.append(el('option', { value: v, text: l, selected: v === value }));
  s.addEventListener('change', () => onChange(s.value as T));
  return s;
}

/** Fluent builder for one side panel. */
export class Panel {
  constructor(public root: HTMLElement) {}
  clear() { this.root.replaceChildren(); return this; }
  title(t: string) { this.root.append(el('h2', { text: t })); return this; }
  blurb(t: string) { this.root.append(el('p', { class: 'blurb', text: t })); return this; }
  note(t: string) { const p = el('p', { class: 'note', text: t }); this.root.append(p); return p; }
  warn(t = '') { const p = el('p', { class: 'warn', text: t }); this.root.append(p); return p; }
  section(t: string) { this.root.append(el('h3', { text: t })); return this; }
  dial(o: DialOpts) { const d = new Dial(o); this.root.append(d.el); return d; }
  readouts(labels: string[]) { const r = new Readouts(labels); this.root.append(r.el); return r; }
  toggle(label: string, v: boolean, cb: (v: boolean) => void) { this.root.append(toggle(label, v, cb)); return this; }
  buttons(...b: HTMLElement[]) { this.root.append(el('div', { class: 'btnrow' }, ...b)); return this; }
  add<T extends Node>(n: T) { this.root.append(n); return n; }
}
