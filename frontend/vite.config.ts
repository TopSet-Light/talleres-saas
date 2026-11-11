import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { apiProxy } from './vite.proxy';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: { usePolling: true },
    // Reemplaza X-Forwarded-For con la IP de la conexión (ver vite.proxy.ts).
    proxy: apiProxy,
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
