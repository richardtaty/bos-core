import { Router, type Response } from "express";
import { requireAuth, requireRole, nombreDepartamentoDe } from "../middleware/auth";
import {
  listarTareas,
  listarTareasVisibles,
  obtenerTarea,
  crearTarea,
  actualizarTarea,
  reasignarTarea,
  registrarTiempo,
  calendarioEditorial,
  agregarChecklistItem,
  toggleChecklistItem,
  eliminarChecklistItem,
  agregarComentario,
  kpiUsuario,
  bloquearTarea,
  desbloquearTarea,
  solicitarExtension,
  listarSolicitudesExtension,
  resolverExtension,
  SinPermisoTareaError,
} from "../services/tareas.service";
import { SinPermisoReporteError, generarReporteTareas } from "../services/reporte-tareas.service";

export const tareasRouter = Router();
tareasRouter.use(requireAuth);

/** Un fallo de permiso es 403, no 400: el dato estaba bien, el usuario no tiene derecho. */
function responderError(res: Response, e: unknown): void {
  const mensaje = e instanceof Error ? e.message : "Error inesperado";
  const esPermiso = e instanceof SinPermisoTareaError || e instanceof SinPermisoReporteError;
  res.status(esPermiso ? 403 : 400).json({ error: mensaje });
}

// ⚠️ Rutas específicas DEBEN ir antes que /:id (regla #2 de CLAUDE.md)

// GET /api/tareas?responsableId=&departamento=&estado=&prioridad=&proyectoId=&canal=
tareasRouter.get("/", async (req, res) => {
  const { responsableId, estado, prioridad, proyectoId, canal } = req.query as Record<string, string | undefined>;
  const { departamento } = req.query as Record<string, string | undefined>;

  res.json(await listarTareas({ responsableId, departamento, estado: estado as any, prioridad: prioridad as any, proyectoId, canal }));
});

// GET /api/tareas/mis-tareas — las del usuario autenticado
tareasRouter.get("/mis-tareas", async (req, res) => {
  const { proyectoId, canal } = req.query as Record<string, string | undefined>;
  res.json(await listarTareas({ responsableId: req.user!.id, proyectoId, canal }));
});

// GET /api/tareas/visibles — listado con alcance por rol (módulo Tareas). El
// servidor calcula el ámbito (global / solo las suyas / departamento o área del
// usuario) y los filtros solo lo acotan, nunca lo amplían.
tareasRouter.get("/visibles", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  res.json(await listarTareasVisibles(req.user!, {
    responsableId: q.responsableId,
    departamento: q.departamento,
    estado: q.estado as any,
    prioridad: q.prioridad as any,
    proyectoId: q.proyectoId,
    canal: q.canal,
  }));
});

// GET /api/tareas/calendario — calendario editorial
tareasRouter.get("/calendario", async (req, res) => {
  const { canal, desde, hasta, responsableId } = req.query as Record<string, string | undefined>;
  res.json(await calendarioEditorial({ canal, desde, hasta, responsableId }));
});

// GET /api/tareas/kpi — KPIs del usuario autenticado
tareasRouter.get("/kpi", async (req, res) => {
  res.json(await kpiUsuario(req.user!.id));
});

// GET /api/tareas/kpi/:usuarioId — KPIs de otro usuario (admin)
tareasRouter.get("/kpi/:usuarioId", async (req, res) => {
  res.json(await kpiUsuario(req.params.usuarioId));
});

// ─── Marketing v2: Extensiones (rutas específicas ANTES de /:id) ───

// GET /api/tareas/extensiones?tareaId=&estado=
tareasRouter.get("/extensiones", async (req, res) => {
  const { tareaId, estado } = req.query as Record<string, string | undefined>;
  res.json(await listarSolicitudesExtension({ tareaId, estado }));
});

// PATCH /api/tareas/extensiones/:id
tareasRouter.patch("/extensiones/:id", async (req, res) => {
  try {
    const r = await resolverExtension(req.params.id, req.body.aprobada, req.user!);
    res.json(r);
  } catch (e) {
    responderError(res, e);
  }
});

// ─── Checklist (rutas específicas ANTES de /:id) ───────────

// PATCH /api/tareas/checklist/:itemId
tareasRouter.patch("/checklist/:itemId", async (req, res) => {
  await toggleChecklistItem(req.params.itemId, req.body.completado);
  res.json({ ok: true });
});

// DELETE /api/tareas/checklist/:itemId
tareasRouter.delete("/checklist/:itemId", async (req, res) => {
  await eliminarChecklistItem(req.params.itemId);
  res.json({ ok: true });
});

// GET /api/tareas/reporte — exporta el reporte de tareas en PDF/Excel/Word.
// SOLO SUPER_ADMIN: ADMIN, SUPERVISOR y USUARIO quedan fuera aunque conozcan la URL.
// La ruta solo lee parámetros de FILTRO (formato, departamento, responsableId, grupo,
// desde, hasta); el departamento autorizado lo decide el servicio desde req.user —
// reglas completas en reporte-tareas.service.ts.
tareasRouter.get("/reporte", requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const formato = q.formato === "excel" || q.formato === "word" ? q.formato : "pdf";
    const r = await generarReporteTareas(req.user!, {
      formato,
      departamento: q.departamento,
      responsableId: q.responsableId,
      grupo: (q.grupo ?? "") as "pendiente" | "en_revision" | "en_proceso" | "realizado" | "cancelado" | "",
      desde: q.desde,
      hasta: q.hasta,
    });
    res.setHeader("Content-Type", r.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${r.filename}"`);
    res.send(r.buffer);
  } catch (e) {
    responderError(res, e);
  }
});

// ─── Rutas con /:id (DEBEN ir al final) ────────────────────

// GET /api/tareas/:id
tareasRouter.get("/:id", async (req, res) => {
  const tarea = await obtenerTarea(req.params.id);
  if (!tarea) { res.status(404).json({ error: "Tarea no encontrada" }); return; }
  res.json(tarea);
});

// POST /api/tareas
tareasRouter.post("/", async (req, res) => {
  try {
    const user = req.user!;
    const data = { ...req.body };
    // Heredar departamento del creador si no se especifica
    if (!data.departamento && user.rol !== "SUPER_ADMIN") {
      data.departamento = user.departamentoId
        ? (await nombreDepartamentoDe(user.departamentoId)) ?? "Marketing"
        : "Marketing";
    }
    const tarea = await crearTarea(data, user);
    res.status(201).json(tarea);
  } catch (e) {
    responderError(res, e);
  }
});

// PATCH /api/tareas/:id
tareasRouter.patch("/:id", async (req, res) => {
  try {
    const tarea = await actualizarTarea(req.params.id, req.body, req.user!);
    res.json(tarea);
  } catch (e) {
    responderError(res, e);
  }
});

// POST /api/tareas/:id/checklist
tareasRouter.post("/:id/checklist", async (req, res) => {
  const item = await agregarChecklistItem(req.params.id, req.body.texto);
  res.status(201).json(item);
});

// POST /api/tareas/:id/comentarios
tareasRouter.post("/:id/comentarios", async (req, res) => {
  const comentario = await agregarComentario(req.params.id, req.body.texto, req.user!.id);
  res.status(201).json(comentario);
});

// PATCH /api/tareas/:id/reasignar
tareasRouter.patch("/:id/reasignar", async (req, res) => {
  try {
    const tarea = await reasignarTarea(req.params.id, req.body.responsableId, req.user!);
    res.json(tarea);
  } catch (e) {
    responderError(res, e);
  }
});

// PATCH /api/tareas/:id/tiempo
tareasRouter.patch("/:id/tiempo", async (req, res) => {
  try {
    const r = await registrarTiempo(req.params.id, req.body.minutos, req.user!.id);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Marketing v2: Bloqueos ──────────────────────────

// POST /api/tareas/:id/bloquear
tareasRouter.post("/:id/bloquear", async (req, res) => {
  try {
    const tarea = await bloquearTarea(req.params.id, req.body.motivo, req.body.dependeDe, req.user!);
    res.json(tarea);
  } catch (e) {
    responderError(res, e);
  }
});

// POST /api/tareas/:id/desbloquear
tareasRouter.post("/:id/desbloquear", async (req, res) => {
  try {
    const tarea = await desbloquearTarea(req.params.id, req.user!);
    res.json(tarea);
  } catch (e) {
    responderError(res, e);
  }
});

// POST /api/tareas/:id/extension
tareasRouter.post("/:id/extension", async (req, res) => {
  try {
    const sol = await solicitarExtension({
      tareaId: req.params.id,
      motivo: req.body.motivo,
      porcentajeCompletado: req.body.porcentajeCompletado ?? 0,
      tiempoAdicionalMinutos: req.body.tiempoAdicionalMinutos ?? 0,
      nuevaFecha: req.body.nuevaFecha,
      dificultad: req.body.dificultad,
    }, req.user!.id);
    res.status(201).json(sol);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
