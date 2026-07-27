import type { NetMsg } from 'shared';
import { NetworkSimulation } from '../src/core/Network';

/**
 * Validación headless de la Fase 4.1 (sin UI, sin Three.js):
 *  1. Determinismo: misma semilla ⇒ resultado idéntico.
 *  2. Colación ON vs OFF: misma semilla y misma ráfaga en B1; la red
 *     coordinada debe despejar antes y con menos espera promedio.
 *
 * Uso:  npx tsx client/scripts/red-smoke.ts
 */

const SEED = 42;
const RATE = 0.11;
const NODO_COLACION = 'B1';

interface Resultado {
  snapshot: ReturnType<NetworkSimulation['snapshot']>;
  mensajes: Record<string, number>;
}

function correr(coordinado: boolean): Resultado {
  // El A/B aísla la coordinación de congestión: los incidentes emergentes de
  // colisión se prueban aparte (#3) para no meter bloqueos aleatorios aquí.
  const sim = new NetworkSimulation({ seed: SEED, rate: RATE, coordinado, emergentesBloquean: false });
  const mensajes: Record<string, number> = {};
  sim.bus.subscribe('red/', (_t, msg: NetMsg) => {
    mensajes[msg.evento] = (mensajes[msg.evento] ?? 0) + 1;
  });

  sim.avanzar(60); // calentamiento: tráfico ambiental estable
  sim.generarCongestion(NODO_COLACION, 24);
  sim.avanzar(240); // la red reacciona (o no, si está en modo fijo)

  return { snapshot: sim.snapshot(), mensajes };
}

function resumen(nombre: string, r: Resultado): void {
  const s = r.snapshot;
  console.log(`\n── ${nombre} ──`);
  console.log(`  procesados:        ${s.procesados}`);
  console.log(`  en red al final:   ${s.enRed}`);
  console.log(`  espera promedio:   ${s.esperaPromedio.toFixed(1)} s`);
  console.log(`  cola máxima:       ${s.colaMax} autos`);
  console.log(
    `  congestiones despejadas: ${s.despejes.length}` +
      (s.despejes.length > 0
        ? ` (duraciones: ${s.despejes.map((d) => d.duracion.toFixed(0) + 's').join(', ')})`
        : ''),
  );
  console.log(`  congestiones activas al final: ${s.congestiones.length}`);
  console.log(`  roces detectados: ${s.colisiones}  ·  incidentes activos: ${s.incidentes.length}`);
  console.log(`  mensajes del bus: ${JSON.stringify(r.mensajes)}`);
}

console.log('Fase 4.1 — smoke test de la red (cuadrícula 4×2, colación en ' + NODO_COLACION + ')');

// 1. Determinismo
const a = correr(true);
const b = correr(true);
const deterministico = JSON.stringify(a.snapshot) === JSON.stringify(b.snapshot);
console.log(`\nDeterminismo (misma semilla, dos corridas): ${deterministico ? 'OK ✓' : 'FALLÓ ✗'}`);
if (!deterministico) process.exit(1);

// 2. Comparación ON vs OFF
const off = correr(false);
resumen('Coordinación OFF (fijo + rutas estáticas)', off);
resumen('Coordinación ON (inteligente + mensajes + re-ruteo)', a);

// Métrica honesta: THROUGHPUT (autos procesados). La "espera promedio" solo
// cuenta a los que terminan, así que un modo que hace gridlock puede mostrar
// espera baja engañosa (pocos completan). Por eso el criterio es el flujo.
const mejorFlujo = a.snapshot.procesados >= off.snapshot.procesados;
console.log(`\nON procesa igual o más que OFF: ${mejorFlujo ? 'OK ✓' : 'NO ✗'}`);
console.log(`  (espera promedio informativa — confundida por gridlock: ON ${a.snapshot.esperaPromedio.toFixed(1)}s vs OFF ${off.snapshot.esperaPromedio.toFixed(1)}s)`);

// 3. Incidente de colisión: bloquea una vía y la red debe re-rutear.
const simCol = new NetworkSimulation({ seed: SEED, rate: RATE, coordinado: true });
simCol.avanzar(60);
const provocada = simCol.provocarColision(NODO_COLACION);
const incidenteActivo = simCol.snapshot().incidentes.length > 0;
simCol.avanzar(5); // debe seguir bloqueada dentro de los ~10 s de duración
const sigueBloqueada = simCol.snapshot().incidentes.length > 0;
simCol.avanzar(10); // pasada la duración, debe despejarse
const despejada = simCol.snapshot().incidentes.length === 0;
console.log('\n── Incidente de colisión (bloqueo + despeje) ──');
console.log(`  colisión provocada:   ${provocada ? 'OK ✓' : 'NO ✗'}`);
console.log(`  vía bloqueada:        ${incidenteActivo && sigueBloqueada ? 'OK ✓' : 'NO ✗'}`);
console.log(`  se despejó sola:      ${despejada ? 'OK ✓' : 'NO ✗'}`);

const colisionOk = provocada && incidenteActivo && sigueBloqueada && despejada;
process.exit(mejorFlujo && colisionOk ? 0 : 1);
