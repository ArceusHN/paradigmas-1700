import express from 'express';
import cors from 'cors';
import type { RunSummary } from '../../shared/types.js';

/**
 * API — Node.js + Express (Fase 1: esqueleto).
 *
 * Por ahora sólo expone /api/health y un /api/runs de muestra (datos en
 * memoria) para demostrar el contrato cliente-servidor. La persistencia
 * real con SQLite y los 5 endpoints llegan en la Fase 4.
 */
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, fase: 1, servicio: 'semaforo-api' });
});

// Muestra del contrato compartido con el cliente (shared/types.ts).
app.get('/api/runs', (_req, res) => {
  const demo: RunSummary[] = [];
  res.json(demo);
});

app.listen(PORT, () => {
  console.log(`🚦 API escuchando en http://localhost:${PORT}`);
});
