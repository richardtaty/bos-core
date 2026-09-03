"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SinPermisoError = void 0;
exports.listarPersonas = listarPersonas;
exports.obtenerFichaPersona = obtenerFichaPersona;
exports.crearPersona = crearPersona;
exports.registrarInteraccion = registrarInteraccion;
exports.completarTarea = completarTarea;
exports.actualizarNegocios = actualizarNegocios;
exports.actualizarComentarios = actualizarComentarios;
exports.actualizarDatosPersona = actualizarDatosPersona;
exports.listarTareasPendientes = listarTareasPendientes;
exports.calcularProximoCumpleanos = calcularProximoCumpleanos;
exports.cumpleanosHoy = cumpleanosHoy;
exports.proximosCumpleanos = proximosCumpleanos;
exports.ubicacionesClientes = ubicacionesClientes;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
async function listarPersonas(params) {
    const condiciones = [
        params.search
            ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.personas.nombre, `%${params.search}%`), (0, drizzle_orm_1.like)(schema_1.personas.email, `%${params.search}%`), (0, drizzle_orm_1.like)(schema_1.personas.telefono, `%${params.search}%`))
            : undefined,
        params.estado ? (0, drizzle_orm_1.eq)(schema_1.personas.estado, params.estado) : undefined,
        params.responsableId ? (0, drizzle_orm_1.eq)(schema_1.personas.responsableId, params.responsableId) : undefined,
    ].filter(Boolean);
    const pagina = Math.max(1, params.pagina ?? 1);
    const limite = Math.min(100, Math.max(1, params.limite ?? 25));
    const filas = await client_1.db
        .select({
        id: schema_1.personas.id,
        nombre: schema_1.personas.nombre,
        telefono: schema_1.personas.telefono,
        email: schema_1.personas.email,
        ciudad: schema_1.personas.ciudad,
        estado: schema_1.personas.estado,
        fuente: schema_1.personas.fuente,
        fechaNacimiento: schema_1.personas.fechaNacimiento,
        responsableNombre: schema_1.usuarios.nombre,
        updatedAt: schema_1.personas.updatedAt,
    })
        .from(schema_1.personas)
        .leftJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.personas.responsableId, schema_1.usuarios.id))
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.personas.updatedAt));
    const total = filas.length;
    const paginadas = filas.slice((pagina - 1) * limite, pagina * limite);
    const paginaIds = paginadas.map(f => f.id);
    if (paginaIds.length === 0) {
        return { items: [], total, pagina, limite, totalPaginas: Math.ceil(total / limite) };
    }
    const tagsPorPersona = await client_1.db
        .select({ personaId: schema_1.personaTags.personaId, tagNombre: schema_1.tags.nombre })
        .from(schema_1.personaTags)
        .innerJoin(schema_1.tags, (0, drizzle_orm_1.eq)(schema_1.personaTags.tagId, schema_1.tags.id))
        .where((0, drizzle_orm_1.inArray)(schema_1.personaTags.personaId, paginaIds));
    const negociosPorPersona = await client_1.db
        .select({ personaId: schema_1.personaNegocios.personaId, negocioNombre: schema_1.negocios.nombre })
        .from(schema_1.personaNegocios)
        .innerJoin(schema_1.negocios, (0, drizzle_orm_1.eq)(schema_1.personaNegocios.negocioId, schema_1.negocios.id))
        .where((0, drizzle_orm_1.inArray)(schema_1.personaNegocios.personaId, paginaIds));
    const items = paginadas.map((p) => ({
        ...p,
        tags: tagsPorPersona.filter((t) => t.personaId === p.id).map((t) => t.tagNombre),
        negocios: negociosPorPersona.filter((n) => n.personaId === p.id).map((n) => n.negocioNombre),
    }));
    return { items, total, pagina, limite, totalPaginas: Math.ceil(total / limite) };
}
async function obtenerFichaPersona(id) {
    const [persona] = await client_1.db.select().from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, id));
    if (!persona)
        return null;
    const tagsPersona = await client_1.db
        .select({ nombre: schema_1.tags.nombre })
        .from(schema_1.personaTags)
        .innerJoin(schema_1.tags, (0, drizzle_orm_1.eq)(schema_1.personaTags.tagId, schema_1.tags.id))
        .where((0, drizzle_orm_1.eq)(schema_1.personaTags.personaId, id));
    const negociosPersona = await client_1.db
        .select({ nombre: schema_1.negocios.nombre })
        .from(schema_1.personaNegocios)
        .innerJoin(schema_1.negocios, (0, drizzle_orm_1.eq)(schema_1.personaNegocios.negocioId, schema_1.negocios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.personaNegocios.personaId, id));
    const interaccionesPersona = await client_1.db
        .select({
        id: schema_1.interacciones.id,
        tipo: schema_1.interacciones.tipo,
        nota: schema_1.interacciones.nota,
        fecha: schema_1.interacciones.fecha,
        autorNombre: schema_1.usuarios.nombre,
    })
        .from(schema_1.interacciones)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.interacciones.autorId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.interacciones.personaId, id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.interacciones.fecha));
    const tareas = await client_1.db
        .select()
        .from(schema_1.tareasSeguimiento)
        .where((0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.personaId, id))
        .orderBy(schema_1.tareasSeguimiento.fecha);
    const registrosPersona = await client_1.db
        .select({
        id: schema_1.registros.id,
        valor: schema_1.registros.valor,
        pipelineNombre: schema_1.pipelines.nombre,
        etapaNombre: schema_1.etapas.nombre,
        updatedAt: schema_1.registros.updatedAt,
    })
        .from(schema_1.registros)
        .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, schema_1.pipelines.id))
        .innerJoin(schema_1.etapas, (0, drizzle_orm_1.eq)(schema_1.registros.etapaId, schema_1.etapas.id))
        .where((0, drizzle_orm_1.eq)(schema_1.registros.personaId, id));
    const bitacora = await client_1.db
        .select({
        id: schema_1.bitacoraAuditoria.id,
        entidad: schema_1.bitacoraAuditoria.entidad,
        accion: schema_1.bitacoraAuditoria.accion,
        fecha: schema_1.bitacoraAuditoria.fecha,
        autorNombre: schema_1.usuarios.nombre,
    })
        .from(schema_1.bitacoraAuditoria)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.bitacoraAuditoria.autorId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.bitacoraAuditoria.personaId, id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bitacoraAuditoria.fecha))
        .limit(100);
    const timeline = [
        ...interaccionesPersona.map((i) => ({
            tipo: "interaccion",
            fecha: i.fecha,
            autor: i.autorNombre,
            detalle: `${i.tipo}: ${i.nota}`,
        })),
        ...bitacora.map((b) => ({
            tipo: "auditoria",
            fecha: b.fecha,
            autor: b.autorNombre,
            detalle: b.accion,
        })),
    ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return {
        ...persona,
        tags: tagsPersona.map((t) => t.nombre),
        negocios: negociosPersona.map((n) => n.nombre),
        interacciones: interaccionesPersona,
        tareas,
        registros: registrosPersona,
        timeline,
        historial: bitacora,
    };
}
async function crearPersona(input, autorId) {
    const id = crypto.randomUUID();
    const ahora = new Date();
    await client_1.db.insert(schema_1.personas).values({
        id,
        nombre: input.nombre,
        telefono: input.telefono,
        email: input.email || undefined,
        ciudad: input.ciudad,
        estado: input.estado,
        fuente: input.fuente,
        referidoPor: input.fuente === "Referido" ? input.referidoPor : undefined,
        responsableId: input.responsableId,
        fechaNacimiento: input.fechaNacimiento || undefined,
        createdAt: ahora,
        updatedAt: ahora,
    });
    for (const nombreTag of input.tags) {
        const [existente] = await client_1.db.select().from(schema_1.tags).where((0, drizzle_orm_1.eq)(schema_1.tags.nombre, nombreTag));
        const tag = existente ?? { id: crypto.randomUUID(), nombre: nombreTag };
        if (!existente)
            await client_1.db.insert(schema_1.tags).values(tag);
        await client_1.db.insert(schema_1.personaTags).values({ personaId: id, tagId: tag.id });
    }
    for (const nombreNegocio of input.negocios ?? []) {
        const [existente] = await client_1.db.select().from(schema_1.negocios).where((0, drizzle_orm_1.eq)(schema_1.negocios.nombre, nombreNegocio));
        const negocio = existente ?? { id: crypto.randomUUID(), nombre: nombreNegocio };
        if (!existente)
            await client_1.db.insert(schema_1.negocios).values(negocio);
        await client_1.db.insert(schema_1.personaNegocios).values({ personaId: id, negocioId: negocio.id });
    }
    // Si el contacto tiene fecha de nacimiento, crear tarea de seguimiento para su próximo cumpleaños
    if (input.fechaNacimiento) {
        const proximoCumple = calcularProximoCumpleanos(input.fechaNacimiento);
        await client_1.db.insert(schema_1.tareasSeguimiento).values({
            id: crypto.randomUUID(),
            personaId: id,
            fecha: proximoCumple,
            nota: `🎂 Cumpleaños de ${input.nombre}`,
            autorId,
            createdAt: new Date(),
        });
    }
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Persona",
        entidadId: id,
        accion: `Contacto creado — fuente: ${input.fuente}${input.referidoPor ? ` (referido por ${input.referidoPor})` : ""}`,
        autorId,
        personaId: id,
    });
    return obtenerFichaPersona(id);
}
// Registrar interacción + agendar seguimiento en una sola operación: ambos son obligatorios,
// nunca queda una interacción sin su próximo seguimiento (regla de negocio ya definida en el CRM).
async function registrarInteraccion(personaId, input, autorId) {
    const interaccionId = crypto.randomUUID();
    const tareaId = crypto.randomUUID();
    const fechaSeguimiento = new Date(input.proximoSeguimiento);
    await client_1.db.insert(schema_1.interacciones).values({
        id: interaccionId,
        personaId,
        tipo: input.tipo,
        nota: input.nota,
        autorId,
        fecha: new Date(),
    });
    await client_1.db.insert(schema_1.tareasSeguimiento).values({
        id: tareaId,
        personaId,
        fecha: fechaSeguimiento,
        nota: input.notaSeguimiento ?? `Seguimiento de ${input.tipo.toLowerCase()}`,
        autorId,
        createdAt: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Interaccion",
        entidadId: interaccionId,
        accion: `Interacción registrada (${input.tipo}) y seguimiento agendado para ${fechaSeguimiento.toISOString()}`,
        autorId,
        personaId,
    });
    return { interaccionId, tareaId };
}
async function completarTarea(tareaId, autorId) {
    const [tarea] = await client_1.db.select().from(schema_1.tareasSeguimiento).where((0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.id, tareaId));
    if (!tarea)
        throw new Error("Tarea no encontrada");
    await client_1.db.update(schema_1.tareasSeguimiento).set({ completado: true, completadoEn: new Date(), completadoPor: autorId }).where((0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.id, tareaId));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "TareaSeguimiento",
        entidadId: tareaId,
        accion: "Tarea de seguimiento marcada como completada",
        autorId,
        personaId: tarea.personaId,
    });
    // Si es una tarea de cumpleaños, crear la del próximo año automáticamente
    if (tarea.nota?.includes("🎂 Cumpleaños")) {
        const [persona] = await client_1.db.select({ fechaNacimiento: schema_1.personas.fechaNacimiento, nombre: schema_1.personas.nombre })
            .from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, tarea.personaId));
        if (persona?.fechaNacimiento) {
            // Calcular el próximo cumpleaños: siempre para el año siguiente al actual,
            // porque el de este año ya fue felicitado (acabamos de completar su tarea).
            const partes = persona.fechaNacimiento.split("-").map(Number);
            const ahora = new Date();
            const et = new Date(ahora.toLocaleString("en-US", { timeZone: "America/New_York" }));
            const proximoCumple = new Date(et.getFullYear() + 1, partes[1] - 1, partes[2]);
            await client_1.db.insert(schema_1.tareasSeguimiento).values({
                id: crypto.randomUUID(),
                personaId: tarea.personaId,
                fecha: proximoCumple,
                nota: `🎂 Cumpleaños de ${persona.nombre}`,
                autorId,
                createdAt: new Date(),
            });
        }
    }
    return { ...tarea, completado: true };
}
// Reemplaza por completo el conjunto de negocios de interés de un contacto — mismo patrón
// de "borrar todo y volver a insertar" que es seguro porque la tabla de unión es pequeña.
async function actualizarNegocios(personaId, nombresNegocios, autorId) {
    const [persona] = await client_1.db.select().from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, personaId));
    if (!persona)
        throw new Error("Persona no encontrada");
    await client_1.db.delete(schema_1.personaNegocios).where((0, drizzle_orm_1.eq)(schema_1.personaNegocios.personaId, personaId));
    for (const nombreNegocio of nombresNegocios) {
        const [existente] = await client_1.db.select().from(schema_1.negocios).where((0, drizzle_orm_1.eq)(schema_1.negocios.nombre, nombreNegocio));
        const negocio = existente ?? { id: crypto.randomUUID(), nombre: nombreNegocio };
        if (!existente)
            await client_1.db.insert(schema_1.negocios).values(negocio);
        await client_1.db.insert(schema_1.personaNegocios).values({ personaId, negocioId: negocio.id });
    }
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Persona",
        entidadId: personaId,
        accion: `Negocios de interés actualizados: ${nombresNegocios.join(", ") || "ninguno"}`,
        autorId,
        personaId,
    });
    return { ok: true };
}
async function actualizarComentarios(personaId, comentarios, autorId) {
    const [persona] = await client_1.db.select().from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, personaId));
    if (!persona)
        throw new Error("Persona no encontrada");
    await client_1.db.update(schema_1.personas).set({ comentarios, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.personas.id, personaId));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Persona",
        entidadId: personaId,
        accion: "Comentarios del cliente actualizados",
        autorId,
        personaId,
    });
    return { ok: true };
}
/**
 * El autor no tiene permiso sobre esta ficha. Es una clase propia (y no un Error normal)
 * para que la ruta pueda distinguirla de "no encontrada" y responder 403 en vez de 404.
 */
class SinPermisoError extends Error {
}
exports.SinPermisoError = SinPermisoError;
// Nombres en español para la bitácora, y qué campos se pueden dejar vacíos. Ciudad y estado
// son NOT NULL en la tabla y obligatorios al crear, así que no se pueden vaciar.
const CAMPOS_EDITABLES = [
    { clave: "telefono", etiqueta: "Teléfono", vaciable: true },
    { clave: "email", etiqueta: "Correo", vaciable: true },
    { clave: "ciudad", etiqueta: "Ciudad", vaciable: false },
    { clave: "estado", etiqueta: "Estado", vaciable: false },
    { clave: "fechaNacimiento", etiqueta: "Fecha de nacimiento", vaciable: true },
];
/**
 * Corrige los datos de contacto de una ficha ya creada.
 *
 * Permiso: el responsable del contacto, o cualquier ADMIN / SUPER_ADMIN. La verificación
 * vive aquí y no en la ruta porque necesita la persona ya cargada para comparar
 * `responsableId` — así no se consulta la misma fila dos veces.
 *
 * Solo escribe los campos que de verdad cambiaron, y deja en la bitácora el antes y el
 * después de cada uno, para que se pueda reconstruir quién corrigió qué.
 */
async function actualizarDatosPersona(personaId, datos, autor) {
    const [persona] = await client_1.db.select().from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, personaId));
    if (!persona)
        throw new Error("Persona no encontrada");
    const esAdmin = autor.rol === "ADMIN" || autor.rol === "SUPER_ADMIN";
    if (!esAdmin && persona.responsableId !== autor.id) {
        throw new SinPermisoError("Solo el responsable de este contacto o un administrador puede editar sus datos.");
    }
    const cambios = {};
    const detalle = [];
    for (const campo of CAMPOS_EDITABLES) {
        if (datos[campo.clave] === undefined)
            continue;
        const enviado = datos[campo.clave];
        const nuevo = enviado === "" && campo.vaciable ? null : enviado;
        const anterior = persona[campo.clave] ?? null;
        if (nuevo === anterior)
            continue;
        cambios[campo.clave] = nuevo;
        detalle.push(`${campo.etiqueta}: "${anterior ?? "(vacío)"}" → "${nuevo ?? "(vacío)"}"`);
    }
    // Nada cambió de verdad (mandaron los mismos valores). No se escribe ni se audita, para no
    // llenar la bitácora de entradas vacías.
    if (detalle.length === 0)
        return { ok: true, sinCambios: true };
    await client_1.db
        .update(schema_1.personas)
        // El cast es porque `cambios` se arma con claves dinámicas; los valores ya están
        // validados por actualizarPersonaSchema y solo se vacían los campos que aceptan null.
        .set({ ...cambios, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.personas.id, personaId));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Persona",
        entidadId: personaId,
        accion: "Datos de contacto actualizados",
        detalle: detalle.join(" | "),
        autorId: autor.id,
        personaId,
    });
    return { ok: true, cambios: detalle };
}
// Calendario global: todas las tareas de seguimiento pendientes, con la persona y su responsable —
// la base tanto de "Mi día" (filtrado por responsable) como del calendario completo del equipo.
async function listarTareasPendientes(responsableId) {
    const condiciones = [
        (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.completado, false),
        responsableId ? (0, drizzle_orm_1.eq)(schema_1.personas.responsableId, responsableId) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        id: schema_1.tareasSeguimiento.id,
        fecha: schema_1.tareasSeguimiento.fecha,
        nota: schema_1.tareasSeguimiento.nota,
        personaId: schema_1.personas.id,
        personaNombre: schema_1.personas.nombre,
        responsableId: schema_1.personas.responsableId,
        responsableNombre: schema_1.usuarios.nombre,
    })
        .from(schema_1.tareasSeguimiento)
        .innerJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.personaId, schema_1.personas.id))
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.personas.responsableId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.and)(...condiciones))
        .orderBy(schema_1.tareasSeguimiento.fecha);
    return filas;
}
// Calcula la fecha del próximo cumpleaños a partir de una fecha de nacimiento (YYYY-MM-DD).
// Si el cumpleaños de este año ya pasó, devuelve el del año siguiente.
function calcularProximoCumpleanos(fechaNacimiento) {
    const partes = fechaNacimiento.split("-").map(Number);
    const mes = partes[1];
    const dia = partes[2];
    const ahora = new Date();
    // Usar Eastern Time para consistencia con el resto del sistema
    const et = new Date(ahora.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const añoActual = et.getFullYear();
    // Cumpleaños este año
    const cumpleEsteAño = new Date(añoActual, mes - 1, dia);
    // Si ya pasó (o es hoy), usar el año siguiente
    // Para "hoy": queremos que la tarea aparezca como "para hoy", no crear la del año siguiente todavía
    const hoyInicio = new Date(et.getFullYear(), et.getMonth(), et.getDate());
    if (cumpleEsteAño < hoyInicio) {
        return new Date(añoActual + 1, mes - 1, dia);
    }
    return cumpleEsteAño;
}
// Contactos que cumplen años hoy (comparando día y mes en Eastern Time)
async function cumpleanosHoy() {
    const filas = await client_1.db
        .select({
        id: schema_1.personas.id,
        nombre: schema_1.personas.nombre,
        fechaNacimiento: schema_1.personas.fechaNacimiento,
    })
        .from(schema_1.personas);
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hoyMes = et.getMonth() + 1;
    const hoyDia = et.getDate();
    return filas
        .filter((p) => {
        if (!p.fechaNacimiento)
            return false;
        const [, mes, dia] = p.fechaNacimiento.split("-").map(Number);
        return mes === hoyMes && dia === hoyDia;
    })
        .map((p) => ({
        personaId: p.id,
        personaNombre: p.nombre,
        fechaNacimiento: p.fechaNacimiento,
    }));
}
// Próximos cumpleaños en los siguientes N días (excluyendo hoy)
async function proximosCumpleanos(dias = 14) {
    const filas = await client_1.db
        .select({
        id: schema_1.personas.id,
        nombre: schema_1.personas.nombre,
        fechaNacimiento: schema_1.personas.fechaNacimiento,
    })
        .from(schema_1.personas);
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hoy = new Date(et.getFullYear(), et.getMonth(), et.getDate());
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + dias);
    return filas
        .filter((p) => {
        if (!p.fechaNacimiento)
            return false;
        const partes = p.fechaNacimiento.split("-").map(Number);
        const mes = partes[1];
        const dia = partes[2];
        // Cumpleaños este año
        const cumpleEsteAño = new Date(hoy.getFullYear(), mes - 1, dia);
        // Si ya pasó hoy, usar el año siguiente
        const fechaCumple = cumpleEsteAño <= hoy
            ? new Date(hoy.getFullYear() + 1, mes - 1, dia)
            : cumpleEsteAño;
        return fechaCumple > hoy && fechaCumple <= limite;
    })
        .map((p) => ({
        personaId: p.id,
        personaNombre: p.nombre,
        fechaNacimiento: p.fechaNacimiento,
    }));
}
// Ubicaciones de clientes para el mapa
async function ubicacionesClientes() {
    const filas = await client_1.db
        .select({
        ciudad: schema_1.personas.ciudad,
        estado: schema_1.personas.estado,
    })
        .from(schema_1.personas)
        .orderBy(schema_1.personas.estado, schema_1.personas.ciudad);
    // Agrupar y contar en JavaScript (evita problemas con count() en el driver proxy)
    const conteo = new Map();
    for (const f of filas) {
        const key = `${f.ciudad}|${f.estado}`;
        const existente = conteo.get(key);
        if (existente) {
            existente.total++;
        }
        else {
            conteo.set(key, { ciudad: f.ciudad, estado: f.estado, total: 1 });
        }
    }
    return Array.from(conteo.values());
}
