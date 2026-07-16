import {
  DIRECTIONS,
  GROUP_OF,
  type Direction,
  type Group,
  type LightState,
  type Mode,
  type SensorReading,
} from 'shared';
import { mulberry32 } from './prng';
import { Vehicle } from './Vehicle';
import { FixedController, SmartController, type SemaforoController } from './Controller';
import {
  CAR_GAP,
  CAR_LEN,
  CAR_SPEED,
  DESPAWN_DIST,
  nocheFactor,
  SPAWN_DIST,
  STEP,
  STOP_LINE,
} from './world';

export interface SimConfig {
  seed: number;
  /** Vehículos por segundo que llegan por cada acceso. */
  rate: number;
}

/** Paleta determinista de colores de carrocería. */
const COLORES = [0x4f8cff, 0xff6b6b, 0xffd166, 0x8ce99a, 0xb197fc, 0xffa94d, 0xe9ecef];

/** Instantánea de estado para el render y el HUD (el render sólo lee). */
export interface Snapshot {
  simTime: number;
  procesados: number;
  enCola: number;
  modo: Mode;
  hora: number;
  colaPorVia: Record<string, number>;
  peaton: boolean;
  emergencia: string | null;
  ns: LightState;
  ew: LightState;
}

/**
 * Mundo de la simulación (Fase 3).
 * Avanza en pasos fijos (reproducible por semilla) y admite dos "cerebros":
 * fijo e inteligente, intercambiables en caliente. Los sensores se construyen
 * a partir del propio mundo (colas) más las entradas externas (peatón,
 * ambulancia, hora) que inyecta la UI — o, más adelante, el ESP32 vía MQTT.
 */
export class Simulation {
  simTime = 0;
  procesados = 0;
  modo: Mode = 'inteligente';

  private cfg: SimConfig;
  private readonly fixed = new FixedController();
  private readonly smart = new SmartController();
  private rng: () => number;
  private lanes: Record<Direction, Vehicle[]>;
  private nextId = 1;
  private acc = 0;

  // ── Entradas de sensores externas (UI / Wokwi) ──
  private peatonInput = false;
  private horaInput = 12;
  private trafico: Record<Group, number> = { NS: 1, EW: 1 };

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed);
    this.lanes = { N: [], S: [], E: [], O: [] };
  }

  private get controller(): SemaforoController {
    return this.modo === 'inteligente' ? this.smart : this.fixed;
  }

  reset(cfg: SimConfig): void {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed);
    this.lanes = { N: [], S: [], E: [], O: [] };
    this.simTime = 0;
    this.procesados = 0;
    this.acc = 0;
    this.nextId = 1;
    this.peatonInput = false;
  }

  // ── API de sensores/eventos (la usan la UI y el puente Wokwi) ──
  setModo(m: Mode): void {
    this.modo = m;
  }
  setHora(h: number): void {
    this.horaInput = h;
  }
  setTrafico(g: Group, factor: number): void {
    this.trafico[g] = factor;
  }
  /** Botón/sensor: "carro detectado" → mete un vehículo en esa vía. */
  detectarCarro(dir: Direction): void {
    if (this.puedeAparecer(dir)) {
      const color = COLORES[this.nextId % COLORES.length];
      this.lanes[dir].push(new Vehicle(this.nextId++, dir, SPAWN_DIST, color, this.simTime));
    }
  }
  /** Botón: peatón esperando cruzar. */
  pedirPeaton(): void {
    this.peatonInput = true;
  }
  /** Botón/RFID: ambulancia entrando por una vía. */
  enviarAmbulancia(dir: Direction): void {
    this.lanes[dir].push(new Vehicle(this.nextId++, dir, SPAWN_DIST, 0xffffff, this.simTime, true));
  }

  vehicles(): Vehicle[] {
    return DIRECTIONS.flatMap((d) => this.lanes[d]);
  }

  /** Construye la lectura de sensores a partir del mundo + entradas externas. */
  private leer(): SensorReading {
    const cola: Record<string, number> = {};
    for (const d of DIRECTIONS) cola[d] = this.lanes[d].filter((v) => v.enCola).length;
    // Emergencia activa mientras la ambulancia siga en/antes del cruce.
    const amb = this.vehicles().find((v) => v.esEmergencia && v.d > -6);
    return {
      colaPorVia: cola,
      peatonEsperando: this.peatonInput,
      emergenciaEnVia: amb ? amb.dir : null,
      horaSimulada: this.horaInput,
    };
  }

  snapshot(): Snapshot {
    const r = this.leer();
    return {
      simTime: this.simTime,
      procesados: this.procesados,
      enCola: this.vehicles().filter((v) => v.enCola).length,
      modo: this.modo,
      hora: this.horaInput,
      colaPorVia: r.colaPorVia,
      peaton: r.peatonEsperando,
      emergencia: r.emergenciaEnVia,
      ns: this.controller.state('NS'),
      ew: this.controller.state('EW'),
    };
  }

  update(realDt: number, speed: number): void {
    this.acc += realDt * speed;
    let pasos = 0;
    while (this.acc >= STEP && pasos < 400) {
      this.step();
      this.acc -= STEP;
      pasos++;
    }
  }

  private step(): void {
    this.simTime += STEP;
    const reading = this.leer();
    this.controller.update({ dt: STEP, simTime: this.simTime, reading });
    // El controlador inteligente avisa cuando ya atendió al peatón.
    if (this.modo === 'inteligente' && this.smart.peatonServido) this.peatonInput = false;
    this.spawn();
    this.advance();
  }

  /** Generación ambiental de tráfico (determinista + factor día/noche). */
  private spawn(): void {
    const noche = nocheFactor(this.horaInput);
    for (const dir of DIRECTIONS) {
      const mult = this.trafico[GROUP_OF[dir]] * (1 - 0.9 * noche); // menos autos de madrugada
      if (this.rng() < this.cfg.rate * mult * STEP && this.puedeAparecer(dir)) {
        const color = COLORES[Math.floor(this.rng() * COLORES.length)];
        this.lanes[dir].push(new Vehicle(this.nextId++, dir, SPAWN_DIST, color, this.simTime));
      }
    }
  }

  private puedeAparecer(dir: Direction): boolean {
    const cola = this.lanes[dir];
    if (cola.length === 0) return true;
    const ultimo = Math.max(...cola.map((v) => v.d));
    return ultimo <= SPAWN_DIST - (CAR_LEN + CAR_GAP);
  }

  private advance(): void {
    for (const dir of DIRECTIONS) {
      const cola = this.lanes[dir];
      cola.sort((a, b) => a.d - b.d);

      const verde = this.controller.state(GROUP_OF[dir]) === 'VERDE';

      for (let i = 0; i < cola.length; i++) {
        const auto = cola[i];
        const debeParar = !auto.committed && !verde;
        const pisoSemaforo = debeParar ? STOP_LINE : -Infinity;
        const pisoLider = i > 0 ? cola[i - 1].d + CAR_LEN + CAR_GAP : -Infinity;
        const piso = Math.max(pisoSemaforo, pisoLider);

        let nueva = auto.d - CAR_SPEED * STEP;
        if (nueva < piso) nueva = piso;
        if (nueva > auto.d) nueva = auto.d;
        auto.d = nueva;

        if (auto.d < STOP_LINE) auto.committed = true;
      }

      this.lanes[dir] = cola.filter((v) => {
        if (v.d < -DESPAWN_DIST) {
          this.procesados++;
          return false;
        }
        return true;
      });
    }
  }
}
