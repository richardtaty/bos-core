# BOS-Core — Taty's Enterprises LLC

Sistema operativo de negocio (CRM + pipelines + facturación) para el ecosistema de
Richard Taty (Business Market Finders, Código Financiero, Mentoría Estratégica,
Kappitalia, Podcast, IMPULSA, etc.). Backend real, base de datos real, desplegado en
Fly.io — no es un prototipo.

## Stack

- **Backend:** Node 22 + Express + TypeScript + Drizzle ORM + `node:sqlite` (SQLite
  nativo de Node, **sin** better-sqlite3 — ver "Errores ya resueltos" abajo).
- **Frontend:** React + TypeScript + Vite + Tailwind, servido como estático desde el
  mismo backend (un solo servicio, un solo deploy).
- **Deploy:** Fly.io, un solo Dockerfile multi-stage, app `tatys-bos-core`.
- **Base de datos:** un solo archivo SQLite en un volumen persistente de Fly
  (`/data/prod.db`). Migraciones son SQL con `CREATE TABLE IF NOT EXISTS` — idempotentes,
  corren solas en cada arranque vía `entrypoint.sh`. Nunca usar `DROP` ni `DELETE` en
  una migración sin antes verificar si hay datos reales (ver seed.ts como ejemplo).

## Comandos clave

```bash
# Desarrollo local
cd backend && npm install && npm run migrate && npm run seed && npm run dev
cd frontend && npm install && npm run dev

# Verificar antes de cualquier cambio
cd backend && npx tsc --noEmit
cd frontend && npx tsc -b && npm run build

# Deploy (desde la raíz del proyecto, NUNCA desde backend/ o frontend/)
fly deploy -a tatys-bos-core
```

## Reglas de negocio que NO se deben romper

- **Etiqueta obligatoria** al crear un contacto (mínimo 1).
- **Fuente = "Referido"** exige el campo `referidoPor`.
- **Interacción sin próximo seguimiento** está prohibido — siempre se agenda una
  tarea junto con la interacción.
- **Motivo de pérdida obligatorio** al mover un registro de pipeline a una etapa
  marcada `esPerdida`.
- **Pago que deja saldo pendiente** exige indicar la próxima fecha de cobro — el
  sistema agenda la tarea de seguimiento solo.
- **Comentarios de un contacto**: solo `SUPER_ADMIN` puede editarlos (bloqueado en
  el backend, no solo ocultado en la UI).
- **Facturación total / desglose por agente**: solo `SUPER_ADMIN`. Un agente normal
  solo ve la suya propia (`/reportes/mi-facturacion`).
- **"Eliminar" un usuario en realidad lo desactiva** (`activo: false`) — nunca se
  borra de verdad, porque tiene contactos/pagos/historial ligados a su ID.
- Siempre debe existir **al menos un Super Admin activo** — el backend lo protege.

## Errores ya resueltos (no los repitas)

1. **`node:sqlite` + Drizzle sin `setReturnArrays(true)`** corrompía datos en
   cualquier consulta con JOIN donde dos tablas comparten nombre de columna (ej.
   `personas.nombre` y `usuarios.nombre`) — los valores se cruzaban en silencio.
   La corrección vive en `backend/src/db/client.ts`. Si tocas ese archivo, no quites
   esa línea.
2. **Rutas de Express con parámro dinámico (`/:id`) deben ir DESPUÉS de cualquier
   ruta específica** con el mismo prefijo (ej. `/tareas/pendientes` antes de `/:id`),
   o Express interpreta el segmento como el parámetro y nunca llega a la ruta real.
3. **Toda ruta nueva del backend debe registrarse en `backend/src/index.ts`** — un
   router sin `app.use(...)` ahí simplemente no existe para el servidor, aunque
   compile perfecto.
4. **El pipeline "Podcast" tiene un flujo de 11 etapas específico** (no genérico):
   Podcast agendado → No-show (pérdida) → Podcast realizado → Entrega de contenido →
   Entrega de landing page → Seguimiento → Reunión del 1% → Oferta → Acción →
   Venta cerrada (ganada) / No cerró (perdida). Si necesitas tocar sus etapas, revisa
   `reconfigurarPodcastSiEsSeguro()` en `seed.ts` — nunca borra etapas si ya hay
   registros usándolas.
5. **`fly deploy` debe correrse desde la raíz del proyecto** (donde está el
   `Dockerfile`), nunca desde `backend/` ni `frontend/`.

## Estructura
## Pipelines configurados (motor genérico, 13 verticales)

Ventas, Podcast (flujo específico, ver arriba), Eventos, Mentorías, Código
Financiero, Kappitalia, Partners, Afiliados, Contenido, Speakers, Clientes,
Onboarding, Customer Success. Agregar uno nuevo = agregar una entrada en el `PIPELINES`
de `seed.ts`, no requiere código nuevo — el motor de etapas/pagos/kanban es genérico.

## Estilo de trabajo esperado

- Español para todo lo visible al usuario (UI, mensajes de error, nombres de campos).
- Antes de dar por terminado cualquier cambio: compilar (`tsc`), y si toca dinero o
  reglas de negocio, probar con `curl` contra un servidor local antes de entregarlo.
- Richard no es programador — evita jerga técnica en las explicaciones, y cuando
  algo requiera pasos manuales, dalos uno a la vez, no en bloque.
