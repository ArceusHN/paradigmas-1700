# Gemelo físico — ESP32 en Wokwi (Fase 3.5)

Proyecto de [wokwi.com](https://wokwi.com) que actúa como hardware simulado del semáforo:

- **Botones** (carro N–S, carro E–O, peatón, ambulancia) → publican eventos MQTT
  que la app 3D consume como si fueran sus propios botones de UI.
- **LEDs** (rojo/amarillo/verde × 2 grupos) → reflejan el estado del semáforo 3D
  en tiempo real (la app lo publica al cambiar de fase, con `retain`).

## Cómo levantarlo

1. Entrar a wokwi.com → **New Project → ESP32 → MicroPython**.
2. Reemplazar el contenido de `main.py` y `diagram.json` con los de esta carpeta.
3. Play ▶. En el serial debe aparecer `WiFi OK` y `MQTT OK`.
4. Correr la app (`npm run dev` en `client/`): el badge "Hardware (Wokwi)" pasa a
   🟢 y los LEDs empiezan a seguir al semáforo.

## Comunicación

| Topic | Dirección | Payload |
|---|---|---|
| `smart-traffic-light-group-4/eventos` | ESP32 → app | `{"tipo":"carro\|peaton\|ambulancia","dir":"N\|E"}` |
| `smart-traffic-light-group-4/estado` | app → ESP32 | `{"ns":"VERDE","ew":"ROJO"}` (retained) |

Broker público: `broker.hivemq.com` (TCP 1883 para el ESP32, WSS 8884 para el navegador).
Si el broker falla, los botones de la UI siguen funcionando (mismo API de sensores).

Monitor de diagnóstico: `node client/scripts/mqtt-listen.mjs` imprime todo lo que
pase por el prefijo del grupo.
