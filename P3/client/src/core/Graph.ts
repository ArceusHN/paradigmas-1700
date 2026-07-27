import type { Direction, EdgeId, NodeId } from 'shared';
import { LANE_OFFSET, STOP_LINE } from './world';

/**
 * Grafo de la red (Fase 4): cuadrícula de intersecciones unidas por cuadras
 * dirigidas. TS puro, sin Three.js — el render solo lee `posicionEn()`.
 *
 * Convención de `dir` (igual que en la Fase 2/3): es el acceso por el que el
 * auto LLEGA — 'N' = viene del norte y avanza +Z, 'O' = viene del oeste y
 * avanza +X, etc. Así `GROUP_OF[dir]` sigue diciendo qué fase del semáforo
 * (NS/EW) le da paso, y los controladores existentes funcionan sin cambios.
 */

export const GRID_COLS = 4;
export const GRID_ROWS = 2;
/** Distancia entre intersecciones (centro a centro). */
export const BLOCK = 60;
/** Largo de las aristas de entrada/salida en el borde de la cuadrícula. */
export const ENTRY_LEN = 40;

/** Vector unitario de avance de un auto que "viene de" cada dirección. */
export const VEC: Record<Direction, { ux: number; uz: number }> = {
  N: { ux: 0, uz: 1 },
  S: { ux: 0, uz: -1 },
  O: { ux: 1, uz: 0 },
  E: { ux: -1, uz: 0 },
};

/** Rotación en Y del auto según su dirección de avance (igual que world.ts). */
const HEADING: Record<Direction, number> = { N: 0, S: Math.PI, E: -Math.PI / 2, O: Math.PI / 2 };

/** Radio de la zona de giro dentro del cruce (coincide con la línea de alto). */
const ZONA_GIRO = STOP_LINE;

export interface Node {
  id: NodeId;
  col: number;
  row: number;
  x: number;
  z: number;
}

export interface Edge {
  id: EdgeId;
  /** null = entrada desde fuera de la cuadrícula. */
  from: NodeId | null;
  /** null = salida del mundo. */
  to: NodeId | null;
  /** Acceso por el que el auto llega a `to` (o etiqueta de avance si es salida). */
  dir: Direction;
  length: number;
  x0: number;
  z0: number;
}

export interface Placement {
  x: number;
  z: number;
  heading: number;
}

const LETRAS = 'ABCDEFGH';

export class Graph {
  readonly nodes = new Map<NodeId, Node>();
  readonly edges = new Map<EdgeId, Edge>();
  /** Aristas que salen de cada nodo (internas + salidas). */
  readonly salientes = new Map<NodeId, Edge[]>();
  /** Aristas que llegan a cada nodo, por acceso. */
  readonly entrantes = new Map<NodeId, Edge[]>();
  readonly entradas: Edge[] = [];
  readonly salidas: Edge[] = [];

  private constructor() {}

  /** Construye la cuadrícula COLS×ROWS con entradas/salidas en todo el borde. */
  static cuadricula(cols = GRID_COLS, rows = GRID_ROWS): Graph {
    const g = new Graph();

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const id = `${LETRAS[c]}${r + 1}`;
        g.nodes.set(id, {
          id,
          col: c,
          row: r,
          x: (c - (cols - 1) / 2) * BLOCK,
          z: (r - (rows - 1) / 2) * BLOCK,
        });
        g.salientes.set(id, []);
        g.entrantes.set(id, []);
      }
    }

    const nodo = (c: number, r: number) => `${LETRAS[c]}${r + 1}`;

    for (const n of g.nodes.values()) {
      // Aristas internas hacia el vecino de la derecha y el de abajo (ambos sentidos).
      if (n.col + 1 < cols) {
        g.interna(n.id, nodo(n.col + 1, n.row), 'O'); // avanza +X: llega desde el oeste
        g.interna(nodo(n.col + 1, n.row), n.id, 'E');
      }
      if (n.row + 1 < rows) {
        g.interna(n.id, nodo(n.col, n.row + 1), 'N'); // avanza +Z: llega desde el norte
        g.interna(nodo(n.col, n.row + 1), n.id, 'S');
      }
      // Entradas y salidas en los bordes expuestos.
      if (n.col === 0) g.borde(n.id, 'O', 'E');
      if (n.col === cols - 1) g.borde(n.id, 'E', 'O');
      if (n.row === 0) g.borde(n.id, 'N', 'S');
      if (n.row === rows - 1) g.borde(n.id, 'S', 'N');
    }
    return g;
  }

  private interna(from: NodeId, to: NodeId, dir: Direction): void {
    const a = this.nodes.get(from)!;
    const e: Edge = { id: `${from}>${to}`, from, to, dir, length: BLOCK, x0: a.x, z0: a.z };
    this.registrar(e);
  }

  /** Crea el par entrada+salida de un lado expuesto del borde. */
  private borde(id: NodeId, dirEntrada: Direction, dirSalida: Direction): void {
    const n = this.nodes.get(id)!;
    const vIn = VEC[dirEntrada];
    const entrada: Edge = {
      id: `ext>${id}:${dirEntrada}`,
      from: null,
      to: id,
      dir: dirEntrada,
      length: ENTRY_LEN,
      x0: n.x - vIn.ux * ENTRY_LEN,
      z0: n.z - vIn.uz * ENTRY_LEN,
    };
    const salida: Edge = {
      id: `${id}>ext:${dirSalida}`,
      from: id,
      to: null,
      dir: dirSalida,
      length: ENTRY_LEN,
      x0: n.x,
      z0: n.z,
    };
    this.registrar(entrada);
    this.registrar(salida);
  }

  private registrar(e: Edge): void {
    this.edges.set(e.id, e);
    if (e.from) this.salientes.get(e.from)!.push(e);
    else this.entradas.push(e);
    if (e.to) this.entrantes.get(e.to)!.push(e);
    else this.salidas.push(e);
  }

  /** Posición en el mundo de un auto a `s` unidades del inicio de la arista. */
  posicionEn(edgeId: EdgeId, s: number): Placement {
    const e = this.edges.get(edgeId)!;
    const v = VEC[e.dir];
    // Carril desplazado para que los dos sentidos de una calle no se solapen
    // (misma convención que placement() de world.ts).
    return {
      x: e.x0 + v.ux * s + v.uz * LANE_OFFSET,
      z: e.z0 + v.uz * s + v.ux * LANE_OFFSET,
      heading: HEADING[e.dir],
    };
  }

  /**
   * Posición de un auto considerando su ruta: dentro de la zona del cruce
   * (los últimos `ZONA_GIRO` de la arista entrante y los primeros de la
   * saliente), la trayectoria de un giro es una curva de Bézier cuadrática
   * entre ambos carriles y el heading es su tangente — así el giro se ve
   * progresivo en vez de un salto de 90° en el centro del nodo.
   * Solo afecta la presentación; la dinámica escalar `s` no cambia.
   */
  posicionEnRuta(actualId: EdgeId, s: number, previaId?: EdgeId, siguienteId?: EdgeId): Placement {
    const actual = this.edges.get(actualId)!;

    // Primera mitad del giro: acercándose al final de la arista actual.
    if (siguienteId && s > actual.length - ZONA_GIRO) {
      const siguiente = this.edges.get(siguienteId)!;
      if (siguiente.dir !== actual.dir) {
        const t = (s - (actual.length - ZONA_GIRO)) / (2 * ZONA_GIRO);
        return this.bezierGiro(actual, siguiente, t);
      }
    }
    // Segunda mitad del giro: recién entrado a la arista siguiente.
    if (previaId && s < ZONA_GIRO) {
      const previa = this.edges.get(previaId)!;
      if (previa.dir !== actual.dir) {
        const t = (ZONA_GIRO + s) / (2 * ZONA_GIRO);
        return this.bezierGiro(previa, actual, t);
      }
    }
    return this.posicionEn(actualId, s);
  }

  /** Bézier cuadrática del carril entrante al saliente dentro del cruce. */
  private bezierGiro(entrante: Edge, saliente: Edge, t: number): Placement {
    const p0 = this.posicionEn(entrante.id, entrante.length - ZONA_GIRO);
    const p2 = this.posicionEn(saliente.id, ZONA_GIRO);
    // Esquina de control: donde se cruzan las líneas de ambos carriles
    // (calles alineadas a los ejes: mezcla de coordenadas de p0 y p2).
    const horizontal = VEC[entrante.dir].ux !== 0;
    const p1 = horizontal ? { x: p2.x, z: p0.z } : { x: p0.x, z: p2.z };

    const u = 1 - t;
    const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
    const z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
    // Tangente de la curva → rotación del auto (misma convención que HEADING).
    const dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dz = 2 * u * (p1.z - p0.z) + 2 * t * (p2.z - p1.z);
    return { x, z, heading: Math.atan2(dx, dz) };
  }

  /** ¿La salida `s` es la vuelta en U inmediata de la entrada `e`? */
  esVueltaEnU(entrada: Edge, salida: Edge): boolean {
    if (salida.from !== entrada.to) return false;
    const a = VEC[entrada.dir];
    const b = VEC[salida.dir];
    return a.ux === -b.ux && a.uz === -b.uz;
  }
}
