import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: { usePolling: true },
    // xfwd envía la IP del navegador para que el límite de intentos no la confunda con la de Vite.
    proxy: { '/api': { target: 'http://api:3000', changeOrigin: true, xfwd: true } },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
