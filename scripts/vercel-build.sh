#!/bin/sh
# Diagnóstico temporal para el bug "vite: command not found" en Vercel.
# Ver specs/03-tasks.md T5.2.
set -e

echo "--- versiones ---"
node -v
npm -v

echo "--- node_modules/.bin (raíz), buscando vite ---"
ls node_modules/.bin/ 2>&1 | grep -i vite || echo "(no está)"

echo "--- apps/web/node_modules existe? ---"
ls apps/web/node_modules 2>&1 | head -5 || echo "(no existe)"

echo "--- apps/web/node_modules/.bin ---"
ls apps/web/node_modules/.bin/ 2>&1 | head -20 || echo "(no existe)"

echo "--- fin diagnóstico ---"
npm run build -w @liga/web
