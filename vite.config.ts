import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Frontend talks to the signalling server via same-origin /ws so no
    // URL configuration is needed in dev. Run `npm run server` alongside.
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  preview: {
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
