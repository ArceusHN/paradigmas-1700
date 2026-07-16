import * as THREE from 'three';
import { CAR_LEN } from '../core/world';

/**
 * Fábrica de un auto low-poly. El cuerpo tiene su largo sobre el eje Z, así
 * que rotarlo en Y con `heading` lo orienta en su sentido de avance.
 *
 * Si `esEmergencia`, devuelve una ambulancia (blanca con barra de luces); el
 * material de la baliza queda en `userData.baliza` para que la escena lo haga
 * parpadear.
 */
export function createCarMesh(color: number, esEmergencia = false): THREE.Group {
  const auto = new THREE.Group();

  const cuerpo = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.9, CAR_LEN),
    new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6 }),
  );
  cuerpo.position.y = 0.55;
  auto.add(cuerpo);

  const cabina = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 1.4),
    new THREE.MeshStandardMaterial({ color: esEmergencia ? 0xdfe6ee : 0x1b2029, roughness: 0.4 }),
  );
  cabina.position.set(0, 1.15, -0.1);
  auto.add(cabina);

  if (esEmergencia) {
    const balizaMat = new THREE.MeshStandardMaterial({
      color: 0xff3b30,
      emissive: 0xff3b30,
      emissiveIntensity: 1.5,
    });
    const baliza = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.4), balizaMat);
    baliza.position.set(0, 1.6, 0.1);
    auto.add(baliza);
    auto.userData.baliza = balizaMat;
  }

  return auto;
}
