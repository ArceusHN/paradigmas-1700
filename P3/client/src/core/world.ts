import type { Direction } from 'shared';

/**
 * Constantes y geometría de la simulación (TS puro).
 * El núcleo calcula la posición del mundo de cada vehículo a partir de su
 * dirección y su distancia al centro; el render sólo *lee* esa posición.
 * Así el núcleo es la única fuente de verdad (regla de oro del plan).
 */

/** Paso de simulación de tamaño fijo (segundos). Clave del determinismo:
 *  el mundo avanza siempre en incrementos iguales, sin importar los FPS. */
export const STEP = 1 / 30;

export const ROAD_HALF = 5; // media anchura de cada calle (calle = 10)
export const LANE_OFFSET = 2.5; // desfase del carril respecto al eje de la calle
export const CROSSWALK = 6.5; // distancia al centro del cruce peatonal
export const STOP_LINE = 8; // distancia al centro donde frena el auto (tras el cruce)
export const SPAWN_DIST = 40; // dónde nacen los autos (lejos del centro)
export const DESPAWN_DIST = 44; // dónde se eliminan tras cruzar

export const PED_SPEED = 3; // unidades por segundo simulado
export const PED_TRAMO = 12; // largo del cruce peatonal (de acera a acera)

export const CAR_LEN = 3; // largo del auto
export const CAR_GAP = 1.6; // separación mínima entre autos en cola
export const CAR_SPEED = 9; // unidades por segundo simulado

/**
 * Factor de "noche" según la hora simulada (0 = pleno día, 1 = noche cerrada),
 * con transición suave al amanecer y al anochecer. Lo usan el generador de
 * tráfico (menos autos de madrugada) y el render (iluminación día/noche).
 */
export function nocheFactor(hora: number): number {
  if (hora >= 7 && hora <= 18) return 0;
  if (hora >= 20 || hora <= 5) return 1;
  if (hora > 18 && hora < 20) return (hora - 18) / 2; // anochecer
  return 1 - (hora - 5) / 2; // amanecer (5–7)
}

export interface Placement {
  x: number;
  z: number;
  heading: number; // rotación en Y (rad); el auto mira su sentido de avance
}

/**
 * Posición en el mundo de un vehículo, dada su dirección de origen y su
 * distancia `d` al centro (d>0 = acercándose, d<0 = ya cruzó y se aleja).
 * Cada acceso usa un carril desplazado para que los sentidos no se solapen.
 */
export function placement(dir: Direction, d: number): Placement {
  switch (dir) {
    case 'N':
      return { x: LANE_OFFSET, z: -d, heading: 0 }; // viene del norte, avanza +Z
    case 'S':
      return { x: -LANE_OFFSET, z: d, heading: Math.PI }; // viene del sur, avanza -Z
    case 'E':
      return { x: d, z: -LANE_OFFSET, heading: -Math.PI / 2 }; // viene del este, avanza -X
    case 'O':
      return { x: -d, z: LANE_OFFSET, heading: Math.PI / 2 }; // viene del oeste, avanza +X
  }
}

/**
 * Posición de un peatón en su cruce, según el progreso `p` (0→1) de acera a
 * acera. Cada cruce se sitúa en uno de los cuatro brazos de la intersección.
 * Los cruces N/S atraviesan la vía Norte-Sur; los E/O atraviesan la Este-Oeste.
 */
export function pedPlacement(cruce: Direction, p: number): Placement {
  const t = -6 + 12 * p; // recorre de -6 a 6
  switch (cruce) {
    case 'N':
      return { x: t, z: -CROSSWALK, heading: Math.PI / 2 };
    case 'S':
      return { x: -t, z: CROSSWALK, heading: -Math.PI / 2 };
    case 'E':
      return { x: CROSSWALK, z: t, heading: 0 };
    case 'O':
      return { x: -CROSSWALK, z: -t, heading: Math.PI };
  }
}
