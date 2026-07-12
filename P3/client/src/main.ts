import { Scene } from './render/Scene';
import { RULES, NEXT_STATE } from 'shared';

// Bootstrap de la Fase 1: monta la escena 3D navegable.
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const escena = new Scene(canvas);
escena.start();

// Evidencia en consola de que los contratos compartidos (shared/types.ts)
// se importan correctamente cliente-lado. Sirve para la demo del avance.
console.log('🚦 Semáforo Inteligente 3D — Fase 1 lista');
console.log('Transiciones de la máquina de estados:', NEXT_STATE);
console.table(RULES);
