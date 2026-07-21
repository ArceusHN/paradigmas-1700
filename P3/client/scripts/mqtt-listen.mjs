// Monitor MQTT de diagnóstico — sustituye al cliente web de HiveMQ.
// Uso:  node scripts/mqtt-listen.mjs
// Se suscribe al prefijo del grupo y muestra todo mensaje entrante.
// Se reconecta solo si el broker se cae; Ctrl+C para salir.

import mqtt from 'mqtt';

const PREFIJO = 'smart-traffic-light-group-4';
const BROKER = process.env.MQTT_BROKER ?? 'mqtt://broker.hivemq.com:1883';

const client = mqtt.connect(BROKER, { reconnectPeriod: 2000 });

client.on('connect', () => {
  console.log(`[OK] Conectado a ${BROKER}`);
  client.subscribe(`${PREFIJO}/#`, (err) => {
    if (err) console.error('[ERROR] al suscribirse:', err.message);
    else console.log(`[OK] Suscrito a ${PREFIJO}/#  — esperando mensajes...`);
  });
});

client.on('message', (topic, payload) => {
  const hora = new Date().toLocaleTimeString();
  console.log(`[${hora}] ${topic}  →  ${payload.toString()}`);
});

client.on('reconnect', () => console.log('[...] Reconectando...'));
client.on('error', (err) => console.error('[ERROR]', err.message));
