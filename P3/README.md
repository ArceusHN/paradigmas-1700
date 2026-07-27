# Semáforo Inteligente 3D

Simulación de una red de semáforos inteligentes coordinados (cuadrícula 4×2)
con gemelo físico en Wokwi. Proyecto del 3er parcial de
**Paradigmas de la Programación**.

Vistas: la app abre en la **red** (Fase 4); la intersección única de la
Fase 3 sigue disponible en `?vista=cruce`.

El diseño completo (fases, arquitectura, reglas) está en [PLAN.md](PLAN.md).

## Requisitos

- Node.js 20+ (probado con 22)

## Cómo correr

```bash
npm install      # una sola vez, desde la raíz P3/
npm run dev      # levanta cliente y servidor a la vez
```

- Cliente (escena 3D): http://localhost:5173
- API: http://localhost:3000/api/health

Controles de la escena: **arrastrar** para orbitar, **rueda** para zoom,
**clic derecho** para desplazar.

## Fase 1 (Diseño y esqueleto) ✅

- Monorepo corriendo (client + server) con npm workspaces.
- Escena 3D navegable, cámara orbital.
- Estados, transiciones, tabla de reglas y contratos en `shared/types.ts`.

## Fase 2 (Semáforo tradicional en 3D, línea base) ✅

| Entregable de la Fase 2 | Estado |
|---|---|
| Máquina de estados con tiempos fijos | ✅ `core/Controller.ts` (plan de 2 fases + todo-rojo) |
| Reloj de simulación acelerable (x1/x5/x20 + pausa) | ✅ `ui/Controls.ts` + paso fijo en `core/Simulation.ts` |
| Generador de demanda determinista por semilla | ✅ `core/prng.ts` (mulberry32) + `core/Demand`/`Simulation` |
| Intersección con 4 postes de luces emisivas | ✅ `render/TrafficLightMesh.ts` |
| Autos que frenan en rojo y arrancan en verde (con cola) | ✅ `render/VehicleMesh.ts` + seguimiento en `Simulation.advance()` |
| Reproducible por semilla | ✅ verificado: misma semilla ⇒ resultado idéntico |

## Estado actual — Fase 3 (Inteligencia y sensores) ✅

| Entregable de la Fase 3 | Estado |
|---|---|
| Panel de sensores manipulables | ✅ `ui/Controls.ts` (carro, peatón, ambulancia, hora) |
| Regla EMERGENCIA (ambulancia → verde inmediato) | ✅ verificada headless |
| Regla PEATÓN (cruce peatonal intercalado) | ✅ `core/Controller.ts` |
| Regla DEMANDA (verde proporcional a la cola) | ✅ verificada: 5s sin cola → ~15s con cola |
| Regla NOCTURNO (madrugada sin tráfico → intermitente) | ✅ verificada headless |
| Toggle modo fijo / inteligente (mismo motor) | ✅ `core/Simulation.ts` |
| Render: ambulancia con baliza, ciclo día/noche | ✅ `render/*` |

Las reglas son **funciones puras** en `core/rules.ts` (paradigma funcional);
el controlador inteligente las compone por prioridad. Los botones de sensores
generan los mismos eventos que envía el ESP32 desde Wokwi (Fase 3.5 — puente MQTT).

## Estado actual — Fase 3.5 (Puente Wokwi / MQTT) ✅

| Pieza | Estado |
|---|---|
| `client/src/wokwi/Bridge.ts` — MQTT (WebSocket) en el navegador | ✅ eventos del ESP32 → misma API de sensores |
| Canal de regreso: estado del semáforo → LEDs del ESP32 | ✅ publica solo al cambiar de fase (retained) |
| `wokwi/` — ESP32 MicroPython (4 botones + 6 LEDs) | ✅ versionado; ver `wokwi/README.md` |
| Badge de conexión + fuente del último evento en el HUD | ✅ "🚑 ambulancia — desde Wokwi" |
| Verificación end-to-end vía `broker.hivemq.com` | ✅ ambas direcciones (evento entrante y estado saliente) |

Topics: `smart-traffic-light-group-4/{eventos,estado}`. Monitor de diagnóstico:
`node client/scripts/mqtt-listen.mjs`. Si el broker público falla, los botones
de la UI siguen funcionando (misma API de sensores). Nota para la demo: la
pestaña de la app debe estar visible — el navegador pausa la simulación (y sus
publicaciones) en pestañas de fondo.

Controles en pantalla: **modo** inteligente/tradicional, **sensores** (carro N-S/E-O,
peatón, ambulancia), **hora del día**, velocidad **x1/x5/x20**, **pausa**,
**semilla**, **reiniciar** y lectura en vivo (fase, colas, procesados, alertas).

## Estructura

```
P3/
├── shared/types.ts        # Contratos, estados, direcciones (tipado estático)
├── client/                # Vite + TypeScript + Three.js
│   └── src/
│       ├── main.ts        # Bootstrap: Simulation + Scene + Controls
│       ├── core/          # Lógica pura, sin Three.js (testeable)
│       │   ├── prng.ts        # PRNG determinista (semilla)
│       │   ├── world.ts       # Geometría y constantes
│       │   ├── Vehicle.ts     # Modelo lógico de vehículo
│       │   ├── TrafficLight.ts# Máquina de estados (patrón State)
│       │   ├── rules.ts       # Reglas de decisión (funciones puras)
│       │   ├── Controller.ts  # Controladores fijo + inteligente
│       │   └── Simulation.ts  # Mundo: paso fijo, demanda, sensores, colas
│       ├── render/        # Three.js (sólo lee estado del núcleo)
│       └── ui/            # Panel de control
└── server/                # Express + TypeScript (esqueleto de la API)
    └── src/index.ts
```

## Estado actual — Fase 4 (Red de semáforos: cuadrícula, eventos y coordinación) ✅

| Entregable de la Fase 4 | Estado |
|---|---|
| 4.1 Grafo de la red + autos con ruta (origen→destino) | ✅ `core/Graph.ts`, `core/Router.ts` (Dijkstra, pesos vivos), `core/Network.ts` |
| 4.2 Render de la cuadrícula 4×2 (8 semáforos) | ✅ `render/RedScene.ts` (calles con contraste, manzanas, 32 postes, marcadores de evento) |
| 4.3 Eventos: **congestión** (cola) y **colisión** (bloqueo) | ✅ botones UI + push buttons del ESP32; colisión también emergente (choque real) |
| 4.4 Mensajería entre semáforos | ✅ `core/Bus.ts` en memoria (determinista) espejado a MQTT (`red/eventos`) |
| 4.5 Algoritmo: re-ruteo + verdes coordinados | ✅ peso = largo + k·cola + castigo por congestión/colisión; anticipación con avisos `flujo` |
| 4.6 Validación ON vs OFF (misma semilla) | ✅ `client/scripts/red-smoke.ts`: métrica de **throughput** (la espera promedio se confunde con el gridlock) |
| Calidad de movimiento en giros | ✅ curva de Bézier + separación en espacio-mundo dentro del cruce (roces: de ~46 a ~5 por 100 autos) |
| Detector y análisis de roces | ✅ `client/scripts/red-collisions.ts` clasifica las circunstancias de cada roce |

Cada semáforo es un **agente**: decide con sus sensores locales + mensajes de
vecinos — no hay controlador central; el desvío del tráfico es emergente.
El panel (con pestañas Red / Sensores / Simulación) muestra la "conversación de
la red" en vivo y permite alternar **coordinada / fija** con la misma semilla.

- **Congestión**: satura una vía con una ráfaga → cola → aviso → desvío.
- **Colisión**: bloquea un tramo (obstáculo) unos segundos → la red lo evita →
  se despeja sola. Provocable por botón o emergente (choque real).

Verificación headless: `npx tsx client/scripts/red-smoke.ts` (determinismo +
throughput ON/OFF + ciclo del incidente de colisión) y
`npx tsx client/scripts/red-collisions.ts` (análisis de roces).

## Próximo

- **Fase 5:** persistencia (SQLite vía API) y dashboards con Chart.js, con
  métricas de red. La tabla `events` registra la fuente (`ui` | `wokwi`).
- **Fase 5:** comparación A/B en vivo (fijo vs inteligente, misma semilla).
