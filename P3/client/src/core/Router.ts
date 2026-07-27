import type { EdgeId, NodeId } from 'shared';
import type { Edge, Graph } from './Graph';

/**
 * Ruteo de vehículos (Fase 4): Dijkstra sobre el grafo con pesos VIVOS.
 * El peso de cada arista lo decide quien llama (largo + k·cola + castigo por
 * congestión), así el desvío emerge y se revierte solo cuando la cola baja.
 * Función pura respecto al grafo: determinista, testeable sin UI.
 */

/**
 * Camino de aristas desde el nodo `desde` hasta la arista de salida `salida`
 * (incluida). Devuelve null si no hay camino (no ocurre en la cuadrícula).
 */
export function rutaHacia(
  g: Graph,
  desde: NodeId,
  salida: EdgeId,
  peso: (e: Edge) => number,
  /** Nodo al que NO se puede volver en el primer tramo (evita el giro en U:
   *  el auto venía de ahí, dar media vuelta en la misma calle es ilegal). */
  evitarPrimero?: NodeId,
): EdgeId[] | null {
  const objetivo = g.edges.get(salida)!;
  const meta = objetivo.from!; // nodo del que parte la arista de salida

  const dist = new Map<NodeId, number>();
  const prev = new Map<NodeId, Edge>();
  const pendientes = new Set<NodeId>(g.nodes.keys());
  dist.set(desde, 0);

  while (pendientes.size > 0) {
    // Selección determinista: menor distancia; en empate, menor id.
    let u: NodeId | null = null;
    let mejor = Infinity;
    for (const n of pendientes) {
      const d = dist.get(n) ?? Infinity;
      if (d < mejor || (d === mejor && u !== null && n < u)) {
        mejor = d;
        u = n;
      }
    }
    if (u === null || mejor === Infinity) break;
    pendientes.delete(u);
    if (u === meta) break;

    for (const e of g.salientes.get(u)!) {
      if (!e.to) continue; // las salidas no llevan a otro nodo
      // Giro en U prohibido solo en el arranque: no volver por donde vino.
      if (u === desde && e.to === evitarPrimero) continue;
      const alt = mejor + peso(e);
      if (alt < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, alt);
        prev.set(e.to, e);
      }
    }
  }

  if (desde !== meta && !prev.has(meta)) return null;

  const camino: EdgeId[] = [salida];
  let n = meta;
  while (n !== desde) {
    const e = prev.get(n)!;
    camino.unshift(e.id);
    n = e.from!;
  }
  return camino;
}
