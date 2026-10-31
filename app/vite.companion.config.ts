// The Moki panel for the IDE (app/companion.html → src/companion): a small page with
// the app's look, built into the VS Code extension (ide/vscode/dist/webview) with fixed
// file names, so the extension loads it without a manifest. public/ is not copied
// (the build script copies only the cats and the logo the panel shows).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: here('../ide/vscode/dist/webview'),
    emptyOutDir: true,
    rollupOptions: {
      input: here('companion.html'),
      output: { entryFileNames: 'companion.js', chunkFileNames: '[name].js', assetFileNames: 'companion[extname]' },
    },
  },
});
