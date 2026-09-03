import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Servidor MCP que conecta Hermes Agent con BOS-Core.
 *
 * Todas las herramientas son de SOLO LECTURA. El límite real no vive aquí sino en el backend:
 * el token es de rol AGENTE, que el servidor rechaza en cualquier método que no sea GET. Este
 * proceso no toca la base de datos — solo llama a `/api/agente/*` por HTTPS, así que toda la
 * lógica de negocio y los permisos siguen viviendo en un solo lugar.
 */

const BOS_URL = (process.env.BOS_URL ?? "https://tatys-bos-core.fly.dev").replace(/\/$/, "");
const BOS_TOKEN = process.env.BOS_TOKEN;

if (!BOS_TOKEN) {
  // stderr, no stdout: stdout es el canal del protocolo MCP y escribir ahí lo rompe.
  console.error("Falta la variable BOS_TOKEN. Genérala con: cd backend && npm run token:agente");
  process.exit(1);
}

/** Llama a la API de BOS y devuelve el texto que verá el agente. */
async function pedir(ruta: string, params: Record<string, unknown> = {}): Promise<string> {
  const url = new URL(`${BOS_URL}/api/agente${ruta}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(url, { headers: { Authorization: `Bearer ${BOS_TOKEN}` } });
  } catch (e) {
    return `No se pudo conectar con BOS en ${BOS_URL}: ${(e as Error).message}`;
  }

  if (respuesta.status === 401) {
    return "La credencial de BOS venció o no es válida. Renuévala con: cd backend && npm run token:agente";
  }
  if (respuesta.status === 403) {
    return "BOS rechazó la operación: esta credencial es de solo lectura.";
  }
  if (!respuesta.ok) {
    return `BOS respondió con error ${respuesta.status}: ${(await respuesta.text()).slice(0, 400)}`;
  }

  return JSON.stringify(await respuesta.json(), null, 1);
}

const servidor = new McpServer({ name: "bos-core", version: "0.1.0" });

/** Registra una herramienta de lectura sin repetir el envoltorio de respuesta en cada una. */
function herramienta(
  nombre: string,
  titulo: string,
  descripcion: string,
  esquema: Record<string, z.ZodTypeAny>,
  ruta: (args: any) => string,
  query: (args: any) => Record<string, unknown> = () => ({})
) {
  servidor.registerTool(
    nombre,
    {
      title: titulo,
      description: descripcion,
      inputSchema: esquema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args: any) => ({ content: [{ type: "text" as const, text: await pedir(ruta(args), query(args)) }] })
  );
}

// ─── Dinero ───────────────────────────────────────────────────

herramienta(
  "panorama_financiero",
  "Panorama financiero",
  "La foto completa del negocio hoy: total vendido, total cobrado, brecha de caja (lo vendido que aún no entra), montos vencidos, cobros de los próximos 7 y 30 días y alertas. Es el mejor punto de partida para casi cualquier pregunta sobre el estado del negocio.",
  {},
  () => "/panorama"
);

herramienta(
  "saldos_pendientes",
  "Saldos por cobrar",
  "Quién debe dinero y cuánto: cada negocio con saldo sin cobrar, con el total del trato, lo ya pagado y lo que falta. Úsala para preguntas de cobranza, cartera vencida o '¿a quién hay que cobrarle?'.",
  {},
  () => "/finanzas/saldos"
);

herramienta(
  "resumen_mensual",
  "Resumen financiero del mes",
  "Ingresos, egresos y rentabilidad de un mes, más el desglose por oferta y por línea de negocio. Sin el parámetro `mes` devuelve el mes en curso.",
  { mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Mes en formato AAAA-MM, por ejemplo 2026-08. Si se omite, el mes actual.") },
  () => "/finanzas/resumen",
  (a) => ({ mes: a.mes })
);

herramienta(
  "resumen_hoy",
  "Números de hoy",
  "Lo cobrado y lo gastado en el día de hoy.",
  {},
  () => "/finanzas/hoy"
);

herramienta(
  "detalle_financiero_negocio",
  "Detalle financiero de un negocio",
  "El estado de cuenta de un negocio concreto del pipeline: valor total, pagos recibidos y saldo pendiente. Requiere el id del registro, que aparece en `tablero_pipeline`.",
  { registro_id: z.string().describe("Id del registro de pipeline") },
  (a) => `/registros/${encodeURIComponent(a.registro_id)}/financiero`
);

// ─── Pipelines ────────────────────────────────────────────────

herramienta(
  "estado_pipelines",
  "Estado de todos los pipelines",
  "Lista los pipelines (Ventas, Podcast, Código Financiero, Mentorías, etc.) con sus métricas: cuántos negocios tiene cada uno, valor total, ganados, perdidos y abiertos. Devuelve también el id de cada pipeline para consultar su tablero.",
  {},
  () => "/pipelines"
);

herramienta(
  "tablero_pipeline",
  "Tablero de un pipeline",
  "El tablero kanban completo de un pipeline: sus etapas en orden y los negocios en cada una, con persona, valor e id. Pide primero `estado_pipelines` para obtener el id.",
  { pipeline_id: z.string().describe("Id del pipeline, obtenido de estado_pipelines") },
  (a) => `/pipelines/${encodeURIComponent(a.pipeline_id)}/tablero`
);

// ─── Contactos ────────────────────────────────────────────────

herramienta(
  "buscar_contactos",
  "Buscar contactos",
  "Busca personas en el CRM por nombre, teléfono o email. Sin el parámetro `buscar` devuelve la lista paginada completa.",
  {
    buscar: z.string().optional().describe("Texto a buscar: nombre, teléfono o email"),
    limite: z.number().int().min(1).max(100).optional().describe("Cuántos resultados devolver (máximo 100)"),
    pagina: z.number().int().min(1).optional().describe("Número de página, empezando en 1"),
  },
  () => "/contactos",
  (a) => ({ buscar: a.buscar, limite: a.limite, pagina: a.pagina })
);

herramienta(
  "ver_contacto",
  "Ficha completa de un contacto",
  "Todo lo que BOS sabe de una persona: datos, etiquetas, negocios en pipelines, historial de interacciones y seguimientos agendados. Pide primero `buscar_contactos` para obtener el id.",
  { contacto_id: z.string().describe("Id de la persona, obtenido de buscar_contactos") },
  (a) => `/contactos/${encodeURIComponent(a.contacto_id)}`
);

// ─── Operación ────────────────────────────────────────────────

herramienta(
  "listar_tareas",
  "Tareas operativas",
  "Las tareas de trabajo del equipo (los tableros Scrum), filtrables por área y estado. Las áreas son textos como Marketing, Ventas u Operaciones.",
  {
    departamento: z.string().optional().describe("Área o departamento, por ejemplo Marketing"),
    estado: z.string().optional().describe("Estado de la tarea, por ejemplo pendiente, en_proceso o completada"),
    prioridad: z.string().optional().describe("Prioridad de la tarea"),
  },
  () => "/tareas",
  (a) => ({ departamento: a.departamento, estado: a.estado, prioridad: a.prioridad })
);

herramienta(
  "seguimientos_pendientes",
  "Seguimientos sin completar",
  "Los seguimientos agendados con contactos que siguen sin completarse, ordenados por fecha. Los que tienen fecha pasada están vencidos: son la lista de a quién hay que contactar.",
  {},
  () => "/seguimientos"
);

herramienta(
  "actividad_reciente",
  "Actividad reciente del sistema",
  "La línea de tiempo de lo que ha pasado en BOS: quién hizo qué y cuándo. Útil para saber qué se movió últimamente o si un área está activa.",
  { limite: z.number().int().min(1).max(200).optional().describe("Cuántos eventos devolver (máximo 200)") },
  () => "/actividad",
  (a) => ({ limite: a.limite })
);

// ─── Arranque ─────────────────────────────────────────────────

async function main() {
  await servidor.connect(new StdioServerTransport());
  console.error(`Servidor MCP de BOS-Core conectado (${BOS_URL}) — solo lectura`);
}

main().catch((e) => {
  console.error("El servidor MCP de BOS-Core no pudo arrancar:", e);
  process.exit(1);
});
