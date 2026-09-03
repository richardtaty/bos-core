"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarPipelines = listarPipelines;
exports.tableroKanban = tableroKanban;
exports.crearRegistro = crearRegistro;
exports.moverEtapa = moverEtapa;
exports.metricasPipeline = metricasPipeline;
exports.registrarPago = registrarPago;
exports.listarPagos = listarPagos;
exports.actualizarValorRegistro = actualizarValorRegistro;
exports.cerrarVenta = cerrarVenta;
exports.estadoFinanciero = estadoFinanciero;
exports.actualizarPlanPago = actualizarPlanPago;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
async function listarPipelines(opts) {
    const ids = opts?.departamentoIds ?? [];
    const filas = ids.length > 0
        ? await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pipelines.activo, true), (0, drizzle_orm_1.or)(...ids.map((id) => (0, drizzle_orm_1.eq)(schema_1.pipelines.departamentoId, id)))))
        : await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.activo, true));
    const resultado = [];
    for (const p of filas) {
        const etapasPipeline = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, p.id)).orderBy(schema_1.etapas.orden);
        resultado.push({ ...p, etapas: etapasPipeline });
    }
    return resultado;
}
async function totalPagadoDe(registroId) {
    const [fila] = await client_1.db.select({ total: (0, drizzle_orm_1.sum)(schema_1.pagos.monto) }).from(schema_1.pagos).where((0, drizzle_orm_1.eq)(schema_1.pagos.registroId, registroId));
    return Number(fila?.total ?? 0);
}
// Vista Kanban: registros agrupados por etapa, con el nombre de la persona y el estado de
// pago (total pagado / saldo pendiente) ya resueltos — nunca se guarda el saldo, siempre se calcula
// sumando los pagos reales contra el valor total del deal.
async function tableroKanban(pipelineId) {
    const [pipeline] = await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.id, pipelineId));
    if (!pipeline)
        throw new Error("Pipeline no encontrado");
    const etapasPipeline = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, pipelineId)).orderBy(schema_1.etapas.orden);
    const columnas = [];
    for (const etapa of etapasPipeline) {
        const registrosEtapa = await client_1.db
            .select({
            id: schema_1.registros.id,
            personaId: schema_1.registros.personaId,
            personaNombre: schema_1.personas.nombre,
            valor: schema_1.registros.valor,
            etapaId: schema_1.registros.etapaId,
            proximoPago: schema_1.registros.proximoPago,
            fechaProximoPago: schema_1.registros.fechaProximoPago,
            metodoPago: schema_1.registros.metodoPago,
        })
            .from(schema_1.registros)
            .leftJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.registros.personaId, schema_1.personas.id))
            .where((0, drizzle_orm_1.eq)(schema_1.registros.etapaId, etapa.id));
        const registrosConPago = await Promise.all(registrosEtapa.map(async (r) => {
            const totalPagado = await totalPagadoDe(r.id);
            const saldoPendiente = r.valor != null ? Math.max(0, r.valor - totalPagado) : null;
            const montoVencido = r.fechaProximoPago && r.fechaProximoPago < new Date() && saldoPendiente != null && saldoPendiente > 0
                ? (r.proximoPago ?? 0)
                : 0;
            return { ...r, totalPagado, saldoPendiente, montoVencido };
        }));
        columnas.push({ ...etapa, registros: registrosConPago });
    }
    return { ...pipeline, etapas: columnas };
}
async function crearRegistro(input) {
    const [primeraEtapa] = await client_1.db
        .select()
        .from(schema_1.etapas)
        .where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, input.pipelineId))
        .orderBy(schema_1.etapas.orden)
        .limit(1);
    if (!primeraEtapa)
        throw new Error("El pipeline no tiene etapas configuradas");
    const id = crypto.randomUUID();
    const ahora = new Date();
    await client_1.db.insert(schema_1.registros).values({
        id,
        pipelineId: input.pipelineId,
        personaId: input.personaId,
        etapaId: primeraEtapa.id,
        valor: input.valor,
        createdAt: ahora,
        updatedAt: ahora,
    });
    await client_1.db.insert(schema_1.historialEtapas).values({
        id: crypto.randomUUID(),
        registroId: id,
        etapaNuevaId: primeraEtapa.id,
        autorId: input.autorId,
        fecha: ahora,
    });
    const [registro] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, id));
    return registro;
}
// Corazón del motor de pipelines: valida la transición, aplica la regla de "motivo de pérdida
// obligatorio", y deja rastro inmutable en historial_etapas.
async function moverEtapa(input) {
    const [nuevaEtapa] = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.id, input.etapaId));
    if (!nuevaEtapa)
        throw new Error("Etapa no encontrada");
    if (nuevaEtapa.esPerdida && !input.motivoPerdida) {
        throw new Error("Debe indicar el motivo de pérdida para mover un registro a una etapa perdida");
    }
    const [registro] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, input.registroId));
    if (!registro)
        throw new Error("Registro no encontrado");
    const ahora = new Date();
    await client_1.db
        .update(schema_1.registros)
        .set({ etapaId: input.etapaId, motivoPerdida: nuevaEtapa.esPerdida ? input.motivoPerdida : null, updatedAt: ahora })
        .where((0, drizzle_orm_1.eq)(schema_1.registros.id, input.registroId));
    await client_1.db.insert(schema_1.historialEtapas).values({
        id: crypto.randomUUID(),
        registroId: input.registroId,
        etapaNuevaId: input.etapaId,
        autorId: input.autorId,
        fecha: ahora,
    });
    if (registro.personaId) {
        await client_1.db.insert(schema_1.bitacoraAuditoria).values({
            id: crypto.randomUUID(),
            entidad: "Registro",
            entidadId: input.registroId,
            accion: `Movido a etapa "${nuevaEtapa.nombre}"${input.motivoPerdida ? ` — motivo: ${input.motivoPerdida}` : ""}`,
            autorId: input.autorId,
            personaId: registro.personaId,
            fecha: ahora,
        });
    }
    const [actualizado] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, input.registroId));
    return actualizado;
}
// Métrica genérica reutilizada por las trece verticales: tasa de conversión y valor
// del pipeline abierto — la misma fórmula sin importar qué vertical la invoque.
async function metricasPipeline(pipelineId) {
    const etapasPipeline = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, pipelineId));
    const registrosPipeline = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, pipelineId));
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
async function registrarPago(input) {
    const [registro] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, input.registroId));
    if (!registro)
        throw new Error("Registro no encontrado");
    const totalPagadoActual = await totalPagadoDe(input.registroId);
    const nuevoTotalPagado = totalPagadoActual + input.monto;
    const saldoPendiente = registro.valor != null ? Math.max(0, registro.valor - nuevoTotalPagado) : 0;
    if (saldoPendiente > 0 && !input.proximaFechaCobro) {
        throw new Error("Queda saldo pendiente — debes indicar la fecha del próximo cobro.");
    }
    const pagoId = crypto.randomUUID();
    const fechaPago = input.fecha ? new Date(input.fecha) : new Date();
    await client_1.db.insert(schema_1.pagos).values({
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
    await client_1.db
        .update(schema_1.registros)
        .set({
        proximoPago,
        fechaProximoPago: saldoPendiente > 0 && input.proximaFechaCobro ? new Date(input.proximaFechaCobro) : null,
        metodoPago: saldoPendiente > 0 ? (input.metodoPago ?? null) : null,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.registros.id, input.registroId));
    let tareaCreada = null;
    if (saldoPendiente > 0 && registro.personaId && input.proximaFechaCobro) {
        const tareaId = crypto.randomUUID();
        await client_1.db.insert(schema_1.tareasSeguimiento).values({
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
        await client_1.db.insert(schema_1.bitacoraAuditoria).values({
            id: crypto.randomUUID(),
            entidad: "Pago",
            entidadId: pagoId,
            accion: saldoPendiente > 0
                ? `Pago registrado: $${input.monto.toLocaleString()} — saldo pendiente $${saldoPendiente.toLocaleString()}`
                : `Pago registrado: $${input.monto.toLocaleString()} — saldado por completo`,
            autorId: input.autorId,
            personaId: registro.personaId,
            fecha: fechaPago,
        });
    }
    return { pagoId, totalPagado: nuevoTotalPagado, saldoPendiente, tareaCreada };
}
async function listarPagos(registroId) {
    const filas = await client_1.db.select().from(schema_1.pagos).where((0, drizzle_orm_1.eq)(schema_1.pagos.registroId, registroId)).orderBy(schema_1.pagos.fecha);
    return filas;
}
// Corregir el precio total acordado de un trato ya creado — necesario porque los precios
// se negocian y a veces cambian después de creado el registro (renegociación, error de tipeo,
// descuento acordado después). Nunca toca los pagos ya registrados, solo el total contra el
// que se calcula el saldo.
async function actualizarValorRegistro(registroId, nuevoValor, autorId) {
    const [registro] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, registroId));
    if (!registro)
        throw new Error("Registro no encontrado");
    const valorAnterior = registro.valor;
    await client_1.db.update(schema_1.registros).set({ valor: nuevoValor, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.registros.id, registroId));
    if (registro.personaId) {
        await client_1.db.insert(schema_1.bitacoraAuditoria).values({
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
async function cerrarVenta(input) {
    const [registro] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, input.registroId));
    if (!registro)
        throw new Error("Registro no encontrado");
    const [etapaGanada] = await client_1.db
        .select()
        .from(schema_1.etapas)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, registro.pipelineId), (0, drizzle_orm_1.eq)(schema_1.etapas.esGanada, true)));
    if (!etapaGanada)
        throw new Error("Este pipeline no tiene una etapa de venta ganada");
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
async function estadoFinanciero(registroId) {
    const [registro] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, registroId));
    if (!registro)
        throw new Error("Registro no encontrado");
    const cobrado = await totalPagadoDe(registroId);
    const saldoPendiente = registro.valor != null ? Math.max(0, registro.valor - cobrado) : 0;
    const montoVencido = registro.fechaProximoPago && registro.fechaProximoPago < new Date() && saldoPendiente > 0
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
async function actualizarPlanPago(registroId, plan, autorId) {
    const [registro] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, registroId));
    if (!registro)
        throw new Error("Registro no encontrado");
    await client_1.db
        .update(schema_1.registros)
        .set({
        proximoPago: "proximoPago" in plan ? (plan.proximoPago ?? null) : registro.proximoPago,
        fechaProximoPago: "fechaProximoPago" in plan
            ? plan.fechaProximoPago
                ? new Date(plan.fechaProximoPago)
                : null
            : registro.fechaProximoPago,
        metodoPago: "metodoPago" in plan ? (plan.metodoPago ?? null) : registro.metodoPago,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.registros.id, registroId));
    if (registro.personaId) {
        await client_1.db.insert(schema_1.bitacoraAuditoria).values({
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
