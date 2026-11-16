# Spacetime Sandbox

A browser physics sandbox built with Three.js and TypeScript. Fly a probe along
a logarithmic scale axis from the hydrogen atom to the cosmic web, and turn the
constants of nature (c, G, ħ) to bring relativity and quantum effects to
whatever scale you are at.

## Stations

| Key | Station | Scale | What is simulated |
|---|---|---|---|
| 1 | Hydrogen atom | 10⁻¹⁰ m | Orbitals sampled from the exact wavefunctions; superpositions beating at the transition frequency |
| 2 | Atoms in motion | 10⁻⁹ m | Lennard-Jones argon, velocity Verlet, measured T, P, g(r) |
| 3 | Relativity lab | 1 m – 1 km | Flight through a lattice with aberration, Doppler shift and beaming; proper time; spacetime diagram |
| 4 | Black hole | 10⁴–10⁷ m | Schwarzschild null geodesics traced per pixel; accretion disc with exact shifts; test-particle orbits |
| 5 | Star | 10⁹ m | Main-sequence scaling relations; Lane–Emden polytrope interior; HR diagram |
| 6 | Solar system | 10¹¹–10¹³ m | Sun and planets from J2000 elements, fourth-order symplectic N-body |
| 7 | Among the stars | 10¹⁷ m | Relativistic flight at 1 g through the solar neighbourhood; exact blackbody Doppler; blueshifted microwave background |
| 8 | Galaxy | 10²¹ m | 26,000 test-particle stars in a bulge + disc + NFW halo potential; rotation curve |
| 9 | Cosmos | 10²⁶ m | Friedmann models: age, fate, distances, expansion history |

The dials at the top multiply c, G and ħ. Scroll, or drag the ruler, to move along the scale axis.

## Run it

```bash
npm install
npm run dev      # development server
npm test         # physics unit tests
npm run build    # single self-contained dist/index.html
node scripts/smoke.mjs   # headless check of every station (needs Chrome and Playwright)
```

## Layout

- `src/physics` — rendering-free physics core, unit-tested
- `src/engine` — app loop, scale axis, ship, relativistic materials
- `src/stations` — one module per station
- `src/ui` — instrument panel, dials, plots
- `src/challenges` — optional goals layered on the sandbox
- `tests` — tests of the physics core against known results
- `DECISIONS.md` — modelling choices and approximations
