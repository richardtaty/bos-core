import { Router } from "express";
import { requireAuth, requireAgente } from "../middleware/auth";
import { commandCenter } from "../services/reportes.service";
import {
  resumenMensual,
  resumenHoy,
  ventasPorOferta,
  adelantosPendientes,
  rentabilidadPorLinea,
} from "../services/ingresos.service";
import { listarPipelines, tableroKanban, metricasPipeline, estadoFinanciero } from "../services/pipelines.service";
import { listarPersonas, obtenerFichaPersona, listarTareasPendientes } from "../services/personas.service";
import { listarTareas } from "../services/tareas.service";
import { timelineGlobal } from "../services/actividad.service";
import type { EstadoTarea, Prioridad } from "../services/tareas.service";

/**
 * Superficie de solo lectura para Hermes Agent (rol AGENTE).
 *
 * Existe como router propio en vez de abrir las rutas normales porque el rol AGENTE está fuera
 * de JERARQUIA a propósito (ver auth.ts): `requireRole` lo rechaza en todo el resto del sistema.
 * Así el agente solo alcanza exactamente lo que se define aquí.
 *
 * Cada endpoint delega en un servicio que ya existe — no se reimplementa lógica de negocio.
 * En particular el saldo pendiente NUNCA se recalcula a mano: sale de `adelantosPendientes()`
 * y `estadoFinanciero()`, que lo derivan restando los pagos al valor del registro.
 */
export const agenteRouter = Router();
agenteRouter.use(requireAuth);
agenteRouter.use(requireAgente);

/** Envuelve un handler async para no repetir try/catch en cada ruta. */
const ok = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
};

// ─── Panorama general ─────────────────────────────────────────
// La foto completa del negocio: vendido, cobrado, brecha de caja, vencidos y alertas.
agenteRouter.get("/panorama", ok(() => commandCenter()));

// ─── Dinero ───────────────────────────────────────────────────
agenteRouter.get(
  "/finanzas/resumen",
  ok(async (req) => {
    const mes = req.query.mes as string | undefined;
    const [resumen, porOferta, rentabilidad] = await Promise.all([
      resumenMensual(mes),
      ventasPorOferta(mes),
      rentabilidadPorLinea(mes),
    ]);
    return { mes: mes ?? "actual", resumen, porOferta, rentabilidad };
  })
);

agenteRouter.get("/finanzas/hoy", ok(() => resumenHoy()));

// Quién debe cuánto. Es la pregunta de cobranza más valiosa del sistema.
agenteRouter.get("/finanzas/saldos", ok(() => adelantosPendientes()));

// ─── Pipelines ────────────────────────────────────────────────
// Lista con métricas de cada uno, para que el agente sepa qué tablero pedir después.
agenteRouter.get(
  "/pipelines",
  ok(async () => {
    const pipelines = await listarPipelines();
    return Promise.all(
      pipelines.map(async (p: { id: string }) => ({ ...p, metricas: await metricasPipeline(p.id) }))
    );
  })
);

// Rutas específicas antes que las dinámicas (regla #2 de CLAUDE.md).
agenteRouter.get("/pipelines/:id/tablero", ok((req) => tableroKanban(req.params.id)));

// ─── Contactos ────────────────────────────────────────────────
agenteRouter.get(
  "/contactos",
  ok((req) =>
    listarPersonas({
      search: req.query.buscar as string | undefined,
      estado: req.query.estado as string | undefined,
      pagina: req.query.pagina ? Number(req.query.pagina) : undefined,
      limite: req.query.limite ? Number(req.query.limite) : undefined,
    })
  )
);

agenteRouter.get("/contactos/:id", ok((req) => obtenerFichaPersona(req.params.id)));

// ─── Operación ────────────────────────────────────────────────
agenteRouter.get(
  "/tareas",
  ok((req) =>
    listarTareas({
      departamento: req.query.departamento as string | undefined,
      estado: req.query.estado as EstadoTarea | undefined,
      prioridad: req.query.prioridad as Prioridad | undefined,
      responsableId: req.query.responsableId as string | undefined,
    })
  )
);

// Seguimientos de contactos sin completar (los vencidos son los que importan).
agenteRouter.get("/seguimientos", ok(() => listarTareasPendientes()));

agenteRouter.get(
  "/actividad",
  ok((req) => timelineGlobal(req.query.limite ? Number(req.query.limite) : 50))
);

// ─── Detalle financiero de un negocio ─────────────────────────
agenteRouter.get("/registros/:id/financiero", ok((req) => estadoFinanciero(req.params.id)));
