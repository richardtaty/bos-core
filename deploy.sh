#!/usr/bin/env bash
set -e

# ═══════════════════════════════════════════════════════════════════════════════
# deploy.sh — Deploy PROTEGIDO de BOS-Core a Fly.io
#
# Evita el incidente del 2026-09-06 (una computadora con código viejo o cambios
# sin subir sobrescribió producción). Este script se niega a desplegar si:
#   1) No estás en la rama `main`.
#   2) Tu `main` local NO coincide con `origin/main` (copia vieja / sin pull).
#   3) Hay cambios sin commitear en el árbol de trabajo.
#   4) El código no compila (backend y frontend).
#
# Uso:  ./deploy.sh          (desde la RAÍZ del proyecto, como antes)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Colores ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

fail() {
  echo -e "${RED}✘ $1${NC}"
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}══════════════ Deploy protegido de BOS-Core ══════════════${NC}"

# ── 1. Rama main ──────────────────────────────────────────────────────────────
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  fail "Estás en la rama '$BRANCH'. Solo se despliega desde 'main'."
fi
echo -e "${GREEN}✔ Rama: main${NC}"

# ── 2. Árbol de trabajo limpio ────────────────────────────────────────────────
if ! git diff --quiet HEAD; then
  echo ""
  git status --short
  fail "Hay cambios sin commitear. Haz commit (o stash) antes de desplegar."
fi
echo -e "${GREEN}✔ Árbol de trabajo limpio${NC}"

# ── 3. main local == origin/main ──────────────────────────────────────────────
echo -e "${YELLOW}↻ Consultando GitHub…${NC}"
git fetch origin main
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse origin/main)
if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  echo ""
  echo "  local : $LOCAL_HEAD  ($(git log -1 --format=%s HEAD))"
  echo "  remoto: $REMOTE_HEAD ($(git log -1 --format=%s origin/main))"
  fail "Tu main local NO está sincronizado con GitHub. Corre 'git pull --ff-only origin main' y vuelve a intentar."
fi
echo -e "${GREEN}✔ main sincronizado con origin/main ($(git rev-parse --short HEAD))${NC}"

# ── 4. Compila el código ──────────────────────────────────────────────────────
echo -e "${YELLOW}🛠 Compilando backend…${NC}"
(cd backend && npx tsc --noEmit) || fail "El backend NO compila. Corrige antes de desplegar."
echo -e "${GREEN}✔ Backend compila${NC}"

echo -e "${YELLOW}🛠 Compilando frontend…${NC}"
(cd frontend && npm run build >/dev/null) || fail "El frontend NO compila. Corrige antes de desplegar."
echo -e "${GREEN}✔ Frontend compila${NC}"

# ── 5. Deploy sellado con SHA + fecha ─────────────────────────────────────────
GIT_SHA=$(git rev-parse --short HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo -e "${YELLOW}🚀 Desplegando commit ${GREEN}$GIT_SHA${YELLOW} (build $BUILD_TIME)…${NC}"

fly deploy -a tatys-bos-core \
  --build-arg GIT_SHA="$GIT_SHA" \
  --build-arg BUILD_TIME="$BUILD_TIME"

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Deploy completado. Verifica con:${NC}"
echo -e "   curl https://tatys-bos-core.fly.dev/version"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
