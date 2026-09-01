import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..');

export default defineConfig({
  root: here,
  envDir: repoRoot, // .env vive en la raíz del monorepo, no en apps/web
  plugins: [react()],
  server: { port: 5173 },
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5.3 usa @import y funciones globales que Dart Sass ya avisa que
        // va a sacar en 3.0 — son warnings del propio Bootstrap, no de nuestro SCSS.
        // Silenciados hasta que Bootstrap publique la versión migrada a @use.
        silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
        quietDeps: true,
      },
    },
  },
});
