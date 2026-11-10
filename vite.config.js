'use strict';

const path = require('node:path');
const { defineConfig } = require('vite');
const vue = require('@vitejs/plugin-vue');

/**
 * Vite configuration of the front end.
 *
 * The application is built into `server/public`, which the Express service
 * serves as its static directory, so the production deployment is one process
 * and one origin: the page and the API share `http://host:port`.
 */
module.exports = defineConfig({
  root: path.resolve(__dirname, 'web'),
  plugins: [vue()],
  base: '/',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'server/public'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue'],
        },
      },
    },
  },
});
