import type { Group, LightState, SensorReading } from 'shared';
import { TrafficLight } from './TrafficLight';
import {
  colaGrupo,
  esNocturno,
  grupoConMasDemanda,
  grupoEmergencia,
  verdeExtendido,
} from './rules';

/** Contexto que la simulación pasa al controlador en cada paso. */
export interface Ctx {
  dt: number;
  simTime: number;
  reading: SensorReading;
}

/**
 * Contrato común de ambos controladores. Gracias a esto, el motor de
 * simulación es idéntico en modo fijo e inteligente → la comparación A/B
 * de la Fase 5 es justa por construcción.
 */
export interface SemaforoController {
  update(ctx: Ctx): void;
  state(group: Group): LightState;
}

// ─── Controlador de tiempos FIJOS (línea base, Fase 2) ────────────────
interface Phase {
  ns: LightState;
  ew: LightState;
  dur: number;
}

const FIXED_PLAN: Phase[] = [
  { ns: 'VERDE', ew: 'ROJO', dur: 7 },
  { ns: 'AMARILLO', ew: 'ROJO', dur: 2 },
  { ns: 'ROJO', ew: 'ROJO', dur: 1 },
  { ns: 'ROJO', ew: 'VERDE', dur: 7 },
  { ns: 'ROJO', ew: 'AMARILLO', dur: 2 },
  { ns: 'ROJO', ew: 'ROJO', dur: 1 },
];
const CICLO = FIXED_PLAN.reduce((s, p) => s + p.dur, 0);

export class FixedController implements SemaforoController {
  readonly ns = new TrafficLight('VERDE');
  readonly ew = new TrafficLight('ROJO');

  update(ctx: Ctx): void {
    let t = ctx.simTime % CICLO;
    for (const fase of FIXED_PLAN) {
      if (t < fase.dur) {
        this.ns.forzar(fase.ns);
        this.ew.forzar(fase.ew);
        return;
      }
      t -= fase.dur;
    }
  }

  state(group: Group): LightState {
    return group === 'NS' ? this.ns.actual : this.ew.actual;
  }
}

// ─── Controlador INTELIGENTE (Fase 3) ─────────────────────────────────
const AMARILLO = 2;
const TODO_ROJO = 1;
const PEATONAL = 4; // tiempo de cruce peatonal (ambos en rojo)
const VERDE_BASE = 5;
const VERDE_MAX = 15;
const SEG_POR_CARRO = 1.2;

type Fase = 'VERDE' | 'AMARILLO' | 'TODO_ROJO' | 'PEATONAL' | 'NOCTURNO';

/**
 * "Cerebro" adaptativo. Evalúa las reglas por prioridad (funciones puras de
 * rules.ts) y ajusta qué grupo tiene verde y por cuánto tiempo:
 *   1. EMERGENCIA  2. PEATÓN  3. DEMANDA  4. NOCTURNO  5. base.
 */
export class SmartController implements SemaforoController {
  private fase: Fase = 'VERDE';
  private activo: Group = 'NS';
  private restante = VERDE_BASE;
  private peatonPend = false;
  /** Bandera de un solo paso: el motor la usa para limpiar la petición de peatón. */
  peatonServido = false;

  private estados: Record<Group, LightState> = { NS: 'VERDE', EW: 'ROJO' };

  update({ dt, reading }: Ctx): void {
    this.peatonServido = false;
    if (reading.peatonEsperando) this.peatonPend = true;

    // Regla 4 — NOCTURNO (tiene override sobre todo el ciclo).
    if (esNocturno(reading)) {
      this.fase = 'NOCTURNO';
      this.set('INTERMITENTE', 'INTERMITENTE');
      return;
    }
    if (this.fase === 'NOCTURNO') {
      this.fase = 'TODO_ROJO';
      this.restante = TODO_ROJO;
    }

    // Regla 1 — EMERGENCIA: si hay ambulancia en el otro grupo, corta el verde ya.
    const emg = grupoEmergencia(reading);
    if (emg && this.fase === 'VERDE' && this.activo !== emg) {
      this.fase = 'AMARILLO';
      this.restante = Math.min(this.restante, AMARILLO);
    }

    this.restante -= dt;
    if (this.restante <= 0) this.transicion(reading, emg);
    this.aplicar();
  }

  private transicion(reading: SensorReading, emg: Group | null): void {
    switch (this.fase) {
      case 'VERDE':
        this.fase = 'AMARILLO';
        this.restante = AMARILLO;
        break;
      case 'AMARILLO':
        this.fase = 'TODO_ROJO';
        this.restante = TODO_ROJO;
        break;
      case 'PEATONAL':
        this.iniciarVerde(reading, emg);
        break;
      case 'TODO_ROJO':
        // Regla 2 — PEATÓN: intercalar un cruce peatonal antes del siguiente verde.
        if (this.peatonPend && !emg) {
          this.fase = 'PEATONAL';
          this.restante = PEATONAL;
          this.peatonPend = false;
          this.peatonServido = true;
        } else {
          this.iniciarVerde(reading, emg);
        }
        break;
      default:
        this.iniciarVerde(reading, emg);
    }
  }

  private iniciarVerde(reading: SensorReading, emg: Group | null): void {
    // Prioridad: emergencia → si no, el grupo con más demanda.
    this.activo = emg ?? grupoConMasDemanda(reading, this.activo);
    this.fase = 'VERDE';
    // Regla 3 — DEMANDA: el verde dura más cuanto más larga es la cola.
    this.restante = verdeExtendido(VERDE_BASE, colaGrupo(reading, this.activo), SEG_POR_CARRO, VERDE_MAX);
  }

  private aplicar(): void {
    if (this.fase === 'VERDE') {
      this.set(this.activo === 'NS' ? 'VERDE' : 'ROJO', this.activo === 'EW' ? 'VERDE' : 'ROJO');
    } else if (this.fase === 'AMARILLO') {
      this.set(this.activo === 'NS' ? 'AMARILLO' : 'ROJO', this.activo === 'EW' ? 'AMARILLO' : 'ROJO');
    } else {
      this.set('ROJO', 'ROJO'); // TODO_ROJO y PEATONAL
    }
  }

  private set(ns: LightState, ew: LightState): void {
    this.estados.NS = ns;
    this.estados.EW = ew;
  }

  state(group: Group): LightState {
    return this.estados[group];
  }
}
