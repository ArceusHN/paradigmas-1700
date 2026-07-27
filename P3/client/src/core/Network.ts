import {
  DIRECTIONS,
  GROUP_OF,
  type Direction,
  type EdgeId,
  type EventSource,
  type LightState,
  type NetMsg,
  type NodeId,
  type SensorReading,
} from 'shared';
import { Bus } from './Bus';
import { Graph, VEC, type Edge } from './Graph';
import { rutaHacia } from './Router';
import { FixedController, SmartController, type SemaforoController } from './Controller';
import { mulberry32 } from './prng';
import { CAR_GAP, CAR_LEN, CAR_SPEED, nocheFactor, pedPlacement, PED_SPEED, PED_TRAMO, STEP, STOP_LINE } from './world';

/**
 * Red de semáforos (Fase 4): cuadrícula de intersecciones donde cada semáforo
 * es un AGENTE — decide con sus sensores locales más los mensajes de sus
 * vecinos (Bus). No hay controlador central: el desvío del tráfico emerge.
 *
 * Coordinación ON  = SmartController por nodo + mensajes + re-ruteo dinámico.
 * Coordinación OFF = FixedController por nodo + rutas estáticas (línea base,
 * misma semilla ⇒ comparación justa por construcción).
 */

export interface RedConfig {
  seed: number;
  /** Vehículos por segundo que llegan por cada entrada del borde. */
  rate: number;
  coordinado: boolean;
  /** Un choque real bloquea la vía como incidente (default true). */
  emergentesBloquean?: boolean;
}

/** Incidente de colisión: un tramo bloqueado en `sCrash` hasta que se despeja. */
export interface Incidente {
  arista: EdgeId;
  nodo: NodeId;
  sCrash: number;
  desde: number;
  autos: number[];
}

/** Umbral de colación: autos parados en un acceso para declarar congestión. */
const UMBRAL_CONGESTION = 6;
/** Histéresis: la congestión se da por despejada al bajar de este valor. */
const UMBRAL_DESPEJE = 2;
/** La cola debe sostenerse este tiempo (s) antes de declarar colación —
 *  distingue una congestión real de la cola normal de un rojo. */
const PERSISTENCIA_CONGESTION = 6;
/** La cola debe mantenerse baja este tiempo (s) antes de declarar despeje. */
const PERSISTENCIA_DESPEJE = 3;
/** Peso de cada auto en cola al calcular rutas (unidades de distancia). */
const K_COLA = 8;
/** Castigo de ruta para una arista declarada en congestión. */
const CASTIGO_CONGESTION = 400;
/** Cada cuánto (s) un nodo avisa a sus vecinos el flujo que va hacia ellos. */
const PERIODO_FLUJO = 2;
/** Cuánto pesa un auto "anunciado" por un vecino en la lectura de demanda. */
const FACTOR_ANTICIPO = 0.5;
/** Distancia entre centros para declarar colisión (las colas legítimas van a
 *  CAR_LEN+CAR_GAP = 4.6 de separación, así que no disparan falsos). */
const UMBRAL_COLISION = 2.6;
/** Histéresis: el par sale de colisión al separarse más que esto. */
const UMBRAL_SEPARACION = 3.4;
/** Separación mínima en espacio-mundo entre autos consecutivos. En los giros
 *  la curva de Bézier "corta la esquina" y comprime la distancia respecto a la
 *  separación en `s`; este piso la mantiene y evita que se encimen. */
const GAP_MUNDO = CAR_LEN + CAR_GAP;
/** Duración de un incidente de colisión: la vía queda bloqueada este tiempo. */
const DURACION_COLISION = 10;
/** Castigo de ruta de una arista bloqueada por colisión (repele a Dijkstra). */
const CASTIGO_COLISION = 1000;
/** Enfriamiento por arista tras despejar, para no re-disparar sobre el resto. */
const COOLDOWN_COLISION = 12;
/** Tope de incidentes simultáneos (evita saturar la red). */
const MAX_INCIDENTES = 3;


const COLORES = [0x4f8cff, 0xff6b6b, 0xffd166, 0x8ce99a, 0xb197fc, 0xffa94d, 0xe9ecef];
/** Colores de ropa de los peatones (paridad con la vista cruce). */
const ROPA = [0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b, 0xa855f7, 0x14b8a6];

/** Peatón que cruza en un nodo de la red (visual; no bloquea autos). */
export interface NetPedestrian {
  id: number;
  nodo: NodeId;
  cruce: Direction;
  progreso: number;
  color: number;
}

/** Vehículo de la red: recorre una ruta de aristas con origen → destino. */
export class NetVehicle {
  /** Distancia recorrida desde el inicio de la arista actual. */
  s = 0;
  /** Ya pasó la línea de alto: cruza aunque el semáforo cambie. */
  committed = false;
  esperaAcum = 0;
  parado = false;
  /** Accidentado: no se mueve, es el obstáculo del incidente hasta que despeja. */
  crashed = false;

  constructor(
    readonly id: number,
    public route: EdgeId[],
    public idx: number,
    readonly color: number,
    readonly nacidoEn: number,
    readonly esEmergencia = false,
  ) {}

  get edgeId(): EdgeId {
    return this.route[this.idx];
  }
}

export interface CongestionActiva {
  nodo: NodeId;
  arista: EdgeId;
  desde: number;
}

/** Estado de un auto al momento de una colisión (para el análisis). */
export interface VehiculoEnColision {
  id: number;
  arista: EdgeId;
  s: number;
  committed: boolean;
  parado: boolean;
  girando: boolean;
}

/**
 * Colisión detectada entre dos autos, con las circunstancias del momento —
 * la materia prima para afinar reglas con evidencia y no a ojo.
 */
export interface CollisionEvent {
  n: number;
  simTime: number;
  x: number;
  z: number;
  /** Nodo más cercano al punto del choque (contexto de la intersección). */
  nodo: NodeId;
  luces: { ns: LightState; ew: LightState };
  tipo: 'giro' | 'cruce' | 'incorporacion' | 'carril';
  duranteColacion: boolean;
  coordinado: boolean;
  autos: [VehiculoEnColision, VehiculoEnColision];
}

export interface RedSnapshot {
  simTime: number;
  hora: number;
  procesados: number;
  enRed: number;
  esperaPromedio: number;
  colaMax: number;
  congestiones: CongestionActiva[];
  /** Historial de colaciones despejadas: cuánto tardó cada una. */
  despejes: { arista: EdgeId; duracion: number }[];
  colisiones: number;
  ultimasColisiones: CollisionEvent[];
  /** Incidentes activos con su posición en el mundo (para render y HUD). */
  incidentes: { arista: EdgeId; nodo: NodeId; x: number; z: number; desde: number }[];
  /** Aristas cuyo acceso el semáforo cerró para desviar (solo Coordinada). */
  movimientosCerrados: EdgeId[];
  luces: Record<NodeId, { ns: LightState; ew: LightState }>;
  colasPorNodo: Record<NodeId, number>;
}

export class NetworkSimulation {
  simTime = 0;
  procesados = 0;
  readonly graph: Graph;
  readonly bus = new Bus();

  private cfg: RedConfig;
  private rng: () => number;
  private controllers = new Map<NodeId, SemaforoController>();
  private vehicles: NetVehicle[] = [];
  private nextId = 1;
  private esperaTotalProcesados = 0;
  private colaMax = 0;

  /** Colas de autos parados por arista (se recalcula en cada paso). */
  private colas = new Map<EdgeId, number>();
  private congestionadas = new Map<EdgeId, CongestionActiva>();
  private despejes: { arista: EdgeId; duracion: number }[] = [];
  /** Desde cuándo la cola de cada arista sostiene el umbral (alta/baja). */
  private altaDesde = new Map<EdgeId, number>();
  private bajaDesde = new Map<EdgeId, number>();
  /** Autos anunciados por vecinos, por arista de llegada (coordinado). */
  private anticipos = new Map<EdgeId, number>();
  private ultimoFlujo = 0;
  /** Entradas de sensores externas (UI / Wokwi), como en la Fase 3. */
  private horaInput = 12;
  private peatones = new Map<NodeId, boolean>();
  /** Peatones visibles cruzando (solo presentación); id incremental propio. */
  private peatonesVis: NetPedestrian[] = [];
  private nextPedId = 1;
  /** Registro de colisiones + pares actualmente en contacto (histéresis). */
  private colisiones: CollisionEvent[] = [];
  private paresEnContacto = new Set<string>();
  /** Incidentes de colisión activos por arista + enfriamiento tras despejar. */
  private incidentes = new Map<EdgeId, Incidente>();
  private cooldownColision = new Map<EdgeId, number>();
  /** true = los accidentes se despejan solos (~10 s); false = manual. */
  private autoDespeje = true;

  constructor(cfg: RedConfig) {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed);
    this.graph = Graph.cuadricula();
    for (const id of this.graph.nodes.keys()) {
      this.controllers.set(id, cfg.coordinado ? new SmartController() : new FixedController());
    }
    if (cfg.coordinado) {
      // Cada mensaje de congestión/despeje re-rutea a los autos afectados.
      this.bus.subscribe('red/eventos', (_t, msg) => this.alRecibirEvento(msg));
    }
  }

  // ── API de eventos externos (UI / Wokwi) ───────────────────────────

  /** Hora simulada (0–23): regula el tráfico ambiental y el modo nocturno. */
  setHora(h: number): void {
    this.horaInput = h;
  }

  /** Sensor "carro detectado": inyecta un auto en una entrada con espacio. */
  inyectarCarro(fuente: EventSource = 'ui'): boolean {
    void fuente; // la fuente se persiste en Fase 5
    const libres = this.graph.entradas.filter((e) => this.hayEspacio(e.id, 0));
    if (libres.length === 0) return false;
    const entrada = libres[Math.floor(this.rng() * libres.length)];
    const ruta = this.rutaNueva(entrada);
    if (!ruta) return false;
    this.vehicles.push(
      new NetVehicle(this.nextId++, ruta, 0, COLORES[this.nextId % COLORES.length], this.simTime),
    );
    return true;
  }

  /** Botón de peatón de un nodo: el controlador intercala la fase peatonal
   *  y aparecen peatones visibles en los cuatro cruces de ese nodo. */
  pedirPeaton(nodo: NodeId, fuente: EventSource = 'ui'): void {
    void fuente;
    this.peatones.set(nodo, true);
    for (const cruce of DIRECTIONS) {
      const enEspera = this.peatonesVis.filter(
        (p) => p.nodo === nodo && p.cruce === cruce && p.progreso < 0.05,
      ).length;
      if (enEspera < 2) {
        this.peatonesVis.push({
          id: this.nextPedId++,
          nodo,
          cruce,
          progreso: 0,
          color: ROPA[this.nextPedId % ROPA.length],
        });
      }
    }
  }

  /** ¿El semáforo peatonal de un cruce de este nodo está en verde? (vía en rojo) */
  private peatonPuedeCruzar(nodo: NodeId, cruce: Direction): boolean {
    return this.controllers.get(nodo)!.state(GROUP_OF[cruce]) === 'ROJO';
  }

  /** Ambulancia: entra por una entrada aleatoria; cada semáforo que la ve
   *  llegar le abre paso (regla EMERGENCIA, ahora en cascada por la red). */
  enviarAmbulancia(fuente: EventSource = 'ui'): void {
    void fuente;
    const libres = this.graph.entradas.filter((e) => this.hayEspacio(e.id, 0));
    if (libres.length === 0) return;
    const entrada = libres[Math.floor(this.rng() * libres.length)];
    const ruta = this.rutaNueva(entrada);
    if (!ruta) return;
    this.vehicles.push(new NetVehicle(this.nextId++, ruta, 0, 0xffffff, this.simTime, true));
  }

  /**
   * Provoca una colisión que bloquea una vía de acceso al nodo (botón UI/Wokwi).
   * Elige el acceso con más autos cerca del cruce; marca hasta 2 como
   * accidentados (serán el obstáculo) o, si no hay, deja un obstáculo-marcador.
   */
  provocarColision(nodo: NodeId, fuente: EventSource = 'ui'): boolean {
    void fuente;
    if (this.incidentes.size >= MAX_INCIDENTES) return false;
    const libres = (this.graph.entrantes.get(nodo) ?? []).filter(
      (e) => !this.incidentes.has(e.id) && (this.cooldownColision.get(e.id) ?? 0) <= this.simTime,
    );
    if (libres.length === 0) return false;
    // Preferir aristas INTERNAS (con nodo aguas arriba): así hay un semáforo que
    // pueda desviar el flujo. Solo si no hay, caer a una entrada del borde.
    const internas = libres.filter((e) => e.from !== null);
    const candidatas = internas.length > 0 ? internas : libres;
    const sCrash = (arista: Edge) => arista.length - STOP_LINE - 2;
    // Prefiere el acceso con autos cerca del punto de choque.
    const conteo = (e: Edge) =>
      this.vehicles.filter((v) => v.edgeId === e.id && Math.abs(v.s - sCrash(e)) < 8).length;
    const arista = candidatas.reduce((mej, e) => (conteo(e) > conteo(mej) ? e : mej), candidatas[0]);
    const s = sCrash(arista);
    const involucrados = this.vehicles
      .filter((v) => v.edgeId === arista.id && !v.crashed && Math.abs(v.s - s) < 8)
      .sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s))
      .slice(0, 2);
    for (const v of involucrados) v.crashed = true;
    this.crearIncidente(arista, s, involucrados.map((v) => v.id));
    return true;
  }

  private crearIncidente(e: Edge, sCrash: number, autos: number[]): void {
    this.incidentes.set(e.id, { arista: e.id, nodo: e.to!, sCrash, desde: this.simTime, autos });
    this.bus.publish('red/eventos', { evento: 'colision', nodo: e.to!, arista: e.id, s: sCrash });
  }

  /** Un choque real se vuelve incidente que bloquea (con enfriamiento y tope). */
  private promoverIncidente(a: NetVehicle, b: NetVehicle): void {
    if (this.cfg.emergentesBloquean === false) return;
    if (this.incidentes.size >= MAX_INCIDENTES) return;
    const e = this.graph.edges.get(a.edgeId)!;
    if (!e.to) return; // no bloqueamos aristas de salida del mundo
    if (this.incidentes.has(e.id) || (this.cooldownColision.get(e.id) ?? 0) > this.simTime) return;
    a.crashed = true;
    b.crashed = true;
    this.crearIncidente(e, Math.min(a.s, b.s), [a.id, b.id]);
  }

  /** Auto-despeje: solo si está activado Y venció la duración. En modo manual
   *  los incidentes persisten hasta que se quiten desde el panel. */
  private actualizarIncidentes(): void {
    if (!this.autoDespeje) return;
    for (const [id, inc] of this.incidentes) {
      if (this.simTime - inc.desde >= DURACION_COLISION) this.limpiarIncidente(id);
    }
  }

  /** Quita un incidente: libera la vía, borra los accidentados y avisa a la red. */
  private limpiarIncidente(id: EdgeId): void {
    const inc = this.incidentes.get(id);
    if (!inc) return;
    this.incidentes.delete(id);
    this.cooldownColision.set(id, this.simTime + COOLDOWN_COLISION);
    if (inc.autos.length > 0) this.vehicles = this.vehicles.filter((v) => !inc.autos.includes(v.id));
    this.bus.publish('red/eventos', {
      evento: 'colision_despejada',
      nodo: inc.nodo,
      arista: id,
      duracion: this.simTime - inc.desde,
    });
  }

  /** Modo de despeje de accidentes: automático (a los ~10 s) o manual. */
  setAutoDespeje(auto: boolean): void {
    this.autoDespeje = auto;
  }

  /** Despeje manual de un accidente (desde el listado del panel). */
  despejarColision(arista: EdgeId): void {
    this.limpiarIncidente(arista);
  }

  /** Despeje manual de todos los accidentes activos. */
  despejarTodas(): void {
    for (const id of [...this.incidentes.keys()]) this.limpiarIncidente(id);
  }

  /**
   * La CONGESTIÓN de la demo: precarga una fila de autos en los accesos del
   * nodo elegido (ráfaga). La cola emerge, el semáforo local la detecta con sus
   * sensores y avisa al resto de la red por el bus.
   */
  generarCongestion(nodo: NodeId, autos = 16, fuente: 'ui' | 'wokwi' = 'ui'): void {
    void fuente; // la fuente se persiste en Fase 5
    // Concentrar la ráfaga en ≤2 accesos: colas más largas ⇒ congestión clara.
    const corredores = this.corredoresHacia(nodo).slice(0, 2);
    if (corredores.length === 0) return;
    for (let i = 0; i < autos; i++) {
      const corredor = corredores[i % corredores.length];
      this.precargar(corredor, Math.floor(i / corredores.length));
    }
  }

  /** Aristas rectas aguas arriba de cada acceso del nodo (para la ráfaga). */
  private corredoresHacia(nodo: NodeId): Edge[][] {
    const corredores: Edge[][] = [];
    for (const llegada of this.graph.entrantes.get(nodo) ?? []) {
      const tramo: Edge[] = [llegada];
      // Camina hacia atrás en línea recta hasta la entrada del borde.
      let actual = llegada;
      while (actual.from) {
        const previa = (this.graph.entrantes.get(actual.from) ?? []).find(
          (e) => e.dir === actual.dir,
        );
        if (!previa) break;
        tramo.unshift(previa);
        actual = previa;
      }
      corredores.push(tramo);
    }
    return corredores;
  }

  /** Coloca un auto en el corredor, en el hueco n contando desde el nodo. */
  private precargar(corredor: Edge[], n: number): void {
    const paso = CAR_LEN + CAR_GAP;
    // Distancia hacia atrás desde la línea de alto de la última arista.
    let restante = n * paso;
    for (let i = corredor.length - 1; i >= 0; i--) {
      const e = corredor[i];
      const tope = i === corredor.length - 1 ? e.length - STOP_LINE : e.length;
      if (restante <= tope) {
        const destino = this.salidaRecta(corredor[corredor.length - 1]);
        if (!destino) return;
        const ruta = corredor.slice(i).map((x) => x.id);
        const cola = rutaHacia(this.graph, corredor[corredor.length - 1].to!, destino.id, (a) => a.length);
        if (!cola) return;
        const v = new NetVehicle(
          this.nextId++,
          [...ruta, ...cola],
          0,
          COLORES[this.nextId % COLORES.length],
          this.simTime,
        );
        v.s = tope - restante;
        this.vehicles.push(v);
        return;
      }
      restante -= tope;
    }
  }

  /** Salida del borde alineada recto con la arista de llegada. */
  private salidaRecta(llegada: Edge): Edge | null {
    const v = VEC[llegada.dir];
    let nodo = llegada.to;
    while (nodo) {
      const recta = this.graph.salientes.get(nodo)!.find((e) => {
        const w = VEC[e.dir];
        return w.ux === v.ux && w.uz === v.uz;
      });
      if (!recta) return null;
      if (!recta.to) return recta;
      nodo = recta.to;
    }
    return null;
  }

  // ── Paso de simulación ──────────────────────────────────────────────

  /** Avanza `segundos` de tiempo simulado en pasos fijos (determinista). */
  avanzar(segundos: number): void {
    const pasos = Math.round(segundos / STEP);
    for (let i = 0; i < pasos; i++) this.step();
  }

  update(realDt: number, speed: number): void {
    this.avanzar(realDt * speed);
  }

  private step(): void {
    this.simTime += STEP;
    this.actualizarIncidentes();
    this.medirColas();
    this.detectarCongestion();
    if (this.cfg.coordinado) this.publicarFlujos();

    for (const [id, ctrl] of this.controllers) {
      ctrl.update({ dt: STEP, simTime: this.simTime, reading: this.lectura(id) });
      // El controlador inteligente avisa cuando ya atendió al peatón.
      if (ctrl instanceof SmartController && ctrl.peatonServido) this.peatones.set(id, false);
    }

    this.spawn();
    this.mover();
    this.avanzarPeatones();
    this.detectarColisiones();
  }

  /** Los peatones avanzan solo si su semáforo peatonal está en verde. */
  private avanzarPeatones(): void {
    for (const p of this.peatonesVis) {
      if (this.peatonPuedeCruzar(p.nodo, p.cruce)) p.progreso += (PED_SPEED * STEP) / PED_TRAMO;
    }
    this.peatonesVis = this.peatonesVis.filter((p) => p.progreso < 1);
  }

  /**
   * Detector de colisiones (instrumentación, no altera la dinámica):
   * dos autos cuyos centros quedan a menos de UMBRAL_COLISION están en
   * colisión. Histéresis por par — cada roce se registra UNA vez, con las
   * circunstancias del momento para el análisis posterior.
   */
  private detectarColisiones(): void {
    const puntos = this.vehicles.map((v) => ({
      v,
      p: this.graph.posicionEnRuta(v.edgeId, v.s, v.route[v.idx - 1], v.route[v.idx + 1]),
    }));
    const porId = new Map(puntos.map((e) => [e.v.id, e]));

    // Salida de la histéresis: par despawneado o ya separado.
    for (const clave of this.paresEnContacto) {
      const [a, b] = clave.split(':').map(Number);
      const A = porId.get(a);
      const B = porId.get(b);
      if (!A || !B || Math.hypot(A.p.x - B.p.x, A.p.z - B.p.z) > UMBRAL_SEPARACION) {
        this.paresEnContacto.delete(clave);
      }
    }

    for (let i = 0; i < puntos.length; i++) {
      for (let j = i + 1; j < puntos.length; j++) {
        const A = puntos[i];
        const B = puntos[j];
        const dx = A.p.x - B.p.x;
        if (dx > UMBRAL_COLISION || dx < -UMBRAL_COLISION) continue;
        const dz = A.p.z - B.p.z;
        if (dz > UMBRAL_COLISION || dz < -UMBRAL_COLISION) continue;
        const clave = `${A.v.id}:${B.v.id}`;
        if (this.paresEnContacto.has(clave)) continue;
        if (Math.hypot(dx, dz) >= UMBRAL_COLISION) continue;
        this.paresEnContacto.add(clave);
        this.registrarColision(A.v, B.v, (A.p.x + B.p.x) / 2, (A.p.z + B.p.z) / 2);
        this.promoverIncidente(A.v, B.v);
      }
    }
  }

  /** ¿El auto está dentro de la zona de giro cambiando de dirección? */
  private girando(v: NetVehicle): boolean {
    const e = this.graph.edges.get(v.edgeId)!;
    const sig = v.route[v.idx + 1] ? this.graph.edges.get(v.route[v.idx + 1])! : null;
    if (sig && v.s > e.length - STOP_LINE && sig.dir !== e.dir) return true;
    const prev = v.idx > 0 ? this.graph.edges.get(v.route[v.idx - 1])! : null;
    return prev !== null && v.s < STOP_LINE && prev.dir !== e.dir;
  }

  private registrarColision(a: NetVehicle, b: NetVehicle, x: number, z: number): void {
    // Nodo más cercano al punto del choque (la cuadrícula es chica: 9 nodos).
    let nodo = 'A1';
    let mejor = Infinity;
    for (const n of this.graph.nodes.values()) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < mejor) {
        mejor = d;
        nodo = n.id;
      }
    }
    const ctrl = this.controllers.get(nodo)!;
    const eA = this.graph.edges.get(a.edgeId)!;
    const eB = this.graph.edges.get(b.edgeId)!;

    let tipo: CollisionEvent['tipo'];
    if (this.girando(a) || this.girando(b)) tipo = 'giro';
    else if (a.edgeId !== b.edgeId && eA.dir !== eB.dir) tipo = 'cruce';
    else if (a.edgeId !== b.edgeId || Math.min(a.s, b.s) < STOP_LINE) tipo = 'incorporacion';
    else tipo = 'carril';

    const estado = (v: NetVehicle): VehiculoEnColision => ({
      id: v.id,
      arista: v.edgeId,
      s: v.s,
      committed: v.committed,
      parado: v.parado,
      girando: this.girando(v),
    });

    this.colisiones.push({
      n: this.colisiones.length + 1,
      simTime: this.simTime,
      x,
      z,
      nodo,
      luces: { ns: ctrl.state('NS'), ew: ctrl.state('EW') },
      tipo,
      duranteColacion: this.congestionadas.size > 0,
      coordinado: this.cfg.coordinado,
      autos: [estado(a), estado(b)],
    });
  }

  /** Registro completo de colisiones (para el análisis headless). */
  colisionesRegistradas(): readonly CollisionEvent[] {
    return this.colisiones;
  }

  /** Lectura de sensores LOCAL de un nodo (+ anticipos de vecinos si coordina). */
  private lectura(nodo: NodeId): SensorReading {
    const colaPorVia: Record<string, number> = { N: 0, S: 0, E: 0, O: 0 };
    let emergenciaEnVia: string | null = null;
    for (const e of this.graph.entrantes.get(nodo) ?? []) {
      let demanda = this.colas.get(e.id) ?? 0;
      if (this.cfg.coordinado) demanda += (this.anticipos.get(e.id) ?? 0) * FACTOR_ANTICIPO;
      colaPorVia[e.dir] += demanda;
      // Ambulancia acercándose por este acceso → regla EMERGENCIA del nodo.
      if (!emergenciaEnVia && this.vehicles.some((v) => v.esEmergencia && v.edgeId === e.id)) {
        emergenciaEnVia = e.dir;
      }
    }
    return {
      colaPorVia,
      peatonEsperando: this.peatones.get(nodo) ?? false,
      emergenciaEnVia,
      horaSimulada: this.horaInput,
    };
  }

  private medirColas(): void {
    this.colas.clear();
    for (const v of this.vehicles) {
      if (v.parado) this.colas.set(v.edgeId, (this.colas.get(v.edgeId) ?? 0) + 1);
    }
    for (const c of this.colas.values()) this.colaMax = Math.max(this.colaMax, c);
  }

  /**
   * El semáforo local detecta la colación con sus sensores y avisa a la red.
   * Con persistencia: la cola de un rojo normal sube y baja en cada ciclo;
   * solo es colación si el umbral se sostiene varios segundos seguidos.
   */
  private detectarCongestion(): void {
    for (const e of this.graph.edges.values()) {
      if (!e.to) continue;
      const cola = this.colas.get(e.id) ?? 0;
      const activa = this.congestionadas.get(e.id);

      if (!activa) {
        if (cola >= UMBRAL_CONGESTION) {
          if (!this.altaDesde.has(e.id)) this.altaDesde.set(e.id, this.simTime);
          if (this.simTime - this.altaDesde.get(e.id)! >= PERSISTENCIA_CONGESTION) {
            const evento: CongestionActiva = { nodo: e.to, arista: e.id, desde: this.simTime };
            this.congestionadas.set(e.id, evento);
            this.bajaDesde.delete(e.id);
            this.bus.publish('red/eventos', { evento: 'congestion', nodo: e.to, arista: e.id, cola });
          }
        } else {
          this.altaDesde.delete(e.id);
        }
      } else {
        if (cola <= UMBRAL_DESPEJE) {
          if (!this.bajaDesde.has(e.id)) this.bajaDesde.set(e.id, this.simTime);
          if (this.simTime - this.bajaDesde.get(e.id)! >= PERSISTENCIA_DESPEJE) {
            this.congestionadas.delete(e.id);
            this.altaDesde.delete(e.id);
            const duracion = this.simTime - activa.desde;
            this.despejes.push({ arista: e.id, duracion });
            this.bus.publish('red/eventos', { evento: 'despeje', nodo: activa.nodo, arista: e.id, duracion });
          }
        } else {
          this.bajaDesde.delete(e.id);
        }
      }
    }
  }

  /** Aviso periódico a vecinos: "van N autos hacia ti por esta arista". */
  private publicarFlujos(): void {
    if (this.simTime - this.ultimoFlujo < PERIODO_FLUJO) return;
    this.ultimoFlujo = this.simTime;
    this.anticipos.clear();
    const enMovimiento = new Map<EdgeId, number>();
    for (const v of this.vehicles) {
      if (!v.parado) enMovimiento.set(v.edgeId, (enMovimiento.get(v.edgeId) ?? 0) + 1);
    }
    for (const [arista, autos] of enMovimiento) {
      const e = this.graph.edges.get(arista)!;
      if (!e.to) continue;
      this.anticipos.set(arista, autos);
      this.bus.publish(`red/${e.to}/flujo`, {
        evento: 'flujo',
        de: e.from ?? 'ext',
        hacia: e.to,
        arista,
        autos,
      });
    }
  }

  /** Congestión/colisión (o su despeje) recibido: los autos re-rutean. */
  private alRecibirEvento(msg: NetMsg): void {
    if (msg.evento === 'flujo') return;
    for (const v of this.vehicles) {
      if (v.committed) continue;
      const actual = this.graph.edges.get(v.edgeId)!;
      if (!actual.to) continue; // ya va saliendo del mundo
      const salida = v.route[v.route.length - 1];
      if (salida === v.edgeId) continue;
      // Evitar el giro en U: no volver al nodo del que el auto viene (actual.from).
      const nueva = rutaHacia(this.graph, actual.to, salida, (e) => this.peso(e), actual.from ?? undefined);
      if (nueva) v.route = [...v.route.slice(0, v.idx + 1), ...nueva];
    }
  }

  /** Peso vivo de una arista: largo + k·cola + castigos por congestión/colisión. */
  private peso(e: Edge): number {
    return (
      e.length +
      K_COLA * (this.colas.get(e.id) ?? 0) +
      (this.congestionadas.has(e.id) ? CASTIGO_CONGESTION : 0) +
      (this.incidentes.has(e.id) ? CASTIGO_COLISION : 0)
    );
  }

  private spawn(): void {
    // Menos tráfico ambiental de madrugada (habilita el modo NOCTURNO).
    const mult = 1 - 0.9 * nocheFactor(this.horaInput);
    for (const entrada of this.graph.entradas) {
      if (this.rng() >= this.cfg.rate * mult * STEP) continue;
      if (!this.hayEspacio(entrada.id, 0)) continue;
      const ruta = this.rutaNueva(entrada);
      if (!ruta) continue;
      this.vehicles.push(
        new NetVehicle(this.nextId++, ruta, 0, COLORES[this.nextId % COLORES.length], this.simTime),
      );
    }
  }

  /** Ruta de una entrada a una salida aleatoria (sin vuelta en U inmediata). */
  private rutaNueva(entrada: Edge): EdgeId[] | null {
    const candidatas = this.graph.salidas.filter((s) => !this.graph.esVueltaEnU(entrada, s));
    const salida = candidatas[Math.floor(this.rng() * candidatas.length)];
    // Coordinado: pesos vivos desde el nacimiento. Fijo: solo distancia.
    const peso = this.cfg.coordinado ? (e: Edge) => this.peso(e) : (e: Edge) => e.length;
    const camino = rutaHacia(this.graph, entrada.to!, salida.id, peso);
    return camino ? [entrada.id, ...camino] : null;
  }

  private hayEspacio(arista: EdgeId, desdeS: number): boolean {
    for (const v of this.vehicles) {
      if (v.edgeId === arista && v.s - desdeS < CAR_LEN + CAR_GAP && v.s >= desdeS) return false;
    }
    return true;
  }

  /** ¿En qué interior de intersección está el auto y cuán avanzado lo cruza? */
  private interior(v: NetVehicle): { nodo: NodeId; avance: number } | null {
    const e = this.graph.edges.get(v.edgeId)!;
    if (e.to && v.s > e.length - STOP_LINE) return { nodo: e.to, avance: v.s - (e.length - STOP_LINE) };
    if (e.from && v.s < STOP_LINE) return { nodo: e.from, avance: STOP_LINE + v.s };
    return null;
  }

  private mundo(v: NetVehicle) {
    return this.graph.posicionEnRuta(v.edgeId, v.s, v.route[v.idx - 1], v.route[v.idx + 1]);
  }

  private mover(): void {
    // Agrupa por arista y ordena del líder hacia atrás.
    const porArista = new Map<EdgeId, NetVehicle[]>();
    for (const v of this.vehicles) {
      const lista = porArista.get(v.edgeId);
      if (lista) lista.push(v);
      else porArista.set(v.edgeId, [v]);
    }
    for (const lista of porArista.values()) lista.sort((a, b) => b.s - a.s);

    // Instantánea de los autos dentro del interior de cada intersección, para
    // mantener separación en espacio-mundo entre trayectorias que se cruzan
    // (las curvas de giro comprimen la distancia que `s` no ve).
    const interiores = this.vehicles
      .map((v) => ({ v, ni: this.interior(v) }))
      .filter((e): e is { v: NetVehicle; ni: { nodo: NodeId; avance: number } } => e.ni !== null)
      .map((e) => ({
        v: e.v,
        nodo: e.ni.nodo,
        avance: e.v.crashed ? Infinity : e.ni.avance,
        ...this.mundo(e.v),
      }));

    const terminados: NetVehicle[] = [];

    for (const [aristaId, lista] of porArista) {
      const arista = this.graph.edges.get(aristaId)!;
      const incidente = this.incidentes.get(aristaId);
      for (let i = 0; i < lista.length; i++) {
        const v = lista[i];
        // Los autos accidentados no se mueven: son el obstáculo del incidente.
        if (v.crashed) {
          v.parado = true;
          continue;
        }
        const sAntes = v.s;

        // ¿Puede cruzar el nodo al final de la arista?
        if (!v.committed && this.puedeCruzar(v, arista)) {
          if (v.s >= arista.length - STOP_LINE) v.committed = true;
        }
        let sMax = Infinity;
        if (!v.committed && arista.to) sMax = arista.length - STOP_LINE;
        if (i > 0) sMax = Math.min(sMax, lista[i - 1].s - (CAR_LEN + CAR_GAP));
        // Vía bloqueada por colisión: los autos detrás del choque se detienen.
        if (incidente && v.s < incidente.sCrash) {
          sMax = Math.min(sMax, incidente.sCrash - (CAR_LEN + CAR_GAP));
        }

        let nuevaS = Math.min(v.s + CAR_SPEED * STEP, Math.max(sMax, v.s));
        // Piso de separación en espacio-mundo dentro del cruce: si el auto va a
        // encimarse con otro que comparte el interior del nodo, cede (retrocede
        // el avance) el MENOS avanzado. Cubre giros en la misma vía y arcos que
        // se cruzan al entrar/salir por vías distintas — lo que `s` no ve.
        const ni = this.interior(v);
        if (ni) {
          const rivales = interiores.filter(
            (r) =>
              r.v !== v &&
              r.nodo === ni.nodo &&
              (ni.avance < r.avance || (ni.avance === r.avance && v.id > r.v.id)),
          );
          if (rivales.length > 0) {
            let probe = nuevaS;
            for (let k = 0; k < 6; k++) {
              const vp = this.graph.posicionEnRuta(v.edgeId, probe, v.route[v.idx - 1], v.route[v.idx + 1]);
              if (rivales.every((r) => Math.hypot(vp.x - r.x, vp.z - r.z) >= GAP_MUNDO)) break;
              probe = Math.max(v.s, probe - GAP_MUNDO * 0.4);
            }
            nuevaS = probe;
          }
        }
        v.s = nuevaS;
        v.parado = v.s - sAntes < 1e-6;
        if (v.parado) v.esperaAcum += STEP;

        // Fin de la arista: pasa a la siguiente o sale del mundo.
        if (v.s >= arista.length) {
          if (v.idx === v.route.length - 1) {
            terminados.push(v);
          } else {
            v.idx++;
            v.s -= arista.length;
            v.committed = false;
          }
        }
      }
    }

    if (terminados.length > 0) {
      for (const v of terminados) {
        this.procesados++;
        this.esperaTotalProcesados += v.esperaAcum;
      }
      this.vehicles = this.vehicles.filter((v) => !terminados.includes(v));
    }
  }

  /** Verde en su acceso y espacio en la siguiente arista (evita bloqueo). */
  private puedeCruzar(v: NetVehicle, arista: Edge): boolean {
    if (!arista.to) return true; // corre hacia el borde del mundo
    const luz = this.controllers.get(arista.to)!.state(GROUP_OF[arista.dir]);
    if (luz !== 'VERDE' && luz !== 'INTERMITENTE') return false;
    const siguiente = v.route[v.idx + 1];
    if (!siguiente) return true;
    // Señal por movimiento (Coordinada): el semáforo CIERRA el movimiento que
    // lleva a un tramo con colisión — flecha roja al recto hacia el accidente,
    // giros abiertos. El auto espera y el re-ruteo lo manda por un giro.
    if (this.cfg.coordinado && this.incidentes.has(siguiente)) return false;
    return this.hayEspacio(siguiente, 0);
  }

  // ── Lecturas para render / HUD / métricas ───────────────────────────

  vehiclesRender(): {
    id: number;
    x: number;
    z: number;
    heading: number;
    color: number;
    esEmergencia: boolean;
    crashed: boolean;
  }[] {
    return this.vehicles.map((v) => {
      // Con el contexto de ruta, los giros dentro del cruce se ven en curva.
      const p = this.graph.posicionEnRuta(v.edgeId, v.s, v.route[v.idx - 1], v.route[v.idx + 1]);
      return {
        id: v.id,
        x: p.x,
        z: p.z,
        heading: p.heading,
        color: v.color,
        esEmergencia: v.esEmergencia,
        crashed: v.crashed,
      };
    });
  }

  /**
   * Elige un auto para "seguir" (validación visual del re-ruteo): uno no
   * comprometido cuya ruta pase MÁS ADELANTE por `nodoPreferido` con margen para
   * rerutear (≥2 aristas antes de ese nodo). Prefiere el más próximo a entrar.
   * Devuelve null si ninguno pasa por ese nodo ahora mismo.
   */
  seguirAuto(nodoPreferido?: NodeId): number | null {
    let mejor: NetVehicle | null = null;
    for (const v of this.vehicles) {
      if (v.committed || v.crashed) continue;
      const restantes = v.route.slice(v.idx);
      if (restantes.length < 3) continue;
      if (nodoPreferido) {
        // Índice (dentro de las restantes) de la arista que ENTRA al nodo.
        const k = restantes.findIndex((id) => this.graph.edges.get(id)!.to === nodoPreferido);
        if (k < 2) continue; // no pasa por el nodo, o ya demasiado cerca para rerutear
      }
      // Preferir el auto más avanzado en su ruta (más cerca de entrar al nodo).
      if (!mejor || v.idx > mejor.idx) mejor = v;
    }
    return mejor ? mejor.id : null;
  }

  /**
   * Ruta restante de un auto para dibujarla: polilínea en coordenadas de mundo
   * (muestreando cada arista) + los nodos que aún atravesará. null si ya salió.
   */
  rutaMundo(id: number): { puntos: { x: number; z: number }[]; pasaPor: NodeId[] } | null {
    const v = this.vehicles.find((x) => x.id === id);
    if (!v) return null;
    const puntos: { x: number; z: number }[] = [];
    const pasaPor: NodeId[] = [];
    for (let i = v.idx; i < v.route.length; i++) {
      const e = this.graph.edges.get(v.route[i])!;
      const desde = i === v.idx ? v.s : 0;
      // Muestreo: inicio (o posición actual), medio y fin de cada arista.
      for (const s of [desde, (desde + e.length) / 2, e.length]) {
        const p = this.graph.posicionEn(e.id, s);
        puntos.push({ x: p.x, z: p.z });
      }
      if (e.to) pasaPor.push(e.to);
    }
    return { puntos, pasaPor };
  }

  /** Peatones para el render: posición mundial = centro del nodo + cruce local. */
  pedestriansRender(): { id: number; x: number; z: number; heading: number; color: number }[] {
    return this.peatonesVis.map((p) => {
      const n = this.graph.nodes.get(p.nodo)!;
      const local = pedPlacement(p.cruce, p.progreso);
      return { id: p.id, x: n.x + local.x, z: n.z + local.z, heading: local.heading, color: p.color };
    });
  }

  snapshot(): RedSnapshot {
    const luces: Record<NodeId, { ns: LightState; ew: LightState }> = {};
    const colasPorNodo: Record<NodeId, number> = {};
    for (const [id, ctrl] of this.controllers) {
      luces[id] = { ns: ctrl.state('NS'), ew: ctrl.state('EW') };
      let cola = 0;
      for (const e of this.graph.entrantes.get(id) ?? []) cola += this.colas.get(e.id) ?? 0;
      colasPorNodo[id] = cola;
    }
    return {
      simTime: this.simTime,
      hora: this.horaInput,
      procesados: this.procesados,
      enRed: this.vehicles.length,
      esperaPromedio: this.procesados > 0 ? this.esperaTotalProcesados / this.procesados : 0,
      colaMax: this.colaMax,
      congestiones: [...this.congestionadas.values()],
      despejes: [...this.despejes],
      colisiones: this.colisiones.length,
      ultimasColisiones: this.colisiones.slice(-3),
      incidentes: [...this.incidentes.values()].map((inc) => {
        const p = this.graph.posicionEn(inc.arista, inc.sCrash);
        return { arista: inc.arista, nodo: inc.nodo, x: p.x, z: p.z, desde: inc.desde };
      }),
      movimientosCerrados: this.cfg.coordinado ? [...this.incidentes.keys()] : [],
      luces,
      colasPorNodo,
    };
  }
}
