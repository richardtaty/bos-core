# Conexión de Hermes Agent con BOS-Core

Este servidor le permite a Hermes Agent **consultar** BOS: dinero, contactos, pipelines,
tareas y seguimientos. Es de **solo lectura** — Hermes no puede modificar ni borrar nada.

## Cómo se instala (una sola vez)

**Paso 1.** Construir el servidor:

```bash
cd /Users/richardtaty/Projects/BOS-Core/mcp-server
npm install
npm run build
```

**Paso 2.** Generar la credencial **en el servidor de producción** (no en tu computadora):

```bash
fly ssh console -a tatys-bos-core -C "node /app/backend/dist/scripts/token-agente.js"
```

Copia el texto largo que empieza con `eyJ...`. Es la llave de Hermes.

> **Importante:** la llave tiene que generarse en el mismo servidor al que Hermes va a
> conectarse. Una llave generada en tu computadora **no sirve** contra Fly, porque cada uno
> firma con una clave distinta. Si vas a probar contra BOS corriendo en tu propia máquina,
> entonces sí usa `cd backend && npm run token:agente` y pon `BOS_URL` en
> `http://localhost:4000`.

**Paso 3.** Pegarla en la configuración de Hermes, donde estén sus servidores MCP:

```json
{
  "mcpServers": {
    "bos-core": {
      "command": "node",
      "args": ["/Users/richardtaty/Projects/BOS-Core/mcp-server/dist/index.js"],
      "env": {
        "BOS_URL": "https://tatys-bos-core.fly.dev",
        "BOS_TOKEN": "eyJ... (la llave del paso 2)"
      }
    }
  }
}
```

Reinicia Hermes y listo.

## Qué puede preguntarle a Hermes

| Herramienta | Para qué sirve |
|---|---|
| `panorama_financiero` | La foto completa: vendido, cobrado, brecha de caja, vencidos, alertas |
| `saldos_pendientes` | Quién debe dinero y cuánto |
| `resumen_mensual` | Ingresos, egresos y rentabilidad de un mes |
| `resumen_hoy` | Lo cobrado y gastado hoy |
| `detalle_financiero_negocio` | Estado de cuenta de un negocio concreto |
| `estado_pipelines` | Métricas de cada pipeline |
| `tablero_pipeline` | El kanban completo de un pipeline |
| `buscar_contactos` | Buscar personas por nombre, teléfono o email |
| `ver_contacto` | Ficha completa: historial, negocios, seguimientos |
| `listar_tareas` | Tareas del equipo por área y estado |
| `seguimientos_pendientes` | A quién hay que contactar (los vencidos primero) |
| `actividad_reciente` | Qué se movió últimamente y quién lo movió |

## La llave vence cada 90 días

Cuando Hermes deje de responder y diga que la credencial venció, genera una nueva con el
mismo comando del paso 2 y reemplázala en la configuración:

```bash
fly ssh console -a tatys-bos-core -C "node /app/backend/dist/scripts/token-agente.js"
```

Correr ese comando de nuevo no crea cuentas duplicadas: reutiliza la que ya existe y solo
emite una llave nueva.

## Lo que hay que cuidar

- **La llave da lectura de todo el CRM**, incluidos los datos personales y financieros de tus
  clientes. Vive solo en la configuración de Hermes, en tu computadora. No la compartas ni la
  subas a ningún lado.
- **Lo que Hermes consulte viaja al proveedor de Hermes.** Es inherente a conectar cualquier
  IA externa con datos reales.
- **No puede escribir.** El bloqueo está en el servidor de BOS, no aquí: aunque alguien se
  robara la llave, seguiría sin poder modificar nada.

## Cómo funciona por dentro

Este proceso no toca la base de datos. Llama por HTTPS a `/api/agente/*` en BOS, que es una
superficie de solo lectura creada para esto (`backend/src/routes/agente.routes.ts`). Toda la
lógica de negocio y los permisos siguen viviendo en BOS, en un solo lugar.

La llave es de rol `AGENTE`, que tiene dos límites independientes:

1. Está fuera de la jerarquía de permisos, así que las rutas normales del sistema lo rechazan.
2. `requireAuth` bloquea cualquier método que no sea `GET`.
