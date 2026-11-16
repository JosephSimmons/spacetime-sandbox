/** The scale axis: limits and the landmark sizes shown between stations. */
export const SCALE_MIN = -15.5;
export const SCALE_MAX = 27.2;

export interface Landmark { name: string; size: number; }

/** Characteristic sizes in metres (diameters or distances), small to large. */
export const LANDMARKS: Landmark[] = [
  { name: 'proton', size: 1.7e-15 },
  { name: 'gold nucleus', size: 1.4e-14 },
  { name: 'electron Compton wavelength', size: 2.43e-12 },
  { name: 'hydrogen atom', size: 1.06e-10 },
  { name: 'water molecule', size: 2.8e-10 },
  { name: 'DNA helix width', size: 2e-9 },
  { name: 'ribosome', size: 2.5e-8 },
  { name: 'virus', size: 1e-7 },
  { name: 'wavelength of green light', size: 5.5e-7 },
  { name: 'red blood cell', size: 7.5e-6 },
  { name: 'human hair width', size: 7e-5 },
  { name: 'grain of sand', size: 5e-4 },
  { name: 'ant', size: 4e-3 },
  { name: 'tennis ball', size: 6.7e-2 },
  { name: 'human', size: 1.7 },
  { name: 'blue whale', size: 30 },
  { name: 'Eiffel Tower', size: 330 },
  { name: 'Mount Everest', size: 8.85e3 },
  { name: 'neutron star', size: 2.4e4 },
  { name: 'Great Britain', size: 9.7e5 },
  { name: 'Moon', size: 3.47e6 },
  { name: 'Earth', size: 1.274e7 },
  { name: 'Jupiter', size: 1.4e8 },
  { name: 'Earth to Moon', size: 3.84e8 },
  { name: 'Sun', size: 1.39e9 },
  { name: 'Betelgeuse', size: 1.2e12 },
  { name: '1 AU', size: 1.496e11 },
  { name: "Neptune's orbit", size: 9e12 },
  { name: 'heliopause', size: 3.6e13 },
  { name: 'light-year', size: 9.46e15 },
  { name: 'Oort cloud', size: 3e16 },
  { name: 'distance to Alpha Centauri', size: 4.1e16 },
  { name: 'Orion Nebula', size: 2.3e17 },
  { name: 'globular cluster', size: 1.5e18 },
  { name: 'thickness of the Milky Way disc', size: 1e19 },
  { name: 'Milky Way', size: 9.5e20 },
  { name: 'distance to Andromeda', size: 2.4e22 },
  { name: 'Local Group', size: 9.5e22 },
  { name: 'distance to the Virgo Cluster', size: 5e23 },
  { name: 'Laniakea supercluster', size: 4.9e24 },
  { name: 'baryon acoustic scale', size: 4.6e24 },
  { name: 'observable universe', size: 8.8e26 },
].sort((a, b) => a.size - b.size);

/** Unit names at each third decade, for the ruler. */
export const DECADE_UNITS: [number, string][] = [
  [-15, '1 fm'], [-12, '1 pm'], [-9, '1 nm'], [-6, '1 µm'], [-3, '1 mm'], [0, '1 m'], [3, '1 km'], [6, '1000 km'],
  [9, '10⁶ km'], [11.175, '1 AU'], [13, '67 AU'], [15.976, '1 ly'], [18.976, '1 kly'], [21.976, '1 Mly'], [24.976, '1 Gly'],
];
