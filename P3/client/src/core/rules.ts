import { DIRECTIONS, GROUP_OF, type Direction, type Group, type SensorReading } from 'shared';

/**
 * Reglas de decisión del semáforo — FUNCIONES PURAS (paradigma funcional).
 *
 * Reciben sólo lecturas de sensores y devuelven un dato; no tienen estado ni
 * efectos secundarios. Por eso son 100% testeables sin UI y sin Three.js.
 * El controlador inteligente (Controller.ts) las compone según prioridad.
 */

/** Suma de vehículos en cola de todo el cruce. */
export function colaTotal(r: SensorReading): number {
  return Object.values(r.colaPorVia).reduce((a, b) => a + b, 0);
}

/** Cola acumulada de un grupo de fase (N+S o E+O). */
export function colaGrupo(r: SensorReading, g: Group): number {
  return DIRECTIONS.filter((d) => GROUP_OF[d] === g).reduce((s, d) => s + (r.colaPorVia[d] ?? 0), 0);
}

/** Regla 4 — NOCTURNO: madrugada y sin tráfico ⇒ amarillo intermitente. */
export function esNocturno(r: SensorReading): boolean {
  const madrugada = r.horaSimulada >= 22 || r.horaSimulada < 5;
  return madrugada && colaTotal(r) === 0;
}

/** Regla 1 — EMERGENCIA: grupo con ambulancia (o null si no hay). */
export function grupoEmergencia(r: SensorReading): Group | null {
  return r.emergenciaEnVia ? GROUP_OF[r.emergenciaEnVia as Direction] : null;
}

/** Regla 3 — DEMANDA: verde base + tiempo extra proporcional a la cola (con tope). */
export function verdeExtendido(base: number, cola: number, segPorCarro: number, tope: number): number {
  return Math.min(base + cola * segPorCarro, tope);
}

/** Elige el grupo que recibe el verde: más demanda; en empate, alterna. */
export function grupoConMasDemanda(r: SensorReading, anterior: Group): Group {
  const ns = colaGrupo(r, 'NS');
  const ew = colaGrupo(r, 'EW');
  if (ns > ew) return 'NS';
  if (ew > ns) return 'EW';
  return anterior === 'NS' ? 'EW' : 'NS'; // empate → no repetir el mismo
}
