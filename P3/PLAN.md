# Plan de Desarrollo — Semáforo Inteligente 3D

**Materia:** Paradigmas de la Programación — 3er Parcial
**Objetivo:** Aplicación web que simula un semáforo inteligente en una intersección 3D (Three.js), con sensores simulados, lógica adaptativa, históricos persistentes y dashboards. **Plus distintivo:** comparación A/B en vivo — dos intersecciones lado a lado (modo fijo vs inteligente) bajo la misma demanda determinista.

**Stack:** TypeScript en todo el proyecto. Frontend: Vite + Three.js + Chart.js. Backend: Node.js + Express. Base de datos: SQLite (`better-sqlite3`).

---

## 1. Arquitectura general

La simulación corre 100% en el navegador; el backend solo persiste y sirve métricas. Si la API se cae, la simulación y el dashboard en vivo siguen funcionando.

```
┌──────────────────────── NAVEGADOR ─────────────────────────┐
│  Simulación (TypeScript + Three.js)                        │
│  ├─ core/    máquina de estados, reglas, sensores,         │
│  │           generador de demanda con semilla              │
│  ├─ render/  escena 3D (1 o 2 intersecciones — modo A/B)   │
│  └─ ui/      panel de sensores + dashboard EN VIVO         │
│                                                            │
│  Dashboard HISTÓRICO (Chart.js)                            │
│  comparativas entre corridas, fijo vs inteligente          │
└────────────────────┬───────────────────────────────────────┘
                     │ REST (JSON) — métricas por lote
┌────────────────────▼───────────────────────────────────────┐
│  API — Node.js + Express (TypeScript)                      │
└────────────────────┬───────────────────────────────────────┘
              ┌──────▼──────┐
              │   SQLite    │  (archivo local, cero instalación)
              └─────────────┘
```

### Estructura del repositorio

```
P3/
├── PLAN.md
├── client/                     # Vite + TypeScript
│   ├── index.html
│   └── src/
│       ├── main.ts             # Bootstrap: simulación + render + UI
│       ├── core/               # ← Lógica pura, sin Three.js (testeable)
│       │   ├── TrafficLight.ts     # Máquina de estados (patrón State)
│       │   ├── Controller.ts       # Cerebro: reglas de prioridad
│       │   ├── rules.ts            # Reglas adaptativas (funciones puras)
│       │   ├── Sensors.ts          # Sensores simulados (Observer/eventos)
│       │   ├── Demand.ts           # Generador de demanda determinista (semilla)
│       │   ├── Vehicle.ts          # Modelo lógico de vehículo/cola
│       │   ├── Graph.ts            # Red de intersecciones: nodos, aristas, pesos (Fase 4)
│       │   ├── Router.ts           # Rutas de vehículos: Dijkstra/A* con pesos vivos (Fase 4)
│       │   ├── Bus.ts              # Mensajería entre semáforos, espejada a MQTT (Fase 4)
│       │   └── Stats.ts            # Métricas por ciclo + buffer para la API
│       ├── render/             # ← Todo lo que toca Three.js
│       │   ├── Scene.ts            # Escena, luces, cámara, OrbitControls
│       │   ├── Intersection.ts     # Calles, cruces, entorno (instanciable ×2)
│       │   ├── TrafficLightMesh.ts # Poste + luces emisivas
│       │   ├── VehicleMesh.ts      # Autos/ambulancia low-poly
│       │   └── DayNight.ts         # Iluminación según hora simulada
│       ├── ui/
│       │   ├── SensorPanel.ts      # Sliders y botones (HTML sobre el canvas)
│       │   ├── LiveDashboard.ts    # Métricas de la corrida actual (memoria)
│       │   └── HistoryDashboard.ts # Consulta la API + Chart.js
│       ├── wokwi/
│       │   └── Bridge.ts           # Puente MQTT ↔ ESP32 simulado (Fase 3.5)
│       └── api.ts              # Cliente REST tipado
├── server/                     # Node.js + Express + TypeScript
│   └── src/
│       ├── index.ts            # Bootstrap Express
│       ├── routes/runs.ts      # Endpoints
│       ├── db.ts               # better-sqlite3 + esquema
│       └── queries.ts          # Agregaciones SQL
├── wokwi/                      # Gemelo físico simulado (proyecto de wokwi.com, versionado)
│   ├── main.py                 # MicroPython: botones → MQTT, MQTT → LEDs
│   └── diagram.json            # ESP32 + push buttons + LEDs del semáforo
└── shared/
    └── types.ts                # CycleMetric, RunSummary, etc. (los usan ambos)
```

---

## 2. Lógica de decisión (lo que exige el enunciado)

Máquina de estados: `VERDE → AMARILLO → ROJO → VERDE...` + estado especial `INTERMITENTE` (madrugada).

Reglas adaptativas por **prioridad** (de mayor a menor), implementadas como funciones puras en `rules.ts` — reciben lecturas de sensores + estado actual, devuelven la transición/duración siguiente:

1. **Emergencia** (ambulancia) → verde inmediato en su dirección.
2. **Peatón** presiona botón → priorizar cruce peatonal al terminar el ciclo actual.
3. **Demanda vehicular** → extender el verde proporcionalmente a la cola (con tope).
4. **Modo nocturno** → madrugada sin tráfico ⇒ amarillo intermitente.
5. **Default** → tiempos base del ciclo.

El modo "tradicional" usa el mismo motor ignorando las reglas 1–4 — así la comparación A/B es justa por construcción.

### Demanda determinista (clave del A/B)

`Demand.ts` genera vehículos, peatones y emergencias con un PRNG con **semilla** (ej. mulberry32). Misma semilla ⇒ misma secuencia exacta de eventos. Esto habilita:
- El modo A/B: dos controladores distintos, idéntica demanda.
- Corridas reproducibles (rigor para el informe).

---

## 3. API y modelo de datos

### Endpoints

| Método | Ruta | Función |
|---|---|---|
| POST | `/api/runs` | Crear corrida (modo, semilla, config) |
| POST | `/api/runs/:id/metrics` | Recibir lote de métricas por ciclo |
| GET | `/api/runs` | Listar corridas |
| GET | `/api/runs/:id/summary` | Agregados de una corrida |
| GET | `/api/compare?a=&b=` | Comparativa entre dos corridas |

**Regla de oro:** métricas por **lote** (un POST por ciclo de semáforo o cada ~5 s simulados), nunca por frame.

### Tablas (SQLite)

- **`runs`** — `id, modo (fijo|inteligente), semilla, config JSON, iniciada_en`
- **`cycle_metrics`** — `run_id, tiempo_sim, espera_promedio, vehiculos_procesados, cola_maxima, peatones_atendidos, emergencias`
- **`events`** — `run_id, tiempo_sim, tipo (peaton|emergencia|modo_nocturno), direccion, fuente (ui|wokwi)`

### Los dos dashboards

- **En vivo** (`LiveDashboard`): métricas de la corrida actual desde memoria, en tiempo real — sin tocar la API. En modo A/B muestra contadores por intersección.
- **Histórico** (`HistoryDashboard`): consulta la API — evolución del tráfico por hora simulada, ranking de corridas, y la gráfica estrella: espera promedio fijo vs inteligente bajo la misma semilla.

---

## 4. Fases de desarrollo

### Fase 1 — Diseño y esqueleto
- Definir estados, transiciones y tabla de reglas con prioridades.
- Scaffolding: Vite + TS en `client/`, Express + TS en `server/`, `shared/types.ts`.
- Escena 3D mínima: plano, luces, cámara orbital, un cubo animado.
- **Entregable:** monorepo corriendo (client + server) y escena navegable.

### Fase 2 — Semáforo tradicional en 3D (línea base)
- Núcleo: máquina de estados con tiempos fijos, reloj de simulación acelerable (x1/x5/x20).
- `Demand.ts` con semilla desde el inicio (los vehículos ya nacen deterministas).
- Render: intersección con 4 postes de luces emisivas; autos que frenan en rojo y arrancan en verde.
- **Entregable:** intersección 3D en modo tradicional, reproducible por semilla.

### Fase 3 — Inteligencia (lógica adaptativa)
- Panel de sensores: slider de flujo por vía, botón de peatón, botón de ambulancia, hora del día.
- Las 5 reglas de prioridad; toggle **modo fijo / inteligente**.
- Render: ambulancia con luces parpadeantes, peatones, ciclo día/noche, amarillo intermitente.
- **Entregable:** el semáforo reacciona en vivo a lo que el usuario manipula.

### Fase 3.5 — Puente Wokwi (MQTT): sensores físicos simulados
- `client/src/wokwi/Bridge.ts`: cliente MQTT sobre WebSocket en el navegador.
  Mapea mensajes JSON del ESP32 (`{"tipo":"carro","dir":"N"}`) a la **misma API
  de sensores** que usan los botones de la UI (`detectarCarro`, `pedirPeaton`,
  `enviarAmbulancia`) — el núcleo no distingue de dónde vino el evento.
- **Bidireccional:** la app publica el estado del semáforo (solo al cambiar,
  nunca por frame) y el ESP32 lo refleja en LEDs — un gemelo físico del
  semáforo 3D, no solo un control remoto.
- Carpeta `wokwi/` versionada: `main.py` (MicroPython) + `diagram.json`
  (push buttons de sensores + LEDs por grupo N–S / E–O).
- Broker público (`broker.hivemq.com`; alternativas `broker.emqx.io`,
  `test.mosquitto.org`) con prefijo de topic único del grupo:
  `smart-traffic-light-group-4/{eventos,estado}`.
- UI: badge de conexión Wokwi + último evento recibido con su fuente.
- **Entregable:** un botón físico en la pestaña de Wokwi dispara eventos en la
  simulación 3D, y los LEDs del ESP32 siguen al semáforo en tiempo real.

### Fase 4 — Red de semáforos: cuadrícula, eventos y coordinación
**(Requerimiento del ingeniero.)** Cuadrícula de ~8 intersecciones (4×2) donde un
evento localizado hace que los semáforos se avisen entre sí, desvíen el tráfico y
ajusten sus verdes para mantener el flujo. Dos tipos de evento:
- **Congestión** — una cola crítica de autos satura una vía (la palabra que el
  equipo usó, "colación", era un malapropismo; internamente siempre fue congestión).
- **Colisión** — un choque **bloquea** físicamente un tramo hasta despejarse.

- **4.1 Grafo de la red + autos con ruta** *(refactor prioritario — marca el ritmo)*
  - Nodos = intersecciones, aristas = cuadras con capacidad y cola.
  - `Vehicle` pasa de "cruza y desaparece" a **origen → destino → ruta** con giros.
  - Nuevos módulos en `core/`: `Graph.ts` (red y pesos), `Router.ts` (rutas).
- **4.2 Render de la cuadrícula** — reutilizar `Intersection` instanciable (ya
  estaba previsto para el A/B); cámara que abarque la red; `InstancedMesh` si hace falta.
- **4.3 Los eventos** — el botón (UI o push button del ESP32) dispara:
  - *Congestión*: **inyecta una ráfaga de autos** hacia un nodo; la cola *emerge*
    y el semáforo local la **detecta con sus sensores** (umbral sostenido).
  - *Colisión*: **bloquea un tramo** de acceso al nodo (obstáculo en la vía) por
    unos segundos. También **emergente**: dos autos que chocan de verdad crean el
    bloqueo (con enfriamiento y tope para no saturar). Los autos accidentados son
    el obstáculo hasta que se despeja.
- **4.4 Mensajería entre semáforos** — bus de eventos en memoria (determinista)
  con contrato JSON, **espejado a MQTT** (`red/<nodo>/estado`, `red/eventos`) para
  ver la "conversación" en vivo y que el ESP32 participe como nodo físico:
  su botón dispara la ráfaga y sus LEDs siguen a la intersección que se elija.
  Mensajes clave: `{"evento":"congestion","nodo":"B2","arista":"A2→B2","cola":12}`
  y colas periódicas a vecinos ("te estoy enviando N autos").
- **4.5 El algoritmo (el corazón de la fase)** — dos capas:
  1. **Re-ruteo:** peso dinámico por arista = `largo + k·cola + castigo si hay
     congestión o colisión`; los autos recalculan con **Dijkstra** al recibirse un
     aviso — el desvío emerge y se revierte solo cuando el evento pasa. Una vía
     con colisión tiene castigo alto (bloqueo) para que la red la evite.
  2. **Verdes coordinados:** el semáforo congestionado drena (más verde a ese
     acceso); los vecinos aguas abajo sincronizan el verde para que lo drenado
     fluya sin re-apilarse (**ola verde** sobre el corredor de desvío) — es la
     regla DEMANDA de la Fase 3 alimentada ahora con información remota.
- **4.6 Validación con números** *(absorbe el A/B de la antigua Fase 5)* — misma
  semilla y misma ráfaga, coordinación **ON vs OFF**: tiempo en despejar la cola,
  espera promedio de la red y throughput.
- **Entregable:** demo estrella — se genera un evento (congestión o colisión), el
  monitor MQTT muestra a los semáforos avisándose, el tráfico se desvía en el 3D y
  los números (throughput) prueban que la coordinación drena la red.
- **Calidad de movimiento:** giros con curva de Bézier y separación en
  espacio-mundo dentro de los cruces (los autos ya no se enciman al girar —
  medido: de ~46 a ~5 roces por 100 autos). Detector de colisiones + harness de
  análisis (`red-collisions.ts`) que clasifica las circunstancias de cada roce.

### Fase 5 — Históricos y dashboards
- Server: esquema SQLite + los 5 endpoints; `Stats.ts` bufferea y postea por lote.
- Dashboard en vivo (memoria) y dashboard histórico (API + Chart.js), ahora con
  **métricas de red** (espera promedio global, cola máxima por nodo, tiempo de despeje).
- La tabla `events` registra la **fuente** de cada evento (`ui` | `wokwi`):
  el dashboard histórico puede evidenciar la integración IoT con datos
  ("eventos disparados desde hardware"), no solo con la demo visual.
- **Entregable:** corridas persistidas y comparables entre sesiones.

### Fase 6 — Cierre (y extras si sobra tiempo)
- Pruebas de escenarios clave: emergencia interrumpe ciclo, peatón, madrugada,
  evento con misma semilla da resultados idénticos al repetir (ON vs OFF comparable).
- Pulido visual y guion de demostración.
- Extra opcional: **replay 3D** de corridas desde `events`.

> **Regla de oro:** el 3D se pule al final. Primero el cerebro con geometría
> simple; si el tiempo se acorta, el orden de recorte dentro de la Fase 4 es:
> menos nodos (2×2 en vez de 4×2), verdes coordinados simplificados (solo drenaje),
> pero **nunca** recortar el re-ruteo — es el algoritmo que pide el enunciado.

---

## 5. Mapa contra los requisitos del enunciado

| Requisito del PDF | Dónde se cubre |
|---|---|
| Simulación visual con 3 estados en tiempo real | Fase 2 (3D con Three.js) |
| Panel de sensores simulados manipulables | Fase 3 |
| Verde extendido / peatón / ambulancia / intermitente nocturno | Fase 3 (reglas 1–4) |
| Dashboard: esperas, vehículos por ciclo, fijo vs inteligente | Fases 4.6 y 5 |
| Registro/histórico del día | Fase 5 (SQLite vía API) |
| Backend/datos (Node.js + BD) sugerido por el PDF | Fase 5 |
| Modo coordinación "ola verde" | Fase 4.5 |
| **Nuevo (ingeniero):** cuadrícula ~8 semáforos + eventos (congestión/colisión) + comunicación + algoritmo de desvío | Fase 4 completa |

## 6. Paradigmas demostrados (para la evaluación)

- **POO:** clases `TrafficLight`, `Controller`, `Vehicle`, `Sensors`; patrón **State** en la máquina de estados; **Observer** para que los sensores notifiquen al controlador.
- **Funcional:** reglas de decisión como funciones puras en `rules.ts`; PRNG determinista — deterministas y testeables sin UI.
- **Orientado a eventos / reactivo:** la simulación responde a sensores y usuario en tiempo real.
- **Pub/sub asíncrono (MQTT):** el patrón Observer extendido a través de la red — un ESP32 (Wokwi) publica sensores y consume el estado del semáforo vía broker; la app y el hardware no se conocen entre sí, solo comparten topics.
- **Distribuido / basado en agentes (Fase 4):** cada semáforo decide con información **local** (sus sensores) más **mensajes de sus vecinos** — no hay un controlador central omnisciente; el desvío del tráfico es comportamiento emergente. Algoritmos de grafos (Dijkstra/A\*) con pesos dinámicos.
- **Tipado estático (TypeScript):** estados como union types (`'VERDE' | 'AMARILLO' | ...`), contratos compartidos cliente/servidor en `shared/types.ts`.
- **Cliente-servidor / declarativo:** REST + SQL de agregación para los históricos.

## 7. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Curva de aprendizaje de Three.js | Fase 1 dedicada a la escena base; solo primitivas, sin modelos externos |
| Gastar el tiempo en lo visual | Lógica primero (`core/` es TS puro); pulido 3D en Fase 6 |
| Sincronización lógica-render | El núcleo es la única fuente de verdad; el render solo lee estado |
| Backend caído en la demo | La simulación y el dashboard en vivo no dependen de la API |
| ON vs OFF no comparable | Demanda con semilla desde Fase 2; test de reproducibilidad en Fase 6 |
| Ciclos largos aburren la demo | Reloj de simulación acelerable (x1, x5, x20) |
| Broker MQTT público caído/lento en la demo | Los botones de la UI son el fallback (misma API de sensores); probar el broker 30 min antes; cambiar a `broker.emqx.io` o `test.mosquitto.org` es una constante |
| Rendimiento con 8 intersecciones | Vehículos low-poly + `InstancedMesh`; tope de autos por arista; cuadrícula recortable a 2×2 |
| **Subestimar el refactor vehicular (4.1)** | Es el cuello de botella: empezarlo primero y en paralelo al render; el bus de mensajes y el algoritmo se enchufan después |
| La coordinación depende del broker | El bus entre semáforos es **en memoria** (determinista); MQTT es solo espejo/observabilidad — si el broker cae, la red sigue coordinando |
