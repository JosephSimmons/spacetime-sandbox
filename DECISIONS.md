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
- **Out-of-band light.** A pure three-band model goes black once the bands
  shift out of the visible, which real scenes do not: infrared shifts in to
  replace them. Surfaces are therefore given an infrared reflectance equal to
  their visible luminance and an ultraviolet one at 35% of it. The "sodium-lamp
  world" toggle removes all of this and lights the scene with a single 589 nm
  line, where the colour shift is exact.
- **Auto exposure** in the lab scales exposure by the Doppler factor in the
  direction you are looking, as an adapting eye or camera would. Turn it off to
  see the raw D⁴ beaming.
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

## Solar system

- Bodies interact by Newtonian gravity with a fourth-order symplectic
  integrator. The optional relativistic correction is the first
  post-Newtonian term for the Sun's field only, applied as a velocity kick
  after each step. It reproduces the periapsis advance (tested) but is an
  expansion in v/c, so it is not trustworthy once orbital speeds pass a few
  tenths of c.

- The figure-eight set piece uses the Chenciner-Montgomery initial conditions
  scaled to solar masses and astronomical units. It replaces the planets; the
  relativistic correction is switched off while it runs.

## Cosmology

- The light-cone diagram is in proper distance for an observer today, built
  from the same integrated expansion history as the scale-factor plot.
- Galaxy positions in the 3D view are an illustrative clustered pattern in
  comoving coordinates; only their redshift colouring and the horizon spheres
  come from the model.

## Interstellar flight

- The star field is drawn from a Salpeter-like mass function at 0.004 stars per
  cubic light-year, the density near the Sun, and repeats every 177 light-years.
  Positions are random; these are not catalogue stars.
- Stars are blackbodies, so their shifted colour and visible brightness are
  exact: a star at temperature T is seen at D·T, and its solid angle shrinks by
  D², giving a visible flux ratio Y(DT) / (D² Y(T)).
- The microwave background is drawn as a 2.7255 K blackbody at T·D in each
  direction. Its brightness scale is chosen so it becomes visible at about
  2,000 K, which is where a blackbody starts to glow to the eye.
- The scale axis sets the time rate here: light crosses the field of view in
  four seconds of play.

## Gravitational lens

- Thin-lens approximation with a softened isothermal ellipsoid; the deflection
  is the closed form of Kormann et al. (1994) in Keeton's (2001) notation, and
  the unit tests check that its divergence is twice the convergence.
- Distances use the Planck 2018 cosmology regardless of the cosmology
  station's dials.
- The quoted mass is that of a singular isothermal sphere inside its Einstein
  radius, π σ² θ_E D_l / G. For an elliptical or cored lens it is a guide.
- The image count comes from which caustics enclose the source centre, so it
  describes a point source. The magnification is for the extended source, by
  inverse ray shooting.
- Background galaxies are a random field, not a catalogue.

## Scale axis

- **Stations whose size depends on the constants move along the axis.** The
  hydrogen atom and the argon box scale as ħ² (the Bohr radius); the black hole
  scales as GM/c². When a dial moves the station you are in, the view moves
  with it. Bands can overlap as a result; the station you are in keeps priority
  until you leave its band.
- **Argon under a changed ħ** only changes size here. Its binding energy and
  therefore its melting point would change too; that is not modelled.
- **In the relativity lab the scale axis sets the grid spacing**, so the same
  speed of light covers fewer cells per second on a larger grid.

## Challenges

- Eighteen optional goals read each station's `probe()` values. Progress is
  kept in the browser's local storage and can be cleared from the panel.
- The galaxy's "reference curve" target is reachable (best χ² about 0.01);
  without a halo the best possible within the dial ranges is about 16.
