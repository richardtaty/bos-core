import { Router } from "express";
import { requireAuth, requireRole, requireDepartamento } from "../middleware/auth";
import { actividadDelDia, miFacturacion, listarPagosDetallado, ventasPorDiaYUsuario, limitesDeRangoET, dashboardLider, dashboardCEO, commandCenter, askBos, ceoMode } from "../services/reportes.service";

export const reportesRouter = Router();
reportesRouter.use(requireAuth);

// Solo Super Admin ve el total de la empresa y el desglose de todos los agentes.
reportesRouter.get("/actividad-hoy", requireRole("SUPER_ADMIN"), async (_req, res) => {
  res.json(await actividadDelDia());
});

// Cualquier usuario ve SU PROPIA facturación — nunca la de otros ni el total.
reportesRouter.get("/mi-facturacion", async (req, res) => {
  res.json(await miFacturacion(req.user!.id));
});

// "desde"/"hasta" llegan como YYYY-MM-DD. Para ADMIN no-SUPER_ADMIN se fuerza
// el rango a los últimos 7 días, sin importar lo que pida el frontend.
function parsearRango(req: import("express").Request) {
  const esSuperAdmin = req.user!.rol === "SUPER_ADMIN";

  if (!esSuperAdmin) {
    // Forzar últimos 7 días para ADMIN
    const hoy = new Date();
    const hace7 = new Date(hoy.getTime() - 6 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return {
      desde: limitesDeRangoET(fmt(hace7), false),
      hasta: limitesDeRangoET(fmt(hoy), true),
    };
  }

  const desde = req.query.desde ? limitesDeRangoET(req.query.desde as string, false) : undefined;
  const hasta = req.query.hasta ? limitesDeRangoET(req.query.hasta as string, true) : undefined;
  return { desde, hasta };
}

// Un agente normal SIEMPRE ve solo lo suyo, sin importar qué usuarioId le pase a la URL —
// solo Super Admin puede pedir el de otro agente o el de todos (sin usuarioId = todos).
reportesRouter.get("/pagos", async (req, res) => {
  const { desde, hasta } = parsearRango(req);
  const esSuperAdmin = req.user!.rol === "SUPER_ADMIN";
  const usuarioId = esSuperAdmin ? (req.query.usuarioId as string | undefined) : req.user!.id;
  res.json(await listarPagosDetallado({ desde, hasta, usuarioId }));
});

reportesRouter.get("/ventas-por-dia", async (req, res) => {
  const { desde, hasta } = parsearRango(req);
  const esSuperAdmin = req.user!.rol === "SUPER_ADMIN";
  const usuarioId = esSuperAdmin ? (req.query.usuarioId as string | undefined) : req.user!.id;
  res.json(await ventasPorDiaYUsuario({ desde, hasta, usuarioId }));
});

// Dashboard del líder de departamento — solo Marketing
reportesRouter.get("/dashboard-lider", requireDepartamento("Marketing"), async (req, res) => {
  res.json(await dashboardLider(req.user!.id));
});

// Dashboard CEO (solo Super Admin)
reportesRouter.get("/dashboard-ceo", requireRole("SUPER_ADMIN"), async (_req, res) => {
  res.json(await dashboardCEO());
});

// Revenue Command Center (solo Super Admin)
reportesRouter.get("/command-center", requireRole("SUPER_ADMIN"), async (_req, res) => {
  res.json(await commandCenter());
});

// Ask BOS (solo Super Admin)
reportesRouter.post("/ask-bos", requireRole("SUPER_ADMIN"), async (req, res) => {
  res.json(await askBos(String(req.body?.pregunta ?? "")));
});

// CEO Mode (solo Super Admin)
reportesRouter.get("/ceo-mode", requireRole("SUPER_ADMIN"), async (_req, res) => {
  res.json(await ceoMode());
});
