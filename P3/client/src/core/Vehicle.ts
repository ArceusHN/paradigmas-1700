import type { Direction } from 'shared';

/**
 * Modelo lógico de un vehículo (POO). No sabe nada de Three.js.
 * `d` es la distancia al centro de la intersección a lo largo de su carril.
 * `committed` = ya pasó la línea de alto y cruza aunque el semáforo cambie.
 */
export class Vehicle {
  d: number;
  committed = false;

  constructor(
    readonly id: number,
    readonly dir: Direction,
    d: number,
    readonly color: number,
    readonly nacidoEn: number, // tiempo de simulación al aparecer (para esperas)
    readonly esEmergencia = false, // true = ambulancia (prioridad máxima)
  ) {
    this.d = d;
  }

  /** ¿Está detenido esperando en la cola? (para métricas y contadores). */
  get enCola(): boolean {
    return !this.committed && this.d > 0;
  }
}
