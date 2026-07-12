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

## Estado actual — Fase 1 (Diseño y esqueleto) ✅

| Entregable de la Fase 1 | Estado |
|---|---|
| Monorepo corriendo (client + server) | ✅ npm workspaces + `npm run dev` |
| Escena 3D navegable (plano, luces, cámara orbital) | ✅ `client/src/render/Scene.ts` |
| Estados y transiciones definidos | ✅ `shared/types.ts` (`LightState`, `NEXT_STATE`) |
| Tabla de reglas con prioridades | ✅ `shared/types.ts` (`RULES`) |
| Contratos compartidos cliente/servidor | ✅ `shared/types.ts` |

## Estructura

```
P3/
├── shared/types.ts        # Contratos y estados (tipado estático)
├── client/                # Vite + TypeScript + Three.js
│   └── src/
│       ├── main.ts        # Bootstrap
│       ├── core/          # Lógica pura (TrafficLight — esqueleto)
│       └── render/        # Escena 3D (Three.js)
└── server/                # Express + TypeScript (esqueleto de la API)
    └── src/index.ts
```

## Próximo (Fase 2)

Máquina de estados con reloj de simulación acelerable, generador de demanda
determinista por semilla, e intersección con autos que frenan/arrancan.
