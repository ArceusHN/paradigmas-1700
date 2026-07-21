import type { Mode } from 'shared';
import type { Simulation, Snapshot } from '../core/Simulation';
import type { Scene } from '../render/Scene';
import type { WokwiBridge } from '../wokwi/Bridge';

/**
 * Panel de control + sensores (HTML sobre el canvas).
 * Fase 2: reloj acelerable, pausa, semilla, densidad, reinicio.
 * Fase 3: toggle modo fijo/inteligente, sensores manipulables (carro, peatón,
 * ambulancia) y hora del día. Estos botones simulan lo que luego enviará el
 * ESP32 desde Wokwi: la app reacciona igual venga de aquí o del hardware.
 */
export class Controls {
  private readonly stats: HTMLElement;
  private wokwiBadge?: HTMLElement;

  constructor(
    private readonly sim: Simulation,
    private readonly scene: Scene,
    private seed: number,
    private rate: number,
    bridge?: WokwiBridge,
  ) {
    const panel = document.getElementById('panel')!;

    // ── Modo (el diferenciador de la Fase 3) ───────────────────
    const modoBox = this.grupo('Modo del semáforo');
    const modos: { m: Mode; label: string }[] = [
      { m: 'inteligente', label: '🧠 Inteligente' },
      { m: 'fijo', label: '⏱ Tradicional' },
    ];
    const modoBtns: HTMLButtonElement[] = [];
    for (const { m, label } of modos) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = m === this.sim.modo ? 'activo' : '';
      b.onclick = () => {
        this.sim.setModo(m);
        modoBtns.forEach((o, i) => o.classList.toggle('activo', modos[i].m === m));
      };
      modoBtns.push(b);
      modoBox.appendChild(b);
    }
    panel.appendChild(modoBox);

    // ── Sensores (simulan las señales del ESP32) ───────────────
    const sensBox = this.grupo('Sensores');
    this.boton(sensBox, '🚗 Carro N–S', () => this.sim.detectarCarro('N'));
    this.boton(sensBox, '🚗 Carro E–O', () => this.sim.detectarCarro('E'));
    this.boton(sensBox, '🚶 Peatón', () => this.sim.pedirPeaton());
    this.boton(sensBox, '🚑 Ambul. N–S', () => this.sim.enviarAmbulancia('N'));
    this.boton(sensBox, '🚑 Ambul. E–O', () => this.sim.enviarAmbulancia('E'));
    panel.appendChild(sensBox);

    // ── Hora del día (para el modo nocturno) ───────────────────
    const horaBox = this.grupo('Hora del día');
    const hora = document.createElement('input');
    hora.type = 'range';
    hora.min = '0';
    hora.max = '23';
    hora.step = '1';
    hora.value = '12';
    const horaVal = document.createElement('span');
    horaVal.className = 'val';
    horaVal.textContent = '12:00';
    hora.oninput = () => {
      const h = Number(hora.value);
      this.sim.setHora(h);
      horaVal.textContent = `${String(h).padStart(2, '0')}:00`;
    };
    horaBox.appendChild(hora);
    horaBox.appendChild(horaVal);
    panel.appendChild(horaBox);

    // ── Velocidad ──────────────────────────────────────────────
    const velBox = this.grupo('Velocidad');
    const velBtns: HTMLButtonElement[] = [];
    for (const x of [1, 5, 20]) {
      const b = document.createElement('button');
      b.textContent = `x${x}`;
      b.className = x === 1 ? 'activo' : '';
      b.onclick = () => {
        this.scene.speed = x;
        velBtns.forEach((o) => o.classList.toggle('activo', o === b));
      };
      velBtns.push(b);
      velBox.appendChild(b);
    }
    const pausa = document.createElement('button');
    pausa.textContent = '⏸';
    pausa.onclick = () => {
      this.scene.paused = !this.scene.paused;
      pausa.textContent = this.scene.paused ? '▶' : '⏸';
      pausa.classList.toggle('activo', this.scene.paused);
    };
    velBox.appendChild(pausa);
    panel.appendChild(velBox);

    // ── Semilla + tráfico + reinicio (compactos) ───────────────
    const cfgBox = this.grupo('Corrida');
    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.value = String(this.seed);
    seedInput.title = 'Semilla';
    seedInput.oninput = () => (this.seed = Number(seedInput.value) || 0);
    cfgBox.appendChild(seedInput);
    const restart = document.createElement('button');
    restart.textContent = '↻ Reiniciar';
    restart.className = 'reinicio';
    restart.onclick = () => {
      this.sim.reset({ seed: this.seed, rate: this.rate });
      this.scene.clearVehicles();
    };
    cfgBox.appendChild(restart);
    panel.appendChild(cfgBox);

    // ── Puente Wokwi (Fase 3.5) ────────────────────────────────
    if (bridge) {
      const wokwiBox = this.grupo('Hardware (Wokwi)');
      this.wokwiBadge = document.createElement('span');
      this.wokwiBadge.className = 'val';
      this.wokwiBadge.textContent = '🔌 conectando…';
      wokwiBox.appendChild(this.wokwiBadge);
      panel.appendChild(wokwiBox);
      bridge.onStatus = (ok) => {
        this.wokwiBadge!.textContent = ok ? '🟢 conectado' : '🔴 sin conexión';
      };
    }

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

  private boton(box: HTMLElement, texto: string, onClick: () => void): void {
    const b = document.createElement('button');
    b.textContent = texto;
    b.onclick = onClick;
    box.appendChild(b);
  }

  private render(s: Snapshot): void {
    const luz = (estado: string) => `<b class="luz ${estado.toLowerCase()}">${estado}</b>`;
    const cola = s.colaPorVia;
    const colaNS = (cola.N ?? 0) + (cola.S ?? 0);
    const colaEW = (cola.E ?? 0) + (cola.O ?? 0);
    const alertas: string[] = [];
    if (s.emergencia) alertas.push(`🚑 emergencia vía ${s.emergencia}`);
    if (s.peaton) alertas.push('🚶 peatón esperando');
    if (s.ultimoEvento && s.simTime - s.ultimoEvento.simTime < 10) {
      const icono = { carro: '🚗', peaton: '🚶', ambulancia: '🚑' }[s.ultimoEvento.tipo];
      const fuente = s.ultimoEvento.fuente === 'wokwi' ? 'Wokwi' : 'UI';
      alertas.push(`${icono} ${s.ultimoEvento.tipo} — desde ${fuente}`);
    }
    this.stats.innerHTML = `
      <div>⏱ ${s.simTime.toFixed(1)} s &nbsp; 🕐 ${String(s.hora).padStart(2, '0')}:00</div>
      <div>N–S ${luz(s.ns)} (${colaNS}) &nbsp; E–O ${luz(s.ew)} (${colaEW})</div>
      <div>procesados: <b>${s.procesados}</b></div>
      ${alertas.length ? `<div class="alerta">${alertas.join(' · ')}</div>` : ''}`;
  }
}
