import { and, eq, or, sum, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { pipelines, etapas, registros, historialEtapas, bitacoraAuditoria, personas, pagos, tareasSeguimiento, usuarios } from "../db/schema";

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

// Saldo pendiente de un trato: total pactado − lo cobrado, nunca negativo. Es `null` cuando el
// trato NO tiene total pactado — un pago recurrente puede no tenerlo (una suscripción no tiene
// "monto total del negocio"), y en ese caso no existe un saldo que calcular: el sistema no
// inventa uno a partir de un número ficticio. Se usa un solo helper para que esta regla sea
// idéntica en todos los caminos y no se desincronice según por dónde pase el código.
function saldoDe(registro: { valor: number | null }, pagado: number): number | null {
  return registro.valor != null ? Math.max(0, registro.valor - pagado) : null;
}

// Inserta un pago respetando la clave de idempotencia. Devuelve el id del pago recién creado, o
// el id del pago que YA existía con esa clave si dos requests llegaron a la vez (el índice único
// `pagos_idempotencia_uq` deja pasar a uno solo, y el segundo cae aquí).
//
// Vive en UNA sola función a propósito: es la protección contra cobrar dos veces la misma plata,
// y el camino normal y el recurrente deben compartir exactamente la misma defensa — dos copias
// terminarían divergiendo.
async function insertarPagoIdempotente(input: {
  registroId: string;
  monto: number;
  nota?: string;
  autorId: string;
  fechaPago: Date;
  idempotencyKey?: string;
}): Promise<{ pagoId: string; yaExistia: boolean }> {
  const pagoId = crypto.randomUUID();
  try {
    await db.insert(pagos).values({
      id: pagoId,
      registroId: input.registroId,
      monto: input.monto,
      nota: input.nota,
      autorId: input.autorId,
      fecha: input.fechaPago,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    return { pagoId, yaExistia: false };
  } catch (err) {
    if (input.idempotencyKey && err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      const [existente] = await db
        .select()
        .from(pagos)
        .where(and(eq(pagos.idempotencyKey, input.idempotencyKey), eq(pagos.registroId, input.registroId)));
      if (existente) return { pagoId: existente.id, yaExistia: true };
    }
    throw err;
  }
}

// Texto en español de una modalidad, para la bitácora (que la lee una persona, no un programa).
const ETIQUETA_MODALIDAD: Record<string, string> = {
  PAGO_UNICO: "pago único",
  ABONOS: "varios abonos",
  RECURRENTE: "pago recurrente",
};

function etiquetaModalidad(modalidad: string | null): string {
  return modalidad ? (ETIQUETA_MODALIDAD[modalidad] ?? modalidad) : "sin definir";
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
        modalidadPago: registros.modalidadPago,
        montoRecurrente: registros.montoRecurrente,
        frecuenciaRecurrente: registros.frecuenciaRecurrente,
      })
      .from(registros)
      .leftJoin(personas, eq(registros.personaId, personas.id))
      .where(eq(registros.etapaId, etapa.id));

    const registrosConPago = await Promise.all(
      registrosEtapa.map(async (r) => {
        const totalPagado = await totalPagadoDe(r.id);
        const saldoPendiente = saldoDe(r, totalPagado);
        // "Vencido" = hay una fecha de próximo cobro que ya pasó y todavía queda algo por cobrar.
        // En un RECURRENTE sin total pactado no hay saldo, y sin esta condición un mes sin pagar
        // nunca se marcaría en rojo — justo el caso más probable de una suscripción. Para el
        // resto de modalidades la regla es exactamente la que ya existía.
        const quedaPorCobrar =
          saldoPendiente != null ? saldoPendiente > 0 : r.modalidadPago === "RECURRENTE";
        const montoVencido =
          r.fechaProximoPago && r.fechaProximoPago < new Date() && quedaPorCobrar
            ? (r.proximoPago ?? r.montoRecurrente ?? 0)
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

// Resumen de Ventas (vista principal de Sala de OFERTAS): las ventas GANADAS visibles para el
// usuario, con lo esencial de cada una — qué se vendió (pipeline), a quién (cliente), por cuánto
// (valor total del deal), cuánto se ha pagado (suma real de pagos), cuánto falta (saldo, siempre
// calculado, nunca guardado), quién la cerró (autor de la entrada del historial que la movió a la
// etapa ganada = "asesor que cerró la venta") y cuándo. SOLO LECTURA: no modifica datos ni registra
// nada. El alcance copia a listarPipelines (SUPER_ADMIN ve todas las unidades; el resto, solo los
// pipelines de sus departamentos). Ordenadas de la más reciente a la más antigua, con tope.
export async function resumenVentas(opts?: { departamentoIds?: string[]; limite?: number }) {
  const pipelinesVisibles = await listarPipelines({ departamentoIds: opts?.departamentoIds });

  const etapaGanadaPorId = new Map<string, { pipelineId: string; pipelineNombre: string; etapaNombre: string }>();
  for (const p of pipelinesVisibles) {
    for (const e of p.etapas) {
      if (e.esGanada) etapaGanadaPorId.set(e.id, { pipelineId: p.id, pipelineNombre: p.nombre, etapaNombre: e.nombre });
    }
  }
  const idsEtapasGanadas = [...etapaGanadaPorId.keys()];
  if (idsEtapasGanadas.length === 0) return [];

  const ganados = await db
    .select({
      id: registros.id,
      pipelineId: registros.pipelineId,
      etapaId: registros.etapaId,
      personaId: registros.personaId,
      personaNombre: personas.nombre,
      valor: registros.valor,
      responsablePersonaNombre: usuarios.nombre,
      updatedAt: registros.updatedAt,
    })
    .from(registros)
    .leftJoin(personas, eq(registros.personaId, personas.id))
    .leftJoin(usuarios, eq(usuarios.id, personas.responsableId))
    .where(inArray(registros.etapaId, idsEtapasGanadas));

  if (ganados.length === 0) return [];
  const idsRegistros = ganados.map((g) => g.id);

  const pagosPorRegistro = new Map<string, number>();
  const filasPagos = await db
    .select({ registroId: pagos.registroId, total: sum(pagos.monto) })
    .from(pagos)
    .where(inArray(pagos.registroId, idsRegistros))
    .groupBy(pagos.registroId);
  for (const f of filasPagos) pagosPorRegistro.set(f.registroId, Number(f.total ?? 0));

  // Responsable y fecha de cierre: la entrada del historial que movió el deal a la etapa GANADA
  // (un deal ganado tiene esa entrada; si no, se usa el responsable del cliente como respaldo).
  const cierres = await db
    .select({
      registroId: historialEtapas.registroId,
      autorId: historialEtapas.autorId,
      autorNombre: usuarios.nombre,
      fecha: historialEtapas.fecha,
    })
    .from(historialEtapas)
    .innerJoin(usuarios, eq(historialEtapas.autorId, usuarios.id))
    .where(inArray(historialEtapas.etapaNuevaId, idsEtapasGanadas));

  const cierrePorRegistro = new Map<string, { autorId: string; autorNombre: string; fecha: Date }>();
  for (const c of cierres) {
    const previo = cierrePorRegistro.get(c.registroId);
    if (!previo || c.fecha >= previo.fecha) {
      cierrePorRegistro.set(c.registroId, { autorId: c.autorId, autorNombre: c.autorNombre, fecha: c.fecha });
    }
  }

  return ganados
    .map((g) => {
      const meta = etapaGanadaPorId.get(g.etapaId);
      const totalPagado = pagosPorRegistro.get(g.id) ?? 0;
      const saldoPendiente = g.valor != null ? Math.max(0, g.valor - totalPagado) : null;
      const cierre = cierrePorRegistro.get(g.id);
      return {
        id: g.id,
        pipelineId: g.pipelineId,
        pipelineNombre: meta?.pipelineNombre ?? null,
        etapaNombre: meta?.etapaNombre ?? null,
        personaId: g.personaId,
        personaNombre: g.personaNombre,
        valor: g.valor,
        totalPagado,
        saldoPendiente,
        pagadaCompleta: g.valor != null && totalPagado >= g.valor,
        responsableId: cierre?.autorId ?? null,
        responsableNombre: cierre?.autorNombre ?? g.responsablePersonaNombre ?? null,
        fechaVenta: cierre?.fecha ?? g.updatedAt,
      };
    })
    .sort((a, b) => new Date(b.fechaVenta).getTime() - new Date(a.fechaVenta).getTime())
    .slice(0, opts?.limite ?? 50);
}

// Registrar un pago (abono/cuota) contra un registro — la ÚNICA forma de crear dinero hoy.
// Los pagos son la fuente de verdad financiera: el saldo se calcula como total − SUM(pagos),
// nunca se guarda, y un cambio de etapa jamás crea un pago.
//
// Primer pago de un trato sin total: recibe "montoTotal", que queda fijado en registros.valor
// (el flujo normal ya no vuelve a pedirlo). Protecciones:
//  - No se permite sobrepagar (abono > saldo pendiente).
//  - Clave de idempotencia (idempotencyKey): un doble clic o reintento con la misma clave no
//    crea un segundo pago — el índice único de pagos lo descarta y se devuelve el ya existente.
//
// ÚNICA excepción a "hay que indicar el monto total": un trato marcado como PAGO RECURRENTE que
// no tiene total pactado (ver el caso 3 más abajo). Se resuelve con una salida temprana propia
// para que el camino de pago único / varios abonos — el 99% de los cobros — quede intacto.
export async function registrarPago(input: {
  registroId: string;
  monto: number;
  montoTotal?: number;
  nota?: string;
  proximaFechaCobro?: string;
  proximoPago?: number;
  metodoPago?: string;
  fecha?: string;
  autorId: string;
  idempotencyKey?: string;
}) {
  const [registro] = await db.select().from(registros).where(eq(registros.id, input.registroId));
  if (!registro) throw new Error("Registro no encontrado");

  const totalPagadoActual = await totalPagadoDe(input.registroId);

  // 1) Idempotencia: si esta clave ya generó un pago, devolver ese pago en vez de duplicarlo.
  if (input.idempotencyKey) {
    const existentes = await db
      .select()
      .from(pagos)
      .where(and(eq(pagos.idempotencyKey, input.idempotencyKey), eq(pagos.registroId, input.registroId)));
    if (existentes.length > 0) {
      const pagado = await totalPagadoDe(input.registroId);
      return {
        pagoId: existentes[0].id,
        valor: registro.valor,
        totalPagado: pagado,
        saldoPendiente: saldoDe(registro, pagado),
        tareaCreada: null,
      };
    }
  }

  // 3) PAGO RECURRENTE sin total pactado.
  // Una suscripción no tiene "monto total del negocio", así que exigirlo obligaría a inventar un
  // número falso — y ese número falso después contamina el Resumen de Ventas, el valor abierto
  // del Pipeline y los reportes de ingresos. Aquí el cobro se registra tal cual: sin total, sin
  // saldo (no hay contra qué comparar) y sin guarda de sobrepago. `registros.valor` NUNCA se
  // escribe. Se sale por aquí antes de tocar el camino normal, que queda intacto.
  if (registro.valor == null && registro.modalidadPago === "RECURRENTE") {
    const fechaPago = input.fecha ? new Date(input.fecha) : new Date();
    const { pagoId, yaExistia } = await insertarPagoIdempotente({
      registroId: input.registroId,
      monto: input.monto,
      nota: input.nota,
      autorId: input.autorId,
      fechaPago,
      idempotencyKey: input.idempotencyKey,
    });
    if (yaExistia) {
      return {
        pagoId,
        valor: null,
        totalPagado: await totalPagadoDe(input.registroId),
        saldoPendiente: null,
        tareaCreada: null,
      };
    }

    const nuevoTotalPagado = totalPagadoActual + input.monto;
    const montoProximoCobro = input.proximoPago ?? registro.montoRecurrente ?? input.monto;

    // Plan de cobro: solo se toca lo que el usuario mandó, y a diferencia del camino normal NO
    // se limpia lo que ya estaba — un trato recurrente no se "salda" nunca, así que no hay motivo
    // para borrar el próximo cobro ni el método.
    await db
      .update(registros)
      .set({
        proximoPago: montoProximoCobro,
        fechaProximoPago: input.proximaFechaCobro ? new Date(input.proximaFechaCobro) : registro.fechaProximoPago,
        metodoPago: input.metodoPago ?? registro.metodoPago,
        updatedAt: new Date(),
      })
      .where(eq(registros.id, input.registroId));

    // Recordatorio del próximo período: el mismo mecanismo que ya usa cualquier cobro con saldo,
    // sin inventar nada nuevo. Nunca se crea un PAGO futuro — solo la tarea de cobro.
    let tareaCreada: string | null = null;
    if (registro.personaId && input.proximaFechaCobro) {
      const tareaId = crypto.randomUUID();
      await db.insert(tareasSeguimiento).values({
        id: tareaId,
        personaId: registro.personaId,
        fecha: new Date(input.proximaFechaCobro),
        nota: `Cobro recurrente de $${montoProximoCobro.toLocaleString()} (próximo pago)`,
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
        accion: `Pago recurrente registrado: $${input.monto.toLocaleString()} — sin total pactado`,
        autorId: input.autorId,
        personaId: registro.personaId,
        fecha: fechaPago,
      });
    }

    return { pagoId, valor: null, totalPagado: nuevoTotalPagado, saldoPendiente: null, tareaCreada };
  }

  // 2) Total del trato: se fija o corrige SOLO mientras no haya pagos. Con pagos, queda fijo.
  let totalEfectivo: number;
  if (registro.valor == null) {
    if (!input.montoTotal) {
      throw new Error("Este trato no tiene monto total — indica el monto total del negocio para registrar el primer pago.");
    }
    totalEfectivo = input.montoTotal;
  } else if (totalPagadoActual === 0 && input.montoTotal != null && Math.abs(input.montoTotal - registro.valor) > 0.001) {
    // Corrección del total antes del primer pago (error de tipeo o renegociación previa al cobro).
    totalEfectivo = input.montoTotal;
  } else if (input.montoTotal != null && Math.abs(input.montoTotal - registro.valor) > 0.001) {
    throw new Error("El monto total ya quedó definido — corregirlo es una acción de SUPER ADMIN.");
  } else {
    totalEfectivo = registro.valor;
  }

  // 3) Guarda de sobrepago: el abono nunca puede superar el saldo pendiente.
  const saldoActual = Math.max(0, totalEfectivo - totalPagadoActual);
  if (input.monto > saldoActual + 0.001) {
    throw new Error(`El abono supera el saldo pendiente de $${saldoActual.toLocaleString()}.`);
  }

  const nuevoTotalPagado = totalPagadoActual + input.monto;
  const saldoPendiente = Math.max(0, totalEfectivo - nuevoTotalPagado);

  if (saldoPendiente > 0 && !input.proximaFechaCobro) {
    throw new Error("Queda saldo pendiente — debes indicar la fecha del próximo cobro.");
  }

  const fechaPago = input.fecha ? new Date(input.fecha) : new Date();

  // Dos requests simultáneos con la misma clave: el índice único dejó pasar a uno solo. Se
  // devuelve el pago que ya quedó registrado en lugar de crear un duplicado.
  const { pagoId, yaExistia } = await insertarPagoIdempotente({
    registroId: input.registroId,
    monto: input.monto,
    nota: input.nota,
    autorId: input.autorId,
    fechaPago,
    idempotencyKey: input.idempotencyKey,
  });
  if (yaExistia) {
    const pagado = await totalPagadoDe(input.registroId);
    return {
      pagoId,
      valor: registro.valor,
      totalPagado: pagado,
      saldoPendiente: saldoDe(registro, pagado),
      tareaCreada: null,
    };
  }

  // Actualizar el total si hace falta (primera definición o corrección previa a pagos) y el
  // plan de pagos del deal: si queda saldo, guardar próximo pago + método; si se saldó por
  // completo, limpiar el plan (ya no hay nada que cobrar).
  const cambiaValor = registro.valor == null || Math.abs(totalEfectivo - registro.valor) > 0.001;
  const proximoPago = saldoPendiente > 0 ? (input.proximoPago ?? saldoPendiente) : null;
  await db
    .update(registros)
    .set({
      ...(cambiaValor ? { valor: totalEfectivo } : {}),
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

  return { pagoId, valor: totalEfectivo, totalPagado: nuevoTotalPagado, saldoPendiente, tareaCreada };
}

export async function listarPagos(registroId: string) {
  const filas = await db.select().from(pagos).where(eq(pagos.registroId, registroId)).orderBy(pagos.fecha);
  return filas;
}

// Corregir el monto total acordado de un trato ya creado. Mientras el trato NO tenga pagos,
// cualquier miembro del equipo puede ajustarlo (error de tipeo o renegociación previa al
// cobro). Una vez que existe al menos un pago, el total queda fijo en el flujo normal y solo
// un SUPER ADMIN puede corregirlo — y nunca por debajo de lo ya pagado (evita inventar saldos
// negativos). Nunca toca los pagos, solo el total contra el que se calcula el saldo.
export async function actualizarValorRegistro(registroId: string, nuevoValor: number, autorId: string, rol: string) {
  const [registro] = await db.select().from(registros).where(eq(registros.id, registroId));
  if (!registro) throw new Error("Registro no encontrado");

  const totalPagado = await totalPagadoDe(registroId);
  if (totalPagado > 0 && rol !== "SUPER_ADMIN") {
    throw new Error("Solo un SUPER ADMIN puede corregir el monto total una vez que hay pagos registrados.");
  }
  if (nuevoValor < totalPagado - 0.001) {
    throw new Error(`El monto total no puede quedar por debajo de lo ya pagado ($${totalPagado.toLocaleString()}).`);
  }

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

  const saldoPendiente = Math.max(0, nuevoValor - totalPagado);
  return { valor: nuevoValor, totalPagado, saldoPendiente };
}

// Estado financiero completo de un deal: cobrado/saldo/vencido siempre calculados a partir
// de los pagos reales, nunca guardados — así nunca se desincronizan con la caja.
//
// NOTA sobre PAGO RECURRENTE sin total pactado: `valorTotal` es null y `saldoPendiente` sigue
// siendo 0 (no `null`). No es un descuido: este es el contrato que ya consume un agente externo
// (GET /api/agente/registros/:id/financiero) y no se cambia aquí. En un recurrente, ese 0
// significa "sin total pactado", NO "ya está pagado". El tablero del Pipeline sí distingue los
// dos casos y muestra el saldo como "—".
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

// Eliminar UN registro de pago incorrecto o duplicado — ÚNICO uso: el SUPER ADMIN corrigiendo
// la caja (la ruta ya exige ese rol). Borra solo esa fila de pagos: nunca toca el registro
// (deal), el cliente ni los demás pagos. El "Pagado"/saldo del pipeline y todos los totales
// del Reporte de Ventas se recalculan solos porque se derivan de los pagos existentes.
export async function eliminarPago(pagoId: string, autorId: string, registroId?: string) {
  const [pago] = await db.select().from(pagos).where(eq(pagos.id, pagoId));
  if (!pago) throw new Error("Pago no encontrado");
  if (registroId && pago.registroId !== registroId) {
    throw new Error("El pago no pertenece a ese registro");
  }

  const [registro] = await db.select().from(registros).where(eq(registros.id, pago.registroId));

  await db.delete(pagos).where(eq(pagos.id, pagoId));

  if (registro?.personaId) {
    const montoTexto = `$${pago.monto.toLocaleString()}`;
    await db.insert(bitacoraAuditoria).values({
      id: crypto.randomUUID(),
      entidad: "Pago",
      entidadId: pago.id,
      accion: `Registro financiero eliminado por SUPER ADMIN — ${montoTexto}`,
      autorId,
      personaId: registro.personaId,
      detalle: `Pago eliminado: monto ${montoTexto} · fecha ${
        pago.fecha instanceof Date ? pago.fecha.toISOString() : String(pago.fecha)
      } · id ${pago.id}`,
      fecha: new Date(),
    });
  }

  return estadoFinanciero(pago.registroId);
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

// Configurar CÓMO se cobra una oportunidad: pago único, varios abonos o pago recurrente.
//
// Es información FINANCIERA del trato, no una etapa comercial: no mueve dinero, no crea ni borra
// pagos, no cambia de etapa y no toca el plan de cobro (`proximoPago`/`fechaProximoPago`/
// `metodoPago` tienen su propia ruta y una sola dueña — si esta función los escribiera habría
// dos fuentes de verdad sobre lo mismo). Escribe solo sus tres columnas.
//
// La puede cambiar cualquier miembro: se puede configurar antes de cobrar y también con cobros ya
// registrados, y cambiar de modalidad no altera ningún número (los pagos y el total siguen
// siendo los mismos). Cada cambio queda en la bitácora para poder rastrearlo.
//
// `modalidad: null` la borra y deja el trato "sin definir" otra vez — el estado en el que están
// todos los tratos que ya existían, porque el sistema no adivina cómo se cobra cada uno.
export async function actualizarModalidadPago(
  registroId: string,
  entrada: {
    modalidad: "PAGO_UNICO" | "ABONOS" | "RECURRENTE" | null;
    montoRecurrente?: number | null;
    frecuenciaRecurrente?: string | null;
  },
  autorId: string
) {
  const [registro] = await db.select().from(registros).where(eq(registros.id, registroId));
  if (!registro) throw new Error("Registro no encontrado");

  const esRecurrente = entrada.modalidad === "RECURRENTE";
  if (esRecurrente && (entrada.montoRecurrente == null || !entrada.frecuenciaRecurrente)) {
    // La ruta ya lo valida con zod (mensaje legible en pantalla); esto es la red de seguridad
    // para cualquier llamada interna, porque un recurrente sin monto ni frecuencia no se podría
    // cobrar ni recordar.
    throw new Error("Un pago recurrente necesita el monto por período y cada cuánto se cobra.");
  }

  const modalidadAnterior = registro.modalidadPago;

  await db
    .update(registros)
    .set({
      modalidadPago: entrada.modalidad,
      // El plan por período solo existe en un recurrente. En cualquier otra modalidad se limpia,
      // para no dejar pegado un monto/frecuencia que ya no describen nada.
      montoRecurrente: esRecurrente ? (entrada.montoRecurrente ?? null) : null,
      frecuenciaRecurrente: esRecurrente ? (entrada.frecuenciaRecurrente ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(registros.id, registroId));

  if (registro.personaId) {
    await db.insert(bitacoraAuditoria).values({
      id: crypto.randomUUID(),
      entidad: "Registro",
      entidadId: registroId,
      accion: `Modalidad de pago: ${etiquetaModalidad(modalidadAnterior)} → ${etiquetaModalidad(entrada.modalidad)}`,
      autorId,
      personaId: registro.personaId,
      fecha: new Date(),
    });
  }

  const [actualizado] = await db.select().from(registros).where(eq(registros.id, registroId));
  return actualizado;
}
