import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Permite importar los contratos compartidos como `shared`
      shared: resolve(__dirname, '../shared/types.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Las llamadas a /api las reenvía al backend (Fase 4)
      '/api': 'http://localhost:3000',
    },
  },
});
