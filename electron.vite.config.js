import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // electron-updater stays a real node_modules require (it ships via
        // package.json dependencies): bundled, its lazy per-platform
        // require('./NsisUpdater') etc. is rewritten by rollup and it grows
        // main by ~500 kB. externalizeDepsPlugin alone didn't keep it out.
        external: ['electron', 'electron-updater'],
        input: {
          index: path.resolve('src/main/index.js'),
        },
      },
    },
  },
  // The preload was never listed here, so it was never built (and main
  // pointed at a file that didn't exist). Forced to CJS: package.json is
  // "type": "module", which would otherwise make electron-vite emit an ES
  // module preload — and a sandboxed renderer (Electron's default) can only
  // load a CommonJS one.
  preload: {
    build: {
      rollupOptions: {
        external: ['electron'],
        input: {
          index: path.resolve('src/main/preload.js'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: path.resolve('index.html'),
        },
      },
    },
  },
});
