import mqtt, { type MqttClient } from 'mqtt';
import { DIRECTIONS, type Direction, type LightState, type WokwiEventMsg } from 'shared';
import type { Simulation } from '../core/Simulation';

/**
 * Puente Wokwi (Fase 3.5): pub/sub MQTT entre el ESP32 simulado y la app.
 *
 * - Suscribe `<prefijo>/eventos` y traduce cada mensaje a la misma API de
 *   sensores que usan los botones de la UI — el núcleo no distingue la fuente.
 * - Publica `<prefijo>/estado` SOLO cuando el semáforo cambia de fase
 *   (nunca por frame), para que el ESP32 refleje el estado en sus LEDs.
 *
 * El navegador solo puede hablar MQTT sobre WebSocket; el ESP32 usa TCP puro.
 * Ambos se encuentran en el broker público — ninguno necesita ver al otro.
 */
export const PREFIJO_MQTT = 'smart-traffic-light-group-4';
const BROKER_WS = 'wss://broker.hivemq.com:8884/mqtt';

export class WokwiBridge {
  /** La UI se suscribe para pintar el badge de conexión. */
  onStatus?: (conectado: boolean) => void;

  private readonly client: MqttClient;
  private ultimoEstado = '';

  constructor(private readonly sim: Simulation) {
    this.client = mqtt.connect(BROKER_WS, { reconnectPeriod: 3000 });

    this.client.on('connect', () => {
      this.client.subscribe(`${PREFIJO_MQTT}/eventos`);
      this.ultimoEstado = ''; // re-publicar el estado tras reconectar
      this.onStatus?.(true);
    });
    this.client.on('close', () => this.onStatus?.(false));
    this.client.on('message', (_topic, payload) => this.recibir(payload));
  }

  /** Mensaje del ESP32 → API de sensores. Ignora payloads malformados (broker público). */
  private recibir(payload: Uint8Array): void {
    let msg: WokwiEventMsg;
    try {
      msg = JSON.parse(new TextDecoder().decode(payload));
    } catch {
      return;
    }
    const dir: Direction = DIRECTIONS.includes(msg.dir as Direction) ? (msg.dir as Direction) : 'N';
    switch (msg.tipo) {
      case 'carro':
        this.sim.detectarCarro(dir, 'wokwi');
        break;
      case 'peaton':
        this.sim.pedirPeaton('wokwi');
        break;
      case 'ambulancia':
        this.sim.enviarAmbulancia(dir, 'wokwi');
        break;
    }
  }

  /** Estado del semáforo → ESP32. Deduplica: solo publica al cambiar. */
  publicarEstado(ns: LightState, ew: LightState): void {
    if (!this.client.connected) return;
    const estado = JSON.stringify({ ns, ew });
    if (estado === this.ultimoEstado) return;
    this.ultimoEstado = estado;
    this.client.publish(`${PREFIJO_MQTT}/estado`, estado, { retain: true }, (err) => {
      if (err) console.error('[wokwi] error al publicar estado:', err);
    });
  }
}
