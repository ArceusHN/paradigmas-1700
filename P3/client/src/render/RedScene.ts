import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EdgeId, Group } from 'shared';
import type { NetworkSimulation, RedSnapshot } from '../core/Network';
import { BLOCK, ENTRY_LEN, GRID_COLS, GRID_ROWS, VEC } from '../core/Graph';
import { nocheFactor, ROAD_HALF, STOP_LINE } from '../core/world';
import { TrafficLightMesh } from './TrafficLightMesh';
import { createCarMesh } from './VehicleMesh';
import { createPedestrianMesh } from './PedestrianMesh';

const COLOR_DIA = new THREE.Color(0x1b2a44);
const COLOR_NOCHE = new THREE.Color(0x05060a);

/**
 * Escena de la RED (Fase 4): cuadrícula 4×2 de intersecciones. Igual que en
 * la Fase 2/3, el render solo LEE el estado del núcleo (`vehiclesRender()`,
 * `snapshot()`) y lo pinta — ninguna decisión de simulación vive aquí.
 */
export class RedScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();

  private readonly lights: { mesh: TrafficLightMesh; nodo: string; group: Group }[] = [];
  private readonly carPool = new Map<number, THREE.Group>();
  /** Overlays rojos sobre las aristas en colación. */
  private readonly congPool = new Map<EdgeId, THREE.Mesh>();
  private readonly congMat = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  /** Marcadores pulsantes en los puntos de colisión recientes (roces). */
  private readonly colPool = new Map<number, THREE.Mesh>();
  private readonly colMat = new THREE.MeshBasicMaterial({
    color: 0xff2d55,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  /** Marcadores de incidente (vía bloqueada) mientras dura la colisión. */
  private readonly incPool = new Map<EdgeId, THREE.Group>();
  /** Flechas de desvío por nodo que cierra un movimiento (roja + verdes). */
  private readonly desviosPool = new Map<EdgeId, THREE.Group>();
  /** Peatones cruzando, por id. */
  private readonly pedPool = new Map<number, THREE.Group>();
  /** Auto en foco: cinta de su ruta restante + halo que lo sigue. */
  private rutaMesh?: THREE.Mesh;
  private halo!: THREE.Mesh;
  // Cian: contrasta con el azul del anillo del nodo activo y los rojos de eventos.
  private readonly rutaMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  /** Etiqueta (sprite) por nodo + su anillo de resaltado del nodo activo. */
  private readonly nodeLabels = new Map<string, THREE.Sprite>();
  private anilloActivo!: THREE.Mesh;

  sim: NetworkSimulation;
  speed = 1;
  paused = false;
  /** Nodo activo del panel: se resalta en la escena (lo fija RedControls). */
  nodoActivo = 'B1';
  /** Id del auto en foco (lo fija RedControls); null = ninguno. */
  focusId: number | null = null;
  onStats?: (s: RedSnapshot) => void;

  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement, sim: NetworkSimulation) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = COLOR_DIA.clone();
    this.scene.fog = new THREE.Fog(0x1b2a44, 300, 700);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
    this.camera.position.set(0, 150, 170);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202028, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sun.position.set(60, 120, 50);
    this.scene.add(this.sun);

    this.buildCiudad();
    this.buildSemaforos();
    this.buildEtiquetas();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Etiqueta flotante (sprite con texto) sobre cada intersección + anillo del
   *  nodo activo, para saber a qué corresponde cada nodo del panel. */
  private buildEtiquetas(): void {
    for (const n of this.sim.graph.nodes.values()) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.textoTextura(n.id), depthTest: false, transparent: true }),
      );
      sprite.position.set(n.x, 18, n.z);
      sprite.scale.set(12, 6, 1);
      this.scene.add(sprite);
      this.nodeLabels.set(n.id, sprite);
    }
    this.anilloActivo = new THREE.Mesh(
      new THREE.RingGeometry(11, 13, 40),
      new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.anilloActivo.rotation.x = -Math.PI / 2;
    this.anilloActivo.position.y = 0.04;
    this.scene.add(this.anilloActivo);

    // Halo del auto en foco (oculto hasta que se sigue a uno).
    this.halo = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.8, 24),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.visible = false;
    this.scene.add(this.halo);
  }

  /** Textura de texto (canvas) para las etiquetas — sin assets externos. */
  private textoTextura(texto: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(16,20,30,0.85)';
    ctx.strokeStyle = '#4f8cff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(6, 6, 244, 116, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e6e9ef';
    ctx.font = 'bold 74px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 128, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  /** Cambia la simulación en caliente (toggle ON/OFF, semilla nueva). */
  reemplazar(sim: NetworkSimulation): void {
    this.sim = sim;
    this.clearVehicles();
    for (const [, m] of this.congPool) this.scene.remove(m);
    this.congPool.clear();
    for (const [, m] of this.colPool) this.scene.remove(m);
    this.colPool.clear();
    for (const [, g] of this.incPool) this.scene.remove(g);
    this.incPool.clear();
    for (const [, g] of this.desviosPool) this.scene.remove(g);
    this.desviosPool.clear();
    for (const [, g] of this.pedPool) this.scene.remove(g);
    this.pedPool.clear();
    this.focusId = null;
    this.limpiarFoco();
  }

  /**
   * Señal por movimiento: en el nodo aguas arriba de cada colisión, una flecha
   * ROJA sobre el movimiento cerrado (recto hacia el accidente) y flechas
   * VERDES sobre los giros abiertos — el semáforo desviando, visible.
   */
  private syncDesvios(s: RedSnapshot): void {
    const activos = new Set(s.movimientosCerrados);
    for (const cerrada of s.movimientosCerrados) {
      if (this.desviosPool.has(cerrada)) continue;
      const e = this.sim.graph.edges.get(cerrada);
      if (!e || !e.from) continue;
      const g = new THREE.Group();
      // Flecha roja sobre la boca del movimiento cerrado.
      g.add(this.flecha(e.id, 0xff2d55));
      // Flechas verdes sobre los giros abiertos del mismo nodo.
      for (const alt of this.sim.graph.salientes.get(e.from) ?? []) {
        if (alt.id === cerrada || !alt.to) continue;
        g.add(this.flecha(alt.id, 0x34c759));
      }
      this.scene.add(g);
      this.desviosPool.set(cerrada, g);
    }
    for (const [id, g] of this.desviosPool) {
      if (!activos.has(id)) {
        this.scene.remove(g);
        this.desviosPool.delete(id);
      }
    }
  }

  /** Flecha chata sobre la boca de una arista, apuntando en su sentido. */
  private flecha(edgeId: EdgeId, color: number): THREE.Mesh {
    const e = this.sim.graph.edges.get(edgeId)!;
    const v = VEC[e.dir];
    const cono = new THREE.Mesh(
      new THREE.ConeGeometry(2, 6, 14),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }),
    );
    const p = this.sim.graph.posicionEn(e.id, STOP_LINE + 4);
    cono.position.set(p.x, 2.2, p.z);
    // El cono apunta +Y por defecto; lo acostamos hacia el sentido de avance.
    cono.rotation.z = -Math.PI / 2 * v.ux; // hacia ±X
    cono.rotation.x = Math.PI / 2 * v.uz; // hacia ±Z
    return cono;
  }

  /** Sincroniza los meshes de peatones con los del núcleo. */
  private syncPeatones(): void {
    const ids = new Set<number>();
    for (const p of this.sim.pedestriansRender()) {
      ids.add(p.id);
      let mesh = this.pedPool.get(p.id);
      if (!mesh) {
        mesh = createPedestrianMesh(p.color);
        this.scene.add(mesh);
        this.pedPool.set(p.id, mesh);
      }
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.heading;
    }
    for (const [id, mesh] of this.pedPool) {
      if (!ids.has(id)) {
        this.scene.remove(mesh);
        this.pedPool.delete(id);
      }
    }
  }

  /** Resalta la etiqueta del nodo activo y mueve el anillo a su posición. */
  private syncNodoActivo(): void {
    for (const [id, sprite] of this.nodeLabels) {
      const activo = id === this.nodoActivo;
      sprite.scale.set(activo ? 15 : 12, activo ? 7.5 : 6, 1);
      (sprite.material as THREE.SpriteMaterial).opacity = activo ? 1 : 0.7;
    }
    const n = this.sim.graph.nodes.get(this.nodoActivo);
    if (n) this.anilloActivo.position.set(n.x, 0.04, n.z);
    this.anilloActivo.visible = !!n;
  }

  /** Cinta de la ruta del auto en foco + halo que lo sigue. La cinta se
   *  redibuja cada frame desde el núcleo, así el re-ruteo se ve en vivo. */
  private syncFoco(t: number): void {
    const ruta = this.focusId !== null ? this.sim.rutaMundo(this.focusId) : null;
    if (!ruta || ruta.puntos.length < 2) {
      this.limpiarFoco();
      return;
    }
    const curva = new THREE.CatmullRomCurve3(ruta.puntos.map((p) => new THREE.Vector3(p.x, 0.35, p.z)));
    const geo = new THREE.TubeGeometry(curva, ruta.puntos.length * 4, 1.0, 8, false);
    if (this.rutaMesh) {
      this.rutaMesh.geometry.dispose();
      this.rutaMesh.geometry = geo;
    } else {
      this.rutaMesh = new THREE.Mesh(geo, this.rutaMat);
      this.scene.add(this.rutaMesh);
    }
    this.rutaMat.opacity = 0.55 + 0.2 * Math.sin(t * 4);

    // Halo sobre el auto (su posición viene de vehiclesRender por id).
    const auto = this.sim.vehiclesRender().find((v) => v.id === this.focusId);
    if (auto) {
      this.halo.visible = true;
      this.halo.position.set(auto.x, 0.15, auto.z);
      this.halo.scale.setScalar(1 + 0.1 * Math.sin(t * 6));
    } else {
      this.halo.visible = false;
    }
  }

  private limpiarFoco(): void {
    if (this.rutaMesh) {
      this.scene.remove(this.rutaMesh);
      this.rutaMesh.geometry.dispose();
      this.rutaMesh = undefined;
    }
    this.halo.visible = false;
  }

  private nodoX(col: number): number {
    return (col - (GRID_COLS - 1) / 2) * BLOCK;
  }
  private nodoZ(row: number): number {
    return (row - (GRID_ROWS - 1) / 2) * BLOCK;
  }

  private buildCiudad(): void {
    const anchoX = (GRID_COLS - 1) * BLOCK + 2 * ENTRY_LEN + 20;
    const anchoZ = (GRID_ROWS - 1) * BLOCK + 2 * ENTRY_LEN + 20;
    const ancho = ROAD_HALF * 2;

    // Terreno claramente más claro que el asfalto para que la calle contraste.
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(anchoX + 60, anchoZ + 60),
      new THREE.MeshStandardMaterial({ color: 0x46536a }),
    );
    base.rotation.x = -Math.PI / 2;
    this.scene.add(base);

    // ── Calles: asfalto oscuro con borde de acera a cada lado ──
    const asfalto = new THREE.MeshStandardMaterial({ color: 0x23262c });
    const borde = new THREE.MeshStandardMaterial({ color: 0x9aa4b2 });
    for (let r = 0; r < GRID_ROWS; r++) {
      const z = this.nodoZ(r);
      const calle = new THREE.Mesh(new THREE.PlaneGeometry(anchoX, ancho), asfalto);
      calle.rotation.x = -Math.PI / 2;
      calle.position.set(0, 0.01, z);
      this.scene.add(calle);
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(anchoX, 0.25, 0.8), borde);
        b.position.set(0, 0.12, z + s * (ROAD_HALF + 0.4));
        this.scene.add(b);
      }
    }
    for (let c = 0; c < GRID_COLS; c++) {
      const x = this.nodoX(c);
      const calle = new THREE.Mesh(new THREE.PlaneGeometry(ancho, anchoZ), asfalto);
      calle.rotation.x = -Math.PI / 2;
      calle.position.set(x, 0.01, 0);
      this.scene.add(calle);
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, anchoZ), borde);
        b.position.set(x + s * (ROAD_HALF + 0.4), 0.12, 0);
        this.scene.add(b);
      }
    }

    // ── Señalización: líneas de alto + eje amarillo discontinuo ──
    const blanco = new THREE.MeshBasicMaterial({ color: 0xf4f6fb });
    const amarillo = new THREE.MeshBasicMaterial({ color: 0xf2c14e });
    const franja = (w: number, h: number, x: number, z: number, mat = blanco) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.03, z);
      this.scene.add(m);
    };
    for (let c = 0; c < GRID_COLS; c++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        const x = this.nodoX(c);
        const z = this.nodoZ(r);
        franja(ancho, 0.45, x, z - STOP_LINE);
        franja(ancho, 0.45, x, z + STOP_LINE);
        franja(0.45, ancho, x - STOP_LINE, z);
        franja(0.45, ancho, x + STOP_LINE, z);
      }
    }
    // Eje discontinuo de cada calle, saltando las intersecciones.
    const cercaDeNodo = (v: number, centros: number[]) =>
      centros.some((c) => Math.abs(v - c) < STOP_LINE + 2);
    const colsX = Array.from({ length: GRID_COLS }, (_, c) => this.nodoX(c));
    const rowsZ = Array.from({ length: GRID_ROWS }, (_, r) => this.nodoZ(r));
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let x = -anchoX / 2 + 2; x < anchoX / 2 - 2; x += 4) {
        if (!cercaDeNodo(x, colsX)) franja(2, 0.18, x, this.nodoZ(r), amarillo);
      }
    }
    for (let c = 0; c < GRID_COLS; c++) {
      for (let z = -anchoZ / 2 + 2; z < anchoZ / 2 - 2; z += 4) {
        if (!cercaDeNodo(z, rowsZ)) franja(0.18, 2, this.nodoX(c), z, amarillo);
      }
    }

    // ── Manzanas entre calles (aceras + un edificio por manzana) ──
    const acera = new THREE.MeshStandardMaterial({ color: 0x77818f });
    const coloresEd = [0x9c4a3a, 0x4a6b8a, 0xb08a3e, 0x5a7d5a, 0x7a5a8a, 0x8a6a4a];
    const lado = BLOCK - ancho - 3;
    let i = 0;
    for (let c = 0; c < GRID_COLS - 1; c++) {
      for (let r = 0; r < GRID_ROWS - 1; r++) {
        const x = (this.nodoX(c) + this.nodoX(c + 1)) / 2;
        const z = (this.nodoZ(r) + this.nodoZ(r + 1)) / 2;
        const pad = new THREE.Mesh(new THREE.BoxGeometry(lado, 0.4, lado), acera);
        pad.position.set(x, 0.2, z);
        this.scene.add(pad);
        const h = 8 + (i % 3) * 4;
        const ed = new THREE.Mesh(
          new THREE.BoxGeometry(lado * 0.55, h, lado * 0.55),
          new THREE.MeshStandardMaterial({ color: coloresEd[i % coloresEd.length], roughness: 0.9 }),
        );
        ed.position.set(x, h / 2, z);
        this.scene.add(ed);
        i++;
      }
    }
  }

  /** Iluminación y cielo según la hora simulada (igual que la vista cruce). */
  private aplicarDiaNoche(hora: number): void {
    const noche = nocheFactor(hora);
    this.hemi.intensity = 0.85 - 0.6 * noche;
    this.sun.intensity = 1.1 - 0.95 * noche;
    (this.scene.background as THREE.Color).copy(COLOR_DIA).lerp(COLOR_NOCHE, noche);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color);
  }

  private buildSemaforos(): void {
    // Los mismos 4 postes de la Fase 2/3, replicados en cada nodo de la red.
    const defs: { dx: number; dz: number; rot: number; group: Group }[] = [
      { dx: 7.5, dz: -8, rot: Math.PI, group: 'NS' },
      { dx: -7.5, dz: 8, rot: 0, group: 'NS' },
      { dx: 8, dz: -7.5, rot: Math.PI / 2, group: 'EW' },
      { dx: -8, dz: 7.5, rot: -Math.PI / 2, group: 'EW' },
    ];
    for (const n of this.sim.graph.nodes.values()) {
      for (const d of defs) {
        const mesh = new TrafficLightMesh(n.x + d.dx, n.z + d.dz, d.rot);
        this.scene.add(mesh.group);
        this.lights.push({ mesh, nodo: n.id, group: d.group });
      }
    }
  }

  private syncVehicles(t: number): void {
    const ids = new Set<number>();
    for (const v of this.sim.vehiclesRender()) {
      ids.add(v.id);
      let mesh = this.carPool.get(v.id);
      if (!mesh) {
        mesh = createCarMesh(v.color, v.esEmergencia);
        this.scene.add(mesh);
        this.carPool.set(v.id, mesh);
      }
      mesh.position.set(v.x, 0, v.z);
      mesh.rotation.y = v.heading;
      const baliza = mesh.userData.baliza as THREE.MeshStandardMaterial | undefined;
      if (baliza) baliza.emissiveIntensity = Math.sin(t * 12) > 0 ? 2 : 0.1;
      // Los autos accidentados se pintan en gris mientras bloquean la vía.
      const cuerpo = mesh.userData.cuerpo as THREE.MeshStandardMaterial | undefined;
      if (cuerpo) cuerpo.color.setHex(v.crashed ? 0x555a63 : (mesh.userData.colorBase as number));
    }
    for (const [id, mesh] of this.carPool) {
      if (!ids.has(id)) {
        this.scene.remove(mesh);
        this.carPool.delete(id);
      }
    }
  }

  /** Overlay rojo pulsante sobre cada arista declarada en colación. */
  private syncCongestion(s: RedSnapshot, t: number): void {
    const activas = new Set<EdgeId>();
    for (const c of s.congestiones) {
      activas.add(c.arista);
      if (!this.congPool.has(c.arista)) {
        const e = this.sim.graph.edges.get(c.arista)!;
        const v = VEC[e.dir];
        const horizontal = v.ux !== 0;
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(horizontal ? e.length - 6 : 4.4, horizontal ? 4.4 : e.length - 6),
          this.congMat,
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(
          e.x0 + (v.ux * e.length) / 2 + v.uz * 2.5,
          0.05,
          e.z0 + (v.uz * e.length) / 2 + v.ux * 2.5,
        );
        this.scene.add(m);
        this.congPool.set(c.arista, m);
      }
    }
    this.congMat.opacity = 0.22 + 0.16 * Math.sin(t * 5);
    for (const [id, mesh] of this.congPool) {
      if (!activas.has(id)) {
        this.scene.remove(mesh);
        this.congPool.delete(id);
      }
    }
  }

  /** Anillo rojo pulsante en el punto de cada colisión reciente (<4 s). */
  private syncColisiones(s: RedSnapshot, t: number): void {
    const recientes = s.ultimasColisiones.filter((c) => s.simTime - c.simTime < 4);
    for (const c of recientes) {
      if (!this.colPool.has(c.n)) {
        const m = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.2, 24), this.colMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(c.x, 0.08, c.z);
        this.scene.add(m);
        this.colPool.set(c.n, m);
      }
    }
    this.colMat.opacity = 0.55 + 0.3 * Math.sin(t * 8);
    const vivos = new Set(recientes.map((c) => c.n));
    for (const [n, mesh] of this.colPool) {
      if (!vivos.has(n)) {
        this.scene.remove(mesh);
        this.colPool.delete(n);
      }
    }
  }

  /** Marcadores de incidente (conos + señal) sobre las vías bloqueadas. */
  private syncIncidentes(s: RedSnapshot, t: number): void {
    const activos = new Set<EdgeId>();
    for (const inc of s.incidentes) {
      activos.add(inc.arista);
      if (!this.incPool.has(inc.arista)) {
        const g = new THREE.Group();
        const disco = new THREE.Mesh(
          new THREE.CircleGeometry(3.2, 24),
          new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.35, depthWrite: false }),
        );
        disco.rotation.x = -Math.PI / 2;
        disco.position.y = 0.06;
        g.add(disco);
        for (const dx of [-1.4, 0, 1.4]) {
          const cono = new THREE.Mesh(
            new THREE.ConeGeometry(0.4, 1.2, 12),
            new THREE.MeshStandardMaterial({ color: 0xff6b1a, emissive: 0x662200 }),
          );
          cono.position.set(dx, 0.6, 0);
          g.add(cono);
        }
        g.position.set(inc.x, 0, inc.z);
        this.scene.add(g);
        this.incPool.set(inc.arista, g);
      }
      const g = this.incPool.get(inc.arista)!;
      g.children[0].scale.setScalar(1 + 0.12 * Math.sin(t * 6));
    }
    for (const [id, g] of this.incPool) {
      if (!activos.has(id)) {
        this.scene.remove(g);
        this.incPool.delete(id);
      }
    }
  }

  clearVehicles(): void {
    for (const [, mesh] of this.carPool) this.scene.remove(mesh);
    this.carPool.clear();
  }

  private resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    const loop = () => {
      const dt = this.clock.getDelta();
      const t = this.clock.elapsedTime;

      if (!this.paused) this.sim.update(dt, this.speed);

      const snap = this.sim.snapshot();
      this.aplicarDiaNoche(snap.hora);
      for (const { mesh, nodo, group } of this.lights) {
        const luz = snap.luces[nodo];
        if (luz) mesh.setState(group === 'NS' ? luz.ns : luz.ew, t);
      }
      this.syncVehicles(t);
      this.syncPeatones();
      this.syncCongestion(snap, t);
      this.syncColisiones(snap, t);
      this.syncIncidentes(snap, t);
      this.syncDesvios(snap);
      this.syncNodoActivo();
      this.syncFoco(t);
      this.onStats?.(snap);

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
