# Spacetime Sandbox

A browser physics sandbox built with Three.js and TypeScript. Fly a probe along
a logarithmic scale axis from the hydrogen atom to the cosmic web, and turn the
constants of nature (c, G, ħ) to bring relativity and quantum effects to
whatever scale you are at.

## Run it

```bash
npm install
npm run dev      # development server
npm test         # physics unit tests
npm run build    # single self-contained dist/index.html
```

## Layout

- `src/physics` — rendering-free physics core, unit-tested
- `src/engine` — app loop, scale axis, ship, relativistic materials
- `src/stations` — one module per station
- `src/ui` — instrument panel, dials, plots
- `src/challenges` — optional goals layered on the sandbox
- `tests` — tests of the physics core against known results
- `DECISIONS.md` — modelling choices and approximations
