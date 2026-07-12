import * as THREE from 'three';
import { CAR_LEN } from '../core/world';

/**
 * Fábrica de un auto low-poly. El cuerpo tiene su largo sobre el eje Z, así
 * que rotarlo en Y con `heading` lo orienta en su sentido de avance.
 */
export function createCarMesh(color: number): THREE.Group {
  const auto = new THREE.Group();

  const cuerpo = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.9, CAR_LEN),
    new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6 }),
  );
  cuerpo.position.y = 0.55;
  auto.add(cuerpo);

  const cabina = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x1b2029, metalness: 0.1, roughness: 0.4 }),
  );
  cabina.position.set(0, 1.15, -0.1);
  auto.add(cabina);

  return auto;
}
