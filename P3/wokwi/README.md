# Gemelo físico — ESP32 en Wokwi (Fases 3.5 y 4)

Proyecto de [wokwi.com](https://wokwi.com) que actúa como hardware de la red de semáforos:

- **Botones** (5) → los eventos y sensores físicos de la red:
  - **Congestión** — satura de autos el **nodo activo** del panel (cola → desvío).
  - **Colisión** — bloquea un tramo del nodo activo (choque → la red lo evita).
  - **Carro** — inyecta un auto en una entrada de la cuadrícula.
  - **Peatón** — pide cruce peatonal en el nodo activo.
  - **Ambulancia** — entra a la red; cada semáforo le abre paso en cascada.
- **LEDs** (rojo/amarillo/verde × 2 grupos) → espejan el **nodo activo** elegido
  en el panel de la app (por defecto B1), en tiempo real.

## Cómo levantarlo

1. Entrar a wokwi.com → **New Project → ESP32 → MicroPython**.
2. Reemplazar el contenido de `main.py` y `diagram.json` con los de esta carpeta.
3. Play ▶. En el serial debe aparecer `WiFi OK` y `MQTT OK`.
4. Correr la app (`npm run dev` en `client/`): el badge "Hardware (Wokwi)" pasa a
   🟢, los LEDs siguen al nodo activo y los botones disparan eventos en el 3D.

## Comunicación

| Topic | Dirección | Payload |
|---|---|---|
| `smart-traffic-light-group-4/eventos` | ESP32 → app | `{"tipo":"congestion"}`, `{"tipo":"colision"}`, `{"tipo":"carro"}`, `{"tipo":"peaton"}`, `{"tipo":"ambulancia"}` (todos admiten `"nodo":"B1"`; si no, usan el nodo activo) |
| `smart-traffic-light-group-4/estado` | app → ESP32 | `{"ns":"VERDE","ew":"ROJO"}` (retained, nodo activo) |
| `smart-traffic-light-group-4/red/eventos` | app → mundo | espejo de la conversación entre semáforos: `congestion`/`despeje` (colas) y `colision`/`colision_despejada` (bloqueos) |

Los mensajes `flujo` (avisos periódicos entre vecinos) NO se espejan a MQTT:
son demasiado frecuentes para un broker público y solo tienen valor interno.
La coordinación de la red corre sobre un bus en memoria — si el broker cae,
la red sigue funcionando y solo se pierde la observabilidad externa.

Broker público: `broker.hivemq.com` (TCP 1883 para el ESP32, WSS 8884 para el
navegador). Monitor de diagnóstico: `node client/scripts/mqtt-listen.mjs`.

> La vista anterior (intersección única, Fase 3) sigue disponible en
> `http://localhost:5173/?vista=cruce`; sus botones de UI funcionan igual.
> El botón "Congestión" mantiene compatibilidad con el firmware viejo que
> enviaba `{"tipo":"colacion"}` (la app lo trata como congestión).
