#!/bin/sh
set -e

echo "Aplicando migración (segura de repetir, usa IF NOT EXISTS)..."
node backend/dist/db/migrate.js

echo "Verificando seed (Super Admin + pipelines — no duplica si ya existen)..."
node backend/dist/db/seed.js

echo "Arrancando servidor..."
node backend/dist/index.js
