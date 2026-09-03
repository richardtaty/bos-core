"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.podcastCitas = exports.podcastReportesDiarios = exports.podcastMetas = exports.metaAdsCampanas = exports.metaAdsGrupos = exports.metaAdsReportes = exports.egresos = exports.ventasIngresos = exports.ofertas = exports.eventosSeguridad = exports.codigosRecuperacion = exports.dispositivosConfiables = exports.bmfMensajes = exports.bmfDocumentos = exports.bmfOfertas = exports.bmfSolicitudes = exports.bmfComisiones = exports.bmfLlamadas = exports.bmfFundings = exports.bmfLenders = exports.recursos = exports.solicitudesExtension = exports.reportesDiarios = exports.bitacoraAuditoria = exports.archivos = exports.tareaComentarios = exports.tareaChecklist = exports.tareasOperativas = exports.proyectoComentarios = exports.proyectos = exports.usuarioDepartamentos = exports.equipoMiembros = exports.equipos = exports.departamentos = exports.pagos = exports.historialEtapas = exports.registros = exports.etapas = exports.pipelines = exports.tareasSeguimiento = exports.interacciones = exports.personaNegocios = exports.negocios = exports.personaTags = exports.tags = exports.personas = exports.usuarios = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
const cuid = () => (0, sqlite_core_1.text)("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamp = (name) => (0, sqlite_core_1.integer)(name, { mode: "timestamp" });
exports.usuarios = (0, sqlite_core_1.sqliteTable)("usuarios", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    email: (0, sqlite_core_1.text)("email").notNull().unique(),
    passwordHash: (0, sqlite_core_1.text)("password_hash").notNull(),
    // AGENTE es un rol de máquina (Hermes Agent), no de persona: solo lee, nunca escribe.
    // No está en la jerarquía de permisos ni se puede crear desde la interfaz — ver auth.ts.
    rol: (0, sqlite_core_1.text)("rol", { enum: ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "TEAM_LEADER", "USUARIO", "AGENTE"] }).notNull().default("USUARIO"),
    activo: (0, sqlite_core_1.integer)("activo", { mode: "boolean" }).notNull().default(true),
    departamentoId: (0, sqlite_core_1.text)("departamento_id"),
    cargo: (0, sqlite_core_1.text)("cargo"),
    supervisorId: (0, sqlite_core_1.text)("supervisor_id"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    // Seguridad: verificación en dos pasos (PIN)
    pinHash: (0, sqlite_core_1.text)("pin_hash"),
    pinHabilitado: (0, sqlite_core_1.integer)("pin_habilitado", { mode: "boolean" }).notNull().default(false),
    pinActualizadoEn: (0, sqlite_core_1.text)("pin_actualizado_en"),
    pinIntentosFallidos: (0, sqlite_core_1.integer)("pin_intentos_fallidos").notNull().default(0),
    pinBloqueadoHasta: (0, sqlite_core_1.text)("pin_bloqueado_hasta"),
    ultimoAccesoPin: (0, sqlite_core_1.text)("ultimo_acceso_pin"),
});
exports.personas = (0, sqlite_core_1.sqliteTable)("personas", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    telefono: (0, sqlite_core_1.text)("telefono"),
    email: (0, sqlite_core_1.text)("email"),
    ciudad: (0, sqlite_core_1.text)("ciudad").notNull(),
    estado: (0, sqlite_core_1.text)("estado").notNull(),
    fuente: (0, sqlite_core_1.text)("fuente").notNull(),
    referidoPor: (0, sqlite_core_1.text)("referido_por"),
    comentarios: (0, sqlite_core_1.text)("comentarios"),
    empresa: (0, sqlite_core_1.text)("empresa"),
    industria: (0, sqlite_core_1.text)("industria"),
    facturacionMensualEstimada: (0, sqlite_core_1.real)("facturacion_mensual_estimada"),
    tiempoEnNegocio: (0, sqlite_core_1.text)("tiempo_en_negocio"),
    fundingSolicitado: (0, sqlite_core_1.real)("funding_solicitado"),
    fundingAnterior: (0, sqlite_core_1.real)("funding_anterior"),
    temperatura: (0, sqlite_core_1.text)("temperatura"),
    prioridad: (0, sqlite_core_1.text)("prioridad"),
    estadoProceso: (0, sqlite_core_1.text)("estado_proceso"),
    fechaNacimiento: (0, sqlite_core_1.text)("fecha_nacimiento"),
    responsableId: (0, sqlite_core_1.text)("responsable_id").notNull().references(() => exports.usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    estadoIdx: (0, sqlite_core_1.index)("personas_estado_idx").on(t.estado),
    responsableIdx: (0, sqlite_core_1.index)("personas_responsable_idx").on(t.responsableId),
}));
exports.tags = (0, sqlite_core_1.sqliteTable)("tags", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull().unique(),
});
exports.personaTags = (0, sqlite_core_1.sqliteTable)("persona_tags", {
    personaId: (0, sqlite_core_1.text)("persona_id").notNull().references(() => exports.personas.id, { onDelete: "cascade" }),
    tagId: (0, sqlite_core_1.text)("tag_id").notNull().references(() => exports.tags.id, { onDelete: "cascade" }),
}, (t) => ({ pk: (0, sqlite_core_1.primaryKey)({ columns: [t.personaId, t.tagId] }) }));
exports.negocios = (0, sqlite_core_1.sqliteTable)("negocios", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull().unique(),
});
exports.personaNegocios = (0, sqlite_core_1.sqliteTable)("persona_negocios", {
    personaId: (0, sqlite_core_1.text)("persona_id").notNull().references(() => exports.personas.id, { onDelete: "cascade" }),
    negocioId: (0, sqlite_core_1.text)("negocio_id").notNull().references(() => exports.negocios.id, { onDelete: "cascade" }),
}, (t) => ({ pk: (0, sqlite_core_1.primaryKey)({ columns: [t.personaId, t.negocioId] }) }));
exports.interacciones = (0, sqlite_core_1.sqliteTable)("interacciones", {
    id: cuid(),
    personaId: (0, sqlite_core_1.text)("persona_id").notNull().references(() => exports.personas.id, { onDelete: "cascade" }),
    tipo: (0, sqlite_core_1.text)("tipo").notNull(),
    nota: (0, sqlite_core_1.text)("nota").notNull(),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
}, (t) => ({ personaFechaIdx: (0, sqlite_core_1.index)("interacciones_persona_fecha_idx").on(t.personaId, t.fecha) }));
exports.tareasSeguimiento = (0, sqlite_core_1.sqliteTable)("tareas_seguimiento", {
    id: cuid(),
    personaId: (0, sqlite_core_1.text)("persona_id").notNull().references(() => exports.personas.id, { onDelete: "cascade" }),
    fecha: timestamp("fecha").notNull(),
    nota: (0, sqlite_core_1.text)("nota"),
    completado: (0, sqlite_core_1.integer)("completado", { mode: "boolean" }).notNull().default(false),
    // Cuándo y quién completó la tarea — para series diarias de "follow-ups realizados hoy".
    completadoEn: timestamp("completado_en"),
    completadoPor: (0, sqlite_core_1.text)("completado_por"),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({ personaEstadoIdx: (0, sqlite_core_1.index)("tareas_persona_estado_idx").on(t.personaId, t.completado, t.fecha) }));
// ---------- Motor genérico de pipelines ----------
exports.pipelines = (0, sqlite_core_1.sqliteTable)("pipelines", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull().unique(),
    activo: (0, sqlite_core_1.integer)("activo", { mode: "boolean" }).notNull().default(true),
    departamentoId: (0, sqlite_core_1.text)("departamento_id"),
});
exports.etapas = (0, sqlite_core_1.sqliteTable)("etapas", {
    id: cuid(),
    pipelineId: (0, sqlite_core_1.text)("pipeline_id").notNull().references(() => exports.pipelines.id, { onDelete: "cascade" }),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    orden: (0, sqlite_core_1.integer)("orden").notNull(),
    esGanada: (0, sqlite_core_1.integer)("es_ganada", { mode: "boolean" }).notNull().default(false),
    esPerdida: (0, sqlite_core_1.integer)("es_perdida", { mode: "boolean" }).notNull().default(false),
    slaDias: (0, sqlite_core_1.integer)("sla_dias"),
}, (t) => ({
    pipelineNombreUq: (0, sqlite_core_1.uniqueIndex)("etapas_pipeline_nombre_uq").on(t.pipelineId, t.nombre),
    pipelineOrdenIdx: (0, sqlite_core_1.index)("etapas_pipeline_orden_idx").on(t.pipelineId, t.orden),
}));
exports.registros = (0, sqlite_core_1.sqliteTable)("registros", {
    id: cuid(),
    pipelineId: (0, sqlite_core_1.text)("pipeline_id").notNull().references(() => exports.pipelines.id),
    personaId: (0, sqlite_core_1.text)("persona_id").references(() => exports.personas.id),
    etapaId: (0, sqlite_core_1.text)("etapa_id").notNull().references(() => exports.etapas.id),
    valor: (0, sqlite_core_1.real)("valor"),
    motivoPerdida: (0, sqlite_core_1.text)("motivo_perdida"),
    proximoPago: (0, sqlite_core_1.real)("proximo_pago"),
    fechaProximoPago: timestamp("fecha_proximo_pago"),
    metodoPago: (0, sqlite_core_1.text)("metodo_pago"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    pipelineEtapaIdx: (0, sqlite_core_1.index)("registros_pipeline_etapa_idx").on(t.pipelineId, t.etapaId),
    personaIdx: (0, sqlite_core_1.index)("registros_persona_idx").on(t.personaId),
}));
exports.historialEtapas = (0, sqlite_core_1.sqliteTable)("historial_etapas", {
    id: cuid(),
    registroId: (0, sqlite_core_1.text)("registro_id").notNull().references(() => exports.registros.id, { onDelete: "cascade" }),
    etapaNuevaId: (0, sqlite_core_1.text)("etapa_nueva_id").notNull().references(() => exports.etapas.id),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
}, (t) => ({ registroFechaIdx: (0, sqlite_core_1.index)("historial_registro_fecha_idx").on(t.registroId, t.fecha) }));
// Cada abono/cuota pagada contra un registro (deal). El valor total del deal ya vive en
// registros.valor; la suma de pagos contra ese registro es lo efectivamente cobrado, y la
// diferencia es el saldo pendiente — nunca se guarda el saldo como campo, siempre se calcula.
exports.pagos = (0, sqlite_core_1.sqliteTable)("pagos", {
    id: cuid(),
    registroId: (0, sqlite_core_1.text)("registro_id").notNull().references(() => exports.registros.id, { onDelete: "cascade" }),
    monto: (0, sqlite_core_1.real)("monto").notNull(),
    nota: (0, sqlite_core_1.text)("nota"),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
}, (t) => ({ registroIdx: (0, sqlite_core_1.index)("pagos_registro_idx").on(t.registroId) }));
// ---------- Estructura organizacional ----------
exports.departamentos = (0, sqlite_core_1.sqliteTable)("departamentos", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull().unique(),
    descripcion: (0, sqlite_core_1.text)("descripcion"),
    activo: (0, sqlite_core_1.integer)("activo", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});
exports.equipos = (0, sqlite_core_1.sqliteTable)("equipos", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    departamentoId: (0, sqlite_core_1.text)("departamento_id").notNull().references(() => exports.departamentos.id),
    supervisorId: (0, sqlite_core_1.text)("supervisor_id").references(() => exports.usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({ deptoIdx: (0, sqlite_core_1.index)("equipos_depto_idx").on(t.departamentoId) }));
exports.equipoMiembros = (0, sqlite_core_1.sqliteTable)("equipo_miembros", {
    equipoId: (0, sqlite_core_1.text)("equipo_id").notNull().references(() => exports.equipos.id, { onDelete: "cascade" }),
    usuarioId: (0, sqlite_core_1.text)("usuario_id").notNull().references(() => exports.usuarios.id),
    cargo: (0, sqlite_core_1.text)("cargo").notNull().default("Miembro"),
}, (t) => ({ pk: (0, sqlite_core_1.primaryKey)({ columns: [t.equipoId, t.usuarioId] }) }));
// M:N — un ADMIN puede pertenecer a varios departamentos.
exports.usuarioDepartamentos = (0, sqlite_core_1.sqliteTable)("usuario_departamentos", {
    usuarioId: (0, sqlite_core_1.text)("usuario_id").notNull().references(() => exports.usuarios.id),
    departamentoId: (0, sqlite_core_1.text)("departamento_id").notNull().references(() => exports.departamentos.id),
}, (t) => ({ pk: (0, sqlite_core_1.primaryKey)({ columns: [t.usuarioId, t.departamentoId] }) }));
// ---------- Proyectos ----------
exports.proyectos = (0, sqlite_core_1.sqliteTable)("proyectos", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    objetivo: (0, sqlite_core_1.text)("objetivo"),
    cliente: (0, sqlite_core_1.text)("cliente"),
    responsableId: (0, sqlite_core_1.text)("responsable_id").notNull().references(() => exports.usuarios.id),
    departamentoId: (0, sqlite_core_1.text)("departamento_id").notNull().references(() => exports.departamentos.id),
    fechaInicio: timestamp("fecha_inicio"),
    fechaEntrega: timestamp("fecha_entrega"),
    prioridad: (0, sqlite_core_1.text)("prioridad", { enum: ["baja", "media", "alta", "urgente"] }).notNull().default("media"),
    estado: (0, sqlite_core_1.text)("estado", { enum: ["activo", "en_proceso", "completado", "en_revision", "cancelado", "en_pausa"] }).notNull().default("activo"),
    activo: (0, sqlite_core_1.integer)("activo", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    deptoIdx: (0, sqlite_core_1.index)("proyectos_depto_idx").on(t.departamentoId),
    responsableIdx: (0, sqlite_core_1.index)("proyectos_responsable_idx").on(t.responsableId),
}));
exports.proyectoComentarios = (0, sqlite_core_1.sqliteTable)("proyecto_comentarios", {
    id: cuid(),
    proyectoId: (0, sqlite_core_1.text)("proyecto_id").notNull().references(() => exports.proyectos.id, { onDelete: "cascade" }),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    texto: (0, sqlite_core_1.text)("texto").notNull(),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
}, (t) => ({ proyectoIdx: (0, sqlite_core_1.index)("proycom_idx").on(t.proyectoId) }));
// ---------- Tareas operativas ----------
exports.tareasOperativas = (0, sqlite_core_1.sqliteTable)("tareas_operativas", {
    id: cuid(),
    titulo: (0, sqlite_core_1.text)("titulo").notNull(),
    descripcion: (0, sqlite_core_1.text)("descripcion"),
    responsableId: (0, sqlite_core_1.text)("responsable_id").notNull().references(() => exports.usuarios.id),
    departamento: (0, sqlite_core_1.text)("departamento").notNull().default("Marketing"),
    prioridad: (0, sqlite_core_1.text)("prioridad", { enum: ["baja", "media", "alta", "urgente"] }).notNull().default("media"),
    fechaInicio: timestamp("fecha_inicio"),
    fechaLimite: timestamp("fecha_limite"),
    estado: (0, sqlite_core_1.text)("estado", {
        enum: [
            "solicitud", "backlog", "pendiente", "por_hacer",
            "en_proceso", "bloqueada", "en_revision", "requiere_ajustes",
            "completada", "aprobado", "publicado", "cancelado",
        ],
    })
        .notNull()
        .default("pendiente"),
    aprobadorId: (0, sqlite_core_1.text)("aprobador_id").references(() => exports.usuarios.id),
    proyectoId: (0, sqlite_core_1.text)("proyecto_id").references(() => exports.proyectos.id),
    porcentajeAvance: (0, sqlite_core_1.integer)("porcentaje_avance").default(0),
    canal: (0, sqlite_core_1.text)("canal"),
    tipoContenido: (0, sqlite_core_1.text)("tipo_contenido"),
    fechaPublicacion: timestamp("fecha_publicacion"),
    subtareaDe: (0, sqlite_core_1.text)("subtarea_de"),
    tiempoInvertido: (0, sqlite_core_1.integer)("tiempo_invertido").default(0),
    // ─── Marketing v2: nuevos campos ──────────────────────
    tipoTarea: (0, sqlite_core_1.text)("tipo_tarea"),
    tiempoEstimado: (0, sqlite_core_1.integer)("tiempo_estimado").default(0),
    solicitanteId: (0, sqlite_core_1.text)("solicitante_id").references(() => exports.usuarios.id),
    // Quién delegó la tarea. Distinto de responsable (quien la ejecuta), solicitante
    // (quien la pidió) y aprobador. Es la base de la garantía de que quien asigna nunca
    // pierde el control — ver puedeGestionarTarea en tareas.service.ts.
    asignadoPorId: (0, sqlite_core_1.text)("asignado_por_id").references(() => exports.usuarios.id),
    criteriosTerminado: (0, sqlite_core_1.text)("criterios_terminado"),
    bloqueoMotivo: (0, sqlite_core_1.text)("bloqueo_motivo"),
    bloqueoDependeDe: (0, sqlite_core_1.text)("bloqueo_depende_de"),
    bloqueoDesde: timestamp("bloqueo_desde"),
    fechaLimiteOriginal: timestamp("fecha_limite_original"),
    sprint: (0, sqlite_core_1.text)("sprint"),
    resultadoFinal: (0, sqlite_core_1.text)("resultado_final"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    responsableIdx: (0, sqlite_core_1.index)("tareas_responsable_idx").on(t.responsableId),
    asignadoPorIdx: (0, sqlite_core_1.index)("tareas_asignado_por_idx").on(t.asignadoPorId),
    estadoIdx: (0, sqlite_core_1.index)("tareas_estado_idx").on(t.estado),
    departamentoIdx: (0, sqlite_core_1.index)("tareas_depto_idx").on(t.departamento),
    fechaLimiteIdx: (0, sqlite_core_1.index)("tareas_fecha_limite_idx").on(t.fechaLimite),
    proyectoIdx: (0, sqlite_core_1.index)("tareas_proyecto_idx").on(t.proyectoId),
    canalIdx: (0, sqlite_core_1.index)("tareas_canal_idx").on(t.canal),
    fechaPubIdx: (0, sqlite_core_1.index)("tareas_fecha_pub_idx").on(t.fechaPublicacion),
}));
exports.tareaChecklist = (0, sqlite_core_1.sqliteTable)("tarea_checklist", {
    id: cuid(),
    tareaId: (0, sqlite_core_1.text)("tarea_id").notNull().references(() => exports.tareasOperativas.id, { onDelete: "cascade" }),
    texto: (0, sqlite_core_1.text)("texto").notNull(),
    completado: (0, sqlite_core_1.integer)("completado", { mode: "boolean" }).notNull().default(false),
    orden: (0, sqlite_core_1.integer)("orden").notNull().default(0),
}, (t) => ({ tareaIdx: (0, sqlite_core_1.index)("checklist_tarea_idx").on(t.tareaId) }));
exports.tareaComentarios = (0, sqlite_core_1.sqliteTable)("tarea_comentarios", {
    id: cuid(),
    tareaId: (0, sqlite_core_1.text)("tarea_id").notNull().references(() => exports.tareasOperativas.id, { onDelete: "cascade" }),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    texto: (0, sqlite_core_1.text)("texto").notNull(),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
}, (t) => ({ tareaIdx: (0, sqlite_core_1.index)("comentarios_tarea_idx").on(t.tareaId) }));
// ---------- Archivos (gestión documental multi-entidad) ----------
exports.archivos = (0, sqlite_core_1.sqliteTable)("archivos", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    url: (0, sqlite_core_1.text)("url").notNull(),
    tipo: (0, sqlite_core_1.text)("tipo", { enum: ["imagen", "video", "documento", "otro"] }).notNull().default("otro"),
    tamanoBytes: (0, sqlite_core_1.integer)("tamano_bytes").default(0),
    entidad: (0, sqlite_core_1.text)("entidad").notNull(),
    entidadId: (0, sqlite_core_1.text)("entidad_id").notNull(),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
}, (t) => ({ entidadIdx: (0, sqlite_core_1.index)("archivos_entidad_idx").on(t.entidad, t.entidadId) }));
exports.bitacoraAuditoria = (0, sqlite_core_1.sqliteTable)("bitacora_auditoria", {
    id: cuid(),
    entidad: (0, sqlite_core_1.text)("entidad").notNull(),
    entidadId: (0, sqlite_core_1.text)("entidad_id").notNull(),
    accion: (0, sqlite_core_1.text)("accion").notNull(),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    detalle: (0, sqlite_core_1.text)("detalle"),
    personaId: (0, sqlite_core_1.text)("persona_id").references(() => exports.personas.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
}, (t) => ({ entidadIdx: (0, sqlite_core_1.index)("bitacora_entidad_idx").on(t.entidad, t.entidadId) }));
// ---------- Marketing v2: Reportes diarios ──────────────
exports.reportesDiarios = (0, sqlite_core_1.sqliteTable)("reportes_diarios", {
    id: cuid(),
    usuarioId: (0, sqlite_core_1.text)("usuario_id").notNull().references(() => exports.usuarios.id),
    fecha: (0, sqlite_core_1.text)("fecha").notNull(), // YYYY-MM-DD en ET
    tareasAsignadas: (0, sqlite_core_1.text)("tareas_asignadas"),
    tareasCompletadas: (0, sqlite_core_1.text)("tareas_completadas"),
    tareasPendientes: (0, sqlite_core_1.text)("tareas_pendientes"),
    tiempoUtilizado: (0, sqlite_core_1.text)("tiempo_utilizado"),
    enlaces: (0, sqlite_core_1.text)("enlaces"),
    dificultades: (0, sqlite_core_1.text)("dificultades"),
    necesitaRevision: (0, sqlite_core_1.text)("necesita_revision"),
    apoyoRequerido: (0, sqlite_core_1.text)("apoyo_requerido"),
    observaciones: (0, sqlite_core_1.text)("observaciones"),
    estado: (0, sqlite_core_1.text)("estado", {
        enum: ["no_iniciado", "en_elaboracion", "enviado", "revisado", "requiere_correccion", "aprobado"],
    })
        .notNull()
        .default("no_iniciado"),
    revisadoPor: (0, sqlite_core_1.text)("revisado_por").references(() => exports.usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    usuarioFechaUq: (0, sqlite_core_1.uniqueIndex)("reportes_usuario_fecha_idx").on(t.usuarioId, t.fecha),
    estadoIdx: (0, sqlite_core_1.index)("reportes_estado_idx").on(t.estado),
    fechaIdx: (0, sqlite_core_1.index)("reportes_fecha_idx").on(t.fecha),
}));
// ---------- Marketing v2: Solicitudes de extensión ────────
exports.solicitudesExtension = (0, sqlite_core_1.sqliteTable)("solicitudes_extension", {
    id: cuid(),
    tareaId: (0, sqlite_core_1.text)("tarea_id").notNull().references(() => exports.tareasOperativas.id, { onDelete: "cascade" }),
    solicitanteId: (0, sqlite_core_1.text)("solicitante_id").notNull().references(() => exports.usuarios.id),
    motivo: (0, sqlite_core_1.text)("motivo").notNull(),
    porcentajeCompletado: (0, sqlite_core_1.integer)("porcentaje_completado").default(0),
    tiempoAdicionalMinutos: (0, sqlite_core_1.integer)("tiempo_adicional_minutos").default(0),
    nuevaFecha: timestamp("nueva_fecha"),
    dificultad: (0, sqlite_core_1.text)("dificultad"),
    estado: (0, sqlite_core_1.text)("estado", { enum: ["pendiente", "aprobada", "rechazada"] })
        .notNull()
        .default("pendiente"),
    autorizadorId: (0, sqlite_core_1.text)("autorizador_id").references(() => exports.usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    tareaIdx: (0, sqlite_core_1.index)("sol_ext_tarea_idx").on(t.tareaId),
    estadoIdx: (0, sqlite_core_1.index)("sol_ext_estado_idx").on(t.estado),
}));
// ---------- Marketing v2: Recursos y accesos ──────────────
exports.recursos = (0, sqlite_core_1.sqliteTable)("recursos", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    url: (0, sqlite_core_1.text)("url").notNull(),
    descripcion: (0, sqlite_core_1.text)("descripcion"),
    cliente: (0, sqlite_core_1.text)("cliente"),
    categoria: (0, sqlite_core_1.text)("categoria"),
    visibleRoles: (0, sqlite_core_1.text)("visible_roles").notNull().default("SUPER_ADMIN,ADMIN,USUARIO"),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    clienteIdx: (0, sqlite_core_1.index)("recursos_cliente_idx").on(t.cliente),
    categoriaIdx: (0, sqlite_core_1.index)("recursos_categoria_idx").on(t.categoria),
}));
// ---------- BMF — Business Market Finders ----------
exports.bmfLenders = (0, sqlite_core_1.sqliteTable)("bmf_lenders", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    contacto: (0, sqlite_core_1.text)("contacto"),
    email: (0, sqlite_core_1.text)("email"),
    telefono: (0, sqlite_core_1.text)("telefono"),
    productos: (0, sqlite_core_1.text)("productos"),
    montoMinimo: (0, sqlite_core_1.real)("monto_minimo"),
    montoMaximo: (0, sqlite_core_1.real)("monto_maximo"),
    tiempoRespuestaDias: (0, sqlite_core_1.integer)("tiempo_respuesta_dias"),
    estado: (0, sqlite_core_1.text)("estado").notNull().default("activo"),
    observaciones: (0, sqlite_core_1.text)("observaciones"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
exports.bmfFundings = (0, sqlite_core_1.sqliteTable)("bmf_fundings", {
    id: cuid(),
    clienteId: (0, sqlite_core_1.text)("cliente_id").notNull().references(() => exports.personas.id),
    agenteId: (0, sqlite_core_1.text)("agente_id").notNull().references(() => exports.usuarios.id),
    lenderId: (0, sqlite_core_1.text)("lender_id").references(() => exports.bmfLenders.id),
    montoSolicitado: (0, sqlite_core_1.real)("monto_solicitado").notNull(),
    montoAprobado: (0, sqlite_core_1.real)("monto_aprobado"),
    fechaCreacion: timestamp("fecha_creacion").notNull().$defaultFn(() => new Date()),
    fechaAprobacion: timestamp("fecha_aprobacion"),
    fechaFunding: timestamp("fecha_funding"),
    estado: (0, sqlite_core_1.text)("estado").notNull().default("pendiente"),
    comisionPorcentaje: (0, sqlite_core_1.real)("comision_porcentaje"),
    comisionMonto: (0, sqlite_core_1.real)("comision_monto"),
    observaciones: (0, sqlite_core_1.text)("observaciones"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    clienteIdx: (0, sqlite_core_1.index)("bmf_fundings_cliente_idx").on(t.clienteId),
    agenteIdx: (0, sqlite_core_1.index)("bmf_fundings_agente_idx").on(t.agenteId),
    lenderIdx: (0, sqlite_core_1.index)("bmf_fundings_lender_idx").on(t.lenderId),
    estadoIdx: (0, sqlite_core_1.index)("bmf_fundings_estado_idx").on(t.estado),
}));
exports.bmfLlamadas = (0, sqlite_core_1.sqliteTable)("bmf_llamadas", {
    id: cuid(),
    personaId: (0, sqlite_core_1.text)("persona_id").notNull().references(() => exports.personas.id),
    agenteId: (0, sqlite_core_1.text)("agente_id").notNull().references(() => exports.usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
    duracionMinutos: (0, sqlite_core_1.integer)("duracion_minutos"),
    resultado: (0, sqlite_core_1.text)("resultado").notNull().default("contestó"),
    observaciones: (0, sqlite_core_1.text)("observaciones"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    personaIdx: (0, sqlite_core_1.index)("bmf_llamadas_persona_idx").on(t.personaId, t.fecha),
    agenteIdx: (0, sqlite_core_1.index)("bmf_llamadas_agente_idx").on(t.agenteId, t.fecha),
}));
exports.bmfComisiones = (0, sqlite_core_1.sqliteTable)("bmf_comisiones", {
    id: cuid(),
    agenteId: (0, sqlite_core_1.text)("agente_id").notNull().references(() => exports.usuarios.id),
    fundingId: (0, sqlite_core_1.text)("funding_id").notNull().references(() => exports.bmfFundings.id),
    monto: (0, sqlite_core_1.real)("monto").notNull(),
    porcentaje: (0, sqlite_core_1.real)("porcentaje").notNull(),
    estado: (0, sqlite_core_1.text)("estado").notNull().default("pendiente"),
    fechaPago: timestamp("fecha_pago"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    agenteIdx: (0, sqlite_core_1.index)("bmf_comisiones_agente_idx").on(t.agenteId),
    fundingIdx: (0, sqlite_core_1.index)("bmf_comisiones_funding_idx").on(t.fundingId),
}));
// ---------- BMF Digital Funding — solicitudes / ofertas / docs / mensajes ----------
exports.bmfSolicitudes = (0, sqlite_core_1.sqliteTable)("bmf_solicitudes", {
    id: cuid(),
    applicationId: (0, sqlite_core_1.text)("application_id").notNull().unique(),
    personaId: (0, sqlite_core_1.text)("persona_id").notNull().references(() => exports.personas.id),
    registroId: (0, sqlite_core_1.text)("registro_id").references(() => exports.registros.id),
    empresaLegal: (0, sqlite_core_1.text)("empresa_legal"),
    dba: (0, sqlite_core_1.text)("dba"),
    empresaDireccion: (0, sqlite_core_1.text)("empresa_direccion"),
    empresaCiudad: (0, sqlite_core_1.text)("empresa_ciudad"),
    empresaEstado: (0, sqlite_core_1.text)("empresa_estado"),
    empresaZip: (0, sqlite_core_1.text)("empresa_zip"),
    industria: (0, sqlite_core_1.text)("industria"),
    estructuraNegocio: (0, sqlite_core_1.text)("estructura_negocio"),
    fechaInicioNegocio: (0, sqlite_core_1.text)("fecha_inicio_negocio"),
    sitioWeb: (0, sqlite_core_1.text)("sitio_web"),
    propietarioNombre: (0, sqlite_core_1.text)("propietario_nombre"),
    propietarioApellido: (0, sqlite_core_1.text)("propietario_apellido"),
    propietarioEmail: (0, sqlite_core_1.text)("propietario_email"),
    propietarioTelefono: (0, sqlite_core_1.text)("propietario_telefono"),
    porcentajePropiedad: (0, sqlite_core_1.real)("porcentaje_propiedad"),
    montoSolicitado: (0, sqlite_core_1.real)("monto_solicitado"),
    propositoFondos: (0, sqlite_core_1.text)("proposito_fondos"),
    ingresoMensualEstimado: (0, sqlite_core_1.real)("ingreso_mensual_estimado"),
    depositosMensualesPromedio: (0, sqlite_core_1.real)("depositos_mensuales_promedio"),
    tieneFinanciamientoActual: (0, sqlite_core_1.integer)("tiene_financiamiento_actual", { mode: "boolean" }).notNull().default(false),
    saldoFinanciamientoActual: (0, sqlite_core_1.real)("saldo_financiamiento_actual"),
    ein: (0, sqlite_core_1.text)("ein"),
    bancoNombre: (0, sqlite_core_1.text)("banco_nombre"),
    depositosMensualesAprox: (0, sqlite_core_1.integer)("depositos_mensuales_aprox"),
    estadoDocumentos: (0, sqlite_core_1.text)("estado_documentos", { enum: ["pendiente", "parcial", "completo"] }).notNull().default("pendiente"),
    consentimiento: (0, sqlite_core_1.integer)("consentimiento", { mode: "boolean" }).notNull().default(false),
    consentimientoFecha: timestamp("consentimiento_fecha"),
    fuente: (0, sqlite_core_1.text)("fuente"),
    campana: (0, sqlite_core_1.text)("campana"),
    utmSource: (0, sqlite_core_1.text)("utm_source"),
    utmMedium: (0, sqlite_core_1.text)("utm_medium"),
    utmCampaign: (0, sqlite_core_1.text)("utm_campaign"),
    landingPage: (0, sqlite_core_1.text)("landing_page"),
    ultimoSeguimientoEn: timestamp("ultimo_seguimiento_en"),
    seguimientosEnviados: (0, sqlite_core_1.integer)("seguimientos_enviados").notNull().default(0),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    personaIdx: (0, sqlite_core_1.index)("bmf_solicitudes_persona_idx").on(t.personaId),
    registroIdx: (0, sqlite_core_1.index)("bmf_solicitudes_registro_idx").on(t.registroId),
    estadoIdx: (0, sqlite_core_1.index)("bmf_solicitudes_estado_idx").on(t.estadoDocumentos),
}));
exports.bmfOfertas = (0, sqlite_core_1.sqliteTable)("bmf_ofertas", {
    id: cuid(),
    solicitudId: (0, sqlite_core_1.text)("solicitud_id").notNull().references(() => exports.bmfSolicitudes.id, { onDelete: "cascade" }),
    lenderId: (0, sqlite_core_1.text)("lender_id").references(() => exports.bmfLenders.id),
    monto: (0, sqlite_core_1.real)("monto"),
    plazo: (0, sqlite_core_1.text)("plazo"),
    frecuenciaPago: (0, sqlite_core_1.text)("frecuencia_pago"),
    montoPago: (0, sqlite_core_1.real)("monto_pago"),
    totalPagar: (0, sqlite_core_1.real)("total_pagar"),
    factorRate: (0, sqlite_core_1.real)("factor_rate"),
    costoOrigination: (0, sqlite_core_1.real)("costo_origination"),
    comisionBroker: (0, sqlite_core_1.real)("comision_broker"),
    comisionNeta: (0, sqlite_core_1.real)("comision_neta"),
    fechaExpiracion: timestamp("fecha_expiracion"),
    estado: (0, sqlite_core_1.text)("estado", { enum: ["borrador", "presentada", "aceptada", "rechazada", "expirada"] }).notNull().default("borrador"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    solicitudIdx: (0, sqlite_core_1.index)("bmf_ofertas_solicitud_idx").on(t.solicitudId),
    lenderIdx: (0, sqlite_core_1.index)("bmf_ofertas_lender_idx").on(t.lenderId),
}));
exports.bmfDocumentos = (0, sqlite_core_1.sqliteTable)("bmf_documentos", {
    id: cuid(),
    solicitudId: (0, sqlite_core_1.text)("solicitud_id").notNull().references(() => exports.bmfSolicitudes.id, { onDelete: "cascade" }),
    tipo: (0, sqlite_core_1.text)("tipo", { enum: ["bank_statement", "identificacion", "cheque_anulado", "otro"] }).notNull().default("otro"),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    storageKey: (0, sqlite_core_1.text)("storage_key"),
    tamanoBytes: (0, sqlite_core_1.integer)("tamano_bytes").notNull().default(0),
    contentType: (0, sqlite_core_1.text)("content_type"),
    estado: (0, sqlite_core_1.text)("estado", { enum: ["pendiente", "recibido", "verificado", "rechazado"] }).notNull().default("pendiente"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    solicitudIdx: (0, sqlite_core_1.index)("bmf_documentos_solicitud_idx").on(t.solicitudId),
}));
exports.bmfMensajes = (0, sqlite_core_1.sqliteTable)("bmf_mensajes", {
    id: cuid(),
    solicitudId: (0, sqlite_core_1.text)("solicitud_id").notNull().references(() => exports.bmfSolicitudes.id, { onDelete: "cascade" }),
    personaId: (0, sqlite_core_1.text)("persona_id").references(() => exports.personas.id),
    direccion: (0, sqlite_core_1.text)("direccion", { enum: ["entrante", "saliente"] }).notNull().default("saliente"),
    remitente: (0, sqlite_core_1.text)("remitente"),
    destinatario: (0, sqlite_core_1.text)("destinatario"),
    asunto: (0, sqlite_core_1.text)("asunto"),
    cuerpo: (0, sqlite_core_1.text)("cuerpo"),
    resendMessageId: (0, sqlite_core_1.text)("resend_message_id"),
    generadoPorIA: (0, sqlite_core_1.integer)("generado_por_ia", { mode: "boolean" }).notNull().default(false),
    estado: (0, sqlite_core_1.text)("estado", { enum: ["enviado", "entregado", "rebotado", "error"] }).notNull().default("enviado"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    solicitudIdx: (0, sqlite_core_1.index)("bmf_mensajes_solicitud_idx").on(t.solicitudId),
    personaIdx: (0, sqlite_core_1.index)("bmf_mensajes_persona_idx").on(t.personaId),
}));
// ─── Seguridad: verificación en dos pasos ─────────────────────
exports.dispositivosConfiables = (0, sqlite_core_1.sqliteTable)("dispositivos_confiables", {
    id: cuid(),
    usuarioId: (0, sqlite_core_1.text)("usuario_id").notNull().references(() => exports.usuarios.id),
    tokenHash: (0, sqlite_core_1.text)("token_hash").notNull(),
    nombreDispositivo: (0, sqlite_core_1.text)("nombre_dispositivo"),
    userAgent: (0, sqlite_core_1.text)("user_agent"),
    ipCreacion: (0, sqlite_core_1.text)("ip_creacion"),
    creadoEn: (0, sqlite_core_1.text)("creado_en").notNull(),
    expiraEn: (0, sqlite_core_1.text)("expira_en").notNull(),
    revocadoEn: (0, sqlite_core_1.text)("revocado_en"),
    ultimoUsoEn: (0, sqlite_core_1.text)("ultimo_uso_en"),
}, (t) => ({
    usuarioIdx: (0, sqlite_core_1.index)("idx_disp_usuario").on(t.usuarioId),
    tokenIdx: (0, sqlite_core_1.index)("idx_disp_token").on(t.tokenHash),
}));
exports.codigosRecuperacion = (0, sqlite_core_1.sqliteTable)("codigos_recuperacion", {
    id: cuid(),
    usuarioId: (0, sqlite_core_1.text)("usuario_id").notNull().references(() => exports.usuarios.id),
    codigoHash: (0, sqlite_core_1.text)("codigo_hash").notNull(),
    usadoEn: (0, sqlite_core_1.text)("usado_en"),
    creadoEn: (0, sqlite_core_1.text)("creado_en").notNull(),
    revocadoEn: (0, sqlite_core_1.text)("revocado_en"),
}, (t) => ({
    usuarioIdx: (0, sqlite_core_1.index)("idx_codigos_usuario").on(t.usuarioId),
}));
exports.eventosSeguridad = (0, sqlite_core_1.sqliteTable)("eventos_seguridad", {
    id: cuid(),
    usuarioId: (0, sqlite_core_1.text)("usuario_id").notNull().references(() => exports.usuarios.id),
    tipoEvento: (0, sqlite_core_1.text)("tipo_evento").notNull(),
    ip: (0, sqlite_core_1.text)("ip"),
    userAgent: (0, sqlite_core_1.text)("user_agent"),
    metadataSegura: (0, sqlite_core_1.text)("metadata_segura"),
    creadoEn: (0, sqlite_core_1.text)("creado_en").notNull(),
}, (t) => ({
    usuarioIdx: (0, sqlite_core_1.index)("idx_eventos_usuario").on(t.usuarioId),
    tipoIdx: (0, sqlite_core_1.index)("idx_eventos_tipo").on(t.tipoEvento, t.creadoEn),
}));
// ─── Motor de Ingresos ────────────────────────────
exports.ofertas = (0, sqlite_core_1.sqliteTable)("ofertas", {
    id: cuid(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull().unique(),
    categoria: (0, sqlite_core_1.text)("categoria", { enum: ["Ancla", "Recurrente", "Volumen medio", "Volumen alto", "Evento"] }).notNull(),
    target: (0, sqlite_core_1.real)("target").notNull().default(0),
    ticket: (0, sqlite_core_1.real)("ticket").notNull().default(0),
});
exports.ventasIngresos = (0, sqlite_core_1.sqliteTable)("ventas_ingresos", {
    id: cuid(),
    fecha: (0, sqlite_core_1.text)("fecha").notNull(),
    ofertaId: (0, sqlite_core_1.text)("oferta_id").notNull().references(() => exports.ofertas.id),
    monto: (0, sqlite_core_1.real)("monto").notNull(),
    nota: (0, sqlite_core_1.text)("nota"),
    esAnticipo: (0, sqlite_core_1.integer)("es_anticipo", { mode: "boolean" }).notNull().default(false),
    totalDeal: (0, sqlite_core_1.real)("total_deal"),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
}, (t) => ({
    ofertaIdx: (0, sqlite_core_1.index)("vi_oferta_idx").on(t.ofertaId),
    fechaIdx: (0, sqlite_core_1.index)("vi_fecha_idx").on(t.fecha),
}));
exports.egresos = (0, sqlite_core_1.sqliteTable)("egresos", {
    id: cuid(),
    fecha: (0, sqlite_core_1.text)("fecha").notNull(),
    categoria: (0, sqlite_core_1.text)("categoria", {
        enum: ["Nómina", "Aviones", "Hoteles", "Transportes", "Comidas", "Otro"],
    }).notNull(),
    ofertaId: (0, sqlite_core_1.text)("oferta_id").references(() => exports.ofertas.id),
    monto: (0, sqlite_core_1.real)("monto").notNull(),
    nota: (0, sqlite_core_1.text)("nota"),
    autorId: (0, sqlite_core_1.text)("autor_id").notNull().references(() => exports.usuarios.id),
}, (t) => ({
    categoriaIdx: (0, sqlite_core_1.index)("eg_categoria_idx").on(t.categoria),
    fechaIdx: (0, sqlite_core_1.index)("eg_fecha_idx").on(t.fecha),
}));
// ─── Métricas Meta Ads (registro manual, sin conexión a Meta) ────────────
exports.metaAdsReportes = (0, sqlite_core_1.sqliteTable)("meta_ads_reportes", {
    id: cuid(),
    fechaInicio: (0, sqlite_core_1.text)("fecha_inicio").notNull(),
    fechaFin: (0, sqlite_core_1.text)("fecha_fin").notNull(),
    titulo: (0, sqlite_core_1.text)("titulo"),
    observacionGeneral: (0, sqlite_core_1.text)("observacion_general"),
    presupuestoTotalActual: (0, sqlite_core_1.real)("presupuesto_total_actual"),
    creadoPor: (0, sqlite_core_1.text)("creado_por").notNull().references(() => exports.usuarios.id),
    actualizadoPor: (0, sqlite_core_1.text)("actualizado_por").references(() => exports.usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    fechasIdx: (0, sqlite_core_1.index)("meta_ads_reportes_fechas_idx").on(t.fechaInicio, t.fechaFin),
}));
exports.metaAdsGrupos = (0, sqlite_core_1.sqliteTable)("meta_ads_grupos", {
    id: cuid(),
    reporteId: (0, sqlite_core_1.text)("reporte_id").notNull().references(() => exports.metaAdsReportes.id, { onDelete: "cascade" }),
    seccionPrincipal: (0, sqlite_core_1.text)("seccion_principal").notNull(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    subtitulo: (0, sqlite_core_1.text)("subtitulo"),
    presupuestoTotalActual: (0, sqlite_core_1.real)("presupuesto_total_actual"),
    observacion: (0, sqlite_core_1.text)("observacion"),
    sinCampanasActivas: (0, sqlite_core_1.integer)("sin_campanas_activas", { mode: "boolean" }).notNull().default(false),
    orden: (0, sqlite_core_1.integer)("orden").notNull().default(0),
}, (t) => ({
    reporteIdx: (0, sqlite_core_1.index)("meta_ads_grupos_reporte_idx").on(t.reporteId),
}));
exports.metaAdsCampanas = (0, sqlite_core_1.sqliteTable)("meta_ads_campanas", {
    id: cuid(),
    grupoId: (0, sqlite_core_1.text)("grupo_id").notNull().references(() => exports.metaAdsGrupos.id, { onDelete: "cascade" }),
    // Referencia a sí misma (campana → segmentación). El FK real vive en la
    // migración SQL (meta_ads_campanas.campana_padre_id REFERENCES meta_ads_campanas).
    // Aquí se declara como texto plano para evitar la referencia circular de tipos.
    campanaPadreId: (0, sqlite_core_1.text)("campana_padre_id"),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    ubicacionPublico: (0, sqlite_core_1.text)("ubicacion_publico"),
    presupuesto: (0, sqlite_core_1.real)("presupuesto"),
    detallePresupuesto: (0, sqlite_core_1.text)("detalle_presupuesto"),
    leads: (0, sqlite_core_1.integer)("leads"),
    costoPorLead: (0, sqlite_core_1.real)("costo_por_lead"),
    moneda: (0, sqlite_core_1.text)("moneda").notNull().default("USD"),
    estado: (0, sqlite_core_1.text)("estado", { enum: ["Activa", "Inactiva"] }).notNull().default("Activa"),
    observaciones: (0, sqlite_core_1.text)("observaciones"),
    recomendaciones: (0, sqlite_core_1.text)("recomendaciones"),
    orden: (0, sqlite_core_1.integer)("orden").notNull().default(0),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    grupoIdx: (0, sqlite_core_1.index)("meta_ads_campanas_grupo_idx").on(t.grupoId),
    padreIdx: (0, sqlite_core_1.index)("meta_ads_campanas_padre_idx").on(t.campanaPadreId),
}));
// ─── Podcast Performance & AI Intelligence ────────────
// Solo se persiste lo que BOS no puede deducir de los datos ya existentes: las metas
// configurables y el reporte diario manual (prospección + compromiso). Las métricas
// de pipeline y follow-ups se calculan on-the-fly desde historial_etapas / tareas_seguimiento.
exports.podcastMetas = (0, sqlite_core_1.sqliteTable)("podcast_metas", {
    id: cuid(),
    clave: (0, sqlite_core_1.text)("clave").notNull(),
    nombre: (0, sqlite_core_1.text)("nombre").notNull(),
    valor: (0, sqlite_core_1.real)("valor").notNull(),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({ claveUq: (0, sqlite_core_1.uniqueIndex)("podcast_metas_clave_uq").on(t.clave) }));
exports.podcastReportesDiarios = (0, sqlite_core_1.sqliteTable)("podcast_reportes_diarios", {
    id: cuid(),
    usuarioId: (0, sqlite_core_1.text)("usuario_id").notNull().references(() => exports.usuarios.id),
    fecha: (0, sqlite_core_1.text)("fecha").notNull(), // YYYY-MM-DD en ET
    prospectosEncontrados: (0, sqlite_core_1.integer)("prospectos_encontrados"),
    prospectosContactados: (0, sqlite_core_1.integer)("prospectos_contactados"),
    respuestas: (0, sqlite_core_1.integer)("respuestas"),
    interesados: (0, sqlite_core_1.integer)("interesados"),
    compromisoContactos: (0, sqlite_core_1.integer)("compromiso_contactos"),
    compromisoFollowups: (0, sqlite_core_1.integer)("compromiso_followups"),
    compromisoPodcasts: (0, sqlite_core_1.integer)("compromiso_podcasts"),
    compromisoNota: (0, sqlite_core_1.text)("compromiso_nota"),
    bloqueos: (0, sqlite_core_1.text)("bloqueos"),
    estado: (0, sqlite_core_1.text)("estado", { enum: ["borrador", "enviado"] }).notNull().default("borrador"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
    usuarioFechaUq: (0, sqlite_core_1.uniqueIndex)("podcast_reportes_usuario_fecha_uq").on(t.usuarioId, t.fecha),
    fechaIdx: (0, sqlite_core_1.index)("podcast_reportes_fecha_idx").on(t.fecha),
}));
// Agenda de podcasts: día + hora + invitado (persona del CRM). `fecha` y `hora` son
// texto a propósito para que la cuadrícula del calendario compare strings sin timezone.
exports.podcastCitas = (0, sqlite_core_1.sqliteTable)("podcast_citas", {
    id: cuid(),
    personaId: (0, sqlite_core_1.text)("persona_id").notNull().references(() => exports.personas.id),
    fecha: (0, sqlite_core_1.text)("fecha").notNull(), // YYYY-MM-DD
    hora: (0, sqlite_core_1.text)("hora").notNull(), // HH:MM (24h)
    estado: (0, sqlite_core_1.text)("estado", { enum: ["agendado", "realizado", "cancelado"] }).notNull().default("agendado"),
    nota: (0, sqlite_core_1.text)("nota"),
    creadoPor: (0, sqlite_core_1.text)("creado_por").notNull().references(() => exports.usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({ fechaIdx: (0, sqlite_core_1.index)("podcast_citas_fecha_idx").on(t.fecha) }));
