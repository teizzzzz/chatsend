import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA install mode (req §4): manifest + a precaching service worker so
    // the app shell opens instantly (and offline — transfers still need a
    // live peer, but history/settings work without a network).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ChatSend',
        short_name: 'ChatSend',
        description: 'Send files between your devices like chat messages',
        theme_color: '#3b6bf6',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The SPA shell; /ws and cross-origin requests are left alone.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
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
