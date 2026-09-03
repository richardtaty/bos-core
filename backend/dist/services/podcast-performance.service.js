"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerMetas = obtenerMetas;
exports.guardarMetas = guardarMetas;
exports.calcularScore = calcularScore;
exports.obtenerReporteDiario = obtenerReporteDiario;
exports.guardarReporteDiario = guardarReporteDiario;
exports.desempenoMi = desempenoMi;
exports.desempenoEquipo = desempenoEquipo;
exports.inteligenciaPodcast = inteligenciaPodcast;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
// ─── Timezone ─────────────────────────────────────────────
// Igual que reportes.service.ts: el negocio opera en Florida (America/New_York) y el
// servidor corre en UTC. Todo "qué día es" pasa por estas funciones, nunca por
// new Date().getDate() directo.
const ZONA_NEGOCIO = "America/New_York";
function fechaET(d) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function offsetETMinutos(fechaRef) {
    const comoUTC = new Date(fechaRef.toLocaleString("en-US", { timeZone: "UTC" }));
    const comoET = new Date(fechaRef.toLocaleString("en-US", { timeZone: ZONA_NEGOCIO }));
    return Math.round((comoUTC.getTime() - comoET.getTime()) / 60000);
}
function limitesDiaET(ymd) {
    const offsetMin = offsetETMinutos(new Date(`${ymd}T12:00:00Z`));
    const [y, m, d] = ymd.split("-").map(Number);
    const inicio = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMin * 60000);
    return { inicio, fin: new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1) };
}
function hoyET() {
    return fechaET(new Date());
}
function sumarDias(ymd, n) {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}
// ─── Metas ────────────────────────────────────────────────
const METAS_DEFAULT = {
    prospectosEncontrados: 50,
    prospectosContactados: 50,
    podcastsAgendados: 3,
    followupsRatio: 100,
};
async function obtenerMetas() {
    const filas = await client_1.db.select().from(schema_1.podcastMetas);
    const porClave = new Map(filas.map((f) => [f.clave, f.valor]));
    const metas = {
        prospectosEncontrados: porClave.get("prospectos_encontrados") ?? METAS_DEFAULT.prospectosEncontrados,
        prospectosContactados: porClave.get("prospectos_contactados") ?? METAS_DEFAULT.prospectosContactados,
        podcastsAgendados: porClave.get("podcasts_agendados") ?? METAS_DEFAULT.podcastsAgendados,
        followupsRatio: porClave.get("followups_ratio") ?? METAS_DEFAULT.followupsRatio,
    };
    return { items: filas, metas };
}
async function guardarMetas(lista) {
    for (const m of lista) {
        const [existente] = await client_1.db.select().from(schema_1.podcastMetas).where((0, drizzle_orm_1.eq)(schema_1.podcastMetas.clave, m.clave));
        if (existente) {
            await client_1.db.update(schema_1.podcastMetas).set({ valor: m.valor, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.podcastMetas.clave, m.clave));
        }
        else {
            await client_1.db.insert(schema_1.podcastMetas).values({
                id: crypto.randomUUID(),
                clave: m.clave,
                nombre: m.nombre,
                valor: m.valor,
                updatedAt: new Date(),
            });
        }
    }
    return obtenerMetas();
}
// ─── Fuentes de métricas (queries base) ───────────────────
async function _movimientosPodcast(inicio, fin) {
    const [pipeline] = await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.nombre, "Podcast"));
    if (!pipeline)
        return [];
    return client_1.db
        .select({
        autorId: schema_1.historialEtapas.autorId,
        etapaNombre: schema_1.etapas.nombre,
        fecha: schema_1.historialEtapas.fecha,
    })
        .from(schema_1.historialEtapas)
        .innerJoin(schema_1.etapas, (0, drizzle_orm_1.eq)(schema_1.historialEtapas.etapaNuevaId, schema_1.etapas.id))
        .innerJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.historialEtapas.registroId, schema_1.registros.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, pipeline.id), (0, drizzle_orm_1.gte)(schema_1.historialEtapas.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.historialEtapas.fecha, fin)));
}
async function _followupsCompletados(inicio, fin) {
    return client_1.db
        .select({
        responsableId: schema_1.personas.responsableId,
        fecha: schema_1.tareasSeguimiento.completadoEn,
    })
        .from(schema_1.tareasSeguimiento)
        .innerJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.personaId, schema_1.personas.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.tareasSeguimiento.completadoEn, inicio), (0, drizzle_orm_1.lte)(schema_1.tareasSeguimiento.completadoEn, fin)));
}
async function _followupsVencidos(usuarioId, fin) {
    const filas = await client_1.db
        .select({ id: schema_1.tareasSeguimiento.id })
        .from(schema_1.tareasSeguimiento)
        .innerJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.personaId, schema_1.personas.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personas.responsableId, usuarioId), (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.completado, false), (0, drizzle_orm_1.lte)(schema_1.tareasSeguimiento.fecha, fin)));
    return filas.length;
}
function _metricasVacio(fecha) {
    return {
        fecha,
        encontrados: 0,
        contactados: 0,
        respuestas: 0,
        interesados: 0,
        followupsRealizados: 0,
        followupsVencidos: 0,
        agendados: 0,
        realizados: 0,
        reuniones: 0,
        ventas: 0,
        noShows: 0,
    };
}
// Devuelve las métricas diarias (auto + manual del reporte) para un usuario en un rango de días.
async function _metricasPara(usuarioId, fechas) {
    const porFecha = new Map();
    if (fechas.length === 0)
        return porFecha;
    for (const f of fechas)
        porFecha.set(f, _metricasVacio(f));
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];
    const { inicio } = limitesDiaET(desde);
    const { fin } = limitesDiaET(hasta);
    const [movimientos, completados, reportes] = await Promise.all([
        _movimientosPodcast(inicio, fin),
        _followupsCompletados(inicio, fin),
        client_1.db
            .select()
            .from(schema_1.podcastReportesDiarios)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.podcastReportesDiarios.usuarioId, usuarioId), (0, drizzle_orm_1.gte)(schema_1.podcastReportesDiarios.fecha, desde), (0, drizzle_orm_1.lte)(schema_1.podcastReportesDiarios.fecha, hasta))),
    ]);
    for (const m of movimientos) {
        if (m.autorId !== usuarioId)
            continue;
        const b = porFecha.get(fechaET(m.fecha));
        if (!b)
            continue;
        switch (m.etapaNombre) {
            case "Podcast agendado":
                b.agendados++;
                break;
            case "Podcast realizado":
                b.realizados++;
                break;
            case "Reunión del 1%":
                b.reuniones++;
                break;
            case "Venta cerrada":
                b.ventas++;
                break;
            case "No-show":
                b.noShows++;
                break;
        }
    }
    for (const c of completados) {
        if (c.responsableId !== usuarioId || !c.fecha)
            continue;
        const b = porFecha.get(fechaET(c.fecha));
        if (b)
            b.followupsRealizados++;
    }
    for (const rep of reportes) {
        const b = porFecha.get(rep.fecha);
        if (!b)
            continue;
        b.encontrados = rep.prospectosEncontrados ?? 0;
        b.contactados = rep.prospectosContactados ?? 0;
        b.respuestas = rep.respuestas ?? 0;
        b.interesados = rep.interesados ?? 0;
    }
    return porFecha;
}
async function _serieMetricas(usuarioId, dias) {
    const hoy = hoyET();
    const fechas = [];
    for (let i = dias - 1; i >= 0; i--)
        fechas.push(sumarDias(hoy, -i));
    const porFecha = await _metricasPara(usuarioId, fechas);
    const serie = fechas.map((f) => porFecha.get(f));
    serie[serie.length - 1].followupsVencidos = await _followupsVencidos(usuarioId, limitesDiaET(hoy).fin);
    return serie;
}
async function _compromisoDe(usuarioId, fecha) {
    const [rep] = await client_1.db
        .select()
        .from(schema_1.podcastReportesDiarios)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.podcastReportesDiarios.usuarioId, usuarioId), (0, drizzle_orm_1.eq)(schema_1.podcastReportesDiarios.fecha, fecha)));
    if (!rep)
        return null;
    return {
        contactos: rep.compromisoContactos,
        followups: rep.compromisoFollowups,
        podcasts: rep.compromisoPodcasts,
        nota: rep.compromisoNota,
    };
}
// ─── Score (transparente, 0–100) ─────────────────────────
function _redondear(n) {
    return Math.round(n * 10) / 10;
}
function calcularScore(m, metas, compromisoAyer) {
    // Actividad (20): encontrados + contactados vs meta.
    const cumplEncontrados = metas.prospectosEncontrados > 0 ? Math.min(1, m.encontrados / metas.prospectosEncontrados) : 0;
    const cumplContactados = metas.prospectosContactados > 0 ? Math.min(1, m.contactados / metas.prospectosContactados) : 0;
    const actividad = ((cumplEncontrados + cumplContactados) / 2) * 20;
    // Follow-up (20): realizados hoy vs (realizados + vencidos), contra la meta configurable
    // de % de follow-ups completados (followups_ratio). Meta por defecto 100%.
    const denomFollowup = m.followupsRealizados + m.followupsVencidos;
    const ratioFollowup = denomFollowup > 0 ? m.followupsRealizados / denomFollowup : 1;
    const objetivoFollowup = metas.followupsRatio > 0 ? metas.followupsRatio / 100 : 1;
    const followup = Math.min(1, ratioFollowup / objetivoFollowup) * 20;
    // Resultados (40): agendados vs meta (20) + realizados vs meta (20).
    const metaAgendados = metas.podcastsAgendados;
    const cumplAgendados = metaAgendados > 0 ? Math.min(1, m.agendados / metaAgendados) : 0;
    const cumplRealizados = metaAgendados > 0 ? Math.min(1, m.realizados / metaAgendados) : 0;
    const resultados = cumplAgendados * 20 + cumplRealizados * 20;
    // Continuidad (20): cumplimiento del compromiso de ayer. Sin compromiso → neutro (20).
    let continuidad = 20;
    if (compromisoAyer && (compromisoAyer.contactos || compromisoAyer.followups || compromisoAyer.podcasts)) {
        const ratios = [];
        if (compromisoAyer.contactos)
            ratios.push(Math.min(1, m.contactados / compromisoAyer.contactos));
        if (compromisoAyer.followups)
            ratios.push(Math.min(1, m.followupsRealizados / compromisoAyer.followups));
        if (compromisoAyer.podcasts)
            ratios.push(Math.min(1, m.agendados / compromisoAyer.podcasts));
        if (ratios.length > 0)
            continuidad = (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 20;
    }
    return {
        total: _redondear(actividad + followup + resultados + continuidad),
        actividad: _redondear(actividad),
        followup: _redondear(followup),
        resultados: _redondear(resultados),
        continuidad: _redondear(continuidad),
    };
}
function _tendencia(hoy, promedio7) {
    if (promedio7 === 0)
        return hoy > 0 ? "mejorando" : "estable";
    const ratio = hoy / promedio7;
    if (ratio >= 1.1)
        return "mejorando";
    if (ratio <= 0.9)
        return "bajando";
    return "estable";
}
function _comparaciones(serie, metas) {
    const hoy = serie[serie.length - 1];
    const prev = serie.slice(0, -1);
    const ayer = prev.length ? prev[prev.length - 1] : hoy;
    const prom = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const kpis = [
        { clave: "encontrados", label: "Prospectos encontrados", meta: metas.prospectosEncontrados },
        { clave: "contactados", label: "Prospectos contactados", meta: metas.prospectosContactados },
        { clave: "followupsRealizados", label: "Follow-ups realizados", meta: null },
        { clave: "agendados", label: "Podcasts agendados", meta: metas.podcastsAgendados },
        { clave: "realizados", label: "Podcasts realizados", meta: null },
        { clave: "reuniones", label: "Reuniones del 1%", meta: null },
    ];
    return kpis.map((k) => {
        const hoyVal = hoy[k.clave];
        const ayerVal = ayer[k.clave];
        const prom7 = prom(prev.map((d) => d[k.clave]));
        return {
            clave: k.clave,
            label: k.label,
            hoy: hoyVal,
            ayer: ayerVal,
            promedio7: _redondear(prom7),
            meta: k.meta,
            cumplimiento: k.meta ? Math.round((hoyVal / k.meta) * 100) : null,
            variacionAyer: ayerVal > 0 ? Math.round(((hoyVal - ayerVal) / ayerVal) * 100) : null,
            tendencia: _tendencia(hoyVal, prom7),
        };
    });
}
// ─── Motor de alertas (reglas deterministas) ─────────────
const NIVEL_ORDEN = { normal: 0, atencion: 1, intervencion: 2 };
function _alertasUsuario(serie, compromisoAyer) {
    const hoy = serie[serie.length - 1];
    const prev = serie.slice(0, -1);
    const prom = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const promAgendados = prom(prev.map((d) => d.agendados));
    const alertas = [];
    // 1. Caída de productividad: agendados hoy muy por debajo del promedio reciente.
    if (promAgendados >= 1 && hoy.agendados <= promAgendados * 0.4) {
        const severo = hoy.agendados <= promAgendados * 0.2;
        alertas.push({
            tipo: "caida_productividad",
            nivel: severo ? "intervencion" : "atencion",
            titulo: "Caída de productividad",
            evidencia: `Hoy agendó ${hoy.agendados} podcast(s) y contactó ${hoy.contactados} prospecto(s).`,
            comparacion: `Su promedio reciente era ${promAgendados.toFixed(1)} agendados/día.`,
            causa: "Ritmo de prospección por debajo de lo habitual.",
            accion: "Revisar bloqueos y priorizar contacto de prospectos hoy.",
        });
    }
    // 2. Compromiso de ayer incumplido.
    if (compromisoAyer && (compromisoAyer.contactos || compromisoAyer.followups || compromisoAyer.podcasts)) {
        const ratios = [];
        if (compromisoAyer.contactos)
            ratios.push(compromisoAyer.contactos > 0 ? hoy.contactados / compromisoAyer.contactos : 0);
        if (compromisoAyer.followups)
            ratios.push(compromisoAyer.followups > 0 ? hoy.followupsRealizados / compromisoAyer.followups : 0);
        if (compromisoAyer.podcasts)
            ratios.push(compromisoAyer.podcasts > 0 ? hoy.agendados / compromisoAyer.podcasts : 0);
        const cumplimiento = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
        if (cumplimiento < 0.5) {
            alertas.push({
                tipo: "compromiso_incumplido",
                nivel: cumplimiento === 0 ? "intervencion" : "atencion",
                titulo: "Compromiso de ayer sin cumplir",
                evidencia: `Ayer se comprometió a ${compromisoAyer.contactos ?? 0} contactos, ${compromisoAyer.followups ?? 0} follow-ups y ${compromisoAyer.podcasts ?? 0} podcasts.`,
                comparacion: `Hoy alcanzó ${hoy.contactados} contactos, ${hoy.followupsRealizados} follow-ups y ${hoy.agendados} podcasts (${Math.round(cumplimiento * 100)}% del compromiso).`,
                causa: "El compromiso se prometió por encima de lo ejecutable, o hubo un bloqueo no reportado.",
                accion: "Revisar qué lo frenó y reajustar el compromiso de mañana a algo realista.",
            });
        }
    }
    // 3. Incongruencia: reporta interés pero no agenda podcasts.
    if (hoy.contactados >= 5 && hoy.interesados >= 1 && hoy.agendados === 0) {
        alertas.push({
            tipo: "incongruencia",
            nivel: "atencion",
            titulo: "Interesados sin podcast agendado",
            evidencia: `Hoy registró ${hoy.interesados} interesado(s) y ${hoy.contactados} contactos, pero 0 podcasts agendados.`,
            comparacion: "Lo esperado es que un interesado pase a podcast agendado en el mismo día o al siguiente.",
            causa: "Posible fricción al cerrar la agenda (falta de calendario, guion, o seguimiento).",
            accion: "Confirmar que los interesados tienen fecha de grabación agendada antes de cerrar el día.",
        });
    }
    // 4. Cuello de botella: muchos realizados, pocas reuniones del 1%.
    const realizados7 = prom(prev.map((d) => d.realizados)) * prev.length + hoy.realizados;
    const reuniones7 = prom(prev.map((d) => d.reuniones)) * prev.length + hoy.reuniones;
    if (realizados7 >= 3 && reuniones7 / realizados7 < 0.5) {
        alertas.push({
            tipo: "cuello_botella",
            nivel: "atencion",
            titulo: "Cuello de botella en la conversión",
            evidencia: `${realizados7} podcasts realizados en los últimos días pero solo ${reuniones7} reuniones del 1%.`,
            comparacion: "La conversión esperada de realizado → reunión debería estar por encima del 50%.",
            causa: "Falta seguimiento posterior a la grabación para llevar al invitado a la reunión del 1%.",
            accion: "Priorizar el envío de contenido y landing a los invitados ya realizados.",
        });
    }
    return alertas;
}
function _estadoIA(alertas) {
    let nivel = "normal";
    for (const a of alertas)
        if (NIVEL_ORDEN[a.nivel] > NIVEL_ORDEN[nivel])
            nivel = a.nivel;
    return nivel;
}
// ─── Usuarios del equipo Podcast ─────────────────────────
async function _usuariosPodcast() {
    const [depto] = await client_1.db.select().from(schema_1.departamentos).where((0, drizzle_orm_1.eq)(schema_1.departamentos.nombre, "Podcast"));
    if (!depto)
        return [];
    const porMulti = await client_1.db
        .select({ id: schema_1.usuarios.id, nombre: schema_1.usuarios.nombre })
        .from(schema_1.usuarios)
        .innerJoin(schema_1.usuarioDepartamentos, (0, drizzle_orm_1.eq)(schema_1.usuarios.id, schema_1.usuarioDepartamentos.usuarioId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.usuarioDepartamentos.departamentoId, depto.id), (0, drizzle_orm_1.eq)(schema_1.usuarios.activo, true)));
    const porLegacy = await client_1.db
        .select({ id: schema_1.usuarios.id, nombre: schema_1.usuarios.nombre })
        .from(schema_1.usuarios)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.usuarios.departamentoId, depto.id), (0, drizzle_orm_1.eq)(schema_1.usuarios.activo, true)));
    const mapa = new Map();
    for (const u of [...porMulti, ...porLegacy])
        if (!mapa.has(u.id))
            mapa.set(u.id, u);
    return Array.from(mapa.values());
}
// ─── Reporte diario ──────────────────────────────────────
async function obtenerReporteDiario(usuarioId, fechaParam) {
    const fecha = fechaParam ?? hoyET();
    const [rep] = await client_1.db
        .select()
        .from(schema_1.podcastReportesDiarios)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.podcastReportesDiarios.usuarioId, usuarioId), (0, drizzle_orm_1.eq)(schema_1.podcastReportesDiarios.fecha, fecha)));
    const metricas = (await _metricasPara(usuarioId, [fecha])).get(fecha);
    metricas.followupsVencidos = await _followupsVencidos(usuarioId, limitesDiaET(fecha).fin);
    const { metas } = await obtenerMetas();
    const compromisoAyer = await _compromisoDe(usuarioId, sumarDias(fecha, -1));
    return {
        fecha,
        estado: rep?.estado ?? null,
        reporte: rep
            ? {
                prospectosEncontrados: rep.prospectosEncontrados,
                prospectosContactados: rep.prospectosContactados,
                respuestas: rep.respuestas,
                interesados: rep.interesados,
                bloqueos: rep.bloqueos,
            }
            : null,
        compromisoHoy: rep
            ? { contactos: rep.compromisoContactos, followups: rep.compromisoFollowups, podcasts: rep.compromisoPodcasts, nota: rep.compromisoNota }
            : null,
        metricas,
        compromisoAyer,
        metas,
    };
}
async function guardarReporteDiario(usuarioId, datos) {
    const fecha = hoyET();
    const ahora = new Date();
    const [existente] = await client_1.db
        .select()
        .from(schema_1.podcastReportesDiarios)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.podcastReportesDiarios.usuarioId, usuarioId), (0, drizzle_orm_1.eq)(schema_1.podcastReportesDiarios.fecha, fecha)));
    const estado = datos.enviar ? "enviado" : existente?.estado === "enviado" ? "enviado" : "borrador";
    const valores = {
        prospectosEncontrados: datos.prospectosEncontrados ?? null,
        prospectosContactados: datos.prospectosContactados ?? null,
        respuestas: datos.respuestas ?? null,
        interesados: datos.interesados ?? null,
        compromisoContactos: datos.compromisoContactos ?? null,
        compromisoFollowups: datos.compromisoFollowups ?? null,
        compromisoPodcasts: datos.compromisoPodcasts ?? null,
        compromisoNota: datos.compromisoNota ?? null,
        bloqueos: datos.bloqueos ?? null,
        estado,
        updatedAt: ahora,
    };
    if (existente) {
        await client_1.db.update(schema_1.podcastReportesDiarios).set(valores).where((0, drizzle_orm_1.eq)(schema_1.podcastReportesDiarios.id, existente.id));
    }
    else {
        await client_1.db.insert(schema_1.podcastReportesDiarios).values({
            ...valores,
            id: crypto.randomUUID(),
            usuarioId,
            fecha,
            createdAt: ahora,
        });
    }
    return obtenerReporteDiario(usuarioId, fecha);
}
// ─── Desempeño individual ────────────────────────────────
async function desempenoMi(usuarioId) {
    const serie = await _serieMetricas(usuarioId, 7);
    const hoy = serie[serie.length - 1];
    const { metas } = await obtenerMetas();
    const compromisoAyer = await _compromisoDe(usuarioId, sumarDias(hoy.fecha, -1));
    const score = calcularScore(hoy, metas, compromisoAyer);
    const comparaciones = _comparaciones(serie, metas);
    const alertas = _alertasUsuario(serie, compromisoAyer);
    return {
        usuarioId,
        fecha: hoy.fecha,
        score,
        metricas: hoy,
        comparaciones,
        metas,
        compromisoAyer,
        alertas,
        estadoIA: _estadoIA(alertas),
    };
}
// ─── Desempeño del equipo ────────────────────────────────
async function desempenoEquipo() {
    const usuariosPodcast = await _usuariosPodcast();
    const { metas } = await obtenerMetas();
    const filas = await Promise.all(usuariosPodcast.map(async (u) => {
        const serie = await _serieMetricas(u.id, 7);
        const hoy = serie[serie.length - 1];
        const compromisoAyer = await _compromisoDe(u.id, sumarDias(hoy.fecha, -1));
        const score = calcularScore(hoy, metas, compromisoAyer);
        const alertas = _alertasUsuario(serie, compromisoAyer);
        const prev = serie.slice(0, -1);
        const promAgendados = prev.length ? prev.reduce((a, d) => a + d.agendados, 0) / prev.length : 0;
        return {
            usuarioId: u.id,
            nombre: u.nombre,
            score,
            contactados: hoy.contactados,
            followupsRealizados: hoy.followupsRealizados,
            agendados: hoy.agendados,
            realizados: hoy.realizados,
            pctMeta: metas.podcastsAgendados > 0 ? Math.round((hoy.agendados / metas.podcastsAgendados) * 100) : 0,
            tendencia: _tendencia(hoy.agendados, promAgendados),
            estadoIA: _estadoIA(alertas),
        };
    }));
    filas.sort((a, b) => b.score.total - a.score.total);
    return { fecha: hoyET(), metas, equipo: filas };
}
// ─── Inteligencia (resumen ejecutivo + funnel) ───────────
async function inteligenciaPodcast() {
    const usuariosPodcast = await _usuariosPodcast();
    const { metas } = await obtenerMetas();
    const desempenos = await Promise.all(usuariosPodcast.map(async (u) => {
        const serie = await _serieMetricas(u.id, 7);
        const hoy = serie[serie.length - 1];
        const compromisoAyer = await _compromisoDe(u.id, sumarDias(hoy.fecha, -1));
        const score = calcularScore(hoy, metas, compromisoAyer);
        const alertas = _alertasUsuario(serie, compromisoAyer);
        return { usuarioId: u.id, nombre: u.nombre, score, hoy, alertas };
    }));
    // Funnel de los últimos 7 días (estable, no depende de un solo día).
    const hoy = hoyET();
    const desde = sumarDias(hoy, -6);
    const { inicio, fin } = limitesDiaET(hoy);
    const [movimientos, reportes, ingresos] = await Promise.all([
        _movimientosPodcast(limitesDiaET(desde).inicio, fin),
        client_1.db
            .select({
            encontrados: schema_1.podcastReportesDiarios.prospectosEncontrados,
            contactados: schema_1.podcastReportesDiarios.prospectosContactados,
            respuestas: schema_1.podcastReportesDiarios.respuestas,
            interesados: schema_1.podcastReportesDiarios.interesados,
        })
            .from(schema_1.podcastReportesDiarios)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.podcastReportesDiarios.fecha, desde), (0, drizzle_orm_1.lte)(schema_1.podcastReportesDiarios.fecha, hoy))),
        client_1.db
            .select({ monto: schema_1.pagos.monto })
            .from(schema_1.pagos)
            .innerJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.pagos.registroId, schema_1.registros.id))
            .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pipelines.nombre, "Podcast"), (0, drizzle_orm_1.gte)(schema_1.pagos.fecha, inicio), (0, drizzle_orm_1.lte)(schema_1.pagos.fecha, fin))),
    ]);
    const funnel = {
        encontrados: 0,
        contactados: 0,
        respuestas: 0,
        interesados: 0,
        agendados: 0,
        realizados: 0,
        reuniones: 0,
        ventas: 0,
        noShows: 0,
    };
    for (const r of reportes) {
        funnel.encontrados += r.encontrados ?? 0;
        funnel.contactados += r.contactados ?? 0;
        funnel.respuestas += r.respuestas ?? 0;
        funnel.interesados += r.interesados ?? 0;
    }
    for (const m of movimientos) {
        switch (m.etapaNombre) {
            case "Podcast agendado":
                funnel.agendados++;
                break;
            case "Podcast realizado":
                funnel.realizados++;
                break;
            case "Reunión del 1%":
                funnel.reuniones++;
                break;
            case "Venta cerrada":
                funnel.ventas++;
                break;
            case "No-show":
                funnel.noShows++;
                break;
        }
    }
    const ingresosPeriodo = ingresos.reduce((s, p) => s + p.monto, 0);
    // Todas las alertas del equipo, ordenadas por severidad.
    const alertas = desempenos
        .flatMap((d) => d.alertas.map((a) => ({ ...a, usuarioId: d.usuarioId, nombre: d.nombre })))
        .sort((a, b) => NIVEL_ORDEN[b.nivel] - NIVEL_ORDEN[a.nivel]);
    const totalScores = desempenos.reduce((s, d) => s + d.score.total, 0);
    const saludPromedio = desempenos.length ? Math.round(totalScores / desempenos.length) : 0;
    const intervencion = alertas.filter((a) => a.nivel === "intervencion").length;
    const atencion = alertas.filter((a) => a.nivel === "atencion").length;
    let estadoGeneral = "normal";
    if (intervencion > 0)
        estadoGeneral = "intervencion";
    else if (atencion > 0)
        estadoGeneral = "atencion";
    // Mayor oportunidad: el invitado más caliente = persona en etapa "Reunión del 1%" o
    // "Oferta" con más interacciones recientes. Como proxy simple, se reporta la cantidad de
    // reuniones y ventas pendientes de cerrar.
    const reunionVenta = funnel.reuniones > 0 ? Math.round((funnel.ventas / funnel.reuniones) * 100) : 0;
    return {
        fecha: hoy,
        equipo: desempenos.map((d) => ({
            usuarioId: d.usuarioId,
            nombre: d.nombre,
            score: d.score,
            estadoIA: _estadoIA(d.alertas),
            agendados: d.hoy.agendados,
            realizados: d.hoy.realizados,
        })),
        funnel,
        conversion: {
            contactoInteresado: funnel.contactados > 0 ? Math.round((funnel.interesados / funnel.contactados) * 100) : 0,
            interesadoAgendado: funnel.interesados > 0 ? Math.round((funnel.agendados / funnel.interesados) * 100) : 0,
            agendadoRealizado: funnel.agendados > 0 ? Math.round((funnel.realizados / funnel.agendados) * 100) : 0,
            realizadoReunion: funnel.realizados > 0 ? Math.round((funnel.reuniones / funnel.realizados) * 100) : 0,
            reunionVenta,
        },
        ingresosPeriodo,
        saludPromedio,
        estadoGeneral,
        alertas,
    };
}
