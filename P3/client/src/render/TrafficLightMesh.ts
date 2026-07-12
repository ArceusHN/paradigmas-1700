import * as THREE from 'three';
import type { LightState } from 'shared';

/** Colores de cada bombilla, de arriba (rojo) a abajo (verde). */
const ORDEN: { key: LightState; color: number }[] = [
  { key: 'ROJO', color: 0xff3b30 },
  { key: 'AMARILLO', color: 0xffcc00 },
  { key: 'VERDE', color: 0x34c759 },
];

/**
 * Poste de semáforo 3D. Sólo *refleja* el estado que le pasa el render;
 * no decide nada (el núcleo es la fuente de verdad).
 */
export class TrafficLightMesh {
  readonly group = new THREE.Group();
  private readonly bulbs = new Map<LightState, THREE.MeshStandardMaterial>();

  constructor(x: number, z: number, mirarHacia: number) {
    const poste = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 5, 12),
      new THREE.MeshStandardMaterial({ color: 0x3a4150 }),
    );
    poste.position.y = 2.5;
    this.group.add(poste);

    const caja = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 2.4, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x11151d }),
    );
    caja.position.y = 5.4;
    this.group.add(caja);

    ORDEN.forEach(({ key, color }, i) => {
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.06 });
      const bombilla = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), mat);
      bombilla.position.set(0, 6.2 - i * 0.8, 0.45);
      this.group.add(bombilla);
      this.bulbs.set(key, mat);
    });

    this.group.position.set(x, 0, z);
    this.group.rotation.y = mirarHacia;
  }

  /** Enciende la bombilla del estado actual y apaga las demás. */
  setState(state: LightState, t: number): void {
    const activa = state === 'INTERMITENTE' ? 'AMARILLO' : state;
    // Parpadeo del amarillo cuando el estado es INTERMITENTE (modo nocturno, Fase 3).
    const parpadeo = state === 'INTERMITENTE' ? (Math.floor(t * 1.5) % 2 === 0 ? 1.6 : 0.06) : 1.6;
    this.bulbs.forEach((mat, key) => {
      mat.emissiveIntensity = key === activa ? parpadeo : 0.06;
    });
  }
}
