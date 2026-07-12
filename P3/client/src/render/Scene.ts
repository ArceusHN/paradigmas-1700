import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Group } from 'shared';
import type { Simulation, Snapshot } from '../core/Simulation';
import { placement } from '../core/world';
import { buildIntersection } from './Intersection';
import { TrafficLightMesh } from './TrafficLightMesh';
import { createCarMesh } from './VehicleMesh';

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
  private readonly carPool = new Map<number, THREE.Group>();

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

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202028, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(15, 30, 12);
    this.scene.add(sun);
  }

  private buildTrafficLights(): void {
    const defs: { x: number; z: number; rot: number; group: Group }[] = [
      { x: 6, z: -6.5, rot: Math.PI, group: 'NS' }, // acceso Norte
      { x: -6, z: 6.5, rot: 0, group: 'NS' }, // acceso Sur
      { x: 6.5, z: -6, rot: Math.PI / 2, group: 'EW' }, // acceso Este
      { x: -6.5, z: 6, rot: -Math.PI / 2, group: 'EW' }, // acceso Oeste
    ];
    for (const d of defs) {
      const mesh = new TrafficLightMesh(d.x, d.z, d.rot);
      this.scene.add(mesh.group);
      this.lights.push({ mesh, group: d.group });
    }
  }

  /** Sincroniza los meshes de autos con los vehículos vivos del núcleo. */
  private syncVehicles(): void {
    const ids = new Set<number>();
    for (const v of this.sim.vehicles()) {
      ids.add(v.id);
      let mesh = this.carPool.get(v.id);
      if (!mesh) {
        mesh = createCarMesh(v.color);
        this.scene.add(mesh);
        this.carPool.set(v.id, mesh);
      }
      const p = placement(v.dir, v.d);
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.heading;
    }
    // Elimina los meshes de autos que ya salieron de la escena.
    for (const [id, mesh] of this.carPool) {
      if (!ids.has(id)) {
        this.scene.remove(mesh);
        this.carPool.delete(id);
      }
    }
  }

  /** Vacía todos los autos (al reiniciar la corrida). */
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
      for (const { mesh, group } of this.lights) {
        mesh.setState(group === 'NS' ? snap.ns : snap.ew, t);
      }
      this.syncVehicles();
      this.onStats?.(snap);

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
