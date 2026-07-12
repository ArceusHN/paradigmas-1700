import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Escena base de Three.js (Fase 1).
 * Sólo geometría primitiva: plano-suelo, luces, cámara orbital y un poste
 * de semáforo de muestra con sus tres luces emisivas ciclando.
 *
 * Regla de oro del plan: el render sólo *lee* estado; nunca decide nada.
 * Por ahora el ciclado de luces es un placeholder visual — la máquina de
 * estados real (core/) lo controlará en la Fase 2.
 */
export class Scene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();

  // Luces emisivas del poste de muestra
  private readonly bulbs: THREE.MeshStandardMaterial[] = [];
  private ciclo = 0;
  private acumulado = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 30, 90);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(12, 12, 18);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 2, 0);

    this.buildLights();
    this.buildGround();
    this.buildTrafficLight();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202028, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(10, 20, 8);
    this.scene.add(sun);
  }

  private buildGround(): void {
    // Suelo
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x161b26 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Cruz de asfalto (avance de la intersección real de la Fase 2)
    const asfalto = new THREE.MeshStandardMaterial({ color: 0x2a2f3a });
    const calleH = new THREE.Mesh(new THREE.PlaneGeometry(80, 10), asfalto);
    calleH.rotation.x = -Math.PI / 2;
    calleH.position.y = 0.01;
    this.scene.add(calleH);
    const calleV = new THREE.Mesh(new THREE.PlaneGeometry(10, 80), asfalto);
    calleV.rotation.x = -Math.PI / 2;
    calleV.position.y = 0.01;
    this.scene.add(calleV);

    // Rejilla de referencia
    const grid = new THREE.GridHelper(80, 40, 0x334155, 0x1e293b);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  private buildTrafficLight(): void {
    const group = new THREE.Group();

    // Poste
    const poste = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x3a4150 }),
    );
    poste.position.y = 3;
    group.add(poste);

    // Caja de luces
    const caja = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 3, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x11151d }),
    );
    caja.position.y = 6.5;
    group.add(caja);

    // Tres bombillas emisivas: rojo, amarillo, verde
    const colores = [0xff3b30, 0xffcc00, 0x34c759];
    colores.forEach((color, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.1,
      });
      const bombilla = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 20), mat);
      bombilla.position.set(0, 7.5 - i, 0.65);
      group.add(bombilla);
      this.bulbs.push(mat);
    });

    group.position.set(-6, 0, -6);
    this.scene.add(group);
  }

  /** Placeholder: enciende una bombilla a la vez, ~1.5 s cada una. */
  private ciclarLuces(dt: number): void {
    this.acumulado += dt;
    if (this.acumulado > 1.5) {
      this.acumulado = 0;
      this.ciclo = (this.ciclo + 1) % 3;
    }
    this.bulbs.forEach((mat, i) => {
      mat.emissiveIntensity = i === this.ciclo ? 1.4 : 0.08;
    });
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    if (this.renderer.domElement.width !== w || this.renderer.domElement.height !== h) {
      this.renderer.setSize(w, h, false);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Arranca el bucle de render. */
  start(): void {
    const loop = () => {
      const dt = this.clock.getDelta();
      this.ciclarLuces(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
