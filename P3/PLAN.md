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
│       └── api.ts              # Cliente REST tipado
├── server/                     # Node.js + Express + TypeScript
│   └── src/
│       ├── index.ts            # Bootstrap Express
│       ├── routes/runs.ts      # Endpoints
│       ├── db.ts               # better-sqlite3 + esquema
│       └── queries.ts          # Agregaciones SQL
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
- **`events`** — `run_id, tiempo_sim, tipo (peaton|emergencia|modo_nocturno), direccion`

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

### Fase 4 — Históricos y dashboards
- Server: esquema SQLite + los 5 endpoints; `Stats.ts` bufferea y postea por lote.
- Dashboard en vivo (memoria) y dashboard histórico (API + Chart.js).
- **Entregable:** corridas persistidas y comparables entre sesiones.

### Fase 5 — Plus distintivo: comparación A/B en vivo
- Dos intersecciones en la misma escena: controlador fijo vs inteligente, **misma semilla** — mismos autos, peatones y emergencias en ambas.
- Contadores de espera/cola sobre cada intersección; las dos corridas se persisten vinculadas y alimentan `GET /api/compare`.
- **Entregable:** demo estrella — una intersección se congestiona mientras la otra fluye, con evidencia cuantitativa en el dashboard.

### Fase 6 — Cierre (y extras si sobra tiempo)
- Pruebas de escenarios clave: emergencia interrumpe ciclo, peatón, madrugada, A/B con misma semilla da resultados idénticos al repetir.
- Pulido visual y guion de demostración.
- Extras opcionales (en orden): **replay 3D** de corridas desde `events` · ola verde con 3 intersecciones coordinadas.

> **Regla de oro:** el 3D se pule al final. Primero el cerebro con geometría
> simple; si el tiempo se acorta, las fases 2–4 cumplen todos los puntos
> obligatorios del enunciado y la Fase 5 es el diferenciador.

---

## 5. Mapa contra los requisitos del enunciado

| Requisito del PDF | Dónde se cubre |
|---|---|
| Simulación visual con 3 estados en tiempo real | Fase 2 (3D con Three.js) |
| Panel de sensores simulados manipulables | Fase 3 |
| Verde extendido / peatón / ambulancia / intermitente nocturno | Fase 3 (reglas 1–4) |
| Dashboard: esperas, vehículos por ciclo, fijo vs inteligente | Fases 4 y 5 |
| Registro/histórico del día | Fase 4 (SQLite vía API) |
| Backend/datos (Node.js + BD) sugerido por el PDF | Fase 4 |
| Modo coordinación "ola verde" | Fase 6 (opcional) |

## 6. Paradigmas demostrados (para la evaluación)

- **POO:** clases `TrafficLight`, `Controller`, `Vehicle`, `Sensors`; patrón **State** en la máquina de estados; **Observer** para que los sensores notifiquen al controlador.
- **Funcional:** reglas de decisión como funciones puras en `rules.ts`; PRNG determinista — deterministas y testeables sin UI.
- **Orientado a eventos / reactivo:** la simulación responde a sensores y usuario en tiempo real.
- **Tipado estático (TypeScript):** estados como union types (`'VERDE' | 'AMARILLO' | ...`), contratos compartidos cliente/servidor en `shared/types.ts`.
- **Cliente-servidor / declarativo:** REST + SQL de agregación para los históricos.

## 7. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Curva de aprendizaje de Three.js | Fase 1 dedicada a la escena base; solo primitivas, sin modelos externos |
| Gastar el tiempo en lo visual | Lógica primero (`core/` es TS puro); pulido 3D en Fase 6 |
| Sincronización lógica-render | El núcleo es la única fuente de verdad; el render solo lee estado |
| Backend caído en la demo | La simulación y el dashboard en vivo no dependen de la API |
| A/B no comparable | Demanda con semilla desde Fase 2; test de reproducibilidad en Fase 6 |
| Ciclos largos aburren la demo | Reloj de simulación acelerable (x1, x5, x20) |
| Rendimiento con 2 intersecciones | Vehículos low-poly + `InstancedMesh` si hace falta; tope de autos por vía |
