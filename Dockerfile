# ---------- Etapa 1: build del frontend ----------
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---------- Etapa 2: build del backend ----------
FROM node:22-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# ---------- Etapa 3: imagen final de producción ----------
FROM node:22-alpine
WORKDIR /app

# Sello de versión inyectado por deploy.sh (deploy_protegido). No rompe el build
# si alguien hace `fly deploy` a mano: quedan los valores por defecto.
ARG GIT_SHA=sin-sello
ARG BUILD_TIME=sin-sello
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

# Solo dependencias de producción del backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENV NODE_ENV=production
EXPOSE 8080

CMD ["./entrypoint.sh"]
