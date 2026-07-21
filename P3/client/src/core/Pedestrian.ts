import type { Direction } from 'shared';

/**
 * Peatón que cruza por uno de los cuatro cruces peatonales.
 * `progreso` va de 0 (una acera) a 1 (la de enfrente). Avanza sólo cuando su
 * semáforo peatonal está en verde (la vía que cruza está en rojo).
 */
export class Pedestrian {
  progreso = 0;

  constructor(
    readonly id: number,
    readonly cruce: Direction,
    readonly color: number,
  ) {}
}
