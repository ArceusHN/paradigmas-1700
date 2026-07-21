import * as THREE from 'three';

/**
 * Semáforo peatonal: poste bajo con dos luces (roja = espere, verde = camine).
 * Sólo refleja el estado que le pasa la escena (derivado del semáforo vehicular).
 */
export class PedestrianSignalMesh {
  readonly group = new THREE.Group();
  private readonly rojo: THREE.MeshStandardMaterial;
  private readonly verde: THREE.MeshStandardMaterial;

  constructor(x: number, z: number, mirarHacia: number) {
    const poste = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 3, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a4150 }),
    );
    poste.position.y = 1.5;
    this.group.add(poste);

    const caja = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x11151d }),
    );
    caja.position.y = 3.2;
    this.group.add(caja);

    this.rojo = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1.4 });
    this.verde = new THREE.MeshStandardMaterial({ color: 0x34c759, emissive: 0x34c759, emissiveIntensity: 0.06 });
    const bRojo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this.rojo);
    bRojo.position.set(0, 3.42, 0.22);
    const bVerde = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this.verde);
    bVerde.position.set(0, 3.0, 0.22);
    this.group.add(bRojo, bVerde);

    this.group.position.set(x, 0, z);
    this.group.rotation.y = mirarHacia;
  }

  setWalk(walk: boolean): void {
    this.verde.emissiveIntensity = walk ? 1.4 : 0.06;
    this.rojo.emissiveIntensity = walk ? 0.06 : 1.4;
  }
}
