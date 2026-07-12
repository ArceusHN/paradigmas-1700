import type { LightState } from 'shared';
import { NEXT_STATE } from 'shared';

/**
 * Máquina de estados del semáforo — patrón State (POO).
 *
 * ESQUELETO Fase 1: define la interfaz y el avance básico del ciclo.
 * En la Fase 2 se le añade el reloj de simulación y las duraciones por
 * estado; en la Fase 3, el Controller inyecta transiciones según las
 * reglas adaptativas (emergencia, peatón, demanda, nocturno).
 *
 * Es TS puro, sin Three.js → testeable sin interfaz gráfica (paradigma
 * funcional + POO). El render sólo leerá `estado` para pintar las luces.
 */
export class TrafficLight {
  private estado: LightState;

  constructor(inicial: LightState = 'ROJO') {
    this.estado = inicial;
  }

  get actual(): LightState {
    return this.estado;
  }

  /** Avanza al siguiente estado del ciclo (VERDE→AMARILLO→ROJO→…). */
  avanzar(): LightState {
    this.estado = NEXT_STATE[this.estado];
    return this.estado;
  }

  /** Forzar un estado (lo usarán las reglas de prioridad en la Fase 3). */
  forzar(estado: LightState): void {
    this.estado = estado;
  }
}
