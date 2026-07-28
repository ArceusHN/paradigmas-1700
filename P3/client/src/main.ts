import { Simulation } from './core/Simulation';
import { NetworkSimulation, type RedConfig } from './core/Network';
import { Scene } from './render/Scene';
import { RedScene } from './render/RedScene';
import { Controls } from './ui/Controls';
import { RedControls } from './ui/RedControls';
import { WokwiBridge } from './wokwi/Bridge';
import { RedBridge } from './wokwi/RedBridge';
import { setFase } from './ui/Shell';

/**
 * Bootstrap con dos vistas:
 *   (default)      → Fase 4: red de semáforos coordinada (cuadrícula 3×3)
 *   ?vista=cruce   → Fase 3: intersección única con sensores y peatones
 */
const SEED = 12345;

function bootCruce(): void {
  const RATE = 0.3;
  setFase('Fase 3 — intersección con sensores');
  const sim = new Simulation({ seed: SEED, rate: RATE });
  const bridge = new WokwiBridge(sim);

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const escena = new Scene(canvas, sim);
  new Controls(sim, escena, SEED, RATE, bridge);

  const hud = escena.onStats;
  escena.onStats = (s) => {
    hud?.(s);
    bridge.publicarEstado(s.ns, s.ew);
  };
  escena.start();
  console.log('🚦 Semáforo Inteligente 3D — vista cruce (Fase 3 + puente Wokwi)');
}

function bootRed(): void {
  setFase('Fase 4 — red coordinada 3×3');
  // Demanda media: red activa pero calmada. El contraste del A/B es más suave
  // que a demanda alta, pero se observa mejor el comportamiento. Ver red-smoke.
  let cfg: RedConfig = { seed: SEED, rate: 0.14, coordinado: true };

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const escena = new RedScene(canvas, new NetworkSimulation(cfg));
  const bridge = new RedBridge();

  let horaActual = 12;
  const controls = new RedControls(
    escena,
    SEED,
    {
      reset(cambios) {
        cfg = { ...cfg, ...cambios };
        escena.reemplazar(new NetworkSimulation(cfg));
        escena.sim.setHora(horaActual);
        conectarSim();
      },
      congestion(nodo, acceso) {
        escena.sim.generarCongestion(nodo, 24, 'ui', acceso);
        controls.registrarTexto(`⚠ congestión generada en ${nodo}${acceso ? ` (acceso ${acceso})` : ''}`);
      },
      colision(nodo, acceso) {
        // El bus narra el incidente; solo avisamos si no se pudo provocar.
        if (!escena.sim.provocarColision(nodo, 'ui', acceso)) {
          controls.registrarTexto(
            acceso
              ? `sin acceso ${acceso} libre en ${nodo} (ya bloqueado o en enfriamiento)`
              : `no se pudo provocar la colisión en ${nodo}`,
          );
        }
      },
      carro() {
        escena.sim.inyectarCarro('ui');
      },
      peaton(nodo) {
        escena.sim.pedirPeaton(nodo, 'ui');
        controls.registrarTexto(`🚶 peatón esperando en ${nodo}`);
      },
      ambulancia() {
        escena.sim.enviarAmbulancia('ui');
        controls.registrarTexto('🚑 ambulancia en camino — verde en cascada');
      },
      hora(h) {
        horaActual = h;
        escena.sim.setHora(h);
      },
      seguir(nodo) {
        const id = escena.sim.seguirAuto(nodo);
        controls.setFoco(id);
        controls.registrarTexto(
          id !== null ? `🔍 siguiendo al auto #${id} (pasa por ${nodo})` : `sin autos que pasen por ${nodo} ahora`,
        );
      },
      dejarDeSeguir() {
        controls.setFoco(null);
      },
      setAutoDespeje(auto) {
        escena.sim.setAutoDespeje(auto);
      },
      despejarColision(arista) {
        escena.sim.despejarColision(arista);
      },
      despejarTodas() {
        escena.sim.despejarTodas();
      },
    },
    true,
  );

  // El bus de la sim actual alimenta el log de la UI y el espejo MQTT.
  const conectarSim = () => {
    escena.sim.bus.espejo = (topic, msg) => bridge.espejarBus(topic, msg);
    escena.sim.bus.subscribe('red/eventos', (_t, msg) =>
      controls.registrarMensaje(msg, escena.sim.simTime),
    );
  };
  conectarSim();

  bridge.onStatus = (ok) => controls.setWokwi(ok);
  // Los botones físicos respetan el nodo y el acceso elegidos en el panel.
  bridge.onCongestion = (nodo) => {
    const destino = nodo ?? controls.nodoActivo;
    escena.sim.generarCongestion(destino, 24, 'wokwi', controls.accesoActivo);
    controls.registrarTexto(`⚠ congestión generada en ${destino} — desde Wokwi`);
  };
  bridge.onColision = (nodo) => {
    // el bus narra el incidente
    escena.sim.provocarColision(nodo ?? controls.nodoActivo, 'wokwi', controls.accesoActivo);
  };
  bridge.onCarro = () => {
    escena.sim.inyectarCarro('wokwi');
    controls.registrarTexto('🚗 carro inyectado — desde Wokwi');
  };
  bridge.onPeaton = () => {
    escena.sim.pedirPeaton(controls.nodoActivo, 'wokwi');
    controls.registrarTexto(`🚶 peatón esperando en ${controls.nodoActivo} — desde Wokwi`);
  };
  bridge.onAmbulancia = () => {
    escena.sim.enviarAmbulancia('wokwi');
    controls.registrarTexto('🚑 ambulancia en camino — desde Wokwi');
  };

  escena.onStats = (s) => {
    controls.render(s);
    // Los incidentes se narran por el bus (registrarMensaje); los roces del
    // detector quedan solo como contador en el HUD para no saturar el log.
    const luzNodo = s.luces[controls.nodoActivo];
    if (luzNodo) bridge.publicarEstado(luzNodo.ns, luzNodo.ew);
  };
  escena.start();
  console.log('🚦 Semáforo Inteligente 3D — vista red (Fase 4: cuadrícula + eventos + MQTT)');
}

const vista = new URLSearchParams(location.search).get('vista');
if (vista === 'cruce') bootCruce();
else bootRed();
