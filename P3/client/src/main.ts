import { Simulation } from './core/Simulation';
import { Scene } from './render/Scene';
import { Controls } from './ui/Controls';
import { WokwiBridge } from './wokwi/Bridge';

// Bootstrap de la Fase 3.5: simulación (núcleo) + escena 3D + panel + puente Wokwi.
const SEED = 12345;
const RATE = 0.3; // vehículos por segundo por acceso

const sim = new Simulation({ seed: SEED, rate: RATE });
const bridge = new WokwiBridge(sim);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const escena = new Scene(canvas, sim);
new Controls(sim, escena, SEED, RATE, bridge);

// El HUD ya consume onStats (lo instala Controls); encadenamos la publicación
// del estado hacia el ESP32 — el Bridge solo publica cuando la fase cambia.
const hud = escena.onStats;
escena.onStats = (s) => {
  hud?.(s);
  bridge.publicarEstado(s.ns, s.ew);
};

escena.start();

console.log('🚦 Semáforo Inteligente 3D — Fase 3.5 (sensores UI + puente Wokwi/MQTT)');
