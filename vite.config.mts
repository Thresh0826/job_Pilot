import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer build configuration. The renderer is bundled into `dist/renderer`
// and loaded by Electron via `loadFile` in production, or served over HTTP in dev.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    target: 'chrome138',
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
});
