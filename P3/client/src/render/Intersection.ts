import * as THREE from 'three';
import { ROAD_HALF } from '../core/world';

/**
 * Geometría estática de la intersección: suelo, cruz de asfalto, líneas de
 * carril y de alto. Instanciable (se usará ×2 en el modo A/B de la Fase 5).
 */
export function buildIntersection(): THREE.Group {
  const grupo = new THREE.Group();

  const cesped = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ color: 0x14351f }),
  );
  cesped.rotation.x = -Math.PI / 2;
  grupo.add(cesped);

  const asfalto = new THREE.MeshStandardMaterial({ color: 0x2a2f3a });
  const ancho = ROAD_HALF * 2;

  const calleH = new THREE.Mesh(new THREE.PlaneGeometry(90, ancho), asfalto);
  calleH.rotation.x = -Math.PI / 2;
  calleH.position.y = 0.01;
  grupo.add(calleH);

  const calleV = new THREE.Mesh(new THREE.PlaneGeometry(ancho, 90), asfalto);
  calleV.rotation.x = -Math.PI / 2;
  calleV.position.y = 0.01;
  grupo.add(calleV);

  // Líneas divisorias amarillas (eje de cada calle).
  const linea = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const lh = new THREE.Mesh(new THREE.PlaneGeometry(90, 0.2), linea);
  lh.rotation.x = -Math.PI / 2;
  lh.position.y = 0.02;
  grupo.add(lh);
  const lv = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 90), linea);
  lv.rotation.x = -Math.PI / 2;
  lv.position.y = 0.02;
  grupo.add(lv);

  return grupo;
}
