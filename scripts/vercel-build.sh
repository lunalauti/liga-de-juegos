#!/bin/sh
# Diagnóstico temporal para el bug "vite: command not found" en Vercel.
set -e

echo "--- pwd ---"
pwd

echo "--- ls -la (acá estamos parados) ---"
ls -la

echo "--- ¿esto es la raíz del repo? busco package.json con \"workspaces\" ---"
grep -l workspaces package.json 2>&1 || echo "(este package.json NO tiene workspaces)"

echo "--- node_modules/.bin, buscando vite ---"
ls node_modules/.bin/ 2>&1 | grep -i vite || echo "(no está acá)"

echo "--- fin diagnóstico ---"
npm run build -w @liga/web
