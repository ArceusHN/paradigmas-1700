import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Direction, Group } from 'shared';
import type { Simulation, Snapshot } from '../core/Simulation';
import { nocheFactor, pedPlacement, placement } from '../core/world';
import { buildIntersection } from './Intersection';
import { TrafficLightMesh } from './TrafficLightMesh';
import { PedestrianSignalMesh } from './PedestrianSignalMesh';
import { createCarMesh } from './VehicleMesh';
import { createPedestrianMesh } from './PedestrianMesh';

const COLOR_DIA = new THREE.Color(0x1b2a44);
const COLOR_NOCHE = new THREE.Color(0x05060a);

/**
 * Capa de presentación (Three.js). Cada frame lee el estado del núcleo y
 * lo pinta: no toma ninguna decisión de simulación. Mantiene un "pool" de
 * meshes de autos indexado por id para crear/mover/eliminar según el mundo.
 */
export class Scene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();

  private readonly lights: { mesh: TrafficLightMesh; group: Group }[] = [];
  private readonly pedSignals: { mesh: PedestrianSignalMesh; cruce: Direction }[] = [];
  private readonly carPool = new Map<number, THREE.Group>();
  private readonly pedPool = new Map<number, THREE.Group>();
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;

  /** Factor de aceleración del reloj (x1 / x5 / x20), controlado por la UI. */
  speed = 1;
  /** Se pausa mientras esté en true. */
  paused = false;
  /** Callback para refrescar el HUD con la instantánea del núcleo. */
  onStats?: (s: Snapshot) => void;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sim: Simulation,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 45, 110);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.camera.position.set(22, 24, 30);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    this.buildLights();
    this.scene.add(buildIntersection());
    this.buildTrafficLights();
    this.buildPedestrianSignals();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202028, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sun.position.set(15, 30, 12);
    this.scene.add(this.sun);
  }

  /** Ajusta la iluminación y el cielo según la hora simulada. */
  private aplicarDiaNoche(hora: number): void {
    const noche = nocheFactor(hora);
    this.hemi.intensity = 0.85 - 0.6 * noche;
    this.sun.intensity = 1.1 - 0.95 * noche;
    (this.scene.background as THREE.Color).copy(COLOR_DIA).lerp(COLOR_NOCHE, noche);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color);
  }

  private buildTrafficLights(): void {
    // Postes en la esquina derecha de cada acceso, mirando al tráfico que llega.
    const defs: { x: number; z: number; rot: number; group: Group }[] = [
      { x: 7.5, z: -8, rot: Math.PI, group: 'NS' }, // acceso Norte
      { x: -7.5, z: 8, rot: 0, group: 'NS' }, // acceso Sur
      { x: 8, z: -7.5, rot: Math.PI / 2, group: 'EW' }, // acceso Este
      { x: -8, z: 7.5, rot: -Math.PI / 2, group: 'EW' }, // acceso Oeste
    ];
    for (const d of defs) {
      const mesh = new TrafficLightMesh(d.x, d.z, d.rot);
      this.scene.add(mesh.group);
      this.lights.push({ mesh, group: d.group });
    }
  }

  private buildPedestrianSignals(): void {
    // Un semáforo peatonal en un extremo de cada cruce.
    const defs: { x: number; z: number; rot: number; cruce: Direction }[] = [
      { x: 7, z: -6.5, rot: -Math.PI / 2, cruce: 'N' },
      { x: -7, z: 6.5, rot: Math.PI / 2, cruce: 'S' },
      { x: 6.5, z: 7, rot: Math.PI, cruce: 'E' },
      { x: -6.5, z: -7, rot: 0, cruce: 'O' },
    ];
    for (const d of defs) {
      const mesh = new PedestrianSignalMesh(d.x, d.z, d.rot);
      this.scene.add(mesh.group);
      this.pedSignals.push({ mesh, cruce: d.cruce });
    }
  }

  /** Sincroniza los meshes de peatones con los del núcleo. */
  private syncPedestrians(): void {
    const ids = new Set<number>();
    for (const p of this.sim.pedestrians()) {
      ids.add(p.id);
      let mesh = this.pedPool.get(p.id);
      if (!mesh) {
        mesh = createPedestrianMesh(p.color);
        this.scene.add(mesh);
        this.pedPool.set(p.id, mesh);
      }
      const pos = pedPlacement(p.cruce, p.progreso);
      mesh.position.set(pos.x, 0, pos.z);
      mesh.rotation.y = pos.heading;
    }
    for (const [id, mesh] of this.pedPool) {
      if (!ids.has(id)) {
        this.scene.remove(mesh);
        this.pedPool.delete(id);
      }
    }
  }

  /** Sincroniza los meshes de autos con los vehículos vivos del núcleo. */
  private syncVehicles(t: number): void {
    const ids = new Set<number>();
    for (const v of this.sim.vehicles()) {
      ids.add(v.id);
      let mesh = this.carPool.get(v.id);
      if (!mesh) {
        mesh = createCarMesh(v.color, v.esEmergencia);
        this.scene.add(mesh);
        this.carPool.set(v.id, mesh);
      }
      const p = placement(v.dir, v.d);
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.heading;
      // Parpadeo de la baliza de la ambulancia.
      const baliza = mesh.userData.baliza as THREE.MeshStandardMaterial | undefined;
      if (baliza) baliza.emissiveIntensity = Math.sin(t * 12) > 0 ? 2 : 0.1;
    }
    // Elimina los meshes de autos que ya salieron de la escena.
    for (const [id, mesh] of this.carPool) {
      if (!ids.has(id)) {
        this.scene.remove(mesh);
        this.carPool.delete(id);
      }
    }
  }

  /** Vacía autos y peatones (al reiniciar la corrida). */
  clearVehicles(): void {
    for (const [, mesh] of this.carPool) this.scene.remove(mesh);
    this.carPool.clear();
    for (const [, mesh] of this.pedPool) this.scene.remove(mesh);
    this.pedPool.clear();
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
      for (const { mesh, group } of this.lights) {
        mesh.setState(group === 'NS' ? snap.ns : snap.ew, t);
      }
      for (const { mesh, cruce } of this.pedSignals) {
        mesh.setWalk(this.sim.peatonPuedeCruzar(cruce));
      }
      this.syncVehicles(t);
      this.syncPedestrians();
      this.onStats?.(snap);

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
