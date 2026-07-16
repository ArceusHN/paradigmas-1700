# Semáforo Inteligente 3D

Simulación de una intersección con semáforo de decisión inteligente.
Proyecto del 3er parcial de **Paradigmas de la Programación**.

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
simulan lo que enviará el ESP32 desde Wokwi (Fase 3 — puente MQTT, siguiente paso).

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

## Próximo

- **Puente Wokwi (MQTT):** un ESP32 con push buttons publica señales de sensores
  a un broker MQTT; la app se suscribe y alimenta la simulación (mismo efecto
  que los botones en pantalla, pero desde hardware simulado).
- **Fase 4:** persistencia (SQLite vía API) y dashboards con Chart.js.
- **Fase 5:** comparación A/B en vivo (fijo vs inteligente, misma semilla).
