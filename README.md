# BOS Core — Sprint 14

Núcleo real: base de datos, API y frontend de Personas + motor genérico de Pipelines.

## Backend

```
cd backend
npm install
npm run migrate    # crea las tablas
npm run seed        # Super Admin + 4 pipelines reales (Ventas, Podcast, Eventos, Customer Success)
npm run dev          # http://localhost:4000
```

Login de prueba: `richard@tatysenterprises.com` / `changeme123`

## Frontend

```
cd frontend
npm install
npm run dev    # http://localhost:5173, proxy a la API en :4000
```

## Producción

```
# backend
npm run build && npm start

# frontend
npm run build   # genera dist/ estático, servir detrás de cualquier CDN/nginx
```

## Base de datos

SQLite nativo de Node 22 (`node:sqlite`, sin dependencias externas ni binarios que
compilar — decisión tomada tras comprobar que `better-sqlite3` no es instalable de
forma confiable en todos los entornos). Para producción a mayor escala: cambiar el
driver en `src/db/client.ts` por `postgres` (Drizzle soporta el cambio sin tocar
`schema.ts` ni ningún servicio) y ajustar `DATABASE_URL`.

Requiere Node ≥ 22.5. `node:sqlite` es una API experimental de Node — estable para
este propósito, pero conviene revisar el changelog de Node antes de subir de versión.
