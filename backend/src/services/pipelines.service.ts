import { and, eq, or, sum } from "drizzle-orm";
import { db } from "../db/client";
import { pipelines, etapas, registros, historialEtapas, bitacoraAuditoria, personas, pagos, tareasSeguimiento } from "../db/schema";

export async function listarPipelines(opts?: { departamentoIds?: string[] }) {
  const ids = opts?.departamentoIds ?? [];
  const filas = ids.length > 0
    ? await db.select().from(pipelines).where(and(
        eq(pipelines.activo, true),
        or(...ids.map((id) => eq(pipelines.departamentoId, id))),
      ) as any)
    : await db.select().from(pipelines).where(eq(pipelines.activo, true));
  const resultado = [];
  for (const p of filas) {
    const etapasPipeline = await db.select().from(etapas).where(eq(etapas.pipelineId, p.id)).orderBy(etapas.orden);
    resultado.push({ ...p, etapas: etapasPipeline });
  }
  return resultado;
}

async function totalPagadoDe(registroId: string): Promise<number> {
  const [fila] = await db.select({ total: sum(pagos.monto) }).from(pagos).where(eq(pagos.registroId, registroId));
  return Number(fila?.total ?? 0);
}

// Vista Kanban: registros agrupados por etapa, con el nombre de la persona y el estado de
// pago (total pagado / saldo pendiente) ya resueltos — nunca se guarda el saldo, siempre se calcula
// sumando los pagos reales contra el valor total del deal.
export async function tableroKanban(pipelineId: string) {
  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, pipelineId));
  if (!pipeline) throw new Error("Pipeline no encontrado");

  const etapasPipeline = await db.select().from(etapas).where(eq(etapas.pipelineId, pipelineId)).orderBy(etapas.orden);

  const columnas = [];
  for (const etapa of etapasPipeline) {
    const registrosEtapa = await db
      .select({
        id: registros.id,
        personaId: registros.personaId,
        personaNombre: personas.nombre,
        valor: registros.valor,
        etapaId: registros.etapaId,
        proximoPago: registros.proximoPago,
        fechaProximoPago: registros.fechaProximoPago,
        metodoPago: registros.metodoPago,
      })
      .from(registros)
      .leftJoin(personas, eq(registros.personaId, personas.id))
      .where(eq(registros.etapaId, etapa.id));

    const registrosConPago = await Promise.all(
      registrosEtapa.map(async (r) => {
        const totalPagado = await totalPagadoDe(r.id);
        const saldoPendiente = r.valor != null ? Math.max(0, r.valor - totalPagado) : null;
        const montoVencido =
          r.fechaProximoPago && r.fechaProximoPago < new Date() && saldoPendiente != null && saldoPendiente > 0
            ? (r.proximoPago ?? 0)
            : 0;
        return { ...r, totalPagado, saldoPendiente, montoVencido };
      })
    );

    columnas.push({ ...etapa, registros: registrosConPago });
  }

  return { ...pipeline, etapas: columnas };
}

export async function crearRegistro(input: { pipelineId: string; personaId?: string; valor?: number; autorId: string }) {
  const [primeraEtapa] = await db
    .select()
    .from(etapas)
    .where(eq(etapas.pipelineId, input.pipelineId))
    .orderBy(etapas.orden)
    .limit(1);
  if (!primeraEtapa) throw new Error("El pipeline no tiene etapas configuradas");

  const id = crypto.randomUUID();
  const ahora = new Date();

  await db.insert(registros).values({
    id,
    pipelineId: input.pipelineId,
    personaId: input.personaId,
    etapaId: primeraEtapa.id,
    valor: input.valor,
    createdAt: ahora,
    updatedAt: ahora,
  });

  await db.insert(historialEtapas).values({
    id: crypto.randomUUID(),
    registroId: id,
    etapaNuevaId: primeraEtapa.id,
    autorId: input.autorId,
    fecha: ahora,
  });

  const [registro] = await db.select().from(registros).where(eq(registros.id, id));
  return registro;
}

interface MoverEtapaInput {
  registroId: string;
  etapaId: string;
  autorId: string;
  motivoPerdida?: string;
}

// Corazón del motor de pipelines: valida la transición, aplica la regla de "motivo de pérdida
// obligatorio", y deja rastro inmutable en historial_etapas.
export async function moverEtapa(input: MoverEtapaInput) {
  const [nuevaEtapa] = await db.select().from(etapas).where(eq(etapas.id, input.etapaId));
  if (!nuevaEtapa) throw new Error("Etapa no encontrada");

  if (nuevaEtapa.esPerdida && !input.motivoPerdida) {
    throw new Error("Debe indicar el motivo de pérdida para mover un registro a una etapa perdida");
  }

  const [registro] = await db.select().from(registros).where(eq(registros.id, input.registroId));
  if (!registro) throw new Error("Registro no encontrado");

  const ahora = new Date();

  await db
    .update(registros)
    .set({ etapaId: input.etapaId, motivoPerdida: nuevaEtapa.esPerdida ? input.motivoPerdida : null, updatedAt: ahora })
    .where(eq(registros.id, input.registroId));

  await db.insert(historialEtapas).values({
    id: crypto.randomUUID(),
    registroId: input.registroId,
    etapaNuevaId: input.etapaId,
    autorId: input.autorId,
    fecha: ahora,
  });

  if (registro.personaId) {
    await db.insert(bitacoraAuditoria).values({
      id: crypto.randomUUID(),
      entidad: "Registro",
      entidadId: input.registroId,
      accion: `Movido a etapa "${nuevaEtapa.nombre}"${input.motivoPerdida ? ` — motivo: ${input.motivoPerdida}` : ""}`,
      autorId: input.autorId,
      personaId: registro.personaId,
      fecha: ahora,
    });
  }

  const [actualizado] = await db.select().from(registros).where(eq(registros.id, input.registroId));
  return actualizado;
}

// Métrica genérica reutilizada por las trece verticales: tasa de conversión y valor
// del pipeline abierto — la misma fórmula sin importar qué vertical la invoque.
export async function metricasPipeline(pipelineId: string) {
  const etapasPipeline = await db.select().from(etapas).where(eq(etapas.pipelineId, pipelineId));
  const registrosPipeline = await db.select().from(registros).where(eq(registros.pipelineId, pipelineId));

  const etapaPorId = new Map(etapasPipeline.map((e) => [e.id, e]));
  const total = registrosPipeline.length;
  const ganados = registrosPipeline.filter((r) => etapaPorId.get(r.etapaId)?.esGanada).length;
  const perdidos = registrosPipeline.filter((r) => etapaPorId.get(r.etapaId)?.esPerdida).length;
  const abiertos = total - ganados - perdidos;
  const valorAbierto = registrosPipeline
    .filter((r) => {
      const e = etapaPorId.get(r.etapaId);
      return e && !e.esGanada && !e.esPerdida;
    })
    .reduce((sum, r) => sum + (r.valor ?? 0), 0);

  return {
    total,
    ganados,
    perdidos,
    abiertos,
    valorAbierto,
    tasaConversion: total > 0 ? Number(((ganados / total) * 100).toFixed(1)) : 0,
  };
}

// Registrar un pago (abono/cuota) contra un registro. Si después de este pago queda saldo
// pendiente, exige la fecha del próximo cobro y agenda automáticamente el seguimiento —
// mismo principio de "nunca queda un pendiente sin fecha" que ya rige el resto del sistema.
// Ahora también registra el plan de pagos (próximo pago + método) de forma estructurada.
export async function registrarPago(input: {
  registroId: string;
  monto: number;
  nota?: string;
  proximaFechaCobro?: string;
  proximoPago?: number;
  metodoPago?: string;
  fecha?: string;
  autorId: string;
}) {
  const [registro] = await db.select().from(registros).where(eq(registros.id, input.registroId));
  if (!registro) throw new Error("Registro no encontrado");

  const totalPagadoActual = await totalPagadoDe(input.registroId);
  const nuevoTotalPagado = totalPagadoActual + input.monto;
  const saldoPendiente = registro.valor != null ? Math.max(0, registro.valor - nuevoTotalPagado) : 0;

  if (saldoPendiente > 0 && !input.proximaFechaCobro) {
    throw new Error("Queda saldo pendiente — debes indicar la fecha del próximo cobro.");
  }

  const pagoId = crypto.randomUUID();
  const fechaPago = input.fecha ? new Date(input.fecha) : new Date();

  await db.insert(pagos).values({
    id: pagoId,
    registroId: input.registroId,
    monto: input.monto,
    nota: input.nota,
    autorId: input.autorId,
    fecha: fechaPago,
  });

  // Actualizar el plan de pagos del deal: si queda saldo, guardar próximo pago + método;
  // si se saldó por completo, limpiar el plan (ya no hay nada que cobrar).
  const proximoPago = saldoPendiente > 0 ? (input.proximoPago ?? saldoPendiente) : null;
  await db
    .update(registros)
    .set({
      proximoPago,
      fechaProximoPago: saldoPendiente > 0 && input.proximaFechaCobro ? new Date(input.proximaFechaCobro) : null,
      metodoPago: saldoPendiente > 0 ? (input.metodoPago ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(registros.id, input.registroId));

  let tareaCreada = null;
  if (saldoPendiente > 0 && registro.personaId && input.proximaFechaCobro) {
    const tareaId = crypto.randomUUID();
    await db.insert(tareasSeguimiento).values({
      id: tareaId,
      personaId: registro.personaId,
      fecha: new Date(input.proximaFechaCobro),
      nota: `Cobro de $${(proximoPago ?? saldoPendiente).toLocaleString()} (próximo pago) — saldo total $${saldoPendiente.toLocaleString()}`,
      autorId: input.autorId,
      createdAt: new Date(),
    });
    tareaCreada = tareaId;
  }

  if (registro.personaId) {
    await db.insert(bitacoraAuditoria).values({
      id: crypto.randomUUID(),
      entidad: "Pago",
      entidadId: pagoId,
      accion:
        saldoPendiente > 0
          ? `Pago registrado: $${input.monto.toLocaleString()} — saldo pendiente $${saldoPendiente.toLocaleString()}`
          : `Pago registrado: $${input.monto.toLocaleString()} — saldado por completo`,
      autorId: input.autorId,
      personaId: registro.personaId,
      fecha: fechaPago,
    });
  }

  return { pagoId, totalPagado: nuevoTotalPagado, saldoPendiente, tareaCreada };
}

export async function listarPagos(registroId: string) {
  const filas = await db.select().from(pagos).where(eq(pagos.registroId, registroId)).orderBy(pagos.fecha);
  return filas;
}

// Corregir el precio total acordado de un trato ya creado — necesario porque los precios
// se negocian y a veces cambian después de creado el registro (renegociación, error de tipeo,
// descuento acordado después). Nunca toca los pagos ya registrados, solo el total contra el
// que se calcula el saldo.
export async function actualizarValorRegistro(registroId: string, nuevoValor: number, autorId: string) {
  const [registro] = await db.select().from(registros).where(eq(registros.id, registroId));
  if (!registro) throw new Error("Registro no encontrado");

  const valorAnterior = registro.valor;
  await db.update(registros).set({ valor: nuevoValor, updatedAt: new Date() }).where(eq(registros.id, registroId));

  if (registro.personaId) {
    await db.insert(bitacoraAuditoria).values({
      id: crypto.randomUUID(),
      entidad: "Registro",
      entidadId: registroId,
      accion: `Precio del trato corregido: $${valorAnterior?.toLocaleString() ?? "—"} → $${nuevoValor.toLocaleString()}`,
      autorId,
      personaId: registro.personaId,
      fecha: new Date(),
    });
  }

  const totalPagado = await totalPagadoDe(registroId);
  const saldoPendiente = Math.max(0, nuevoValor - totalPagado);
  return { valor: nuevoValor, totalPagado, saldoPendiente };
}

// Cerrar una venta en un solo paso — la simplificación que pidió Richard para no tener que
// hacer tres acciones separadas (fijar precio → mover a ganada → registrar pago).
// Fija el total acordado, mueve el registro a la etapa ganada del pipeline y registra el
// cobro de hoy. Si queda saldo, exige la fecha del próximo cobro y agenda el seguimiento,
// igual que registrarPago. La regla de saldo se valida *antes* de tocar nada para no dejar
// el registro a medias (precio cambiado o etapa movida) si falta la fecha.
export async function cerrarVenta(input: {
  registroId: string;
  montoTotal: number;
  montoCobrado: number;
  proximaFechaCobro?: string;
  metodoPago?: string;
  nota?: string;
  autorId: string;
}) {
  const [registro] = await db.select().from(registros).where(eq(registros.id, input.registroId));
  if (!registro) throw new Error("Registro no encontrado");

  const [etapaGanada] = await db
    .select()
    .from(etapas)
    .where(and(eq(etapas.pipelineId, registro.pipelineId), eq(etapas.esGanada, true)));
  if (!etapaGanada) throw new Error("Este pipeline no tiene una etapa de venta ganada");

  const totalPagadoActual = await totalPagadoDe(input.registroId);
  const saldo = Math.max(0, input.montoTotal - (totalPagadoActual + input.montoCobrado));
  if (saldo > 0 && !input.proximaFechaCobro) {
    throw new Error("Queda saldo pendiente — debes indicar la fecha del próximo cobro.");
  }

  // 1) Fijar el total acordado de la venta.
  await actualizarValorRegistro(input.registroId, input.montoTotal, input.autorId);

  // 2) Mover a la etapa ganada (si no está ya).
  if (registro.etapaId !== etapaGanada.id) {
    await moverEtapa({ registroId: input.registroId, etapaId: etapaGanada.id, autorId: input.autorId });
  }

  // 3) Registrar el cobro de hoy.
  await registrarPago({
    registroId: input.registroId,
    monto: input.montoCobrado,
    nota: input.nota,
    proximaFechaCobro: input.proximaFechaCobro,
    metodoPago: input.metodoPago,
    autorId: input.autorId,
  });

  return estadoFinanciero(input.registroId);
}

// Estado financiero completo de un deal: cobrado/saldo/vencido siempre calculados a partir
// de los pagos reales, nunca guardados — así nunca se desincronizan con la caja.
export async function estadoFinanciero(registroId: string) {
  const [registro] = await db.select().from(registros).where(eq(registros.id, registroId));
  if (!registro) throw new Error("Registro no encontrado");

  const cobrado = await totalPagadoDe(registroId);
  const saldoPendiente = registro.valor != null ? Math.max(0, registro.valor - cobrado) : 0;
  const montoVencido =
    registro.fechaProximoPago && registro.fechaProximoPago < new Date() && saldoPendiente > 0
      ? (registro.proximoPago ?? 0)
      : 0;

  return {
    valorTotal: registro.valor,
    cobrado,
    saldoPendiente,
    proximoPago: registro.proximoPago,
    fechaProximoPago: registro.fechaProximoPago,
    metodoPago: registro.metodoPago,
    montoVencido,
  };
}

// Corregir/setear el plan de pagos (próximo pago, fecha, método) sin registrar un pago —
// útil para armar el plan por adelantado o corregir un dato mal cargado. No toca los pagos.
export async function actualizarPlanPago(
  registroId: string,
  plan: { proximoPago?: number | null; fechaProximoPago?: string | null; metodoPago?: string | null },
  autorId: string
) {
  const [registro] = await db.select().from(registros).where(eq(registros.id, registroId));
  if (!registro) throw new Error("Registro no encontrado");

  await db
    .update(registros)
    .set({
      proximoPago: "proximoPago" in plan ? (plan.proximoPago ?? null) : registro.proximoPago,
      fechaProximoPago:
        "fechaProximoPago" in plan
          ? plan.fechaProximoPago
            ? new Date(plan.fechaProximoPago)
            : null
          : registro.fechaProximoPago,
      metodoPago: "metodoPago" in plan ? (plan.metodoPago ?? null) : registro.metodoPago,
      updatedAt: new Date(),
    })
    .where(eq(registros.id, registroId));

  if (registro.personaId) {
    await db.insert(bitacoraAuditoria).values({
      id: crypto.randomUUID(),
      entidad: "Registro",
      entidadId: registroId,
      accion: "Plan de pagos actualizado",
      autorId,
      personaId: registro.personaId,
      fecha: new Date(),
    });
  }

  return estadoFinanciero(registroId);
}
