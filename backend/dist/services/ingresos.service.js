"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOfertas = getOfertas;
exports.getVentasIngresos = getVentasIngresos;
exports.getEgresos = getEgresos;
exports.createVentaIngreso = createVentaIngreso;
exports.deleteVentaIngreso = deleteVentaIngreso;
exports.createEgreso = createEgreso;
exports.deleteEgreso = deleteEgreso;
exports.resumenMensual = resumenMensual;
exports.resumenHoy = resumenHoy;
exports.ventasPorOferta = ventasPorOferta;
exports.tickerIngresos = tickerIngresos;
exports.adelantosPendientes = adelantosPendientes;
exports.egresosPorCategoria = egresosPorCategoria;
exports.rentabilidadPorLinea = rentabilidadPorLinea;
exports.actividadReciente = actividadReciente;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
// ─── Helpers de fecha ──────────────────────────────────
function inicioDeMes(ym) {
    if (ym)
        return `${ym}-01`;
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-01`;
}
function hoy() {
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}
function asNumber(v) {
    return Number(v ?? 0);
}
// ─── Ofertas ───────────────────────────────────────────
async function getOfertas() {
    return client_1.db.select().from(schema_1.ofertas).orderBy(schema_1.ofertas.nombre);
}
// ─── Ventas (ingresos) ────────────────────────────────
async function getVentasIngresos(ym) {
    const condiciones = [];
    if (ym) {
        const inicio = inicioDeMes(ym);
        const [y, m] = ym.split("-").map(Number);
        const fin = `${y}-${String(m).padStart(2, "0")}-31`;
        condiciones.push((0, drizzle_orm_1.gte)(schema_1.ventasIngresos.fecha, inicio));
        condiciones.push((0, drizzle_orm_1.lte)(schema_1.ventasIngresos.fecha, fin));
    }
    // Ventas manuales
    const manuales = await client_1.db
        .select({
        id: schema_1.ventasIngresos.id,
        fecha: schema_1.ventasIngresos.fecha,
        ofertaId: schema_1.ventasIngresos.ofertaId,
        ofertaNombre: schema_1.ofertas.nombre,
        monto: schema_1.ventasIngresos.monto,
        nota: schema_1.ventasIngresos.nota,
        esAnticipo: schema_1.ventasIngresos.esAnticipo,
        totalDeal: schema_1.ventasIngresos.totalDeal,
        autorId: schema_1.ventasIngresos.autorId,
        autorNombre: schema_1.usuarios.nombre,
    })
        .from(schema_1.ventasIngresos)
        .innerJoin(schema_1.ofertas, (0, drizzle_orm_1.eq)(schema_1.ventasIngresos.ofertaId, schema_1.ofertas.id))
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.ventasIngresos.autorId, schema_1.usuarios.id))
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.ventasIngresos.fecha));
    // Pagos del pipeline (unificados)
    let pipelinePagos = [];
    if (ym) {
        const inicio = inicioDeMes(ym);
        const [y, m] = ym.split("-").map(Number);
        const fin = `${y}-${String(m).padStart(2, "0")}-31`;
        const inicioMesDate = new Date(`${inicio}T00:00:00`);
        const finMesDate = new Date(`${fin}T23:59:59.999`);
        pipelinePagos = await client_1.db
            .select({
            id: schema_1.pagos.id,
            fecha: schema_1.pagos.fecha,
            pipelineId: schema_1.registros.pipelineId,
            pipelineNombre: schema_1.pipelines.nombre,
            monto: schema_1.pagos.monto,
            nota: schema_1.pagos.nota,
            personaNombre: schema_1.personas.nombre,
            autorId: schema_1.pagos.autorId,
            autorNombre: schema_1.usuarios.nombre,
        })
            .from(schema_1.pagos)
            .innerJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.pagos.registroId, schema_1.registros.id))
            .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
            .leftJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.registros.personaId, schema_1.personas.id))
            .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.pagos.autorId, schema_1.usuarios.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicioMesDate), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, finMesDate)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.pagos.fecha));
    }
    else {
        pipelinePagos = await client_1.db
            .select({
            id: schema_1.pagos.id,
            fecha: schema_1.pagos.fecha,
            pipelineId: schema_1.registros.pipelineId,
            pipelineNombre: schema_1.pipelines.nombre,
            monto: schema_1.pagos.monto,
            nota: schema_1.pagos.nota,
            personaNombre: schema_1.personas.nombre,
            autorId: schema_1.pagos.autorId,
            autorNombre: schema_1.usuarios.nombre,
        })
            .from(schema_1.pagos)
            .innerJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.pagos.registroId, schema_1.registros.id))
            .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
            .leftJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.registros.personaId, schema_1.personas.id))
            .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.pagos.autorId, schema_1.usuarios.id))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.pagos.fecha));
    }
    // Mapear pagos del pipeline al mismo formato que ventasIngresos
    const pagosMapeados = pipelinePagos.map((p) => ({
        id: p.id,
        fecha: typeof p.fecha === "string" ? p.fecha : p.fecha.toISOString().slice(0, 10),
        ofertaId: p.pipelineId,
        ofertaNombre: p.personaNombre
            ? `${p.pipelineNombre} — ${p.personaNombre}`
            : p.pipelineNombre,
        monto: p.monto,
        nota: p.nota,
        esAnticipo: false,
        totalDeal: null,
        autorId: p.autorId,
        autorNombre: p.autorNombre,
        fuente: "pipeline",
    }));
    // Unificar y ordenar por fecha descendente
    const unificados = [...manuales, ...pagosMapeados]
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    return unificados;
}
// ─── Egresos ───────────────────────────────────────────
async function getEgresos(ym) {
    const condiciones = [];
    if (ym) {
        const inicio = inicioDeMes(ym);
        const [y, m] = ym.split("-").map(Number);
        const fin = `${y}-${String(m).padStart(2, "0")}-31`;
        condiciones.push((0, drizzle_orm_1.gte)(schema_1.egresos.fecha, inicio));
        condiciones.push((0, drizzle_orm_1.lte)(schema_1.egresos.fecha, fin));
    }
    return client_1.db
        .select({
        id: schema_1.egresos.id,
        fecha: schema_1.egresos.fecha,
        categoria: schema_1.egresos.categoria,
        ofertaId: schema_1.egresos.ofertaId,
        ofertaNombre: schema_1.ofertas.nombre,
        monto: schema_1.egresos.monto,
        nota: schema_1.egresos.nota,
        autorId: schema_1.egresos.autorId,
        autorNombre: schema_1.usuarios.nombre,
    })
        .from(schema_1.egresos)
        .leftJoin(schema_1.ofertas, (0, drizzle_orm_1.eq)(schema_1.egresos.ofertaId, schema_1.ofertas.id))
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.egresos.autorId, schema_1.usuarios.id))
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.egresos.fecha));
}
// ─── Crear / eliminar ─────────────────────────────────
async function createVentaIngreso(data) {
    if (!data.fecha || !data.ofertaId || !data.monto) {
        throw new Error("Fecha, oferta y monto son obligatorios");
    }
    if (data.esAnticipo && !data.totalDeal) {
        throw new Error("Si es anticipo, el total del deal es obligatorio");
    }
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.ventasIngresos).values({
        id,
        fecha: data.fecha,
        ofertaId: data.ofertaId,
        monto: data.monto,
        nota: data.nota ?? null,
        esAnticipo: data.esAnticipo ?? false,
        totalDeal: data.totalDeal ?? null,
        autorId: data.autorId,
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "venta_ingreso",
        entidadId: id,
        accion: "crear",
        autorId: data.autorId,
        detalle: `Venta de $${data.monto.toLocaleString("en-US")}`,
    });
    return { id };
}
async function deleteVentaIngreso(id, autorId) {
    const [existe] = await client_1.db.select().from(schema_1.ventasIngresos).where((0, drizzle_orm_1.eq)(schema_1.ventasIngresos.id, id));
    if (!existe)
        throw new Error("Venta no encontrada");
    await client_1.db.delete(schema_1.ventasIngresos).where((0, drizzle_orm_1.eq)(schema_1.ventasIngresos.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "venta_ingreso",
        entidadId: id,
        accion: "eliminar",
        autorId,
        detalle: "Venta eliminada",
    });
    return { ok: true };
}
async function createEgreso(data) {
    if (!data.fecha || !data.categoria || !data.monto) {
        throw new Error("Fecha, categoría y monto son obligatorios");
    }
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.egresos).values({
        id,
        fecha: data.fecha,
        categoria: data.categoria,
        monto: data.monto,
        ofertaId: data.ofertaId ?? null,
        nota: data.nota ?? null,
        autorId: data.autorId,
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "egreso",
        entidadId: id,
        accion: "crear",
        autorId: data.autorId,
        detalle: `Egreso de $${data.monto.toLocaleString("en-US")} — ${data.categoria}`,
    });
    return { id };
}
async function deleteEgreso(id, autorId) {
    const [existe] = await client_1.db.select().from(schema_1.egresos).where((0, drizzle_orm_1.eq)(schema_1.egresos.id, id));
    if (!existe)
        throw new Error("Egreso no encontrado");
    await client_1.db.delete(schema_1.egresos).where((0, drizzle_orm_1.eq)(schema_1.egresos.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "egreso",
        entidadId: id,
        accion: "eliminar",
        autorId,
        detalle: "Egreso eliminado",
    });
    return { ok: true };
}
// ─── Resumen del mes ──────────────────────────────────
async function resumenMensual(ym) {
    const inicio = inicioDeMes(ym);
    const ahora = ym ? new Date(`${ym}-01`) : new Date();
    const y = ahora.getFullYear();
    const m = ahora.getMonth() + 1;
    const fin = `${y}-${String(m).padStart(2, "0")}-31`;
    // Ventas manuales (motor de ingresos)
    const [facturadoManual] = await client_1.db
        .select({ total: (0, drizzle_orm_1.sum)(schema_1.ventasIngresos.monto) })
        .from(schema_1.ventasIngresos)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.ventasIngresos.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.ventasIngresos.fecha, fin)));
    // Pagos reales del pipeline (unificado)
    const inicioMesDate = new Date(`${inicio}T00:00:00`);
    const finMesDate = new Date(`${fin}T23:59:59.999`);
    const [facturadoPipeline] = await client_1.db
        .select({ total: (0, drizzle_orm_1.sum)(schema_1.pagos.monto) })
        .from(schema_1.pagos)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicioMesDate), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, finMesDate)));
    const [gastos] = await client_1.db
        .select({ total: (0, drizzle_orm_1.sum)(schema_1.egresos.monto) })
        .from(schema_1.egresos)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.egresos.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.egresos.fecha, fin)));
    const todas = await client_1.db.select({ target: schema_1.ofertas.target }).from(schema_1.ofertas);
    const metaMensual = todas.reduce((s, o) => s + o.target, 0);
    const facturadoVal = asNumber(facturadoManual?.total) + asNumber(facturadoPipeline?.total);
    const gastosVal = asNumber(gastos?.total);
    const gananciaNeta = facturadoVal - gastosVal;
    const pctMeta = metaMensual > 0 ? Math.round((facturadoVal / metaMensual) * 100) : 0;
    const margen = facturadoVal > 0 ? Math.round((gananciaNeta / facturadoVal) * 100) : 0;
    return {
        mes: ym ?? `${y}-${String(m).padStart(2, "0")}`,
        metaMensual,
        facturado: facturadoVal,
        pctMeta,
        gastos: gastosVal,
        gananciaNeta,
        margen,
    };
}
// ─── Resumen HOY ──────────────────────────────────────
async function resumenHoy() {
    const dia = hoy();
    // Ventas manuales del día
    const [facturadoManual] = await client_1.db
        .select({ total: (0, drizzle_orm_1.sum)(schema_1.ventasIngresos.monto) })
        .from(schema_1.ventasIngresos)
        .where((0, drizzle_orm_1.eq)(schema_1.ventasIngresos.fecha, dia));
    // Pagos reales del pipeline hoy
    const inicioHoy = new Date(`${dia}T00:00:00`);
    const finHoy = new Date(`${dia}T23:59:59.999`);
    const [facturadoPipeline] = await client_1.db
        .select({ total: (0, drizzle_orm_1.sum)(schema_1.pagos.monto) })
        .from(schema_1.pagos)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicioHoy), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, finHoy)));
    const facturadoHoy = asNumber(facturadoManual?.total) + asNumber(facturadoPipeline?.total);
    const metaDiaria = 10000;
    const pct = Math.round((facturadoHoy / metaDiaria) * 100);
    return {
        fecha: dia,
        facturado: facturadoHoy,
        metaDiaria,
        pct,
        cumplida: facturadoHoy >= metaDiaria,
    };
}
// ─── Ventas por oferta (progreso vs meta) ─────────────
async function ventasPorOferta(ym) {
    const inicio = inicioDeMes(ym);
    const ahora = ym ? new Date(`${ym}-01`) : new Date();
    const y = ahora.getFullYear();
    const m = ahora.getMonth() + 1;
    const fin = `${y}-${String(m).padStart(2, "0")}-31`;
    const todas = await client_1.db.select().from(schema_1.ofertas).orderBy(schema_1.ofertas.nombre);
    // ── Pagos del pipeline agrupados por pipeline ──
    const inicioMesDate = new Date(`${inicio}T00:00:00`);
    const finMesDate = new Date(`${fin}T23:59:59.999`);
    const pagosPorPipeline = await client_1.db
        .select({
        pipelineNombre: schema_1.pipelines.nombre,
        total: (0, drizzle_orm_1.sum)(schema_1.pagos.monto),
    })
        .from(schema_1.pagos)
        .innerJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.pagos.registroId, schema_1.registros.id))
        .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicioMesDate), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, finMesDate)))
        .groupBy(schema_1.pipelines.nombre);
    const resultados = await Promise.all(todas.map(async (o) => {
        // Ventas manuales de esta oferta
        const [totalManual] = await client_1.db
            .select({ total: (0, drizzle_orm_1.sum)(schema_1.ventasIngresos.monto) })
            .from(schema_1.ventasIngresos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ventasIngresos.ofertaId, o.id), (0, drizzle_orm_1.gte)(schema_1.ventasIngresos.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.ventasIngresos.fecha, fin)));
        // Pagos reales matcheados por nombre de pipeline ≈ nombre de oferta
        const match = pagosPorPipeline.find(p => p.pipelineNombre.toLowerCase().includes(o.nombre.toLowerCase()) ||
            o.nombre.toLowerCase().includes(p.pipelineNombre.toLowerCase()));
        const actual = asNumber(totalManual?.total) + asNumber(match?.total);
        const pct = o.target > 0 ? Math.round((actual / o.target) * 100) : 0;
        return {
            ofertaId: o.id,
            nombre: o.nombre,
            categoria: o.categoria,
            target: o.target,
            ticket: o.ticket,
            actual,
            pct,
        };
    }));
    return resultados;
}
// ─── Ticker (datos reales del CRM, sin restricción de rol) ──
// Zona horaria del negocio (Florida = America/New_York)
const ZONA = "America/New_York";
function fechaET(d) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function offsetETMinutos(fechaRef) {
    const comoUTC = new Date(fechaRef.toLocaleString("en-US", { timeZone: "UTC" }));
    const comoET = new Date(fechaRef.toLocaleString("en-US", { timeZone: ZONA }));
    return Math.round((comoUTC.getTime() - comoET.getTime()) / 60000);
}
function inicioDelDiaET(ymd, offsetMin) {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMin * 60000);
}
async function tickerIngresos() {
    const ahora = new Date();
    const dia = fechaET(ahora);
    const offsetMin = offsetETMinutos(ahora);
    // ─── HOY: total de pagos reales del día ──────────
    const inicioHoy = inicioDelDiaET(dia, offsetMin);
    const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000 - 1);
    const [facturadoHoy] = await client_1.db
        .select({ total: (0, drizzle_orm_1.sum)(schema_1.pagos.monto) })
        .from(schema_1.pagos)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicioHoy), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, finHoy)));
    const hoyFacturado = asNumber(facturadoHoy?.total);
    const metaDiaria = 10000;
    const pctHoy = Math.round((hoyFacturado / metaDiaria) * 100);
    // ─── Últimos 7 días de facturación real ─────────
    const ultimos7dias = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(ahora);
        d.setDate(d.getDate() - i);
        const ymd = fechaET(d);
        const inicioDia = inicioDelDiaET(ymd, offsetMin);
        const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000 - 1);
        const [res] = await client_1.db
            .select({ total: (0, drizzle_orm_1.sum)(schema_1.pagos.monto) })
            .from(schema_1.pagos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicioDia), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, finDia)));
        const diaSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()];
        ultimos7dias.push({ fecha: `${diaSemana} ${d.getDate()}`, total: asNumber(res?.total) });
    }
    // ─── Por pipeline (línea de negocio) ────────────
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);
    const todas = await client_1.db.select().from(schema_1.ofertas).orderBy(schema_1.ofertas.nombre);
    // Pagos del mes agrupados por pipeline
    const pagosPorPipeline = await client_1.db
        .select({
        pipelineNombre: schema_1.pipelines.nombre,
        total: (0, drizzle_orm_1.sum)(schema_1.pagos.monto),
    })
        .from(schema_1.pagos)
        .innerJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.pagos.registroId, schema_1.registros.id))
        .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicioMes), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, finMes)))
        .groupBy(schema_1.pipelines.nombre);
    // Combinar ofertas con datos reales de pagos
    const resultados = todas.map(o => {
        const match = pagosPorPipeline.find(p => p.pipelineNombre.toLowerCase().includes(o.nombre.toLowerCase()) ||
            o.nombre.toLowerCase().includes(p.pipelineNombre.toLowerCase()));
        const actual = match ? asNumber(match.total) : 0;
        const pct = o.target > 0 ? Math.round((actual / o.target) * 100) : 0;
        return { nombre: o.nombre, categoria: o.categoria, target: o.target, actual, pct };
    });
    return {
        hoy: { facturado: hoyFacturado, meta: metaDiaria, pct: pctHoy },
        ultimos7dias,
        ofertas: resultados,
    };
}
// ─── Anticipos pendientes ─────────────────────────────
async function adelantosPendientes() {
    // ── Anticipos manuales (motor de ingresos) ──
    const filasManuales = await client_1.db
        .select({
        id: schema_1.ventasIngresos.id,
        fecha: schema_1.ventasIngresos.fecha,
        ofertaId: schema_1.ventasIngresos.ofertaId,
        ofertaNombre: schema_1.ofertas.nombre,
        monto: schema_1.ventasIngresos.monto,
        totalDeal: schema_1.ventasIngresos.totalDeal,
        nota: schema_1.ventasIngresos.nota,
    })
        .from(schema_1.ventasIngresos)
        .innerJoin(schema_1.ofertas, (0, drizzle_orm_1.eq)(schema_1.ventasIngresos.ofertaId, schema_1.ofertas.id))
        .where((0, drizzle_orm_1.eq)(schema_1.ventasIngresos.esAnticipo, true));
    const manuales = filasManuales
        .map((f) => ({
        ...f,
        totalDeal: f.totalDeal ?? f.monto,
        saldoPendiente: (f.totalDeal ?? f.monto) - f.monto,
    }))
        .filter((f) => f.saldoPendiente > 0);
    // ── Saldos reales del pipeline (deals con pagos parciales) ──
    const dealsConSaldo = await client_1.db
        .select({
        id: schema_1.registros.id,
        valor: schema_1.registros.valor,
        pipelineId: schema_1.registros.pipelineId,
        pipelineNombre: schema_1.pipelines.nombre,
        personaNombre: schema_1.personas.nombre,
        createdAt: schema_1.registros.createdAt,
        totalPagado: (0, drizzle_orm_1.sum)(schema_1.pagos.monto),
    })
        .from(schema_1.registros)
        .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
        .leftJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.registros.personaId, schema_1.personas.id))
        .leftJoin(schema_1.pagos, (0, drizzle_orm_1.eq)(schema_1.registros.id, schema_1.pagos.registroId))
        .groupBy(schema_1.registros.id)
        .having((0, drizzle_orm_1.sql) `COALESCE(${schema_1.registros.valor}, 0) > COALESCE(SUM(${schema_1.pagos.monto}), 0)`);
    const pipelineSaldos = dealsConSaldo
        .filter((d) => (d.valor ?? 0) > asNumber(d.totalPagado))
        .map((d) => ({
        id: d.id,
        fecha: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : "",
        ofertaId: d.pipelineId,
        ofertaNombre: d.personaNombre
            ? `${d.pipelineNombre} — ${d.personaNombre}`
            : d.pipelineNombre,
        monto: asNumber(d.totalPagado),
        totalDeal: d.valor ?? 0,
        saldoPendiente: (d.valor ?? 0) - asNumber(d.totalPagado),
        nota: d.personaNombre ?? null,
    }))
        .sort((a, b) => b.saldoPendiente - a.saldoPendiente);
    // ── Unificar ambas fuentes ──
    const todos = [...manuales, ...pipelineSaldos]
        .sort((a, b) => b.saldoPendiente - a.saldoPendiente);
    return todos;
}
// ─── Egresos por categoría ────────────────────────────
async function egresosPorCategoria(ym) {
    const inicio = inicioDeMes(ym);
    const ahora = ym ? new Date(`${ym}-01`) : new Date();
    const y = ahora.getFullYear();
    const m = ahora.getMonth() + 1;
    const fin = `${y}-${String(m).padStart(2, "0")}-31`;
    const filas = await client_1.db
        .select({ categoria: schema_1.egresos.categoria, total: (0, drizzle_orm_1.sum)(schema_1.egresos.monto) })
        .from(schema_1.egresos)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.egresos.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.egresos.fecha, fin)))
        .groupBy(schema_1.egresos.categoria);
    const totalGeneral = filas.reduce((s, f) => s + asNumber(f.total), 0);
    return filas.map((f) => ({
        categoria: f.categoria,
        monto: asNumber(f.total),
        pct: totalGeneral > 0 ? Math.round((asNumber(f.total) / totalGeneral) * 100) : 0,
    }));
}
// ─── Rentabilidad por línea ───────────────────────────
async function rentabilidadPorLinea(ym) {
    const inicio = inicioDeMes(ym);
    const ahora = ym ? new Date(`${ym}-01`) : new Date();
    const y = ahora.getFullYear();
    const m = ahora.getMonth() + 1;
    const fin = `${y}-${String(m).padStart(2, "0")}-31`;
    const todas = await client_1.db.select().from(schema_1.ofertas).orderBy(schema_1.ofertas.nombre);
    // ── Pagos del pipeline agrupados por pipeline ──
    const inicioMesDate = new Date(`${inicio}T00:00:00`);
    const finMesDate = new Date(`${fin}T23:59:59.999`);
    const pagosPorPipeline = await client_1.db
        .select({
        pipelineNombre: schema_1.pipelines.nombre,
        total: (0, drizzle_orm_1.sum)(schema_1.pagos.monto),
    })
        .from(schema_1.pagos)
        .innerJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.pagos.registroId, schema_1.registros.id))
        .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicioMesDate), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, finMesDate)))
        .groupBy(schema_1.pipelines.nombre);
    const resultados = await Promise.all(todas.map(async (o) => {
        // Ventas manuales de esta oferta
        const [ingManual] = await client_1.db
            .select({ total: (0, drizzle_orm_1.sum)(schema_1.ventasIngresos.monto) })
            .from(schema_1.ventasIngresos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ventasIngresos.ofertaId, o.id), (0, drizzle_orm_1.gte)(schema_1.ventasIngresos.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.ventasIngresos.fecha, fin)));
        // Pagos reales matcheados por nombre
        const match = pagosPorPipeline.find(p => p.pipelineNombre.toLowerCase().includes(o.nombre.toLowerCase()) ||
            o.nombre.toLowerCase().includes(p.pipelineNombre.toLowerCase()));
        const [egr] = await client_1.db
            .select({ total: (0, drizzle_orm_1.sum)(schema_1.egresos.monto) })
            .from(schema_1.egresos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.egresos.ofertaId, o.id), (0, drizzle_orm_1.gte)(schema_1.egresos.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.egresos.fecha, fin)));
        const ingresos = asNumber(ingManual?.total) + asNumber(match?.total);
        const gastos = asNumber(egr?.total);
        return {
            ofertaId: o.id,
            ofertaNombre: o.nombre,
            ingresos,
            egresos: gastos,
            neto: ingresos - gastos,
        };
    }));
    // Gastos generales (sin ofertaId)
    const [gastosGenerales] = await client_1.db
        .select({ total: (0, drizzle_orm_1.sum)(schema_1.egresos.monto) })
        .from(schema_1.egresos)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.egresos.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.egresos.fecha, fin), (0, drizzle_orm_1.sql) `${schema_1.egresos.ofertaId} IS NULL`));
    const gastosGenVal = asNumber(gastosGenerales?.total);
    if (gastosGenVal > 0) {
        resultados.push({
            ofertaId: null,
            ofertaNombre: "Gastos generales",
            ingresos: 0,
            egresos: gastosGenVal,
            neto: -gastosGenVal,
        });
    }
    return resultados;
}
// ─── Actividad reciente ───────────────────────────────
async function actividadReciente(limite = 12) {
    // Ventas manuales (motor de ingresos)
    const ventas = await client_1.db
        .select({
        id: schema_1.ventasIngresos.id,
        fecha: schema_1.ventasIngresos.fecha,
        monto: schema_1.ventasIngresos.monto,
        ofertaNombre: schema_1.ofertas.nombre,
        nota: schema_1.ventasIngresos.nota,
    })
        .from(schema_1.ventasIngresos)
        .innerJoin(schema_1.ofertas, (0, drizzle_orm_1.eq)(schema_1.ventasIngresos.ofertaId, schema_1.ofertas.id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.ventasIngresos.fecha))
        .limit(limite);
    // Pagos reales del pipeline (unificado)
    const pipelinePagos = await client_1.db
        .select({
        id: schema_1.pagos.id,
        fecha: schema_1.pagos.fecha,
        monto: schema_1.pagos.monto,
        pipelineNombre: schema_1.pipelines.nombre,
        personaNombre: schema_1.personas.nombre,
        nota: schema_1.pagos.nota,
    })
        .from(schema_1.pagos)
        .innerJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.pagos.registroId, schema_1.registros.id))
        .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
        .leftJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.registros.personaId, schema_1.personas.id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.pagos.fecha))
        .limit(limite);
    const gastos = await client_1.db
        .select({
        id: schema_1.egresos.id,
        fecha: schema_1.egresos.fecha,
        monto: schema_1.egresos.monto,
        ofertaNombre: schema_1.ofertas.nombre,
        categoria: schema_1.egresos.categoria,
        nota: schema_1.egresos.nota,
    })
        .from(schema_1.egresos)
        .leftJoin(schema_1.ofertas, (0, drizzle_orm_1.eq)(schema_1.egresos.ofertaId, schema_1.ofertas.id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.egresos.fecha))
        .limit(limite);
    const unificados = [
        ...ventas.map((v) => ({ tipo: "ingreso", ...v, categoria: undefined })),
        ...pipelinePagos.map((p) => ({
            tipo: "ingreso",
            id: p.id,
            fecha: typeof p.fecha === "string" ? p.fecha : p.fecha.toISOString().slice(0, 10),
            monto: p.monto,
            ofertaNombre: p.pipelineNombre,
            nota: p.personaNombre ? `${p.personaNombre}${p.nota ? ` — ${p.nota}` : ""}` : (p.nota ?? null),
            categoria: undefined,
        })),
        ...gastos.map((g) => ({ tipo: "egreso", ...g })),
    ]
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
        .slice(0, limite);
    return unificados;
}
