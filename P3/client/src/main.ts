import { Simulation } from './core/Simulation';
import { Scene } from './render/Scene';
import { Controls } from './ui/Controls';

// Bootstrap de la Fase 2: simulación (núcleo) + escena 3D + panel de control.
const SEED = 12345;
const RATE = 0.3; // vehículos por segundo por acceso

const sim = new Simulation({ seed: SEED, rate: RATE });

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const escena = new Scene(canvas, sim);
new Controls(sim, escena, SEED, RATE);
escena.start();

console.log('🚦 Semáforo Inteligente 3D — Fase 2 (modo tradicional, reproducible por semilla)');
