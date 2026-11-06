import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// UI of the desktop app, built into app/dist and loaded by Electron (desktop/main.ts).
export default defineConfig({
  root: 'app',
  base: './', // loaded from disk by Electron
  plugins: [react()],
  // Electron 43 runs Chromium 150: modern syntax ships as written (scripts/build-desktop.mjs targets its Node).
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome150' },
});
