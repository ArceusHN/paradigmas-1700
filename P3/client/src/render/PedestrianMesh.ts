import * as THREE from 'three';

/** Peatón low-poly: cuerpo (color de ropa) + cabeza. */
export function createPedestrianMesh(color: number): THREE.Group {
  const p = new THREE.Group();

  const cuerpo = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
  );
  cuerpo.position.y = 0.75;
  p.add(cuerpo);

  const cabeza = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.6 }),
  );
  cabeza.position.y = 1.5;
  p.add(cabeza);

  return p;
}
