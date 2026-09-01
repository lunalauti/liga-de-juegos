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
});
