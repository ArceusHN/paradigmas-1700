import { DIRECTIONS, GROUP_OF, type Direction } from 'shared';
import { mulberry32 } from './prng';
import { Vehicle } from './Vehicle';
import { FixedController } from './Controller';
import {
  CAR_GAP,
  CAR_LEN,
  CAR_SPEED,
  DESPAWN_DIST,
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
  ns: ReturnType<FixedController['state']>;
  ew: ReturnType<FixedController['state']>;
}

/**
 * Mundo de la simulación (Fase 2, modo tradicional).
 * Avanza en pasos fijos de tamaño STEP → reproducible por semilla.
 * Es TS puro: se puede testear sin Three.js (test de reproducibilidad, Fase 6).
 */
export class Simulation {
  simTime = 0;
  procesados = 0;

  private cfg: SimConfig;
  private controller = new FixedController();
  private rng: () => number;
  private lanes: Record<Direction, Vehicle[]>;
  private nextId = 1;
  private acc = 0; // acumulador de tiempo real→simulado

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed);
    this.lanes = { N: [], S: [], E: [], O: [] };
  }

  /** Reinicia el mundo (misma o nueva semilla) — reproducibilidad. */
  reset(cfg: SimConfig): void {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed);
    this.lanes = { N: [], S: [], E: [], O: [] };
    this.simTime = 0;
    this.procesados = 0;
    this.acc = 0;
    this.nextId = 1;
  }

  /** Todos los vehículos vivos (para que el render sincronice sus meshes). */
  vehicles(): Vehicle[] {
    return DIRECTIONS.flatMap((d) => this.lanes[d]);
  }

  snapshot(): Snapshot {
    return {
      simTime: this.simTime,
      procesados: this.procesados,
      enCola: this.vehicles().filter((v) => v.enCola).length,
      ns: this.controller.state('NS'),
      ew: this.controller.state('EW'),
    };
  }

  /**
   * Avanza la simulación. `realDt` = segundos reales del frame; `speed` = factor
   * de aceleración (x1/x5/x20). Se consume en pasos fijos para no romper el
   * determinismo aunque varíen los FPS.
   */
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
    this.controller.update(this.simTime);
    this.spawn();
    this.advance();
  }

  /** Genera llegadas de vehículos de forma determinista (misma semilla ⇒ igual). */
  private spawn(): void {
    for (const dir of DIRECTIONS) {
      if (this.rng() < this.cfg.rate * STEP && this.puedeAparecer(dir)) {
        const color = COLORES[Math.floor(this.rng() * COLORES.length)];
        this.lanes[dir].push(new Vehicle(this.nextId++, dir, SPAWN_DIST, color, this.simTime));
      }
    }
  }

  /** Evita que un auto nazca encima del último de su carril. */
  private puedeAparecer(dir: Direction): boolean {
    const cola = this.lanes[dir];
    if (cola.length === 0) return true;
    const ultimo = Math.max(...cola.map((v) => v.d));
    return ultimo <= SPAWN_DIST - (CAR_LEN + CAR_GAP);
  }

  /** Modelo de seguimiento de vehículos + respeto del semáforo. */
  private advance(): void {
    for (const dir of DIRECTIONS) {
      const cola = this.lanes[dir];
      // Ordena por cercanía al centro: el líder (menor d) va primero.
      cola.sort((a, b) => a.d - b.d);

      const verde = this.controller.state(GROUP_OF[dir]) === 'VERDE';

      for (let i = 0; i < cola.length; i++) {
        const auto = cola[i];

        // Piso por semáforo: si debe parar, no baja de la línea de alto.
        const debeParar = !auto.committed && !verde;
        const pisoSemaforo = debeParar ? STOP_LINE : -Infinity;

        // Piso por el auto de adelante: mantener separación.
        const pisoLider = i > 0 ? cola[i - 1].d + CAR_LEN + CAR_GAP : -Infinity;

        const piso = Math.max(pisoSemaforo, pisoLider);

        let nueva = auto.d - CAR_SPEED * STEP;
        if (nueva < piso) nueva = piso;
        if (nueva > auto.d) nueva = auto.d; // nunca retrocede
        auto.d = nueva;

        // Al pasar la línea de alto queda "comprometido": termina de cruzar.
        if (auto.d < STOP_LINE) auto.committed = true;
      }

      // Elimina y contabiliza los que ya salieron por el otro lado.
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
