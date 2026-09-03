#!/usr/bin/env bash
set -e

# ── Colores ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cleanup() {
  echo ""
  echo -e "${YELLOW}🛑 Apagando servidores…${NC}"
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
  echo -e "${GREEN}✅ Todo apagado.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Backend ───────────────────────────────────────────────────────────────────
echo -e "${GREEN}🔧 Iniciando backend en modo dev…${NC}"
cd "$SCRIPT_DIR/backend"
npm run dev &
BACKEND_PID=$!

# ── Frontend ──────────────────────────────────────────────────────────────────
echo -e "${GREEN}🎨 Iniciando frontend en modo dev…${NC}"
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Backend → ${YELLOW}http://localhost:4000${NC}"
echo -e "${GREEN}  Frontend → ${YELLOW}http://localhost:5173${NC}"
echo -e "${GREEN}  Presiona Ctrl+C para parar ambos servidores${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# ── Esperar a que mueran los procesos ────────────────────────────────────────
wait
