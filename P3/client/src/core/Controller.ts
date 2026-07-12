import type { Group, LightState } from 'shared';
import { TrafficLight } from './TrafficLight';

interface Phase {
  ns: LightState;
  ew: LightState;
  dur: number; // duración en segundos simulados
}

/**
 * Plan de tiempos fijos del semáforo tradicional (línea base de la Fase 2).
 * Dos fases en cruz separadas por un "todo rojo" de seguridad.
 * Ciclo total = 7+2+1 + 7+2+1 = 20 s.
 */
const FIXED_PLAN: Phase[] = [
  { ns: 'VERDE', ew: 'ROJO', dur: 7 },
  { ns: 'AMARILLO', ew: 'ROJO', dur: 2 },
  { ns: 'ROJO', ew: 'ROJO', dur: 1 },
  { ns: 'ROJO', ew: 'VERDE', dur: 7 },
  { ns: 'ROJO', ew: 'AMARILLO', dur: 2 },
  { ns: 'ROJO', ew: 'ROJO', dur: 1 },
];

const CICLO = FIXED_PLAN.reduce((s, p) => s + p.dur, 0);

/**
 * Controlador de tiempos fijos. En la Fase 3 se añade un controlador
 * inteligente que reordena/estira fases según los sensores; el modo
 * tradicional seguirá usando este plan para que la comparación A/B sea justa.
 *
 * Usa dos objetos TrafficLight (patrón State en POO): el controlador es el
 * "cerebro" que decide, la luz sólo guarda su estado actual.
 */
export class FixedController {
  readonly ns = new TrafficLight('VERDE');
  readonly ew = new TrafficLight('ROJO');

  /** Ajusta las luces según el tiempo de simulación transcurrido. */
  update(simTime: number): void {
    let t = simTime % CICLO;
    for (const fase of FIXED_PLAN) {
      if (t < fase.dur) {
        this.ns.forzar(fase.ns);
        this.ew.forzar(fase.ew);
        return;
      }
      t -= fase.dur;
    }
  }

  state(group: Group): LightState {
    return group === 'NS' ? this.ns.actual : this.ew.actual;
  }
}
