import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { moverEtapaSchema, registrarPagoSchema, actualizarPlanPagoSchema, cerrarVentaSchema } from "../lib/validation";
import {
  listarPipelines,
  tableroKanban,
  crearRegistro,
  moverEtapa,
  metricasPipeline,
  registrarPago,
  listarPagos,
  actualizarValorRegistro,
  actualizarPlanPago,
  cerrarVenta,
} from "../services/pipelines.service";

export const pipelinesRouter = Router();
pipelinesRouter.use(requireAuth);

pipelinesRouter.get("/", async (req, res) => {
  // Aislamiento por unidad de negocio: el usuario ve los pipelines de todos sus
  // departamentos (multi-depto). SUPER_ADMIN ve todo.
  const user = req.user!;
  if (user.rol === "SUPER_ADMIN") {
    res.json(await listarPipelines());
    return;
  }
  const ids = user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
  res.json(await listarPipelines({ departamentoIds: ids }));
});

pipelinesRouter.get("/:id/tablero", async (req, res) => {
  try {
    res.json(await tableroKanban(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

pipelinesRouter.get("/:id/metricas", async (req, res) => {
  res.json(await metricasPipeline(req.params.id));
});

pipelinesRouter.post("/:id/registros", async (req, res) => {
  try {
    const registro = await crearRegistro({
      pipelineId: req.params.id,
      personaId: req.body.personaId,
      valor: req.body.valor,
      autorId: req.user!.id,
    });
    res.status(201).json(registro);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

pipelinesRouter.patch("/registros/:registroId/etapa", requireRole("USUARIO"), async (req, res) => {
  const parsed = moverEtapaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const registro = await moverEtapa({
      registroId: req.params.registroId,
      etapaId: parsed.data.etapaId,
      motivoPerdida: parsed.data.motivoPerdida,
      autorId: req.user!.id,
    });
    res.json(registro);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

pipelinesRouter.get("/registros/:registroId/pagos", requireRole("USUARIO"), async (req, res) => {
  res.json(await listarPagos(req.params.registroId));
});

pipelinesRouter.patch("/registros/:registroId/valor", requireRole("USUARIO"), async (req, res) => {
  const nuevoValor = Number(req.body.valor);
  if (!nuevoValor || nuevoValor <= 0) {
    res.status(400).json({ error: "El valor debe ser un número mayor a cero" });
    return;
  }
  try {
    const resultado = await actualizarValorRegistro(req.params.registroId, nuevoValor, req.user!.id);
    res.json(resultado);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

pipelinesRouter.patch("/registros/:registroId/plan-pago", requireRole("USUARIO"), async (req, res) => {
  const parsed = actualizarPlanPagoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const resultado = await actualizarPlanPago(req.params.registroId, parsed.data, req.user!.id);
    res.json(resultado);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

pipelinesRouter.post("/registros/:registroId/cerrar-venta", requireRole("USUARIO"), async (req, res) => {
  const parsed = cerrarVentaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const resultado = await cerrarVenta({
      registroId: req.params.registroId,
      montoTotal: parsed.data.montoTotal,
      montoCobrado: parsed.data.montoCobrado,
      proximaFechaCobro: parsed.data.proximaFechaCobro,
      metodoPago: parsed.data.metodoPago,
      nota: parsed.data.nota,
      autorId: req.user!.id,
    });
    res.status(201).json(resultado);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

pipelinesRouter.post("/registros/:registroId/pagos", requireRole("USUARIO"), async (req, res) => {
  const parsed = registrarPagoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const resultado = await registrarPago({
      registroId: req.params.registroId,
      monto: parsed.data.monto,
      nota: parsed.data.nota,
      proximaFechaCobro: parsed.data.proximaFechaCobro,
      proximoPago: parsed.data.proximoPago,
      metodoPago: parsed.data.metodoPago,
      fecha: parsed.data.fecha,
      autorId: req.user!.id,
    });
    res.status(201).json(resultado);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});
