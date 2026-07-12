/**
 * Contratos compartidos entre cliente y servidor.
 * Tipado estático (TypeScript) = uno de los paradigmas que evalúa el curso.
 *
 * Fase 1: aquí sólo definimos las *formas* de los datos y estados.
 * La implementación de la lógica llega en las fases 2–4.
 */

// ─── Máquina de estados del semáforo (patrón State) ───────────────────
// Los estados como union type: TypeScript verifica en compilación que
// nunca exista un estado inválido.
export type LightState = 'VERDE' | 'AMARILLO' | 'ROJO' | 'INTERMITENTE';

// Transiciones válidas del ciclo. Cualquier salto no listado es un bug
// detectable en tiempo de compilación.
export const NEXT_STATE: Record<LightState, LightState> = {
  VERDE: 'AMARILLO',
  AMARILLO: 'ROJO',
  ROJO: 'VERDE',
  INTERMITENTE: 'INTERMITENTE', // se mantiene hasta salir del modo nocturno
};

// ─── Modo de operación (habilita la comparación A/B) ──────────────────
export type Mode = 'fijo' | 'inteligente';

// ─── Reglas adaptativas por prioridad ─────────────────────────────────
// El controlador evalúa las reglas de mayor a menor prioridad y aplica
// la primera que dispare. Aquí sólo declaramos el catálogo; las funciones
// puras que las implementan viven en client/src/core/rules.ts (Fase 3).
export type RuleId =
  | 'EMERGENCIA' // 1. ambulancia → verde inmediato
  | 'PEATON' //     2. botón de peatón → priorizar cruce
  | 'DEMANDA' //    3. cola larga → extender verde (con tope)
  | 'NOCTURNO' //   4. madrugada sin tráfico → amarillo intermitente
  | 'DEFAULT'; //   5. tiempos base del ciclo

export interface RuleSpec {
  id: RuleId;
  priority: number; // 1 = mayor prioridad
  descripcion: string;
}

export const RULES: readonly RuleSpec[] = [
  { id: 'EMERGENCIA', priority: 1, descripcion: 'Ambulancia detectada → verde inmediato en su dirección' },
  { id: 'PEATON', priority: 2, descripcion: 'Botón de peatón → priorizar cruce peatonal al terminar el ciclo' },
  { id: 'DEMANDA', priority: 3, descripcion: 'Extender el verde proporcional a la cola, con tope' },
  { id: 'NOCTURNO', priority: 4, descripcion: 'Madrugada sin tráfico → amarillo intermitente' },
  { id: 'DEFAULT', priority: 5, descripcion: 'Tiempos base del ciclo' },
] as const;

// ─── Lecturas de sensores (entrada del controlador) ───────────────────
export interface SensorReading {
  colaPorVia: Record<string, number>; // vehículos esperando por dirección
  peatonEsperando: boolean;
  emergenciaEnVia: string | null; // dirección con ambulancia, o null
  horaSimulada: number; // 0–23
}

// ─── Métricas persistidas (contrato con la API, Fase 4) ────────────────
export interface CycleMetric {
  tiempoSim: number;
  esperaPromedio: number;
  vehiculosProcesados: number;
  colaMaxima: number;
  peatonesAtendidos: number;
  emergencias: number;
}

export interface RunSummary {
  id: number;
  modo: Mode;
  semilla: number;
  esperaPromedio: number;
  vehiculosProcesados: number;
  iniciadaEn: string;
}
