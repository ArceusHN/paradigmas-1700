/**
 * PRNG determinista con semilla (mulberry32) — paradigma funcional.
 *
 * Misma semilla ⇒ misma secuencia exacta de números. Es la pieza que hace
 * la simulación *reproducible*: fundamental para el informe (Fase 6) y para
 * la comparación A/B justa (Fase 5), donde dos controladores distintos deben
 * recibir idéntica demanda de vehículos.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
