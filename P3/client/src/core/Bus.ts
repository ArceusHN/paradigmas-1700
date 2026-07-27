import type { NetMsg } from 'shared';

/**
 * Bus de mensajes entre semáforos (Fase 4).
 *
 * Es EN MEMORIA y síncrono a propósito: la coordinación de la red no depende
 * del broker ni pierde el determinismo por semilla. El `espejo` permite
 * publicar cada mensaje también a MQTT (observabilidad + nodo físico ESP32)
 * sin que el núcleo conozca nada de red.
 */
export type BusHandler = (topic: string, msg: NetMsg) => void;

export class Bus {
  /** Espejo opcional hacia MQTT (lo conecta la capa wokwi/, no el núcleo). */
  espejo?: BusHandler;

  private subs: { prefijo: string; fn: BusHandler }[] = [];

  subscribe(prefijo: string, fn: BusHandler): void {
    this.subs.push({ prefijo, fn });
  }

  publish(topic: string, msg: NetMsg): void {
    for (const s of this.subs) {
      if (topic.startsWith(s.prefijo)) s.fn(topic, msg);
    }
    this.espejo?.(topic, msg);
  }
}
