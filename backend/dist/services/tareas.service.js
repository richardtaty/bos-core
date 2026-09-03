"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SinPermisoTareaError = void 0;
exports.esRolDeMando = esRolDeMando;
exports.puedeGestionarTarea = puedeGestionarTarea;
exports.listarTareas = listarTareas;
exports.obtenerTarea = obtenerTarea;
exports.crearTarea = crearTarea;
exports.actualizarTarea = actualizarTarea;
exports.reasignarTarea = reasignarTarea;
exports.registrarTiempo = registrarTiempo;
exports.calendarioEditorial = calendarioEditorial;
exports.agregarChecklistItem = agregarChecklistItem;
exports.toggleChecklistItem = toggleChecklistItem;
exports.eliminarChecklistItem = eliminarChecklistItem;
exports.agregarComentario = agregarComentario;
exports.kpiUsuario = kpiUsuario;
exports.bloquearTarea = bloquearTarea;
exports.desbloquearTarea = desbloquearTarea;
exports.solicitarExtension = solicitarExtension;
exports.resolverExtension = resolverExtension;
exports.listarSolicitudesExtension = listarSolicitudesExtension;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
const auth_1 = require("../middleware/auth");
/** Convierte una fecha YYYY-MM-DD en un Date al mediodía UTC, evitando que
 *  el offset de zona horaria (ej. UTC-4 en ET) la desplace al día anterior. */
function fechaNoon(ymd) {
    return new Date(ymd + "T12:00:00");
}
const TAREA_COLUMNS = {
    id: schema_1.tareasOperativas.id,
    titulo: schema_1.tareasOperativas.titulo,
    descripcion: schema_1.tareasOperativas.descripcion,
    responsableId: schema_1.tareasOperativas.responsableId,
    responsableNombre: schema_1.usuarios.nombre,
    departamento: schema_1.tareasOperativas.departamento,
    prioridad: schema_1.tareasOperativas.prioridad,
    fechaInicio: schema_1.tareasOperativas.fechaInicio,
    fechaLimite: schema_1.tareasOperativas.fechaLimite,
    estado: schema_1.tareasOperativas.estado,
    aprobadorId: schema_1.tareasOperativas.aprobadorId,
    proyectoId: schema_1.tareasOperativas.proyectoId,
    porcentajeAvance: schema_1.tareasOperativas.porcentajeAvance,
    canal: schema_1.tareasOperativas.canal,
    tipoContenido: schema_1.tareasOperativas.tipoContenido,
    fechaPublicacion: schema_1.tareasOperativas.fechaPublicacion,
    subtareaDe: schema_1.tareasOperativas.subtareaDe,
    tiempoInvertido: schema_1.tareasOperativas.tiempoInvertido,
    // ─── Marketing v2 ──────────────────────────
    tipoTarea: schema_1.tareasOperativas.tipoTarea,
    tiempoEstimado: schema_1.tareasOperativas.tiempoEstimado,
    solicitanteId: schema_1.tareasOperativas.solicitanteId,
    asignadoPorId: schema_1.tareasOperativas.asignadoPorId,
    criteriosTerminado: schema_1.tareasOperativas.criteriosTerminado,
    bloqueoMotivo: schema_1.tareasOperativas.bloqueoMotivo,
    bloqueoDependeDe: schema_1.tareasOperativas.bloqueoDependeDe,
    bloqueoDesde: schema_1.tareasOperativas.bloqueoDesde,
    fechaLimiteOriginal: schema_1.tareasOperativas.fechaLimiteOriginal,
    sprint: schema_1.tareasOperativas.sprint,
    resultadoFinal: schema_1.tareasOperativas.resultadoFinal,
    createdAt: schema_1.tareasOperativas.createdAt,
    updatedAt: schema_1.tareasOperativas.updatedAt,
};
// ─── Permisos sobre una tarea ─────────────────────────────
//
// Antes de esto el módulo no tenía ninguna verificación: cualquiera con sesión podía
// editar, reasignar y cambiar de estado cualquier tarea de cualquier departamento.
/** El autor no tiene permiso sobre esta tarea. Clase propia para que la ruta pueda
 *  responder 403 en vez del 400 genérico. Mismo patrón que SinPermisoError en personas. */
class SinPermisoTareaError extends Error {
}
exports.SinPermisoTareaError = SinPermisoTareaError;
/** Roles con mando sobre el trabajo de otros. Son los que pueden delegar y aprobar. */
function esRolDeMando(rol) {
    return rol === "SUPER_ADMIN" || rol === "ADMIN" || rol === "SUPERVISOR" || rol === "TEAM_LEADER";
}
/** Los departamentos del usuario, resueltos a nombre (la tarea guarda el nombre, no el id). */
async function departamentosDe(user) {
    const ids = user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
    const nombres = [];
    for (const id of ids) {
        const nombre = await (0, auth_1.nombreDepartamentoDe)(id);
        if (nombre)
            nombres.push(nombre);
    }
    return nombres;
}
/**
 * ¿Puede este usuario ver y gestionar esta tarea (editar, mover de estado, bloquear)?
 *
 * El punto 2 es la garantía que se pidió: quien delega una tarea NO la pierde. Reasignarla
 * no lo saca — sigue viéndola, editándola y moviéndola de estado. Y va ANTES que la regla
 * de departamento a propósito, para que la garantía se sostenga aunque la tarea termine
 * en otra área.
 */
async function puedeGestionarTarea(user, tarea) {
    // 1. El dueño del sistema pasa siempre.
    if (user.rol === "SUPER_ADMIN")
        return true;
    // 2. Relación directa con la tarea: la ejecuta, LA ASIGNÓ, la pidió o la aprueba.
    if (tarea.responsableId === user.id ||
        tarea.asignadoPorId === user.id ||
        tarea.solicitanteId === user.id ||
        tarea.aprobadorId === user.id) {
        return true;
    }
    // 3. Su departamento. Cubre tanto a los roles de mando sobre su área como al compañero
    //    de equipo que mueve una tarjeta ajena en el Kanban compartido — cerrar eso rompería
    //    la operación diaria del tablero.
    return (await departamentosDe(user)).includes(tarea.departamento);
}
/** Igual que puedeGestionarTarea pero lanza. Para usar al inicio de cada escritura. */
async function asegurarPuedeGestionar(user, tarea) {
    if (!(await puedeGestionarTarea(user, tarea))) {
        throw new SinPermisoTareaError("No tienes permiso sobre esta tarea. Pertenece a otro departamento y no participas en ella.");
    }
}
/**
 * Delegar (cambiar el responsable) es más restrictivo que editar: exige rol de mando, o
 * ser quien ya la había asignado. Sin esto, cualquier compañero de departamento podría
 * pasarle el trabajo a otro, que es justo el descontrol que se quería resolver.
 */
async function asegurarPuedeDelegar(user, tarea) {
    await asegurarPuedeGestionar(user, tarea);
    if (esRolDeMando(user.rol) || tarea.asignadoPorId === user.id)
        return;
    throw new SinPermisoTareaError("Solo un Team Leader, Supervisor o Admin puede reasignar una tarea a otra persona.");
}
async function listarTareas(params) {
    const condiciones = [
        params.responsableId ? (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.responsableId, params.responsableId) : undefined,
        params.departamento ? (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.departamento, params.departamento) : undefined,
        params.estado ? (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.estado, params.estado) : undefined,
        params.prioridad ? (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.prioridad, params.prioridad) : undefined,
        params.proyectoId ? (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.proyectoId, params.proyectoId) : undefined,
        params.canal ? (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.canal, params.canal) : undefined,
    ].filter(Boolean);
    return client_1.db
        .select(TAREA_COLUMNS)
        .from(schema_1.tareasOperativas)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.responsableId, schema_1.usuarios.id))
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.tareasOperativas.updatedAt));
}
async function obtenerTarea(id) {
    const [tarea] = await client_1.db
        .select(TAREA_COLUMNS)
        .from(schema_1.tareasOperativas)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.responsableId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    if (!tarea)
        return null;
    const checklist = await client_1.db
        .select()
        .from(schema_1.tareaChecklist)
        .where((0, drizzle_orm_1.eq)(schema_1.tareaChecklist.tareaId, id))
        .orderBy(schema_1.tareaChecklist.orden);
    const comentarios = await client_1.db
        .select({
        id: schema_1.tareaComentarios.id,
        autorId: schema_1.tareaComentarios.autorId,
        autorNombre: schema_1.usuarios.nombre,
        texto: schema_1.tareaComentarios.texto,
        fecha: schema_1.tareaComentarios.fecha,
    })
        .from(schema_1.tareaComentarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.tareaComentarios.autorId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.tareaComentarios.tareaId, id))
        .orderBy(schema_1.tareaComentarios.fecha);
    // Subtareas
    const subtareas = await client_1.db
        .select(TAREA_COLUMNS)
        .from(schema_1.tareasOperativas)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.responsableId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.subtareaDe, id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.tareasOperativas.createdAt));
    return { ...tarea, checklist, comentarios, subtareas };
}
async function crearTarea(input, autor) {
    const id = crypto.randomUUID();
    const ahora = new Date();
    const autorId = autor.id;
    await client_1.db.insert(schema_1.tareasOperativas).values({
        id,
        titulo: input.titulo,
        descripcion: input.descripcion,
        responsableId: input.responsableId,
        departamento: input.departamento ?? "Marketing",
        prioridad: input.prioridad ?? "media",
        fechaInicio: input.fechaInicio ? fechaNoon(input.fechaInicio) : undefined,
        fechaLimite: input.fechaLimite ? fechaNoon(input.fechaLimite) : undefined,
        aprobadorId: input.aprobadorId,
        proyectoId: input.proyectoId,
        canal: input.canal,
        tipoContenido: input.tipoContenido,
        fechaPublicacion: input.fechaPublicacion ? fechaNoon(input.fechaPublicacion) : undefined,
        subtareaDe: input.subtareaDe,
        // ─── Marketing v2 ──────────────────────────
        tipoTarea: input.tipoTarea,
        tiempoEstimado: input.tiempoEstimado ?? 0,
        solicitanteId: input.solicitanteId,
        // Quien crea la tarea es quien la delega. Queda grabado desde el minuto uno para que
        // no pueda perder el acceso más adelante, aunque la reasigne.
        asignadoPorId: autorId,
        criteriosTerminado: input.criteriosTerminado,
        sprint: input.sprint,
        estado: "pendiente",
        createdAt: ahora,
        updatedAt: ahora,
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "TareaOperativa",
        entidadId: id,
        accion: `Tarea creada: "${input.titulo}" — ${input.departamento ?? "Marketing"}${input.canal ? ` | Canal: ${input.canal}` : ""}`,
        autorId,
    });
    return obtenerTarea(id);
}
async function actualizarTarea(id, input, autor) {
    const [tarea] = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    if (!tarea)
        throw new Error("Tarea no encontrada");
    const autorId = autor.id;
    await asegurarPuedeGestionar(autor, tarea);
    // Cambiar el responsable por esta vía es delegar igual que usar /reasignar, así que
    // pide el mismo permiso. Si no se cerrara aquí, el gate de /reasignar sería decorativo.
    const estaDelegando = input.responsableId !== undefined && input.responsableId !== tarea.responsableId;
    if (estaDelegando)
        await asegurarPuedeDelegar(autor, tarea);
    const data = { updatedAt: new Date() };
    if (input.titulo !== undefined)
        data.titulo = input.titulo;
    if (input.descripcion !== undefined)
        data.descripcion = input.descripcion;
    if (input.responsableId !== undefined)
        data.responsableId = input.responsableId;
    // Quien delega queda grabado como asignador y conserva el control de la tarea.
    if (estaDelegando)
        data.asignadoPorId = autorId;
    if (input.departamento !== undefined)
        data.departamento = input.departamento;
    if (input.prioridad !== undefined)
        data.prioridad = input.prioridad;
    if (input.fechaInicio !== undefined)
        data.fechaInicio = input.fechaInicio ? fechaNoon(input.fechaInicio) : null;
    if (input.fechaLimite !== undefined)
        data.fechaLimite = input.fechaLimite ? fechaNoon(input.fechaLimite) : null;
    if (input.estado !== undefined)
        data.estado = input.estado;
    if (input.aprobadorId !== undefined)
        data.aprobadorId = input.aprobadorId;
    if (input.proyectoId !== undefined)
        data.proyectoId = input.proyectoId;
    if (input.porcentajeAvance !== undefined)
        data.porcentajeAvance = input.porcentajeAvance;
    if (input.canal !== undefined)
        data.canal = input.canal;
    if (input.tipoContenido !== undefined)
        data.tipoContenido = input.tipoContenido;
    if (input.fechaPublicacion !== undefined)
        data.fechaPublicacion = input.fechaPublicacion ? fechaNoon(input.fechaPublicacion) : null;
    if (input.tipoTarea !== undefined)
        data.tipoTarea = input.tipoTarea;
    if (input.tiempoEstimado !== undefined)
        data.tiempoEstimado = input.tiempoEstimado;
    if (input.solicitanteId !== undefined)
        data.solicitanteId = input.solicitanteId;
    if (input.criteriosTerminado !== undefined)
        data.criteriosTerminado = input.criteriosTerminado;
    if (input.sprint !== undefined)
        data.sprint = input.sprint;
    if (input.bloqueoMotivo !== undefined)
        data.bloqueoMotivo = input.bloqueoMotivo;
    if (input.bloqueoDependeDe !== undefined)
        data.bloqueoDependeDe = input.bloqueoDependeDe;
    if (input.resultadoFinal !== undefined)
        data.resultadoFinal = input.resultadoFinal;
    await client_1.db.update(schema_1.tareasOperativas).set(data).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    const cambios = input.responsableId && input.responsableId !== tarea.responsableId ? " (reasignada)" : "";
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "TareaOperativa",
        entidadId: id,
        accion: `Tarea actualizada: "${input.titulo ?? tarea.titulo}" → estado: ${input.estado ?? tarea.estado}${cambios}`,
        autorId,
    });
    return obtenerTarea(id);
}
// ─── Reasignación ─────────────────────────────────────────
async function reasignarTarea(id, nuevoResponsableId, autor) {
    const [tarea] = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    if (!tarea)
        throw new Error("Tarea no encontrada");
    const autorId = autor.id;
    await asegurarPuedeDelegar(autor, tarea);
    // `asignadoPorId` se reescribe con quien delega ahora. La tarea puede cambiar de manos
    // muchas veces; el que conserva el control es siempre el último que la delegó.
    await client_1.db.update(schema_1.tareasOperativas)
        .set({ responsableId: nuevoResponsableId, asignadoPorId: autorId, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "TareaOperativa",
        entidadId: id,
        accion: `Tarea reasignada: "${tarea.titulo}" → nuevo responsable`,
        autorId,
    });
    return obtenerTarea(id);
}
// ─── Registro de tiempo ───────────────────────────────────
async function registrarTiempo(id, minutos, _autorId) {
    const [tarea] = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    if (!tarea)
        throw new Error("Tarea no encontrada");
    const nuevoTiempo = (tarea.tiempoInvertido ?? 0) + minutos;
    await client_1.db.update(schema_1.tareasOperativas)
        .set({ tiempoInvertido: nuevoTiempo, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    return { tareaId: id, tiempoInvertido: nuevoTiempo, minutosAgregados: minutos };
}
// ─── Calendario Editorial ─────────────────────────────────
async function calendarioEditorial(params) {
    const conds = [
        params.canal ? (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.canal, params.canal) : undefined,
        params.responsableId ? (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.responsableId, params.responsableId) : undefined,
        params.desde ? (0, drizzle_orm_1.gte)(schema_1.tareasOperativas.fechaPublicacion, new Date(params.desde)) : undefined,
        params.hasta ? (0, drizzle_orm_1.lte)(schema_1.tareasOperativas.fechaPublicacion, new Date(params.hasta)) : undefined,
    ].filter(Boolean);
    return client_1.db
        .select(TAREA_COLUMNS)
        .from(schema_1.tareasOperativas)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.tareasOperativas.responsableId, schema_1.usuarios.id))
        .where(conds.length ? (0, drizzle_orm_1.and)(...conds) : undefined)
        .orderBy(schema_1.tareasOperativas.fechaPublicacion ?? (0, drizzle_orm_1.desc)(schema_1.tareasOperativas.updatedAt));
}
// ─── Checklist (sin cambios) ──────────────────────────────
async function agregarChecklistItem(tareaId, texto) {
    const id = crypto.randomUUID();
    const [ultimo] = await client_1.db
        .select({ orden: schema_1.tareaChecklist.orden })
        .from(schema_1.tareaChecklist)
        .where((0, drizzle_orm_1.eq)(schema_1.tareaChecklist.tareaId, tareaId))
        .orderBy(schema_1.tareaChecklist.orden)
        .limit(1);
    const orden = (ultimo?.orden ?? -1) + 1;
    await client_1.db.insert(schema_1.tareaChecklist).values({ id, tareaId, texto, orden, completado: false });
    return { id, tareaId, texto, completado: false, orden };
}
async function toggleChecklistItem(itemId, completado) {
    await client_1.db.update(schema_1.tareaChecklist).set({ completado }).where((0, drizzle_orm_1.eq)(schema_1.tareaChecklist.id, itemId));
    return { ok: true };
}
async function eliminarChecklistItem(itemId) {
    await client_1.db.delete(schema_1.tareaChecklist).where((0, drizzle_orm_1.eq)(schema_1.tareaChecklist.id, itemId));
    return { ok: true };
}
// ─── Comentarios ──────────────────────────────────────────
async function agregarComentario(tareaId, texto, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.tareaComentarios).values({ id, tareaId, autorId, texto, fecha: new Date() });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "TareaOperativa",
        entidadId: tareaId,
        accion: "Comentario agregado en tarea",
        autorId,
    });
    const [comentario] = await client_1.db
        .select({
        id: schema_1.tareaComentarios.id,
        autorId: schema_1.tareaComentarios.autorId,
        autorNombre: schema_1.usuarios.nombre,
        texto: schema_1.tareaComentarios.texto,
        fecha: schema_1.tareaComentarios.fecha,
    })
        .from(schema_1.tareaComentarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.tareaComentarios.autorId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.tareaComentarios.id, id));
    return comentario;
}
// ─── KPIs ─────────────────────────────────────────────────
async function kpiUsuario(usuarioId) {
    const misTareas = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.responsableId, usuarioId));
    const total = misTareas.length;
    const completadas = misTareas.filter((t) => ["aprobado", "publicado", "completada"].includes(t.estado)).length;
    const enProgreso = misTareas.filter((t) => t.estado === "en_proceso").length;
    const enRevision = misTareas.filter((t) => t.estado === "en_revision").length;
    const atrasadas = misTareas.filter((t) => {
        if (!t.fechaLimite)
            return false;
        return t.fechaLimite < new Date() && !["aprobado", "publicado", "completada", "cancelado"].includes(t.estado);
    }).length;
    const bloqueadas = misTareas.filter((t) => t.estado === "bloqueada").length;
    const tiempoTotal = misTareas.reduce((s, t) => s + (t.tiempoInvertido ?? 0), 0);
    const publicadas = misTareas.filter((t) => t.estado === "publicado").length;
    return { total, completadas, enProgreso, enRevision, atrasadas, bloqueadas, tiempoTotal, publicadas };
}
// ─── Marketing v2: Bloqueos ─────────────────────────────
async function bloquearTarea(id, motivo, dependeDe, autor) {
    const [tarea] = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    if (!tarea)
        throw new Error("Tarea no encontrada");
    const autorId = autor.id;
    await asegurarPuedeGestionar(autor, tarea);
    await client_1.db.update(schema_1.tareasOperativas)
        .set({
        estado: "bloqueada",
        bloqueoMotivo: motivo,
        bloqueoDependeDe: dependeDe ?? null,
        bloqueoDesde: new Date(),
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "TareaOperativa",
        entidadId: id,
        accion: `Tarea bloqueada: "${tarea.titulo}" — ${motivo}`,
        autorId,
    });
    return obtenerTarea(id);
}
async function desbloquearTarea(id, autor) {
    const [tarea] = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    if (!tarea)
        throw new Error("Tarea no encontrada");
    const autorId = autor.id;
    await asegurarPuedeGestionar(autor, tarea);
    await client_1.db.update(schema_1.tareasOperativas)
        .set({
        estado: "en_proceso",
        bloqueoMotivo: null,
        bloqueoDependeDe: null,
        bloqueoDesde: null,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "TareaOperativa",
        entidadId: id,
        accion: `Tarea desbloqueada: "${tarea.titulo}"`,
        autorId,
    });
    return obtenerTarea(id);
}
// ─── Marketing v2: Solicitudes de extensión ────────────
async function solicitarExtension(input, autorId) {
    const [tarea] = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, input.tareaId));
    if (!tarea)
        throw new Error("Tarea no encontrada");
    const id = crypto.randomUUID();
    const ahora = new Date();
    await client_1.db.insert(schema_1.solicitudesExtension).values({
        id,
        tareaId: input.tareaId,
        solicitanteId: autorId,
        motivo: input.motivo,
        porcentajeCompletado: input.porcentajeCompletado,
        tiempoAdicionalMinutos: input.tiempoAdicionalMinutos,
        nuevaFecha: new Date(input.nuevaFecha),
        dificultad: input.dificultad,
        estado: "pendiente",
        createdAt: ahora,
        updatedAt: ahora,
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "TareaOperativa",
        entidadId: input.tareaId,
        accion: `Solicitud de extensión: "${tarea.titulo}" — nueva fecha: ${input.nuevaFecha}`,
        autorId,
    });
    return { id, tareaId: input.tareaId, estado: "pendiente" };
}
async function resolverExtension(id, aprobada, autorizador) {
    const [sol] = await client_1.db.select().from(schema_1.solicitudesExtension).where((0, drizzle_orm_1.eq)(schema_1.solicitudesExtension.id, id));
    if (!sol)
        throw new Error("Solicitud no encontrada");
    const autorizadorId = autorizador.id;
    // Aprobar una prórroga es una decisión de jefe, no de par: mueve la fecha límite de un
    // compromiso. Antes lo podía hacer cualquiera con sesión — incluida la propia persona
    // que la pidió, que es como no tener control ninguno sobre lo que se delega.
    const [tareaDeLaSolicitud] = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, sol.tareaId));
    if (!tareaDeLaSolicitud)
        throw new Error("Tarea no encontrada");
    await asegurarPuedeGestionar(autorizador, tareaDeLaSolicitud);
    if (sol.solicitanteId === autorizadorId) {
        throw new SinPermisoTareaError("No puedes aprobar tu propia solicitud de extensión. Debe resolverla quien te asignó la tarea o un superior.");
    }
    if (!esRolDeMando(autorizador.rol) && tareaDeLaSolicitud.asignadoPorId !== autorizadorId) {
        throw new SinPermisoTareaError("Solo un Team Leader, Supervisor o Admin — o quien asignó la tarea — puede resolver una solicitud de extensión.");
    }
    const nuevoEstado = aprobada ? "aprobada" : "rechazada";
    await client_1.db.update(schema_1.solicitudesExtension)
        .set({ estado: nuevoEstado, autorizadorId, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.solicitudesExtension.id, id));
    if (aprobada && sol.nuevaFecha) {
        const [tarea] = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, sol.tareaId));
        await client_1.db.update(schema_1.tareasOperativas)
            .set({
            fechaLimiteOriginal: tarea?.fechaLimite ?? undefined,
            fechaLimite: sol.nuevaFecha,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.id, sol.tareaId));
    }
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "SolicitudExtension",
        entidadId: id,
        accion: `Extensión ${nuevoEstado} para tarea ${sol.tareaId}`,
        autorId: autorizadorId,
    });
    return { id, estado: nuevoEstado };
}
async function listarSolicitudesExtension(params) {
    const conds = [
        params.tareaId ? (0, drizzle_orm_1.eq)(schema_1.solicitudesExtension.tareaId, params.tareaId) : undefined,
        params.estado ? (0, drizzle_orm_1.eq)(schema_1.solicitudesExtension.estado, params.estado) : undefined,
    ].filter(Boolean);
    return client_1.db
        .select({
        id: schema_1.solicitudesExtension.id,
        tareaId: schema_1.solicitudesExtension.tareaId,
        solicitanteId: schema_1.solicitudesExtension.solicitanteId,
        solicitanteNombre: schema_1.usuarios.nombre,
        motivo: schema_1.solicitudesExtension.motivo,
        porcentajeCompletado: schema_1.solicitudesExtension.porcentajeCompletado,
        tiempoAdicionalMinutos: schema_1.solicitudesExtension.tiempoAdicionalMinutos,
        nuevaFecha: schema_1.solicitudesExtension.nuevaFecha,
        dificultad: schema_1.solicitudesExtension.dificultad,
        estado: schema_1.solicitudesExtension.estado,
        autorizadorId: schema_1.solicitudesExtension.autorizadorId,
        createdAt: schema_1.solicitudesExtension.createdAt,
        updatedAt: schema_1.solicitudesExtension.updatedAt,
    })
        .from(schema_1.solicitudesExtension)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.solicitudesExtension.solicitanteId, schema_1.usuarios.id))
        .where(conds.length ? (0, drizzle_orm_1.and)(...conds) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.solicitudesExtension.createdAt));
}
