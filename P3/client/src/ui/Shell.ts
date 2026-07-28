/**
 * Chrome de la aplicación (Fase 4): barra superior + drawer del panel.
 *
 * Separa la LECTURA (chips de métricas, siempre visibles arriba) de la ACCIÓN
 * (controles dentro del panel, que se abre solo cuando hace falta). Lo usan las
 * dos vistas — red y cruce — para no duplicar el cableado del toggle.
 */
const CLASE_CERRADO = 'panel-cerrado';
const LS_KEY = 'panel-abierto';

const toggle = document.getElementById('panel-toggle');
const chips = document.getElementById('chips');
const faseTag = document.getElementById('fase-tag');

function aplicar(abierto: boolean): void {
  document.body.classList.toggle(CLASE_CERRADO, !abierto);
  toggle?.setAttribute('aria-expanded', String(abierto));
  localStorage.setItem(LS_KEY, String(abierto));
}

/** Alterna el drawer; también responde a la tecla P. */
export function togglePanel(): void {
  aplicar(document.body.classList.contains(CLASE_CERRADO));
}

/** Texto de la fase junto al título (antes vivía en el HUD oculto). */
export function setFase(texto: string): void {
  if (faseTag) faseTag.textContent = texto;
}

/** Chips de métricas de la barra superior. Recibe HTML ya formado. */
export function setChips(html: string): void {
  if (chips) chips.innerHTML = html;
}

/**
 * Helper para armar un chip: icono + valor. `ayuda` es el tooltip (los iconos
 * solos no se entienden) y `alerta` lo resalta en rojo.
 */
export function chip(icono: string, valor: string, ayuda: string, alerta = false): string {
  const t = ayuda.replace(/"/g, '&quot;');
  return `<span class="chip${alerta ? ' alerta' : ''}" title="${t}"><i>${icono}</i>${valor}</span>`;
}

// Estado inicial: lo último que el usuario eligió (abierto por defecto).
aplicar(localStorage.getItem(LS_KEY) !== 'false');

toggle?.addEventListener('click', togglePanel);
window.addEventListener('keydown', (e) => {
  // La tecla P alterna el panel, salvo mientras se escribe en un campo.
  const enCampo = (e.target as HTMLElement)?.matches?.('input, select, textarea');
  if (!enCampo && (e.key === 'p' || e.key === 'P')) togglePanel();
});
