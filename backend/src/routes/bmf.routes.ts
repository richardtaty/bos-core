import { Router } from "express";
import { requireAuth, requireRole, requireDepartamento } from "../middleware/auth";
import { listarSolicitudes, obtenerSolicitud } from "../services/bmf-solicitudes.service";
import { generarEnlaceSubida, esTipoDocumento } from "../services/documentos.service";
import { documentosActivos } from "../lib/funding-env";
import {
  listarLenders,
  crearLender,
  obtenerLender,
  actualizarLender,
  listarFundings,
  crearFunding,
  obtenerFunding,
  actualizarFunding,
  listarLlamadas,
  registrarLlamada,
  statsLlamadas,
  listarComisiones,
  crearComision,
  pagarComision,
  dashboardBMF,
  dashboardAdminBMF,
  scoreCliente,
} from "../services/bmf.service";
import {
  produccionPorAgente,
  produccionPorLender,
  fundingMensual,
  pipelineReport,
  reporteLlamadas,
  rankingAgentes,
  kpiAgente,
} from "../services/bmf.reportes.service";

export const bmfRouter = Router();
bmfRouter.use(requireAuth);

// ─── Lenders ──────────────────────────────────────────────

bmfRouter.get("/lenders", async (_req, res) => {
  try {
    res.json(await listarLenders());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.post("/lenders", requireRole("ADMIN"), async (req, res) => {
  try {
    const lender = await crearLender(req.body, req.user!.id);
    res.status(201).json(lender);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/lenders/:id", async (req, res) => {
  try {
    res.json(await obtenerLender(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

bmfRouter.patch("/lenders/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const lender = await actualizarLender(req.params.id, req.body, req.user!.id);
    res.json(lender);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ─── Fundings ─────────────────────────────────────────────

bmfRouter.get("/fundings", async (req, res) => {
  try {
    const { estado, agenteId, lenderId, clienteId } = req.query;
    res.json(await listarFundings({
      estado: estado as string | undefined,
      agenteId: agenteId as string | undefined,
      lenderId: lenderId as string | undefined,
      clienteId: clienteId as string | undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.post("/fundings", async (req, res) => {
  try {
    const funding = await crearFunding(req.body, req.user!.id);
    res.status(201).json(funding);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/fundings/:id", async (req, res) => {
  try {
    res.json(await obtenerFunding(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

bmfRouter.patch("/fundings/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const funding = await actualizarFunding(req.params.id, req.body, req.user!.id);
    res.json(funding);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ─── Llamadas ─────────────────────────────────────────────
// IMPORTANTE: /stats va ANTES de cualquier ruta con :id para este prefijo

bmfRouter.get("/llamadas/stats", async (req, res) => {
  try {
    const { agenteId, desde, hasta } = req.query;
    res.json(await statsLlamadas({
      agenteId: agenteId as string | undefined,
      desde: desde as string | undefined,
      hasta: hasta as string | undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/llamadas", async (req, res) => {
  try {
    const { personaId, agenteId, desde, hasta } = req.query;
    res.json(await listarLlamadas({
      personaId: personaId as string | undefined,
      agenteId: agenteId as string | undefined,
      desde: desde as string | undefined,
      hasta: hasta as string | undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.post("/llamadas", async (req, res) => {
  try {
    const llamada = await registrarLlamada(req.body, req.user!.id);
    res.status(201).json(llamada);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ─── Comisiones ───────────────────────────────────────────

bmfRouter.get("/comisiones", async (req, res) => {
  try {
    const { agenteId, estado } = req.query;
    res.json(await listarComisiones({
      agenteId: agenteId as string | undefined,
      estado: estado as string | undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.post("/comisiones", requireRole("ADMIN"), async (req, res) => {
  try {
    const comision = await crearComision(req.body, req.user!.id);
    res.status(201).json(comision);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

bmfRouter.patch("/comisiones/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const comision = await pagarComision(req.params.id, req.user!.id);
    res.json(comision);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ─── Dashboard ────────────────────────────────────────────

bmfRouter.get("/dashboard", async (req, res) => {
  try {
    const { departamentoId } = req.user!;
    if (!departamentoId) {
      res.json({
        clientesActivos: 0, leadsNuevos: 0, seguimientosPendientes: 0, seguimientosVencidos: 0,
        solicitudesAbiertas: 0, solicitudesAprobadas: 0, solicitudesPerdidas: 0,
        fundingMes: 0, fundingHistorico: 0, pipelineActivo: 0, renovacionesProximas: 0,
        lendersActivos: 0, agentesActivos: 0, conversion: 0,
        comisionesGeneradas: 0, comisionesPendientes: 0, actividadHoy: 0,
        agentes: [],
      });
      return;
    }
    res.json(await dashboardBMF(departamentoId));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/dashboard/admin", requireRole("ADMIN"), async (req, res) => {
  try {
    const { departamentoId } = req.user!;
    if (!departamentoId) {
      res.json({ agentesSinActividad: [], kpisPorAgente: [], clientesSinContacto: [], renovacionesProximas: [] });
      return;
    }
    res.json(await dashboardAdminBMF(departamentoId));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Score ────────────────────────────────────────────────

bmfRouter.get("/score/:personaId", async (req, res) => {
  try {
    res.json(await scoreCliente(req.params.personaId));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Reportes ─────────────────────────────────────────────

bmfRouter.get("/reportes/produccion-agente", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    res.json(await produccionPorAgente({
      desde: desde as string | undefined,
      hasta: hasta as string | undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/reportes/produccion-lender", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    res.json(await produccionPorLender({
      desde: desde as string | undefined,
      hasta: hasta as string | undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/reportes/funding-mensual", async (req, res) => {
  try {
    const anio = req.query.anio ? Number(req.query.anio) : undefined;
    res.json(await fundingMensual(anio));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/reportes/pipeline", async (_req, res) => {
  try {
    res.json(await pipelineReport());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/reportes/llamadas", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    res.json(await reporteLlamadas({
      desde: desde as string | undefined,
      hasta: hasta as string | undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/reportes/ranking", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    res.json(await rankingAgentes({
      desde: desde as string | undefined,
      hasta: hasta as string | undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/reportes/kpi-agente/:agenteId", async (req, res) => {
  try {
    res.json(await kpiAgente(req.params.agenteId));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Solicitudes de financiamiento digital (BMF Funding) ────────
// Solo el equipo de Business Market Finders (y SUPER_ADMIN) las ve.

bmfRouter.get("/solicitudes", requireDepartamento("Business Market Finders"), async (_req, res) => {
  try {
    res.json(await listarSolicitudes());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

bmfRouter.get("/solicitudes/:id", requireDepartamento("Business Market Finders"), async (req, res) => {
  try {
    const solicitud = await obtenerSolicitud(req.params.id);
    if (!solicitud) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }
    res.json(solicitud);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Genera un enlace de subida presigned a R2 (10 min) para un documento de una solicitud.
// Solo el equipo de Business Market Finders. Devuelve 503 si R2 no está configurado aún.
bmfRouter.post("/solicitudes/:id/documentos/subir", requireDepartamento("Business Market Finders"), async (req, res) => {
  try {
    if (!documentosActivos()) {
      res.status(503).json({ error: "Documentos desactivados (falta configuración R2)." });
      return;
    }
    const { tipo, nombre, contentType } = (req.body ?? {}) as {
      tipo?: unknown;
      nombre?: unknown;
      contentType?: unknown;
    };
    if (!esTipoDocumento(tipo)) {
      res.status(400).json({ error: "tipo inválido. Debe ser bank_statement, identificacion, cheque_anulado u otro." });
      return;
    }
    if (typeof nombre !== "string" || !nombre.trim()) {
      res.status(400).json({ error: "nombre es obligatorio." });
      return;
    }
    const enlace = await generarEnlaceSubida({
      solicitudId: req.params.id,
      tipo,
      nombre: nombre.trim(),
      contentType: typeof contentType === "string" ? contentType : undefined,
    });
    if (!enlace) {
      res.status(503).json({ error: "No se pudo generar el enlace de subida." });
      return;
    }
    res.status(201).json(enlace);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
