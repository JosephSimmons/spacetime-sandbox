import { App } from './engine/app';
import { LabStation } from './stations/lab';
import { SolarStation } from './stations/solar';
import { BlackHoleStation } from './stations/blackhole';

const app = new App([new LabStation(), new BlackHoleStation(), new SolarStation()], 1);
(window as any).__app = app;
app.start();
