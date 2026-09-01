import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    // design/support.js es el runtime generado del canvas de Claude Design
    // ("GENERATED — do not edit"); no es código nuestro, no se lintea.
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', 'design/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // apps/api, packages/shared, scripts de Node: globals de Node.
  {
    files: [
      'apps/api/**/*.{ts,tsx,js,mjs}',
      'packages/shared/**/*.{ts,tsx}',
      'tools/**/*.{js,mjs,ts}',
      '*.config.{js,ts}',
    ],
    languageOptions: { globals: globals.node },
  },

  // apps/web: React + browser.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      // El patrón "setLoading(true) / .then(...).finally(() => setLoading(false))"
      // arriba de un fetch en useEffect aparece en varias pantallas — y en algunas
      // (Home, Ranking, Dia) el `setLoading(false)` temprano fue justamente la
      // corrección de un bug real ya verificado contra producción (Fase 4). Esta
      // regla de react-hooks 7.x lo marca como error; se apaga a propósito en vez
      // de tocar código probado para complacer un lint nuevo y opinativo.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // Reglas comunes: no rompemos por variables que empiezan con _, y dejamos
  // que TS strict (ya corre en `typecheck`) se ocupe de lo que ESLint duplicaría.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
