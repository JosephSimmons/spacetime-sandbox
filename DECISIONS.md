# Decisions

Calls made during the build, so they can be reviewed or overturned. Newest last.

## Structure

- **Physics is a separate, tested core.** Everything in `src/physics` is plain
  TypeScript with no rendering code, checked by `npm test` against analytic or
  tabulated results. Rendering code and shaders call into it or mirror it.
- **Each station works in its own natural units** (Bohr radii, AU, kpc, Mpc,
  gravitational radii). This sidesteps the floating-point problems of putting
  forty orders of magnitude in one coordinate system. The scale axis moves you
  between stations; between them is a "corridor" of landmark sizes, which is
  scenery and not simulation.
- **Single-file build.** `npm run build` produces one self-contained
  `dist/index.html`.

## Physics

- **Relativistic optics** are done by Lorentz-transforming each vertex's
  emission event into the ship's frame. For objects at rest in the scene this is
  exact and gives aberration, apparent contraction and Terrell rotation together.
  Objects moving within the scene (planets, stars) are treated as slow: their
  own light-travel delay is ignored.
- **Doppler colour** treats a surface colour as three narrow bands (610, 550,
  465 nm), shifts each, and re-projects through the CIE colour-matching
  functions. Real surfaces have broad spectra, so this is a model of the effect,
  not a spectral renderer. Blackbody sources (stars, the accretion disc) are
  exact: a Doppler-shifted blackbody is a blackbody at temperature D·T.
- **Beaming** scales bolometric intensity as D⁴.
- **The player's proper time drives the simulation.** World time advances by
  γ dτ, so time dilation is something you experience, not just a readout.
- **Black hole** is Schwarzschild (non-rotating). Rays are traced with the exact
  null-geodesic orbit equation. The accretion disc is a thin, flat disc on
  circular geodesics with a Shakura-Sunyaev temperature profile; its Doppler and
  gravitational shifts are exact for that model. No Kerr, no disc thickness.
- **Galaxy** stars are test particles integrated in an analytic potential
  (Hernquist bulge, Miyamoto-Nagai disc, NFW halo). There is no self-gravity,
  so spiral structure here is kinematic winding, not a density wave. The
  "observed" rotation-curve points are illustrative values for a Milky-Way-like
  spiral, not survey data.
- **Star** uses empirical main-sequence scaling relations plus a polytrope for
  the interior. The G dial scales luminosity as G⁴ (homology with
  electron-scattering opacity) and leaves the radius relation alone.
- **Hydrogen** is non-relativistic with infinite nuclear mass. Turning ħ or c
  far enough that the fine-structure constant approaches 1 breaks that
  approximation; the panel warns when it does.
- **Molecular dynamics** is Lennard-Jones argon in reduced units with a
  2.5σ shifted cutoff.
