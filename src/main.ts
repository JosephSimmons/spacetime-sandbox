import { App } from './engine/app';
import { HydrogenStation } from './stations/hydrogen';
import { MDStation } from './stations/md';
import { LabStation } from './stations/lab';
import { BlackHoleStation } from './stations/blackhole';
import { StarStation } from './stations/star';
import { SolarStation } from './stations/solar';
import { GalaxyStation } from './stations/galaxy';
import { CosmosStation } from './stations/cosmos';
import { Challenges } from './challenges';

// Ordered small to large; number keys 1-8 jump to them in this order.
const stations = [
  new HydrogenStation(), new MDStation(), new LabStation(), new BlackHoleStation(),
  new StarStation(), new SolarStation(), new GalaxyStation(), new CosmosStation(),
];
const app = new App(stations, 1);
new Challenges(app);
(window as any).__app = app;
app.start();
