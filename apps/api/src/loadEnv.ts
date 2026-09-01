// Se importa antes que cualquier otro módulo (incluido app.ts) para que las
// variables de entorno estén listas cuando db.ts las lee al cargarse.
// npm -w corre con cwd en apps/api/, pero .env vive en la raíz del monorepo.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

config({ path: resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../.env') });
