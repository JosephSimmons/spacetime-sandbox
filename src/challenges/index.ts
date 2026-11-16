/** Optional goals layered on the sandbox. Each reads the active station's probe. */
import type { App } from '../engine/app';
import { el, button } from '../ui/kit';

type Probe = Record<string, number>;
export interface Challenge { id: string; station: string; title: string; text: string; done: (p: Probe) => boolean; }

export const CHALLENGES: Challenge[] = [
  { id: 'muon', station: 'lab', title: 'Outrun the clock', text: 'Slow light to 30 m/s, start a muon run, and deliver the particle before its lifetime runs out. At rest it could cover a third of the distance.', done: (p) => p.runArrived === 1 },
  { id: 'twin', station: 'lab', title: 'The younger twin', text: 'Travel, then brake to rest, with the lattice clocks at least ten seconds ahead of your own.', done: (p) => p.t - p.tau >= 10 && p.beta < 0.01 },
  { id: 'photon-sphere', station: 'blackhole', title: 'Where light orbits', text: 'Hover within 2% of the photon sphere, at 3 GM/c². Look sideways with the celestial grid on.', done: (p) => Math.abs(p.r - 3) < 0.06 },
  { id: 'precession', station: 'blackhole', title: 'A rosette', text: 'Set up a test orbit whose periapsis advances by at least 90° every turn.', done: (p) => p.precessionDeg >= 90 },
  { id: 'second-earth', station: 'solar', title: 'A second Earth', text: 'Add a body that settles on a bound, near-circular orbit (e < 0.1) between 0.95 and 1.37 AU.', done: (p) => p.habitableAdded === 1 },
  { id: 'eject', station: 'solar', title: 'Lose a planet', text: 'Get at least one body thrown out of the system or into the Sun. Gravity, mass or a passing visitor will all do it.', done: (p) => p.ejected >= 1 },
  { id: 'fit-curve', station: 'galaxy', title: 'Weigh the dark matter', text: 'Tune the halo, disc and bulge until the rotation curve matches the reference points with χ² below 0.15. Without a halo, the best possible is about 16.', done: (p) => p.misfit < 0.15 },
  { id: 'unbind', station: 'galaxy', title: 'What holds it together', text: 'Remove the dark matter and keep watching until at least 3% of the stars have drifted beyond 150 kpc.', done: (p) => p.halo === 0 && p.escapedFrac >= 0.03 },
  { id: 'tension', station: 'cosmos', title: 'The Hubble tension', text: 'Build a flat universe that is 13.8 billion years old (within 0.05) with H₀ between 72.5 and 73.5.', done: (p) => p.flat === 1 && Math.abs(p.age - 13.8) < 0.05 && p.H0 >= 72.5 && p.H0 <= 73.5 },
  { id: 'crunch', station: 'cosmos', title: 'Big Crunch', text: 'Make a universe that stops expanding and falls back in on itself.', done: (p) => p.recollapses === 1 },
  { id: 'o-star', station: 'star', title: 'Live fast', text: 'Make an O-type star, hotter than 30,000 K, and read off how long it lasts.', done: (p) => p.T >= 30000 },
  { id: 'long-lived', station: 'star', title: 'Outlast the universe', text: 'Make a star with a main-sequence lifetime above 100 billion years.', done: (p) => p.lifetime > 100 },
  { id: 'visible-lyman', station: 'hydrogen', title: 'Lyman-alpha you can see', text: 'With states n = 1 and n = 2 selected, change ħ until the light of that transition falls in the visible band, 380 to 750 nm.', done: (p) => Math.min(p.nA, p.nB) === 1 && Math.max(p.nA, p.nB) === 2 && p.lambda >= 380 && p.lambda <= 750 },
  { id: 'freeze', station: 'md', title: 'Freeze it', text: 'Cool and compress the argon until it holds a crystal below 60 K.', done: (p) => p.solid === 1 && p.T < 60 },
];

const KEY = 'spacetime-sandbox.challenges';

export class Challenges {
  private doneIds = new Set<string>();
  private root = document.getElementById('challenges')!;
  private btn = document.getElementById('btnChallenges')!;

  constructor(private app: App) {
    try { for (const id of JSON.parse(localStorage.getItem(KEY) || '[]')) this.doneIds.add(id); } catch { /* storage unavailable */ }
    this.btn.addEventListener('click', () => { this.root.classList.toggle('hidden'); this.render(); });
    app.refreshHooks.push(() => this.check());
    this.label();
  }

  private label() { this.btn.textContent = `Challenges ${this.doneIds.size}/${CHALLENGES.length}`; }

  private check() {
    const st = this.app.active;
    if (!st) return;
    const probe = st.probe(this.app.ctx);
    for (const c of CHALLENGES) {
      if (c.station !== st.id || this.doneIds.has(c.id)) continue;
      let ok = false;
      try { ok = c.done(probe); } catch { ok = false; }
      if (!ok) continue;
      this.doneIds.add(c.id);
      try { localStorage.setItem(KEY, JSON.stringify([...this.doneIds])); } catch { /* storage unavailable */ }
      this.app.toast(`Challenge complete: ${c.title}`);
      this.label();
      if (!this.root.classList.contains('hidden')) this.render();
    }
  }

  private render() {
    const r = this.root;
    r.replaceChildren(el('h2', { text: 'Challenges' }), el('p', { class: 'blurb', text: 'Optional goals. The sandbox does not need them, but each one points at something worth seeing.' }));
    for (const c of CHALLENGES) {
      const st = this.app.stations.find((s) => s.id === c.station);
      const done = this.doneIds.has(c.id);
      r.append(el('div', { class: `chal${done ? ' done' : ''}` },
        el('span', { class: 'st', text: done ? 'done' : st?.name ?? '' }),
        el('h4', { text: c.title }), el('p', { text: c.text }),
        button(`Go to ${st?.name ?? 'station'}`, () => { this.app.jump(c.station); r.classList.add('hidden'); }),
      ));
    }
    r.append(el('div', { class: 'btnrow' },
      button('Close', () => r.classList.add('hidden')),
      button('Clear progress', () => { this.doneIds.clear(); try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } this.label(); this.render(); }),
    ));
  }
}
