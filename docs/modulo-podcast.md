# Módulo Podcast — BOS Core

## Descripción General

El módulo Podcast es una de las cuatro unidades de negocio independientes dentro del CRM BOS Core de Taty's Enterprises. Está diseñado para gestionar el ciclo de vida completo de un invitado de podcast: desde la agenda inicial hasta la venta cerrada, pasando por la grabación, entrega de contenido y seguimiento comercial.

El Podcast es una **unidad de negocio independiente**. Esto significa que un líder asignado al departamento de Podcast solo ve y administra lo relacionado con Podcast — no tiene acceso a Ventas, Marketing ni BMF. La base de datos de clientes es compartida entre todas las unidades.

## Estructura del Pipeline

El pipeline de Podcast tiene **11 etapas** secuenciales que cubren todo el proceso:

| # | Etapa | Tipo | Descripción |
|---|---|---|---|
| 1 | Podcast agendado | Activa | El invitado confirma fecha de grabación |
| 2 | **No-show** | ❌ Pérdida | El invitado no se presentó a grabar |
| 3 | Podcast realizado | Activa | Grabación completada exitosamente |
| 4 | Entrega de contenido | Activa | Se entrega el episodio editado al invitado |
| 5 | Entrega de landing page | Activa | Se publica la landing page del episodio |
| 6 | Seguimiento | Activa | Contacto post-entrega para avanzar |
| 7 | Reunión del 1% | Activa | Reunión de negocios con el invitado |
| 8 | Oferta | Activa | Se presenta una propuesta comercial |
| 9 | Acción | Activa | El invitado toma acción sobre la oferta |
| 10 | **Venta cerrada** | ✅ Ganada | El invitado compró |
| 11 | **No cerró** | ❌ Pérdida | El invitado decidió no comprar |

Cada etapa está vinculada a un registro (deal) que puede tener un valor monetario, pagos asociados, y seguimiento automático.

## Dashboard de Podcast

La pantalla principal del módulo (`/podcast`) muestra:

### KPIs en tiempo real
- Podcasts agendados
- No-shows (tasa de abandono)
- Podcasts realizados
- Contenido entregado vs. pendiente
- Landing pages entregadas vs. pendientes
- Reuniones del 1% realizadas
- Ofertas presentadas
- Ventas cerradas
- Negocios no cerrados
- **Ingresos totales** generados por el pipeline
- **Ticket promedio** por venta
- **Tasa de conversión**: Podcast → Reunión
- **Tasa de conversión**: Reunión → Venta

### Metas semanales
- Meta de podcasts por semana (actual vs. objetivo)
- Meta de reuniones del 1% por semana (actual vs. objetivo)

### Alertas automáticas
El sistema alerta cuando:
- La tasa de no-shows es alta
- Hay muchas landing pages pendientes
- Hay mucho contenido pendiente de entrega

### Tablero Kanban
Vista visual de todos los invitados organizados por etapa. Funcionalidad drag & drop para mover invitados entre etapas.

## Funcionalidades Adicionales

- **Registro de pagos**: Cada deal puede tener pagos parciales o totales asociados
- **Seguimiento automático**: Al registrar un pago con saldo pendiente, el sistema agenda automáticamente la fecha del próximo cobro
- **Historial completo**: Cada cambio de etapa queda registrado con fecha, autor y motivo
- **Calendario**: Vista de seguimientos pendientes del equipo
- **Reporte de ventas**: Ventas por día con límite de 7 días (ampliable por SUPER_ADMIN)
- **Clientes compartidos**: Acceso a la base de datos general de clientes

## Acceso y Seguridad

- **URL**: `https://tatys-bos-core.fly.dev/podcast`
- **Líder actual**: Richard Taty (SUPER_ADMIN, temporal)
- **Permisos**: El departamento Podcast está 100% aislado de Marketing, Ventas y BMF
- **Menú**: El líder de Podcast solo ve su sección en el menú lateral
- El SUPER_ADMIN puede asignar un nuevo líder de Podcast desde la página de Equipo

## Stack Técnico

- **Backend**: Node.js + Express + TypeScript + Drizzle ORM + SQLite
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Despliegue**: Fly.io (un solo servicio, un solo deploy)
- **Autenticación**: JWT con verificación en dos pasos (PIN) para SUPER_ADMIN
