import mqtt, { type MqttClient } from 'mqtt';
import type { LightState, NetMsg, NodeId } from 'shared';
import { PREFIJO_MQTT } from './Bridge';

const BROKER_WS = 'wss://broker.hivemq.com:8884/mqtt';

/**
 * Puente Wokwi de la RED (Fase 4). Tres funciones:
 *
 * 1. ESP32 → red: los push buttons publican eventos — colación (en el nodo
 *    activo del panel, o `{"nodo":"B1"}` explícito), carro, peatón y
 *    ambulancia — que se mapean a la misma API de sensores que usa la UI.
 * 2. Espejo del bus: los eventos congestion/despeje que los semáforos se
 *    intercambian se publican también a MQTT — la "conversación" de la red
 *    es observable desde fuera. (Los `flujo` no se espejan: son demasiado
 *    frecuentes para un broker público y solo tienen valor interno.)
 * 3. Estado → ESP32: las luces del nodo elegido se publican al topic de
 *    estado de siempre — los LEDs del ESP32 espejan ese nodo sin cambios
 *    en su firmware.
 */
export class RedBridge {
  onStatus?: (conectado: boolean) => void;
  /** `nodo` viene solo si el mensaje lo trae; si no, la app usa el nodo activo. */
  onCongestion?: (nodo?: NodeId) => void;
  onColision?: (nodo?: NodeId) => void;
  onCarro?: () => void;
  onPeaton?: () => void;
  onAmbulancia?: () => void;

  private readonly client: MqttClient;
  private ultimoEstado = '';

  constructor() {
    this.client = mqtt.connect(BROKER_WS, { reconnectPeriod: 3000 });
    this.client.on('connect', () => {
      this.client.subscribe(`${PREFIJO_MQTT}/eventos`);
      this.ultimoEstado = '';
      this.onStatus?.(true);
    });
    this.client.on('close', () => this.onStatus?.(false));
    this.client.on('message', (_t, payload) => this.recibir(payload));
  }

  private recibir(payload: Uint8Array): void {
    let msg: { tipo?: string; nodo?: string };
    try {
      msg = JSON.parse(new TextDecoder().decode(payload));
    } catch {
      return;
    }
    const nodo = typeof msg.nodo === 'string' ? msg.nodo : undefined;
    switch (msg.tipo) {
      case 'congestion':
      case 'colacion': // compat con firmware viejo (era congestión)
        this.onCongestion?.(nodo);
        break;
      case 'colision':
        this.onColision?.(nodo);
        break;
      case 'carro':
        this.onCarro?.();
        break;
      case 'peaton':
        this.onPeaton?.();
        break;
      case 'ambulancia':
        this.onAmbulancia?.();
        break;
    }
  }

  /** Luces del nodo espejado → LEDs del ESP32. Publica solo al cambiar. */
  publicarEstado(ns: LightState, ew: LightState): void {
    if (!this.client.connected) return;
    const estado = JSON.stringify({ ns, ew });
    if (estado === this.ultimoEstado) return;
    this.ultimoEstado = estado;
    this.client.publish(`${PREFIJO_MQTT}/estado`, estado, { retain: true });
  }

  /** Espejo del bus interno hacia MQTT (solo congestion/despeje). */
  espejarBus(topic: string, msg: NetMsg): void {
    if (topic !== 'red/eventos' || !this.client.connected) return;
    this.client.publish(`${PREFIJO_MQTT}/red/eventos`, JSON.stringify(msg));
  }
}
