import { NetworkSimulation, type CollisionEvent } from '../src/core/Network';

/**
 * Análisis de colisiones (Fase 4): ¿bajo qué circunstancias chocan los autos?
 *
 * Corre una matriz de escenarios (semillas × coordinación × colación) y
 * agrega las colisiones por tipo, nodo y contexto. La salida es la evidencia
 * para decidir QUÉ mecanismo afinar (no adivinar).
 *
 * Uso:  npx tsx client/scripts/red-collisions.ts
 */

const SEMILLAS = [42, 7, 99, 1234];
const RATE = 0.11;

interface Corrida {
  coordinado: boolean;
  conColacion: boolean;
  colisiones: readonly CollisionEvent[];
  procesados: number;
}

function correr(seed: number, coordinado: boolean, conColacion: boolean): Corrida {
  const sim = new NetworkSimulation({ seed, rate: RATE, coordinado });
  sim.avanzar(60);
  if (conColacion) sim.generarCongestion('B1', 24);
  sim.avanzar(240);
  return {
    coordinado,
    conColacion,
    colisiones: sim.colisionesRegistradas(),
    procesados: sim.snapshot().procesados,
  };
}

const corridas: Corrida[] = [];
for (const seed of SEMILLAS) {
  for (const coordinado of [true, false]) {
    for (const conColacion of [false, true]) {
      corridas.push(correr(seed, coordinado, conColacion));
    }
  }
}

const todas = corridas.flatMap((c) => c.colisiones);
const totalProcesados = corridas.reduce((s, c) => s + c.procesados, 0);

const cuenta = <T extends string>(claves: (c: CollisionEvent) => T): Record<string, number> => {
  const r: Record<string, number> = {};
  for (const c of todas) r[claves(c)] = (r[claves(c)] ?? 0) + 1;
  return r;
};
const tabla = (titulo: string, datos: Record<string, number>) => {
  console.log(`\n${titulo}`);
  for (const [k, v] of Object.entries(datos).sort((a, b) => b[1] - a[1])) {
    const pct = ((v / todas.length) * 100).toFixed(0);
    console.log(`  ${k.padEnd(22)} ${String(v).padStart(4)}  (${pct}%)`);
  }
};

console.log(`Análisis de colisiones — ${corridas.length} corridas de 300 s (semillas ${SEMILLAS.join(', ')})`);
console.log(`Autos procesados: ${totalProcesados} · Colisiones: ${todas.length}`);
console.log(`Tasa global: ${((todas.length / totalProcesados) * 100).toFixed(2)} colisiones por 100 autos`);

tabla('── Por tipo ──', cuenta((c) => c.tipo));
tabla('── Por nodo ──', cuenta((c) => c.nodo));
tabla('── ¿Durante una colación activa? ──', cuenta((c) => (c.duranteColacion ? 'con colación' : 'tráfico normal')));
tabla('── Por modo de la red ──', cuenta((c) => (c.coordinado ? 'coordinada' : 'fija')));
tabla('── Luces del nodo al chocar ──', cuenta((c) => `NS=${c.luces.ns} EW=${c.luces.ew}`));
tabla(
  '── Estado de los autos ──',
  cuenta((c) => {
    const [a, b] = c.autos;
    if (a.girando || b.girando) return 'al menos uno girando';
    if (a.parado || b.parado) return 'uno parado (alcance)';
    return 'ambos en movimiento';
  }),
);

// Desglose por escenario (tasas comparables).
console.log('\n── Tasa por escenario (colisiones por 100 autos) ──');
for (const coordinado of [true, false]) {
  for (const conColacion of [false, true]) {
    const grupo = corridas.filter((c) => c.coordinado === coordinado && c.conColacion === conColacion);
    const cols = grupo.reduce((s, c) => s + c.colisiones.length, 0);
    const procs = grupo.reduce((s, c) => s + c.procesados, 0);
    const nombre = `${coordinado ? 'coordinada' : 'fija'} · ${conColacion ? 'con colación' : 'ambiental'}`;
    console.log(`  ${nombre.padEnd(28)} ${((cols / procs) * 100).toFixed(2)}`);
  }
}

// Las 3 circunstancias más repetidas (combinación tipo + luces + contexto).
tabla(
  '── Top circunstancias (tipo · luces · contexto) ──',
  cuenta((c) => `${c.tipo} · NS=${c.luces.ns}/EW=${c.luces.ew} · ${c.duranteColacion ? 'colación' : 'normal'}`),
);
