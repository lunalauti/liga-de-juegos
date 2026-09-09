import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..');

export default defineConfig({
  root: here,
  envDir: repoRoot, // .env vive en la raíz del monorepo, no en apps/web
  plugins: [
    react(),
    // T10.1, specs/02-design.md §10.1 — `injectManifest` (no `generateSW`)
    // porque src/sw.ts necesita código propio para el push de RF-22; con
    // `generateSW` no hay forma de meter esos listeners.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false, // el registro lo hace main.tsx a mano (control explícito de cuándo pedir permiso)
      registerType: 'autoUpdate',
      devOptions: { enabled: false }, // el SW sólo se prueba contra el build real (npm run build && preview), no en dev
      manifest: {
        name: 'Liga de Juegos',
        short_name: 'Liga',
        description: 'Ranking diario de los juegos de La Nación entre amigos.',
        lang: 'es-AR',
        theme_color: '#16513C',
        background_color: '#F6F2EA',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
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
