import { Router } from "express";
import { requireAuth, requireDepartamento, requireRole } from "../middleware/auth";
import { reportePodcast } from "../services/podcast.service";
import {
  obtenerMetas,
  guardarMetas,
  obtenerReporteDiario,
  guardarReporteDiario,
  desempenoMi,
  desempenoEquipo,
  inteligenciaPodcast,
} from "../services/podcast-performance.service";
import { guardarReportePodcastSchema, guardarMetasPodcastSchema, crearCitaPodcastSchema, actualizarCitaPodcastSchema } from "../lib/validation";
import {
  listarCitas,
  crearCita,
  actualizarCita,
  eliminarCita,
} from "../services/podcast-citas.service";
import { buscarInvitados, obtenerOCrearInvitado } from "../services/podcast-invitados.service";

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

// ─── Desempeño individual (score + comparaciones) ─────────
podcastRouter.get("/desempeno/mi", requireDepartamento("Podcast"), async (req, res) => {
  try {
    res.json(await desempenoMi(req.user!.id));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Vista de equipo: ADMIN del departamento (o Super Admin) — hasta que se asigne líder.
podcastRouter.get("/desempeno/equipo", requireRole("ADMIN"), requireDepartamento("Podcast"), async (_req, res) => {
  try {
    res.json(await desempenoEquipo());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

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
