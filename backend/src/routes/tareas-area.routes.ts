import { Router, type Response } from "express";
import { requireAuth, requireDepartamento } from "../middleware/auth";
import {
  listarTareasVisibles,
  obtenerTarea,
  crearTarea,
  actualizarTarea,
  reasignarTarea,
  miembrosElegiblesDeDepartamento,
  esMiembroElegibleDeDepartamento,
  SinPermisoTareaError,
} from "../services/tareas.service";

/**
 * Tareas vistas desde UNA sección del CRM, con el departamento fijo en el servidor.
 *
 * Es el mismo módulo central de Tareas —misma tabla `tareas_operativas`, mismas tarjetas,
 * mismo motor de estados—, no una pantalla ni una tabla aparte. Lo único que cambia es que
 * el departamento deja de ser un filtro elegible y pasa a ser el contexto entero.
 *
 * Nació como el bloque de tareas de Podcast (PODCAST → Tareas) y de ahí se generalizó a las
 * demás secciones para que todas se comporten igual: al entrar a Tareas desde un área se ven
 * SOLO las tareas de esa área, sin elegir nada.
 *
 * El departamento es un DATO ESTRUCTURADO de la tarea (la columna `departamento`, con el
 * nombre exacto de la unidad), así que el filtro es ese valor exacto. Nunca por título,
 * descripción, texto libre ni nombre del responsable.
 *
 * Lo importante de este módulo: el departamento lo pone SIEMPRE el servidor. Estas rutas no
 * leen ningún parámetro `departamento` del cliente y al crear lo descartan del body.
 * Manipular el request no saca una tarea del área ni mete tareas de otras áreas. El alcance
 * por rol lo sigue calculando `listarTareasVisibles` desde `req.user`.
 */

/** Un fallo de permiso de tareas es 403; lo demás, 400. Igual que tareas.routes.ts. */
function responderErrorTarea(res: Response, e: unknown): void {
  const mensaje = e instanceof Error ? e.message : "Error inesperado";
  res.status(e instanceof SinPermisoTareaError ? 403 : 400).json({ error: mensaje });
}

/**
 * Agrega a `router` las rutas de tareas acotadas a `departamento`, todas bajo `requireDepartamento`:
 *
 *   GET    /tareas/miembros            — quién puede ser responsable (gente real del área)
 *   GET    /tareas                     — el listado del área
 *   POST   /tareas                     — crea una tarea que YA nace siendo del área
 *   PATCH  /tareas/:id                 — editar/completar/reagendar la MISMA tarea
 *   PATCH  /tareas/:id/reasignar       — solo a alguien del equipo del área
 *
 * ⚠️ Las rutas con /:id van al final y `/tareas/miembros` antes (regla #2 de CLAUDE.md).
 */
export function montarRutasTareasDeArea(router: Router, departamento: string): void {
  const soloDelArea = requireDepartamento(departamento);

  /** La tarea existe y es de esta área, o se responde y se devuelve null. */
  async function cargarTareaDelArea(res: Response, id: string) {
    const tarea = await obtenerTarea(id);
    if (!tarea) {
      res.status(404).json({ error: "Tarea no encontrada" });
      return null;
    }
    if (tarea.departamento !== departamento) {
      // El bloqueo real: una tarea de otra área no se toca desde esta vista aunque se
      // conozca su id.
      res.status(403).json({ error: `Esta tarea no pertenece a ${departamento}.` });
      return null;
    }
    return tarea;
  }

  // Quién puede ser responsable aquí: los miembros REALES del área más los Super Admin
  // activos. Se consulta la relación del CRM, no una lista escrita a mano: si el equipo
  // cambia, el selector cambia solo.
  router.get("/tareas/miembros", soloDelArea, async (_req, res) => {
    try {
      res.json(await miembrosElegiblesDeDepartamento(departamento));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // El `departamento` NO se lee del query a propósito, aunque venga.
  router.get("/tareas", soloDelArea, async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    try {
      res.json(
        await listarTareasVisibles(req.user!, {
          responsableId: q.responsableId,
          departamento,
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

  // Crea una tarea que YA nace siendo del área. El usuario no elige departamento, y el que
  // venga en el body se descarta.
  router.post("/tareas", soloDelArea, async (req, res) => {
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
    if (!(await esMiembroElegibleDeDepartamento(departamento, responsableId))) {
      res.status(400).json({ error: `Esa persona no pertenece al equipo de ${departamento}.` });
      return;
    }
    try {
      const tarea = await crearTarea({ ...body, titulo, responsableId, departamento }, req.user!);
      res.status(201).json(tarea);
    } catch (e) {
      responderErrorTarea(res, e);
    }
  });

  // Editar, completar y reagendar la MISMA tarea. `departamento` se elimina del input para
  // que no pueda mudarse de área desde aquí.
  router.patch("/tareas/:id", soloDelArea, async (req, res) => {
    const tarea = await cargarTareaDelArea(res, req.params.id);
    if (!tarea) return;
    try {
      const { departamento: _ignorado, ...cambios } = req.body ?? {};
      res.json(await actualizarTarea(req.params.id, cambios, req.user!));
    } catch (e) {
      responderErrorTarea(res, e);
    }
  });

  // Reasignar: solo a alguien del equipo del área.
  router.patch("/tareas/:id/reasignar", soloDelArea, async (req, res) => {
    const tarea = await cargarTareaDelArea(res, req.params.id);
    if (!tarea) return;
    const responsableId = typeof req.body?.responsableId === "string" ? req.body.responsableId : "";
    if (!responsableId) {
      res.status(400).json({ error: "Elige un responsable" });
      return;
    }
    if (!(await esMiembroElegibleDeDepartamento(departamento, responsableId))) {
      res.status(400).json({ error: `Esa persona no pertenece al equipo de ${departamento}.` });
      return;
    }
    try {
      res.json(await reasignarTarea(req.params.id, responsableId, req.user!));
    } catch (e) {
      responderErrorTarea(res, e);
    }
  });
}

/**
 * Las secciones del CRM que tienen su propia vista de Tareas, con el departamento que fijan.
 * El `slug` es el que viaja en la URL (`/api/areas/<slug>/tareas`) y el nombre tiene que
 * coincidir EXACTO con el de la tabla `departamentos`, porque es el valor que guarda la tarea.
 */
export const AREAS_TAREAS: { slug: string; departamento: string }[] = [
  { slug: "marketing", departamento: "Marketing" },
  { slug: "sala-de-ofertas", departamento: "Sala de OFERTAS" },
  { slug: "podcast", departamento: "Podcast" },
];

/** Un router independiente por área, para montarlos con `app.use("/api/areas/<slug>", ...)`. */
function crearRouterTareasDeArea(departamento: string): Router {
  const router = Router();
  router.use(requireAuth);
  montarRutasTareasDeArea(router, departamento);
  return router;
}

/** Router raíz de `/api/areas`: cada slug queda con su ámbito ya fijado en el servidor. */
export const areasTareasRouter = Router();
for (const { slug, departamento } of AREAS_TAREAS) {
  areasTareasRouter.use(`/${slug}`, crearRouterTareasDeArea(departamento));
}
