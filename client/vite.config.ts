import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  server: {
    port: 5173,
    // No proxy needed — no backend. All data ops run in the browser.
  },
});
