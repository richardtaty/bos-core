import { Router, type Request, type Response } from "express";
import { requireAuth, requireDepartamento, requireRole } from "../middleware/auth";
import { reportePodcast } from "../services/podcast.service";
import {
  obtenerMetas,
  guardarMetas,
  obtenerReporteDiario,
  guardarReporteDiario,
  desempenoMi,
  desempenoEquipo,
  desempenoDeUsuario,
  detalleMiembro,
  inteligenciaPodcast,
  miembrosHistorial,
  listarHistorial,
  detalleHistorial,
  resumenEquipoDelDia,
  hoyET,
  SinPermisoHistorialError,
} from "../services/podcast-performance.service";
import { guardarReportePodcastSchema, guardarMetasPodcastSchema, crearCitaPodcastSchema, actualizarCitaPodcastSchema, crearPersonaSchema } from "../lib/validation";
import {
  listarCitas,
  crearCita,
  actualizarCita,
  eliminarCita,
} from "../services/podcast-citas.service";
import { buscarInvitados, obtenerOCrearInvitado, crearInvitadoCompleto } from "../services/podcast-invitados.service";
import {
  listarTareasVisibles,
  obtenerTarea,
  crearTarea,
  actualizarTarea,
  reasignarTarea,
  SinPermisoTareaError,
} from "../services/tareas.service";
import {
  miembrosElegiblesPodcast,
  esMiembroElegiblePodcast,
} from "../services/podcast-performance.service";

export const podcastRouter = Router();
podcastRouter.use(requireAuth);

// Reporte histórico (snapshot) que ya existía.
podcastRouter.get("/reporte", requireDepartamento("Podcast"), async (_req, res) => {
  try {
    res.json(await reportePodcast());
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ─── Metas (configurables por Super Admin) ────────────────
podcastRouter.get("/metas", requireDepartamento("Podcast"), async (_req, res) => {
  try {
    res.json(await obtenerMetas());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

podcastRouter.put("/metas", requireRole("SUPER_ADMIN"), async (req, res) => {
  const parsed = guardarMetasPodcastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  try {
    res.json(await guardarMetas(parsed.data.metas));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Reporte diario (cierre del día) ──────────────────────
podcastRouter.get("/reporte-diario", requireDepartamento("Podcast"), async (req, res) => {
  try {
    const fecha = typeof req.query.fecha === "string" ? req.query.fecha : undefined;
    res.json(await obtenerReporteDiario(req.user!.id, fecha));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

podcastRouter.post("/reporte-diario", requireDepartamento("Podcast"), async (req, res) => {
  const parsed = guardarReportePodcastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  try {
    res.json(await guardarReporteDiario(req.user!.id, parsed.data));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Historial y consulta de reportes diarios ─────────────
// SOLO LECTURA sobre los mismos registros que escribe el Cierre diario. No crea reportes, no
// modifica históricos y no genera resúmenes.
//
// Regla de acceso (idéntica a /desempeno/equipo, no se inventa una nueva):
//   · Cualquier miembro de Podcast consulta SU propio historial, incluidos sus borradores.
//   · Ver a OTROS exige ADMIN o superior (SUPER_ADMIN siempre pasa). Un USUARIO que mande el
//     `usuarioId` de otra persona recibe 403 desde el backend, no un filtro de la UI.
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Además del formato, la fecha tiene que existir en el calendario: "2026-13-99" no lo es. */
function fechaValida(ymd: string): boolean {
  if (!FECHA_ISO.test(ymd)) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

function puedeVerEquipoPodcast(req: Request): boolean {
  const rol = req.user!.rol;
  return rol === "SUPER_ADMIN" || rol === "ADMIN";
}

/** Traduce SinPermisoHistorialError a 403 y deja el resto como 500, en un solo lugar. */
function responderErrorHistorial(res: Response, err: unknown): void {
  if (err instanceof SinPermisoHistorialError) {
    res.status(403).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: (err as Error).message });
}

// Miembros elegibles en el selector (reales, nunca hardcodeados).
podcastRouter.get("/historial/miembros", requireDepartamento("Podcast"), async (req, res) => {
  try {
    res.json(await miembrosHistorial(req.user!.id, puedeVerEquipoPodcast(req)));
  } catch (err) {
    responderErrorHistorial(res, err);
  }
});

// Listado cronológico (más reciente primero) — GET /podcast/historial?usuarioId=&desde=&hasta=
podcastRouter.get("/historial", requireDepartamento("Podcast"), async (req, res) => {
  const { usuarioId, desde, hasta, limite } = req.query as Record<string, string | undefined>;
  if (desde && !fechaValida(desde)) { res.status(400).json({ error: "Fecha 'desde' inválida" }); return; }
  if (hasta && !fechaValida(hasta)) { res.status(400).json({ error: "Fecha 'hasta' inválida" }); return; }
  try {
    res.json(await listarHistorial(req.user!.id, puedeVerEquipoPodcast(req), {
      usuarioId,
      desde,
      hasta,
      limite: limite ? Number(limite) : undefined,
    }));
  } catch (err) {
    responderErrorHistorial(res, err);
  }
});

// El reporte real de una persona en una fecha: GET /podcast/historial/:usuarioId/:fecha
podcastRouter.get("/historial/:usuarioId/:fecha", requireDepartamento("Podcast"), async (req, res) => {
  const { usuarioId, fecha } = req.params;
  if (!fechaValida(fecha)) { res.status(400).json({ error: "Fecha inválida (formato YYYY-MM-DD)" }); return; }
  try {
    res.json(await detalleHistorial(req.user!.id, puedeVerEquipoPodcast(req), usuarioId, fecha));
  } catch (err) {
    responderErrorHistorial(res, err);
  }
});

// ─── Resumen automático del equipo ───────────────────────
// LECTURA sobre los MISMOS reportes que escribe el Cierre diario. No crea reportes, no los
// modifica y no guarda ningún resumen: se arma en cada consulta desde los datos reales de esa
// fecha, así que consultar el 5 de septiembre devuelve el 5 de septiembre y nada de hoy lo
// sobrescribe.
//
// Misma regla de acceso que /desempeno/equipo y /inteligencia (ADMIN o superior): ver el resumen
// de TODO el equipo no es algo que un USUARIO obtenga por defecto. Reenviar un usuarioId ajeno no
// cambia nada — la población la decide el servidor desde la relación real con Podcast.
podcastRouter.get("/resumen-diario", requireRole("ADMIN"), requireDepartamento("Podcast"), async (req, res) => {
  const cruda = req.query.fecha;
  // "?fecha=" repetida llega como arreglo: no se adivina cuál quieren, se dice que no.
  if (cruda !== undefined && typeof cruda !== "string") {
    res.status(400).json({ error: "Manda una sola fecha (formato YYYY-MM-DD)" });
    return;
  }
  // "?fecha=" vacío es lo mismo que no mandar fecha: se usa hoy. Sin esto, un vacío pasaba los
  // controles de abajo (una cadena vacía es falsy) y reventaba más adentro con "Invalid time value".
  const fecha = cruda?.trim() || undefined;
  if (fecha && !fechaValida(fecha)) {
    res.status(400).json({ error: "Fecha inválida (formato YYYY-MM-DD)" });
    return;
  }
  // YYYY-MM-DD compara cronológicamente como texto.
  if (fecha && fecha > hoyET()) {
    res.status(400).json({ error: "No se puede consultar el resumen de una fecha futura." });
    return;
  }
  try {
    res.json(await resumenEquipoDelDia(fecha));
  } catch (err) {
    responderErrorHistorial(res, err);
  }
});

/**
 * Lee y valida un período de la query (`?desde=&hasta=`). Sin parámetros, hoy.
 * Devuelve `{ error }` con el mensaje listo para el 400, o `{ desde, hasta }`.
 * `YYYY-MM-DD` compara cronológicamente como texto, así que las comparaciones de abajo son válidas.
 */
function leerPeriodo(query: Record<string, unknown>): { error: string } | { desde: string; hasta: string } {
  const leer = (clave: string): string | undefined | null => {
    const v = query[clave];
    if (v === undefined) return undefined;
    // "?desde=" repetida llega como arreglo: no se adivina cuál quieren, se dice que no.
    if (typeof v !== "string") return null;
    return v.trim() || undefined;
  };

  const hasta = leer("hasta");
  if (hasta === null) return { error: "Manda un solo valor en 'hasta' (formato YYYY-MM-DD)" };
  const desde = leer("desde");
  if (desde === null) return { error: "Manda un solo valor en 'desde' (formato YYYY-MM-DD)" };

  const h = hasta ?? hoyET();
  const d = desde ?? h;
  if (!fechaValida(d)) return { error: "Fecha 'desde' inválida (formato YYYY-MM-DD)" };
  if (!fechaValida(h)) return { error: "Fecha 'hasta' inválida (formato YYYY-MM-DD)" };
  if (d > h) return { error: "'desde' no puede ser posterior a 'hasta'." };
  if (h > hoyET()) return { error: "No se puede consultar un período futuro." };
  return { desde: d, hasta: h };
}

// ─── Desempeño individual (score + comparaciones) ─────────
// SIN cambios de permiso: solo el departamento. Un USUARIO sigue viendo únicamente lo suyo.
podcastRouter.get("/desempeno/mi", requireDepartamento("Podcast"), async (req, res) => {
  try {
    res.json(await desempenoMi(req.user!.id));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// El desempeño de OTRA persona, para el selector de "Mi desempeño".
// Doble candado: requireRole("ADMIN") en la ruta Y `_exigirAcceso` adentro del servicio (que además
// comprueba que esa persona sea del equipo de Podcast). Cambiar el usuarioId a mano no sirve: el
// backend responde 403 antes de devolver un solo dato.
podcastRouter.get(
  "/desempeno/usuario/:usuarioId",
  requireRole("ADMIN"),
  requireDepartamento("Podcast"),
  async (req, res) => {
    const { usuarioId } = req.params;
    const cruda = req.query.fecha;
    const fecha = typeof cruda === "string" ? cruda.trim() || undefined : undefined;
    if (fecha && !fechaValida(fecha)) {
      res.status(400).json({ error: "Fecha inválida (formato YYYY-MM-DD)" });
      return;
    }
    if (fecha && fecha > hoyET()) {
      res.status(400).json({ error: "No se puede consultar el desempeño de una fecha futura." });
      return;
    }
    try {
      res.json(await desempenoDeUsuario(req.user!.id, true, usuarioId, fecha));
    } catch (err) {
      responderErrorHistorial(res, err);
    }
  }
);

// Vista de equipo (Reporte de equipo): ADMIN del departamento (o Super Admin) — hasta que se
// asigne líder. Acepta un período opcional; sin parámetros, hoy.
podcastRouter.get("/desempeno/equipo", requireRole("ADMIN"), requireDepartamento("Podcast"), async (req, res) => {
  const periodo = leerPeriodo(req.query as Record<string, unknown>);
  if ("error" in periodo) {
    res.status(400).json({ error: periodo.error });
    return;
  }
  try {
    res.json(await desempenoEquipo(periodo));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// El detalle de una persona dentro del período, para el drill-down de "Reporte de equipo".
// Misma doble validación que /desempeno/usuario/:usuarioId.
podcastRouter.get(
  "/desempeno/miembro/:usuarioId",
  requireRole("ADMIN"),
  requireDepartamento("Podcast"),
  async (req, res) => {
    const { usuarioId } = req.params;
    const periodo = leerPeriodo(req.query as Record<string, unknown>);
    if ("error" in periodo) {
      res.status(400).json({ error: periodo.error });
      return;
    }
    try {
      res.json(await detalleMiembro(req.user!.id, true, usuarioId, periodo.desde, periodo.hasta));
    } catch (err) {
      responderErrorHistorial(res, err);
    }
  }
);

// Resumen ejecutivo + alertas de IA.
podcastRouter.get("/inteligencia", requireRole("ADMIN"), requireDepartamento("Podcast"), async (_req, res) => {
  try {
    res.json(await inteligenciaPodcast());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Calendario de podcasts (citas) ──────────────────────
podcastRouter.get("/citas", requireDepartamento("Podcast"), async (req, res) => {
  const { desde, hasta } = req.query as Record<string, string | undefined>;
  res.json(await listarCitas({ desde, hasta }));
});

podcastRouter.post("/citas", requireDepartamento("Podcast"), async (req, res) => {
  const parsed = crearCitaPodcastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  try {
    res.status(201).json(await crearCita(parsed.data, req.user!.id));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

podcastRouter.patch("/citas/:id", requireDepartamento("Podcast"), async (req, res) => {
  const parsed = actualizarCitaPodcastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  try {
    res.json(await actualizarCita(req.params.id, parsed.data));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

podcastRouter.delete("/citas/:id", requireDepartamento("Podcast"), async (req, res) => {
  await eliminarCita(req.params.id);
  res.json({ ok: true });
});

// ─── Invitados del calendario (autocomplete) ─────────────────────
// Búsqueda para el campo "Invitado": con q vacío NO devuelve lista (el
// combobox solo sugiere mientras se escribe). La normalización de acentos,
// mayúsculas y espacios vive en el servicio.
podcastRouter.get("/invitados", requireDepartamento("Podcast"), async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.json(await buscarInvitados(q));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Crea la ficha mínima de un invitado que no existe (o reutiliza la existente
// con el mismo nombre). Se llama cuando el usuario elige "+ Agregar «nombre»".
podcastRouter.post("/invitados", requireDepartamento("Podcast"), async (req, res) => {
  const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
  if (nombre.length < 2) {
    res.status(400).json({ error: "Escribe el nombre del invitado" });
    return;
  }
  try {
    res.status(201).json(await obtenerOCrearInvitado(nombre, req.user!.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Alta COMPLETA de un invitado nuevo desde el calendario: recibe el formulario
// oficial de "Nuevo contacto" (mismas reglas de validación que Clientes) y, si
// ya existe una persona con el mismo correo/teléfono (o el mismo nombre cuando
// no se aporta nada más), responde 409 con `claro` para que el usuario la use
// en vez de duplicar. Si no hay duplicado, crea el contacto real del CRM.
podcastRouter.post("/invitados/completo", requireDepartamento("Podcast"), async (req, res) => {
  const parsed = crearPersonaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const resultado = await crearInvitadoCompleto(parsed.data, req.user!.id);
    if ("duplicado" in resultado) {
      const d = resultado.duplicado;
      const motivo = d.por === "email" ? "correo" : d.por === "telefono" ? "teléfono" : "nombre";
      res.status(409).json({
        error: {
          mensaje: `Ya existe un contacto con estos datos (mismo ${motivo}): ${d.nombre}`,
          claro: d,
        },
      });
      return;
    }
    res.status(201).json(resultado.persona);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ─── Tareas de Podcast ───────────────────────────────────────────
//
// Podcast NO tiene tabla propia de tareas: usa la MISMA tabla central
// (`tareas_operativas`) que el módulo Tareas. Aquí no se crea nada nuevo — se acota.
//
// El departamento es un DATO ESTRUCTURADO de la tarea (la columna `departamento`, con el
// nombre "Podcast"), así que el filtro es ese valor exacto. Nunca por título, descripción,
// texto libre ni nombre del responsable.
//
// Lo importante de este bloque: el departamento lo pone SIEMPRE el servidor. Estas rutas
// no leen ningún parámetro `departamento` del cliente, y al crear lo descartan del body.
// Manipular el request no saca una tarea de Podcast ni mete tareas de otros departamentos.
// El alcance por rol lo sigue calculando `listarTareasVisibles` desde `req.user`.

const DEPARTAMENTO_PODCAST = "Podcast";

/** Un fallo de permiso de tareas es 403; lo demás, 400. Igual que tareas.routes.ts. */
function responderErrorTarea(res: Response, e: unknown): void {
  const mensaje = e instanceof Error ? e.message : "Error inesperado";
  res.status(e instanceof SinPermisoTareaError ? 403 : 400).json({ error: mensaje });
}

/** La tarea existe y es de Podcast, o se responde y se devuelve null. */
async function cargarTareaPodcast(res: Response, id: string) {
  const tarea = await obtenerTarea(id);
  if (!tarea) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return null;
  }
  if (tarea.departamento !== DEPARTAMENTO_PODCAST) {
    // El bloqueo real: una tarea de otro departamento no se toca desde esta vista aunque
    // se conozca su id.
    res.status(403).json({ error: "Esta tarea no pertenece a Podcast." });
    return null;
  }
  return tarea;
}

// Quién puede ser responsable aquí: los miembros REALES de Podcast más los Super Admin
// activos. Se consulta la relación del CRM, no una lista escrita a mano: si el equipo
// cambia, el selector cambia solo.
podcastRouter.get("/tareas/miembros", requireDepartamento("Podcast"), async (_req, res) => {
  try {
    res.json(await miembrosElegiblesPodcast());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /podcast/tareas?responsableId=&estado=&prioridad=&proyectoId=&canal=
// El `departamento` NO se lee del query a propósito, aunque venga.
podcastRouter.get("/tareas", requireDepartamento("Podcast"), async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  try {
    res.json(
      await listarTareasVisibles(req.user!, {
        responsableId: q.responsableId,
        departamento: DEPARTAMENTO_PODCAST,
        estado: q.estado as any,
        prioridad: q.prioridad as any,
        proyectoId: q.proyectoId,
        canal: q.canal,
      }),
    );
  } catch (e) {
    responderErrorTarea(res, e);
  }
});

// POST /podcast/tareas — crea una tarea que YA nace siendo de Podcast. El usuario no elige
// departamento, y el que venga en el body se descarta.
podcastRouter.post("/tareas", requireDepartamento("Podcast"), async (req, res) => {
  const body = req.body ?? {};
  const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
  if (!titulo) {
    res.status(400).json({ error: "El título es obligatorio" });
    return;
  }
  const responsableId = typeof body.responsableId === "string" ? body.responsableId : "";
  if (!responsableId) {
    res.status(400).json({ error: "Elige un responsable" });
    return;
  }
  if (!(await esMiembroElegiblePodcast(responsableId))) {
    res.status(400).json({ error: "Esa persona no pertenece al equipo de Podcast." });
    return;
  }
  try {
    const tarea = await crearTarea({ ...body, titulo, responsableId, departamento: DEPARTAMENTO_PODCAST }, req.user!);
    res.status(201).json(tarea);
  } catch (e) {
    responderErrorTarea(res, e);
  }
});

// PATCH /podcast/tareas/:id — editar, completar y reagendar la MISMA tarea.
// `departamento` se elimina del input para que no pueda mudarse de área desde aquí.
podcastRouter.patch("/tareas/:id", requireDepartamento("Podcast"), async (req, res) => {
  const tarea = await cargarTareaPodcast(res, req.params.id);
  if (!tarea) return;
  try {
    const { departamento: _ignorado, ...cambios } = req.body ?? {};
    res.json(await actualizarTarea(req.params.id, cambios, req.user!));
  } catch (e) {
    responderErrorTarea(res, e);
  }
});

// PATCH /podcast/tareas/:id/reasignar — solo a alguien del equipo de Podcast.
podcastRouter.patch("/tareas/:id/reasignar", requireDepartamento("Podcast"), async (req, res) => {
  const tarea = await cargarTareaPodcast(res, req.params.id);
  if (!tarea) return;
  const responsableId = typeof req.body?.responsableId === "string" ? req.body.responsableId : "";
  if (!responsableId) {
    res.status(400).json({ error: "Elige un responsable" });
    return;
  }
  if (!(await esMiembroElegiblePodcast(responsableId))) {
    res.status(400).json({ error: "Esa persona no pertenece al equipo de Podcast." });
    return;
  }
  try {
    res.json(await reasignarTarea(req.params.id, responsableId, req.user!));
  } catch (e) {
    responderErrorTarea(res, e);
  }
});
