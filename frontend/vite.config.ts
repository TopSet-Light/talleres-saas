import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: { usePolling: true },
    proxy: { '/api': { target: 'http://api:3000', changeOrigin: true } },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
