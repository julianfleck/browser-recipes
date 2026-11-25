import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'extension'),
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    outDir: path.resolve(import.meta.dirname, 'extension-build'),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(import.meta.dirname, 'extension/popup.html') },
  },
});
