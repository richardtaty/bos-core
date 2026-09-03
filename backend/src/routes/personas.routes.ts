import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { crearPersonaSchema, crearInteraccionSchema, actualizarComentariosSchema, actualizarNegociosSchema, actualizarPersonaSchema, activoDigitalSchema } from "../lib/validation";
import {
  listarActivosDigitales,
  crearActivoDigital,
  actualizarActivoDigital,
  eliminarActivoDigital,
  SinPermisoActivoError,
} from "../services/activos-digitales.service";
import {
  listarPersonas,
  obtenerFichaPersona,
  crearPersona,
  registrarInteraccion,
  completarTarea,
  actualizarComentarios,
  actualizarNegocios,
  actualizarDatosPersona,
  SinPermisoError,
  listarTareasPendientes,
  ubicacionesClientes,
  cumpleanosHoy,
  proximosCumpleanos,
} from "../services/personas.service";

export const personasRouter = Router();
personasRouter.use(requireAuth);

personasRouter.get("/", async (req, res) => {
  const { search, estado, responsableId, pagina, limite } = req.query;
  const personas = await listarPersonas({
    search: search as string | undefined,
    estado: estado as string | undefined,
    responsableId: responsableId as string | undefined,
    pagina: pagina ? parseInt(pagina as string, 10) : undefined,
    limite: limite ? parseInt(limite as string, 10) : undefined,
  });
  res.json(personas);
});

// IMPORTANTE: estas rutas específicas van ANTES de "/:id" — si no, Express interpretaría
// "tareas" o "ubicaciones" como si fuera un id de persona y nunca llegaría aquí.
personasRouter.get("/ubicaciones", async (_req, res) => {
  try {
    res.json(await ubicacionesClientes());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

personasRouter.get("/tareas/pendientes", async (req, res) => {
  const soloPropias = req.query.propias === "true";
  const tareas = await listarTareasPendientes(soloPropias ? req.user!.id : undefined);
  res.json(tareas);
});

personasRouter.get("/cumpleanos", async (_req, res) => {
  try {
    const hoy = await cumpleanosHoy();
    const proximos = await proximosCumpleanos(14);
    res.json({ hoy, proximos });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

personasRouter.get("/:id", async (req, res) => {
  const ficha = await obtenerFichaPersona(req.params.id);
  if (!ficha) {
    res.status(404).json({ error: "Persona no encontrada" });
    return;
  }
  res.json(ficha);
});

personasRouter.post("/", async (req, res) => {
  const parsed = crearPersonaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const persona = await crearPersona(parsed.data, req.user!.id);
  res.status(201).json(persona);
});

personasRouter.post("/:id/interacciones", async (req, res) => {
  const parsed = crearInteraccionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const resultado = await registrarInteraccion(req.params.id, parsed.data, req.user!.id);
  res.status(201).json(resultado);
});

// ── Activos digitales de la ficha (uno-a-muchos) ──────────────
// Viven bajo "/:id/activos-digitales": cada activo pertenece únicamente a esa persona.
// Quien crea/edita/elimina lo decide el servicio (responsable o admin), igual que los datos
// de contacto. Tanto la URL "/:id" como estas rutas usan la persona como prefijo, pero no
// chocan entre sí porque difieren en el número de segmentos.
personasRouter.get("/:id/activos-digitales", async (req, res) => {
  try {
    res.json(await listarActivosDigitales(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

personasRouter.post("/:id/activos-digitales", async (req, res) => {
  const parsed = activoDigitalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const activo = await crearActivoDigital(req.params.id, parsed.data, req.user!.id, req.user!.rol);
    res.status(201).json(activo);
  } catch (err) {
    if (err instanceof SinPermisoActivoError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: (err as Error).message });
  }
});

personasRouter.patch("/:id/activos-digitales/:activoId", async (req, res) => {
  const parsed = activoDigitalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const activo = await actualizarActivoDigital(req.params.id, req.params.activoId, parsed.data, req.user!.id, req.user!.rol);
    res.json(activo);
  } catch (err) {
    if (err instanceof SinPermisoActivoError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: (err as Error).message });
  }
});

personasRouter.delete("/:id/activos-digitales/:activoId", async (req, res) => {
  try {
    res.json(await eliminarActivoDigital(req.params.id, req.params.activoId, req.user!.id, req.user!.rol));
  } catch (err) {
    if (err instanceof SinPermisoActivoError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: (err as Error).message });
  }
});

personasRouter.patch("/:id/comentarios", requireRole("SUPER_ADMIN"), async (req, res) => {
  const parsed = actualizarComentariosSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const resultado = await actualizarComentarios(req.params.id, parsed.data.comentarios, req.user!.id);
    res.json(resultado);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

personasRouter.patch("/:id/negocios", async (req, res) => {
  const parsed = actualizarNegociosSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const resultado = await actualizarNegocios(req.params.id, parsed.data.negocios, req.user!.id);
    res.json(resultado);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

personasRouter.patch("/tareas/:tareaId/completar", requireRole("USUARIO"), async (req, res) => {
  try {
    const tarea = await completarTarea(req.params.tareaId, req.user!.id);
    res.json(tarea);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// Corregir los datos de contacto de una ficha (teléfono, correo, ciudad, estado, cumpleaños).
// Va al final del archivo a propósito: "/:id" es un solo segmento y podría tragarse rutas
// nuevas de un solo segmento que se agreguen después. Quien permite o niega es el servicio,
// que necesita la ficha cargada para saber si quien edita es su responsable.
personasRouter.patch("/:id", async (req, res) => {
  const parsed = actualizarPersonaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const resultado = await actualizarDatosPersona(req.params.id, parsed.data, {
      id: req.user!.id,
      rol: req.user!.rol,
    });
    res.json(resultado);
  } catch (err) {
    if (err instanceof SinPermisoError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: (err as Error).message });
  }
});
