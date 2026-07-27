import type { EdgeId, NetMsg, NodeId } from 'shared';
import type { RedSnapshot } from '../core/Network';
import type { RedScene } from '../render/RedScene';

/** Acciones que la UI delega en el bootstrap (main.ts). */
export interface RedAcciones {
  reset(cambios: { seed?: number; coordinado?: boolean }): void;
  congestion(nodo: NodeId): void;
  colision(nodo: NodeId): void;
  carro(): void;
  peaton(nodo: NodeId): void;
  ambulancia(): void;
  hora(h: number): void;
  seguir(nodo: NodeId): void;
  dejarDeSeguir(): void;
  setAutoDespeje(auto: boolean): void;
  despejarColision(arista: EdgeId): void;
  despejarTodas(): void;
}

/**
 * Panel de control de la RED (Fase 4), organizado en tabs para conservar
 * todas las funcionalidades de la Fase 3 (sensores, hora, velocidad, semilla)
 * más las nuevas de la red (coordinación ON/OFF, colación, conversación).
 */
export class RedControls {
  /** Nodo activo: destino de colación/peatón y nodo que espejan los LEDs del ESP32. */
  nodoActivo: NodeId = 'B1';

  private readonly stats: HTMLElement;
  private readonly log: HTMLElement;
  private wokwiBadge?: HTMLElement;
  private focoStatus!: HTMLElement;
  private lineas: string[] = [];
  private seed: number;
  private coordinado = true;
  private autoDespeje = true;
  /** Contenedor del listado de accidentes + firma para rebuild solo al cambiar. */
  private accidentesLista!: HTMLElement;
  private accidentesFirma = '';
  /** Auto en foco (fuente de verdad; se propaga a scene.focusId). */
  private focusId: number | null = null;

  constructor(
    private readonly scene: RedScene,
    seedInicial: number,
    private readonly acciones: RedAcciones,
    conWokwi: boolean,
  ) {
    this.seed = seedInicial;
    const panel = document.getElementById('panel')!;
    panel.innerHTML = '';

    // ── Nodo activo (compartido por congestión, colisión, peatón y LEDs) ──
    const nodoBox = this.grupo('Nodo activo (congestión · colisión · peatón · LEDs)');
    const sel = document.createElement('select');
    sel.autocomplete = 'off'; // evita que el navegador restaure el valor al recargar
    for (const id of this.scene.sim.graph.nodes.keys()) {
      const op = document.createElement('option');
      op.value = id;
      op.textContent = `Nodo ${id}`;
      sel.appendChild(op);
    }
    sel.value = this.nodoActivo;
    this.scene.nodoActivo = this.nodoActivo; // resaltado inicial en la escena
    sel.onchange = () => {
      this.nodoActivo = sel.value;
      this.scene.nodoActivo = sel.value; // mueve el resaltado al nodo elegido
    };
    nodoBox.appendChild(sel);
    panel.appendChild(nodoBox);

    // ── Tabs ──
    const tabsBar = document.createElement('div');
    tabsBar.className = 'tabs';
    panel.appendChild(tabsBar);
    const panes = new Map<string, HTMLElement>();
    const tabBtns = new Map<string, HTMLButtonElement>();
    const tab = (nombre: string): HTMLElement => {
      const btn = document.createElement('button');
      btn.textContent = nombre;
      btn.onclick = () => {
        for (const [n, p] of panes) {
          p.classList.toggle('activa', n === nombre);
          tabBtns.get(n)!.classList.toggle('activo', n === nombre);
        }
      };
      tabsBar.appendChild(btn);
      tabBtns.set(nombre, btn);
      const pane = document.createElement('div');
      pane.className = 'tabpane';
      panel.appendChild(pane);
      panes.set(nombre, pane);
      return pane;
    };

    const tabRed = tab('Red');
    const tabSensores = tab('Sensores');
    const tabSim = tab('Simulación');
    panes.get('Red')!.classList.add('activa');
    tabBtns.get('Red')!.classList.add('activo');

    // ═══ Tab RED ═══
    const modoBox = this.grupo('Coordinación de la red');
    const modos: { v: boolean; label: string }[] = [
      { v: true, label: '📡 Coordinada' },
      { v: false, label: '⏱ Fija (sin mensajes)' },
    ];
    const modoBtns: HTMLButtonElement[] = [];
    for (const { v, label } of modos) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = v === this.coordinado ? 'activo' : '';
      b.onclick = () => {
        this.coordinado = v;
        modoBtns.forEach((o, i) => o.classList.toggle('activo', modos[i].v === v));
        this.lineas = [];
        this.setFoco(null); // la sim se recrea: el auto seguido ya no existe
        this.acciones.reset({ coordinado: v });
      };
      modoBtns.push(b);
      modoBox.appendChild(b);
    }
    tabRed.appendChild(modoBox);

    const colBox = this.grupo('Eventos en el nodo activo');
    this.boton(colBox, '⚠ Congestión (cola)', () => this.acciones.congestion(this.nodoActivo));
    this.boton(colBox, '💥 Colisión (bloqueo)', () => this.acciones.colision(this.nodoActivo));
    tabRed.appendChild(colBox);

    // Accidentes activos: modo de despeje + listado para quitarlos a mano.
    const accBox = this.grupo('Accidentes activos');
    const autoBtns: HTMLButtonElement[] = [];
    for (const modo of [{ v: true, label: '⏱ Auto (10s)' }, { v: false, label: '✋ Manual' }]) {
      const b = document.createElement('button');
      b.textContent = modo.label;
      b.className = modo.v === this.autoDespeje ? 'activo' : '';
      b.onclick = () => {
        this.autoDespeje = modo.v;
        autoBtns.forEach((o, i) => o.classList.toggle('activo', (i === 0) === modo.v));
        this.acciones.setAutoDespeje(modo.v);
      };
      autoBtns.push(b);
      accBox.appendChild(b);
    }
    this.accidentesLista = document.createElement('div');
    this.accidentesLista.className = 'accidentes';
    accBox.appendChild(this.accidentesLista);
    const despTodos = document.createElement('button');
    despTodos.textContent = '✕ Despejar todos';
    despTodos.className = 'reinicio';
    despTodos.onclick = () => this.acciones.despejarTodas();
    accBox.appendChild(despTodos);
    tabRed.appendChild(accBox);

    // Seguir un auto: valida visualmente el re-ruteo ante una colisión.
    const segBox = this.grupo('Seguir un auto (valida el desvío)');
    this.boton(segBox, '🔍 Seguir un auto', () => this.acciones.seguir(this.nodoActivo));
    this.boton(segBox, '✕ Dejar de seguir', () => this.acciones.dejarDeSeguir());
    this.focoStatus = document.createElement('div');
    this.focoStatus.className = 'minilog';
    this.focoStatus.textContent = '(ningún auto en seguimiento)';
    segBox.appendChild(this.focoStatus);
    tabRed.appendChild(segBox);

    const logBox = this.grupo('Conversación de la red');
    this.log = document.createElement('div');
    this.log.className = 'minilog';
    this.log.textContent = '(sin mensajes todavía)';
    logBox.appendChild(this.log);
    tabRed.appendChild(logBox);

    // ═══ Tab SENSORES ═══
    // El peatón actúa sobre el nodo activo; el carro y la ambulancia entran
    // por el borde de la cuadrícula (tráfico externo / recorrido en cascada).
    const pedBox = this.grupo('En el nodo activo');
    this.boton(pedBox, '🚶 Peatón', () => this.acciones.peaton(this.nodoActivo));
    tabSensores.appendChild(pedBox);

    const bordeBox = this.grupo('Entran por el borde de la red');
    this.boton(bordeBox, '🚗 Carro', () => this.acciones.carro());
    this.boton(bordeBox, '🚑 Ambulancia', () => this.acciones.ambulancia());
    tabSensores.appendChild(bordeBox);

    if (conWokwi) {
      const wokwiBox = this.grupo('Hardware (Wokwi)');
      this.wokwiBadge = document.createElement('span');
      this.wokwiBadge.className = 'val';
      this.wokwiBadge.textContent = '🔌 conectando…';
      wokwiBox.appendChild(this.wokwiBadge);
      tabSensores.appendChild(wokwiBox);
    }

    // ═══ Tab SIMULACIÓN ═══
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
      this.acciones.hora(h);
      horaVal.textContent = `${String(h).padStart(2, '0')}:00`;
    };
    horaBox.appendChild(hora);
    horaBox.appendChild(horaVal);
    tabSim.appendChild(horaBox);

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
    tabSim.appendChild(velBox);

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
      this.lineas = [];
      this.setFoco(null);
      this.acciones.reset({ seed: this.seed });
    };
    cfgBox.appendChild(restart);
    tabSim.appendChild(cfgBox);

    // ── Lectura en vivo (siempre visible) ──
    this.stats = document.createElement('div');
    this.stats.id = 'stats';
    panel.appendChild(this.stats);

    const nav = this.grupo('');
    const link = document.createElement('a');
    link.href = '?vista=cruce';
    link.textContent = '↩ Ver intersección única (Fase 3)';
    link.className = 'navlink';
    nav.appendChild(link);
    panel.appendChild(nav);
  }

  setWokwi(ok: boolean): void {
    if (this.wokwiBadge) this.wokwiBadge.textContent = ok ? '🟢 conectado' : '🔴 sin conexión';
  }

  /** Listado de accidentes activos: rebuild solo al cambiar el conjunto (para
   *  no recrear los botones ✕ bajo el clic); la edad se refresca cada frame. */
  private renderAccidentes(s: RedSnapshot): void {
    const firma = s.incidentes.map((i) => i.arista).sort().join('|');
    if (firma !== this.accidentesFirma) {
      this.accidentesFirma = firma;
      this.accidentesLista.innerHTML = '';
      if (s.incidentes.length === 0) {
        this.accidentesLista.textContent = '(ninguno)';
      } else {
        for (const inc of s.incidentes) {
          const fila = document.createElement('div');
          fila.className = 'accidente';
          const etiqueta = document.createElement('span');
          etiqueta.dataset.arista = inc.arista;
          etiqueta.textContent = inc.arista;
          const x = document.createElement('button');
          x.textContent = '✕';
          x.onclick = () => this.acciones.despejarColision(inc.arista);
          fila.appendChild(etiqueta);
          fila.appendChild(x);
          this.accidentesLista.appendChild(fila);
        }
      }
    }
    // Refresco de edad sobre las filas existentes.
    for (const inc of s.incidentes) {
      const etiqueta = this.accidentesLista.querySelector<HTMLElement>(`[data-arista="${inc.arista}"]`);
      if (etiqueta) etiqueta.textContent = `${inc.arista} · ${(s.simTime - inc.desde).toFixed(0)}s`;
    }
  }

  /** Fija (o limpia) el auto en foco y lo propaga a la escena. */
  setFoco(id: number | null): void {
    this.focusId = id;
    this.scene.focusId = id;
    if (id === null) this.focoStatus.textContent = '(ningún auto en seguimiento)';
  }

  /** Mensaje del bus → línea humana en la "conversación". */
  registrarMensaje(msg: NetMsg, simTime: number): void {
    const t = `${simTime.toFixed(0)}s`;
    let linea = '';
    if (msg.evento === 'congestion') linea = `${t} · ${msg.nodo}: ⚠ congestión en ${msg.arista} (${msg.cola} autos)`;
    else if (msg.evento === 'despeje') linea = `${t} · ${msg.nodo}: ✓ ${msg.arista} descongestionada en ${msg.duracion.toFixed(0)}s`;
    else if (msg.evento === 'colision') {
      linea = `${t} · ${msg.nodo}: 💥 colisión en ${msg.arista} — vía bloqueada`;
      // En Coordinada, el semáforo aguas arriba desvía (cierra recto, abre giros).
      if (this.coordinado) linea += `\n${t} · 🚦 ${msg.arista.split('>')[0]} desvía: cierra recto, abre giros`;
    } else if (msg.evento === 'colision_despejada')
      linea = `${t} · ${msg.nodo}: 🧹 ${msg.arista} despejada (${msg.duracion.toFixed(0)}s)`;
    else return; // los "flujo" son demasiado frecuentes para el log
    this.lineas.push(linea);
    if (this.lineas.length > 6) this.lineas.shift();
    this.log.textContent = this.lineas.join('\n');
  }

  registrarTexto(texto: string): void {
    this.lineas.push(texto);
    if (this.lineas.length > 6) this.lineas.shift();
    this.log.textContent = this.lineas.join('\n');
  }

  private grupo(titulo: string): HTMLElement {
    const box = document.createElement('div');
    box.className = 'grupo';
    if (titulo) {
      const h = document.createElement('label');
      h.textContent = titulo;
      box.appendChild(h);
    }
    return box;
  }

  private boton(box: HTMLElement, texto: string, onClick: () => void): void {
    const b = document.createElement('button');
    b.textContent = texto;
    b.onclick = onClick;
    box.appendChild(b);
  }

  render(s: RedSnapshot): void {
    this.renderAccidentes(s);

    // Estado del auto en foco: su ruta restante (cambia sola si reruta).
    if (this.focusId !== null) {
      const ruta = this.scene.sim.rutaMundo(this.focusId);
      if (!ruta) {
        const salido = this.focusId;
        this.setFoco(null);
        this.focoStatus.textContent = `el auto #${salido} salió de la red`;
      } else {
        const nodos = ruta.pasaPor.length > 0 ? ruta.pasaPor.join(' → ') : '(saliendo)';
        this.focoStatus.textContent = `siguiendo #${this.focusId} · pasa por ${nodos}`;
      }
    }

    const luz = (estado: string) => `<b class="luz ${estado.toLowerCase()}">${estado}</b>`;
    const activo = s.luces[this.nodoActivo];
    const colas = Object.entries(s.colasPorNodo)
      .map(([id, c]) => `${id}:${c > 0 ? `<b>${c}</b>` : c}`)
      .join(' ');
    const ultimosDespejes = s.despejes.slice(-2);
    this.stats.innerHTML = `
      <div>⏱ ${s.simTime.toFixed(1)} s &nbsp; 🕐 ${String(s.hora).padStart(2, '0')}:00 &nbsp; 🚗 <b>${s.enRed}</b> &nbsp; ✅ ${s.procesados}</div>
      <div>espera promedio: <b>${s.esperaPromedio.toFixed(1)} s</b> &nbsp; cola máx: <b>${s.colaMax}</b></div>
      <div>💥 incidentes activos: <b>${s.incidentes.length}</b> &nbsp; roces detectados: <b>${s.colisiones}</b></div>
      <div>nodo ${this.nodoActivo}: N–S ${activo ? luz(activo.ns) : '—'} E–O ${activo ? luz(activo.ew) : '—'}</div>
      <div class="colas">colas: ${colas}</div>
      ${
        s.congestiones.length > 0
          ? `<div class="alerta">⚠ congestión activa: ${s.congestiones
              .map((c) => `${c.arista} (${(s.simTime - c.desde).toFixed(0)}s)`)
              .join(' · ')}</div>`
          : ''
      }
      ${
        ultimosDespejes.length > 0
          ? `<div>últimos despejes: ${ultimosDespejes
              .map((d) => `${d.arista} en <b>${d.duracion.toFixed(0)}s</b>`)
              .join(' · ')}</div>`
          : ''
      }`;
  }
}
