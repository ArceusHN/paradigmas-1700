import * as THREE from 'three';
import { CROSSWALK, ROAD_HALF, STOP_LINE } from '../core/world';

/**
 * Geometría estática de la intersección: suelo, calzada en cruz, aceras en las
 * cuatro esquinas, cruces peatonales (zebra), líneas de alto, líneas de carril
 * discontinuas y edificios de fondo. Instanciable (se reutiliza ×2 en el A/B
 * de la Fase 5).
 */
export function buildIntersection(): THREE.Group {
  const grupo = new THREE.Group();
  const MAPA = 90;
  const ancho = ROAD_HALF * 2;

  // ── Suelo base (tierra/relleno bajo las aceras) ──
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(MAPA, MAPA),
    new THREE.MeshStandardMaterial({ color: 0x2b3340 }),
  );
  base.rotation.x = -Math.PI / 2;
  grupo.add(base);

  // ── Calzada en cruz ──
  const asfalto = new THREE.MeshStandardMaterial({ color: 0x33383f });
  const calleH = new THREE.Mesh(new THREE.PlaneGeometry(MAPA, ancho), asfalto);
  calleH.rotation.x = -Math.PI / 2;
  calleH.position.y = 0.01;
  grupo.add(calleH);
  const calleV = new THREE.Mesh(new THREE.PlaneGeometry(ancho, MAPA), asfalto);
  calleV.rotation.x = -Math.PI / 2;
  calleV.position.y = 0.01;
  grupo.add(calleV);

  // ── Aceras en las cuatro esquinas ──
  const acera = new THREE.MeshStandardMaterial({ color: 0x8b95a3 });
  const lado = MAPA / 2 - (ROAD_HALF + 1.5);
  const centro = ROAD_HALF + 1.5 + lado / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const esquina = new THREE.Mesh(new THREE.BoxGeometry(lado, 0.4, lado), acera);
      esquina.position.set(sx * centro, 0.2, sz * centro);
      grupo.add(esquina);
    }
  }

  // ── Cruces peatonales (zebra) en los cuatro brazos ──
  const blanco = new THREE.MeshBasicMaterial({ color: 0xf4f6fb });
  const franja = (w: number, h: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), blanco);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    grupo.add(m);
  };
  for (let i = -4; i <= 4; i++) {
    const off = i * 1.05;
    // Cruces N y S: franjas alargadas en Z, repartidas en X
    franja(0.5, 2, off, -CROSSWALK);
    franja(0.5, 2, off, CROSSWALK);
    // Cruces E y O: franjas alargadas en X, repartidas en Z
    franja(2, 0.5, CROSSWALK, off);
    franja(2, 0.5, -CROSSWALK, off);
  }

  // ── Líneas de alto (antes de cada cruce) ──
  franja(ancho, 0.45, 0, -STOP_LINE);
  franja(ancho, 0.45, 0, STOP_LINE);
  franja(0.45, ancho, -STOP_LINE, 0);
  franja(0.45, ancho, STOP_LINE, 0);

  // ── Líneas de carril discontinuas (eje de cada calle, fuera del cruce) ──
  const amarillo = new THREE.MeshBasicMaterial({ color: 0xf2c14e });
  const dash = (horizontal: boolean, desde: number, hasta: number) => {
    for (let d = desde; d < hasta; d += 4) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(horizontal ? 2 : 0.18, horizontal ? 0.18 : 2),
        amarillo,
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(horizontal ? d : 0, 0.03, horizontal ? 0 : d);
      grupo.add(m);
    }
  };
  dash(true, STOP_LINE + 2, MAPA / 2);
  dash(true, -MAPA / 2, -STOP_LINE - 2);
  dash(false, STOP_LINE + 2, MAPA / 2);
  dash(false, -MAPA / 2, -STOP_LINE - 2);

  // ── Edificios de fondo (una caja por esquina) ──
  const edificios = [0x9c4a3a, 0x4a6b8a, 0xb08a3e, 0x5a7d5a];
  const alturas = [16, 12, 20, 14];
  edificios.forEach((color, i) => {
    const sx = i < 2 ? -1 : 1;
    const sz = i % 2 === 0 ? -1 : 1;
    const h = alturas[i];
    const ed = new THREE.Mesh(
      new THREE.BoxGeometry(14, h, 14),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    );
    ed.position.set(sx * (centro + 4), h / 2, sz * (centro + 4));
    grupo.add(ed);
  });

  return grupo;
}
