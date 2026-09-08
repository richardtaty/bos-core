import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { moverEtapaSchema, registrarPagoSchema, actualizarPlanPagoSchema } from "../lib/validation";
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
  eliminarPago,
  resumenVentas,
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

// Resumen de Ventas (vista principal de Sala de OFERTAS) — SOLO LECTURA. Mismo aislamiento por
// unidad de negocio que el listado de pipelines de arriba. Va ANTES de las rutas con :id para que
// "resumen-ventas" no se interprete como un parámetro dinámico (ver errores ya resueltos).
pipelinesRouter.get("/resumen-ventas", async (req, res) => {
  const user = req.user!;
  const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200);
  if (user.rol === "SUPER_ADMIN") {
    res.json(await resumenVentas({ limite }));
    return;
  }
  const ids = user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
  res.json(await resumenVentas({ departamentoIds: ids, limite }));
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
    // El servicio decide si quien pide puede corregir el total: si el trato ya tiene pagos,
    // solo un SUPER ADMIN (la guarda de "no bajar de lo pagado" aplica siempre).
    const resultado = await actualizarValorRegistro(req.params.registroId, nuevoValor, req.user!.id, req.user!.rol);
    res.json(resultado);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("no encontrado")) res.status(404).json({ error: msg });
    else if (msg.includes("SUPER ADMIN")) res.status(403).json({ error: msg });
    else res.status(400).json({ error: msg });
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
      montoTotal: parsed.data.montoTotal,
      nota: parsed.data.nota,
      proximaFechaCobro: parsed.data.proximaFechaCobro,
      proximoPago: parsed.data.proximoPago,
      metodoPago: parsed.data.metodoPago,
      fecha: parsed.data.fecha,
      autorId: req.user!.id,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    res.status(201).json(resultado);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

// Eliminar un pago incorrecto o duplicado — SOLO SUPER ADMIN (ADMIN, SUPERVISOR y USUARIO
// reciben 403 de requireRole). Corrige la caja sin tocar al cliente ni al deal.
pipelinesRouter.delete("/registros/:registroId/pagos/:pagoId", requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const estado = await eliminarPago(req.params.pagoId, req.user!.id, req.params.registroId);
    res.json(estado);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("no encontrado") || msg.includes("no pertenece")) {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(422).json({ error: msg });
  }
});
