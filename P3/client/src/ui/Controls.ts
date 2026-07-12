import type { Simulation, Snapshot } from '../core/Simulation';
import type { Scene } from '../render/Scene';

/**
 * Panel de control de la simulación (HTML sobre el canvas).
 * Fase 2: reloj acelerable (x1/x5/x20), pausa, semilla y densidad de tráfico,
 * y una lectura en vivo del estado. El panel de *sensores* (peatón, ambulancia,
 * modo inteligente) llega en la Fase 3.
 */
export class Controls {
  private readonly stats: HTMLElement;

  constructor(
    private readonly sim: Simulation,
    private readonly scene: Scene,
    private seed: number,
    private rate: number,
  ) {
    const panel = document.getElementById('panel')!;

    // ── Velocidad ──────────────────────────────────────────────
    const velBox = this.grupo('Velocidad');
    const botones: HTMLButtonElement[] = [];
    for (const x of [1, 5, 20]) {
      const b = document.createElement('button');
      b.textContent = `x${x}`;
      b.className = x === 1 ? 'activo' : '';
      b.onclick = () => {
        this.scene.speed = x;
        botones.forEach((o) => o.classList.toggle('activo', o === b));
      };
      botones.push(b);
      velBox.appendChild(b);
    }
    const pausa = document.createElement('button');
    pausa.textContent = '⏸ Pausa';
    pausa.onclick = () => {
      this.scene.paused = !this.scene.paused;
      pausa.textContent = this.scene.paused ? '▶ Seguir' : '⏸ Pausa';
      pausa.classList.toggle('activo', this.scene.paused);
    };
    velBox.appendChild(pausa);
    panel.appendChild(velBox);

    // ── Semilla ────────────────────────────────────────────────
    const seedBox = this.grupo('Semilla');
    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.value = String(this.seed);
    seedInput.oninput = () => (this.seed = Number(seedInput.value) || 0);
    seedBox.appendChild(seedInput);
    panel.appendChild(seedBox);

    // ── Densidad de tráfico ────────────────────────────────────
    const rateBox = this.grupo('Tráfico');
    const rateInput = document.createElement('input');
    rateInput.type = 'range';
    rateInput.min = '0.05';
    rateInput.max = '0.8';
    rateInput.step = '0.05';
    rateInput.value = String(this.rate);
    const rateVal = document.createElement('span');
    rateVal.className = 'val';
    rateVal.textContent = this.rate.toFixed(2);
    rateInput.oninput = () => {
      this.rate = Number(rateInput.value);
      rateVal.textContent = this.rate.toFixed(2);
    };
    rateBox.appendChild(rateInput);
    rateBox.appendChild(rateVal);
    panel.appendChild(rateBox);

    // ── Reiniciar ──────────────────────────────────────────────
    const restart = document.createElement('button');
    restart.textContent = '↻ Reiniciar corrida';
    restart.className = 'reinicio';
    restart.onclick = () => {
      this.sim.reset({ seed: this.seed, rate: this.rate });
      this.scene.clearVehicles();
    };
    panel.appendChild(restart);

    // ── Lectura en vivo ────────────────────────────────────────
    this.stats = document.createElement('div');
    this.stats.id = 'stats';
    panel.appendChild(this.stats);

    this.scene.onStats = (s) => this.render(s);
  }

  private grupo(titulo: string): HTMLElement {
    const box = document.createElement('div');
    box.className = 'grupo';
    const h = document.createElement('label');
    h.textContent = titulo;
    box.appendChild(h);
    return box;
  }

  private render(s: Snapshot): void {
    const luz = (estado: string) =>
      `<b class="luz ${estado.toLowerCase()}">${estado}</b>`;
    this.stats.innerHTML = `
      <div>⏱ ${s.simTime.toFixed(1)} s sim</div>
      <div>N–S ${luz(s.ns)} &nbsp; E–O ${luz(s.ew)}</div>
      <div>🚗 en cola: <b>${s.enCola}</b> &nbsp; procesados: <b>${s.procesados}</b></div>`;
  }
}
