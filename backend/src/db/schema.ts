import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const cuid = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamp = (name: string) => integer(name, { mode: "timestamp" });

export const usuarios = sqliteTable("usuarios", {
  id: cuid(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // AGENTE es un rol de máquina (Hermes Agent), no de persona: solo lee, nunca escribe.
  // No está en la jerarquía de permisos ni se puede crear desde la interfaz — ver auth.ts.
  rol: text("rol", { enum: ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "TEAM_LEADER", "USUARIO", "AGENTE"] }).notNull().default("USUARIO"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  departamentoId: text("departamento_id"),
  cargo: text("cargo"),
  supervisorId: text("supervisor_id"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  // Seguridad: verificación en dos pasos (PIN)
  pinHash: text("pin_hash"),
  pinHabilitado: integer("pin_habilitado", { mode: "boolean" }).notNull().default(false),
  pinActualizadoEn: text("pin_actualizado_en"),
  pinIntentosFallidos: integer("pin_intentos_fallidos").notNull().default(0),
  pinBloqueadoHasta: text("pin_bloqueado_hasta"),
  ultimoAccesoPin: text("ultimo_acceso_pin"),
});

export const personas = sqliteTable(
  "personas",
  {
    id: cuid(),
    nombre: text("nombre").notNull(),
    telefono: text("telefono"),
    email: text("email"),
    ciudad: text("ciudad").notNull(),
    estado: text("estado").notNull(),
    fuente: text("fuente").notNull(),
    referidoPor: text("referido_por"),
    comentarios: text("comentarios"),
    empresa: text("empresa"),
    industria: text("industria"),
    facturacionMensualEstimada: real("facturacion_mensual_estimada"),
    tiempoEnNegocio: text("tiempo_en_negocio"),
    fundingSolicitado: real("funding_solicitado"),
    fundingAnterior: real("funding_anterior"),
    temperatura: text("temperatura"),
    prioridad: text("prioridad"),
    estadoProceso: text("estado_proceso"),
    fechaNacimiento: text("fecha_nacimiento"),
    responsableId: text("responsable_id").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    estadoIdx: index("personas_estado_idx").on(t.estado),
    responsableIdx: index("personas_responsable_idx").on(t.responsableId),
  })
);

export const tags = sqliteTable("tags", {
  id: cuid(),
  nombre: text("nombre").notNull().unique(),
});

export const personaTags = sqliteTable(
  "persona_tags",
  {
    personaId: text("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.personaId, t.tagId] }) })
);

export const negocios = sqliteTable("negocios", {
  id: cuid(),
  nombre: text("nombre").notNull().unique(),
});

export const personaNegocios = sqliteTable(
  "persona_negocios",
  {
    personaId: text("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    negocioId: text("negocio_id").notNull().references(() => negocios.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.personaId, t.negocioId] }) })
);

export const interacciones = sqliteTable(
  "interacciones",
  {
    id: cuid(),
    personaId: text("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    nota: text("nota").notNull(),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ personaFechaIdx: index("interacciones_persona_fecha_idx").on(t.personaId, t.fecha) })
);

export const tareasSeguimiento = sqliteTable(
  "tareas_seguimiento",
  {
    id: cuid(),
    personaId: text("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    fecha: timestamp("fecha").notNull(),
    nota: text("nota"),
    completado: integer("completado", { mode: "boolean" }).notNull().default(false),
    // Cuándo y quién completó la tarea — para series diarias de "follow-ups realizados hoy".
    completadoEn: timestamp("completado_en"),
    completadoPor: text("completado_por"),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ personaEstadoIdx: index("tareas_persona_estado_idx").on(t.personaId, t.completado, t.fecha) })
);

// ---------- Motor genérico de pipelines ----------

export const pipelines = sqliteTable("pipelines", {
  id: cuid(),
  nombre: text("nombre").notNull().unique(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  departamentoId: text("departamento_id"),
});

export const etapas = sqliteTable(
  "etapas",
  {
    id: cuid(),
    pipelineId: text("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull(),
    esGanada: integer("es_ganada", { mode: "boolean" }).notNull().default(false),
    esPerdida: integer("es_perdida", { mode: "boolean" }).notNull().default(false),
    slaDias: integer("sla_dias"),
  },
  (t) => ({
    pipelineNombreUq: uniqueIndex("etapas_pipeline_nombre_uq").on(t.pipelineId, t.nombre),
    pipelineOrdenIdx: index("etapas_pipeline_orden_idx").on(t.pipelineId, t.orden),
  })
);

export const registros = sqliteTable(
  "registros",
  {
    id: cuid(),
    pipelineId: text("pipeline_id").notNull().references(() => pipelines.id),
    personaId: text("persona_id").references(() => personas.id),
    etapaId: text("etapa_id").notNull().references(() => etapas.id),
    valor: real("valor"),
    motivoPerdida: text("motivo_perdida"),
    proximoPago: real("proximo_pago"),
    fechaProximoPago: timestamp("fecha_proximo_pago"),
    metodoPago: text("metodo_pago"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    pipelineEtapaIdx: index("registros_pipeline_etapa_idx").on(t.pipelineId, t.etapaId),
    personaIdx: index("registros_persona_idx").on(t.personaId),
  })
);

export const historialEtapas = sqliteTable(
  "historial_etapas",
  {
    id: cuid(),
    registroId: text("registro_id").notNull().references(() => registros.id, { onDelete: "cascade" }),
    etapaNuevaId: text("etapa_nueva_id").notNull().references(() => etapas.id),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ registroFechaIdx: index("historial_registro_fecha_idx").on(t.registroId, t.fecha) })
);

// Cada abono/cuota pagada contra un registro (deal). El valor total del deal ya vive en
// registros.valor; la suma de pagos contra ese registro es lo efectivamente cobrado, y la
// diferencia es el saldo pendiente — nunca se guarda el saldo como campo, siempre se calcula.
export const pagos = sqliteTable(
  "pagos",
  {
    id: cuid(),
    registroId: text("registro_id").notNull().references(() => registros.id, { onDelete: "cascade" }),
    monto: real("monto").notNull(),
    nota: text("nota"),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ registroIdx: index("pagos_registro_idx").on(t.registroId) })
);

// ---------- Estructura organizacional ----------

export const departamentos = sqliteTable("departamentos", {
  id: cuid(),
  nombre: text("nombre").notNull().unique(),
  descripcion: text("descripcion"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const equipos = sqliteTable(
  "equipos",
  {
    id: cuid(),
    nombre: text("nombre").notNull(),
    departamentoId: text("departamento_id").notNull().references(() => departamentos.id),
    supervisorId: text("supervisor_id").references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ deptoIdx: index("equipos_depto_idx").on(t.departamentoId) })
);

export const equipoMiembros = sqliteTable(
  "equipo_miembros",
  {
    equipoId: text("equipo_id").notNull().references(() => equipos.id, { onDelete: "cascade" }),
    usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
    cargo: text("cargo").notNull().default("Miembro"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.equipoId, t.usuarioId] }) })
);

// M:N — un ADMIN puede pertenecer a varios departamentos.
export const usuarioDepartamentos = sqliteTable(
  "usuario_departamentos",
  {
    usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
    departamentoId: text("departamento_id").notNull().references(() => departamentos.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.usuarioId, t.departamentoId] }) })
);

// ---------- Proyectos ----------

export const proyectos = sqliteTable(
  "proyectos",
  {
    id: cuid(),
    nombre: text("nombre").notNull(),
    objetivo: text("objetivo"),
    cliente: text("cliente"),
    responsableId: text("responsable_id").notNull().references(() => usuarios.id),
    departamentoId: text("departamento_id").notNull().references(() => departamentos.id),
    fechaInicio: timestamp("fecha_inicio"),
    fechaEntrega: timestamp("fecha_entrega"),
    prioridad: text("prioridad", { enum: ["baja", "media", "alta", "urgente"] }).notNull().default("media"),
    estado: text("estado", { enum: ["activo", "en_proceso", "completado", "en_revision", "cancelado", "en_pausa"] }).notNull().default("activo"),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    deptoIdx: index("proyectos_depto_idx").on(t.departamentoId),
    responsableIdx: index("proyectos_responsable_idx").on(t.responsableId),
  })
);

export const proyectoComentarios = sqliteTable(
  "proyecto_comentarios",
  {
    id: cuid(),
    proyectoId: text("proyecto_id").notNull().references(() => proyectos.id, { onDelete: "cascade" }),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    texto: text("texto").notNull(),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ proyectoIdx: index("proycom_idx").on(t.proyectoId) })
);

// ---------- Tareas operativas ----------

export const tareasOperativas = sqliteTable(
  "tareas_operativas",
  {
    id: cuid(),
    titulo: text("titulo").notNull(),
    descripcion: text("descripcion"),
    responsableId: text("responsable_id").notNull().references(() => usuarios.id),
    departamento: text("departamento").notNull().default("Marketing"),
    prioridad: text("prioridad", { enum: ["baja", "media", "alta", "urgente"] }).notNull().default("media"),
    fechaInicio: timestamp("fecha_inicio"),
    fechaLimite: timestamp("fecha_limite"),
    estado: text("estado", {
      enum: [
        "solicitud", "backlog", "pendiente", "por_hacer",
        "en_proceso", "bloqueada", "en_revision", "requiere_ajustes",
        "completada", "aprobado", "publicado", "cancelado",
      ],
    })
      .notNull()
      .default("pendiente"),
    aprobadorId: text("aprobador_id").references(() => usuarios.id),
    proyectoId: text("proyecto_id").references(() => proyectos.id),
    porcentajeAvance: integer("porcentaje_avance").default(0),
    canal: text("canal"),
    tipoContenido: text("tipo_contenido"),
    fechaPublicacion: timestamp("fecha_publicacion"),
    subtareaDe: text("subtarea_de"),
    tiempoInvertido: integer("tiempo_invertido").default(0),
    // ─── Marketing v2: nuevos campos ──────────────────────
    tipoTarea: text("tipo_tarea"),
    tiempoEstimado: integer("tiempo_estimado").default(0),
    solicitanteId: text("solicitante_id").references(() => usuarios.id),
    // Quién delegó la tarea. Distinto de responsable (quien la ejecuta), solicitante
    // (quien la pidió) y aprobador. Es la base de la garantía de que quien asigna nunca
    // pierde el control — ver puedeGestionarTarea en tareas.service.ts.
    asignadoPorId: text("asignado_por_id").references(() => usuarios.id),
    criteriosTerminado: text("criterios_terminado"),
    bloqueoMotivo: text("bloqueo_motivo"),
    bloqueoDependeDe: text("bloqueo_depende_de"),
    bloqueoDesde: timestamp("bloqueo_desde"),
    fechaLimiteOriginal: timestamp("fecha_limite_original"),
    sprint: text("sprint"),
    resultadoFinal: text("resultado_final"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    responsableIdx: index("tareas_responsable_idx").on(t.responsableId),
    asignadoPorIdx: index("tareas_asignado_por_idx").on(t.asignadoPorId),
    estadoIdx: index("tareas_estado_idx").on(t.estado),
    departamentoIdx: index("tareas_depto_idx").on(t.departamento),
    fechaLimiteIdx: index("tareas_fecha_limite_idx").on(t.fechaLimite),
    proyectoIdx: index("tareas_proyecto_idx").on(t.proyectoId),
    canalIdx: index("tareas_canal_idx").on(t.canal),
    fechaPubIdx: index("tareas_fecha_pub_idx").on(t.fechaPublicacion),
  })
);

export const tareaChecklist = sqliteTable(
  "tarea_checklist",
  {
    id: cuid(),
    tareaId: text("tarea_id").notNull().references(() => tareasOperativas.id, { onDelete: "cascade" }),
    texto: text("texto").notNull(),
    completado: integer("completado", { mode: "boolean" }).notNull().default(false),
    orden: integer("orden").notNull().default(0),
  },
  (t) => ({ tareaIdx: index("checklist_tarea_idx").on(t.tareaId) })
);

export const tareaComentarios = sqliteTable(
  "tarea_comentarios",
  {
    id: cuid(),
    tareaId: text("tarea_id").notNull().references(() => tareasOperativas.id, { onDelete: "cascade" }),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    texto: text("texto").notNull(),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ tareaIdx: index("comentarios_tarea_idx").on(t.tareaId) })
);

// ---------- Archivos (gestión documental multi-entidad) ----------

export const archivos = sqliteTable(
  "archivos",
  {
    id: cuid(),
    nombre: text("nombre").notNull(),
    url: text("url").notNull(),
    tipo: text("tipo", { enum: ["imagen", "video", "documento", "otro"] }).notNull().default("otro"),
    tamanoBytes: integer("tamano_bytes").default(0),
    entidad: text("entidad").notNull(),
    entidadId: text("entidad_id").notNull(),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ entidadIdx: index("archivos_entidad_idx").on(t.entidad, t.entidadId) })
);

export const bitacoraAuditoria = sqliteTable(
  "bitacora_auditoria",
  {
    id: cuid(),
    entidad: text("entidad").notNull(),
    entidadId: text("entidad_id").notNull(),
    accion: text("accion").notNull(),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    detalle: text("detalle"),
    personaId: text("persona_id").references(() => personas.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ entidadIdx: index("bitacora_entidad_idx").on(t.entidad, t.entidadId) })
);

// ---------- Marketing v2: Reportes diarios ──────────────

export const reportesDiarios = sqliteTable(
  "reportes_diarios",
  {
    id: cuid(),
    usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
    fecha: text("fecha").notNull(), // YYYY-MM-DD en ET
    tareasAsignadas: text("tareas_asignadas"),
    tareasCompletadas: text("tareas_completadas"),
    tareasPendientes: text("tareas_pendientes"),
    tiempoUtilizado: text("tiempo_utilizado"),
    enlaces: text("enlaces"),
    dificultades: text("dificultades"),
    necesitaRevision: text("necesita_revision"),
    apoyoRequerido: text("apoyo_requerido"),
    observaciones: text("observaciones"),
    estado: text("estado", {
      enum: ["no_iniciado", "en_elaboracion", "enviado", "revisado", "requiere_correccion", "aprobado"],
    })
      .notNull()
      .default("no_iniciado"),
    revisadoPor: text("revisado_por").references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    usuarioFechaUq: uniqueIndex("reportes_usuario_fecha_idx").on(t.usuarioId, t.fecha),
    estadoIdx: index("reportes_estado_idx").on(t.estado),
    fechaIdx: index("reportes_fecha_idx").on(t.fecha),
  })
);

// ---------- Marketing v2: Solicitudes de extensión ────────

export const solicitudesExtension = sqliteTable(
  "solicitudes_extension",
  {
    id: cuid(),
    tareaId: text("tarea_id").notNull().references(() => tareasOperativas.id, { onDelete: "cascade" }),
    solicitanteId: text("solicitante_id").notNull().references(() => usuarios.id),
    motivo: text("motivo").notNull(),
    porcentajeCompletado: integer("porcentaje_completado").default(0),
    tiempoAdicionalMinutos: integer("tiempo_adicional_minutos").default(0),
    nuevaFecha: timestamp("nueva_fecha"),
    dificultad: text("dificultad"),
    estado: text("estado", { enum: ["pendiente", "aprobada", "rechazada"] })
      .notNull()
      .default("pendiente"),
    autorizadorId: text("autorizador_id").references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    tareaIdx: index("sol_ext_tarea_idx").on(t.tareaId),
    estadoIdx: index("sol_ext_estado_idx").on(t.estado),
  })
);

// ---------- Marketing v2: Recursos y accesos ──────────────

export const recursos = sqliteTable(
  "recursos",
  {
    id: cuid(),
    nombre: text("nombre").notNull(),
    url: text("url").notNull(),
    descripcion: text("descripcion"),
    cliente: text("cliente"),
    categoria: text("categoria"),
    visibleRoles: text("visible_roles").notNull().default("SUPER_ADMIN,ADMIN,USUARIO"),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    clienteIdx: index("recursos_cliente_idx").on(t.cliente),
    categoriaIdx: index("recursos_categoria_idx").on(t.categoria),
  })
);

// ---------- BMF — Business Market Finders ----------

export const bmfLenders = sqliteTable(
  "bmf_lenders",
  {
    id: cuid(),
    nombre: text("nombre").notNull(),
    contacto: text("contacto"),
    email: text("email"),
    telefono: text("telefono"),
    productos: text("productos"),
    montoMinimo: real("monto_minimo"),
    montoMaximo: real("monto_maximo"),
    tiempoRespuestaDias: integer("tiempo_respuesta_dias"),
    estado: text("estado").notNull().default("activo"),
    observaciones: text("observaciones"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  }
);

export const bmfFundings = sqliteTable(
  "bmf_fundings",
  {
    id: cuid(),
    clienteId: text("cliente_id").notNull().references(() => personas.id),
    agenteId: text("agente_id").notNull().references(() => usuarios.id),
    lenderId: text("lender_id").references(() => bmfLenders.id),
    montoSolicitado: real("monto_solicitado").notNull(),
    montoAprobado: real("monto_aprobado"),
    fechaCreacion: timestamp("fecha_creacion").notNull().$defaultFn(() => new Date()),
    fechaAprobacion: timestamp("fecha_aprobacion"),
    fechaFunding: timestamp("fecha_funding"),
    estado: text("estado").notNull().default("pendiente"),
    comisionPorcentaje: real("comision_porcentaje"),
    comisionMonto: real("comision_monto"),
    observaciones: text("observaciones"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    clienteIdx: index("bmf_fundings_cliente_idx").on(t.clienteId),
    agenteIdx: index("bmf_fundings_agente_idx").on(t.agenteId),
    lenderIdx: index("bmf_fundings_lender_idx").on(t.lenderId),
    estadoIdx: index("bmf_fundings_estado_idx").on(t.estado),
  })
);

export const bmfLlamadas = sqliteTable(
  "bmf_llamadas",
  {
    id: cuid(),
    personaId: text("persona_id").notNull().references(() => personas.id),
    agenteId: text("agente_id").notNull().references(() => usuarios.id),
    fecha: timestamp("fecha").notNull().$defaultFn(() => new Date()),
    duracionMinutos: integer("duracion_minutos"),
    resultado: text("resultado").notNull().default("contestó"),
    observaciones: text("observaciones"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    personaIdx: index("bmf_llamadas_persona_idx").on(t.personaId, t.fecha),
    agenteIdx: index("bmf_llamadas_agente_idx").on(t.agenteId, t.fecha),
  })
);

export const bmfComisiones = sqliteTable(
  "bmf_comisiones",
  {
    id: cuid(),
    agenteId: text("agente_id").notNull().references(() => usuarios.id),
    fundingId: text("funding_id").notNull().references(() => bmfFundings.id),
    monto: real("monto").notNull(),
    porcentaje: real("porcentaje").notNull(),
    estado: text("estado").notNull().default("pendiente"),
    fechaPago: timestamp("fecha_pago"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    agenteIdx: index("bmf_comisiones_agente_idx").on(t.agenteId),
    fundingIdx: index("bmf_comisiones_funding_idx").on(t.fundingId),
  })
);

// ---------- BMF Digital Funding — solicitudes / ofertas / docs / mensajes ----------

export const bmfSolicitudes = sqliteTable(
  "bmf_solicitudes",
  {
    id: cuid(),
    applicationId: text("application_id").notNull().unique(),
    personaId: text("persona_id").notNull().references(() => personas.id),
    registroId: text("registro_id").references(() => registros.id),
    empresaLegal: text("empresa_legal"),
    dba: text("dba"),
    empresaDireccion: text("empresa_direccion"),
    empresaCiudad: text("empresa_ciudad"),
    empresaEstado: text("empresa_estado"),
    empresaZip: text("empresa_zip"),
    industria: text("industria"),
    estructuraNegocio: text("estructura_negocio"),
    fechaInicioNegocio: text("fecha_inicio_negocio"),
    sitioWeb: text("sitio_web"),
    propietarioNombre: text("propietario_nombre"),
    propietarioApellido: text("propietario_apellido"),
    propietarioEmail: text("propietario_email"),
    propietarioTelefono: text("propietario_telefono"),
    porcentajePropiedad: real("porcentaje_propiedad"),
    montoSolicitado: real("monto_solicitado"),
    propositoFondos: text("proposito_fondos"),
    ingresoMensualEstimado: real("ingreso_mensual_estimado"),
    depositosMensualesPromedio: real("depositos_mensuales_promedio"),
    tieneFinanciamientoActual: integer("tiene_financiamiento_actual", { mode: "boolean" }).notNull().default(false),
    saldoFinanciamientoActual: real("saldo_financiamiento_actual"),
    ein: text("ein"),
    bancoNombre: text("banco_nombre"),
    depositosMensualesAprox: integer("depositos_mensuales_aprox"),
    estadoDocumentos: text("estado_documentos", { enum: ["pendiente", "parcial", "completo"] }).notNull().default("pendiente"),
    consentimiento: integer("consentimiento", { mode: "boolean" }).notNull().default(false),
    consentimientoFecha: timestamp("consentimiento_fecha"),
    fuente: text("fuente"),
    campana: text("campana"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    landingPage: text("landing_page"),
    ultimoSeguimientoEn: timestamp("ultimo_seguimiento_en"),
    seguimientosEnviados: integer("seguimientos_enviados").notNull().default(0),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    personaIdx: index("bmf_solicitudes_persona_idx").on(t.personaId),
    registroIdx: index("bmf_solicitudes_registro_idx").on(t.registroId),
    estadoIdx: index("bmf_solicitudes_estado_idx").on(t.estadoDocumentos),
  })
);

export const bmfOfertas = sqliteTable(
  "bmf_ofertas",
  {
    id: cuid(),
    solicitudId: text("solicitud_id").notNull().references(() => bmfSolicitudes.id, { onDelete: "cascade" }),
    lenderId: text("lender_id").references(() => bmfLenders.id),
    monto: real("monto"),
    plazo: text("plazo"),
    frecuenciaPago: text("frecuencia_pago"),
    montoPago: real("monto_pago"),
    totalPagar: real("total_pagar"),
    factorRate: real("factor_rate"),
    costoOrigination: real("costo_origination"),
    comisionBroker: real("comision_broker"),
    comisionNeta: real("comision_neta"),
    fechaExpiracion: timestamp("fecha_expiracion"),
    estado: text("estado", { enum: ["borrador", "presentada", "aceptada", "rechazada", "expirada"] }).notNull().default("borrador"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    solicitudIdx: index("bmf_ofertas_solicitud_idx").on(t.solicitudId),
    lenderIdx: index("bmf_ofertas_lender_idx").on(t.lenderId),
  })
);

export const bmfDocumentos = sqliteTable(
  "bmf_documentos",
  {
    id: cuid(),
    solicitudId: text("solicitud_id").notNull().references(() => bmfSolicitudes.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: ["bank_statement", "identificacion", "cheque_anulado", "otro"] }).notNull().default("otro"),
    nombre: text("nombre").notNull(),
    storageKey: text("storage_key"),
    tamanoBytes: integer("tamano_bytes").notNull().default(0),
    contentType: text("content_type"),
    estado: text("estado", { enum: ["pendiente", "recibido", "verificado", "rechazado"] }).notNull().default("pendiente"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    solicitudIdx: index("bmf_documentos_solicitud_idx").on(t.solicitudId),
  })
);

export const bmfMensajes = sqliteTable(
  "bmf_mensajes",
  {
    id: cuid(),
    solicitudId: text("solicitud_id").notNull().references(() => bmfSolicitudes.id, { onDelete: "cascade" }),
    personaId: text("persona_id").references(() => personas.id),
    direccion: text("direccion", { enum: ["entrante", "saliente"] }).notNull().default("saliente"),
    remitente: text("remitente"),
    destinatario: text("destinatario"),
    asunto: text("asunto"),
    cuerpo: text("cuerpo"),
    resendMessageId: text("resend_message_id"),
    generadoPorIA: integer("generado_por_ia", { mode: "boolean" }).notNull().default(false),
    estado: text("estado", { enum: ["enviado", "entregado", "rebotado", "error"] }).notNull().default("enviado"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    solicitudIdx: index("bmf_mensajes_solicitud_idx").on(t.solicitudId),
    personaIdx: index("bmf_mensajes_persona_idx").on(t.personaId),
  })
);

// ─── Seguridad: verificación en dos pasos ─────────────────────

export const dispositivosConfiables = sqliteTable(
  "dispositivos_confiables",
  {
    id: cuid(),
    usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
    tokenHash: text("token_hash").notNull(),
    nombreDispositivo: text("nombre_dispositivo"),
    userAgent: text("user_agent"),
    ipCreacion: text("ip_creacion"),
    creadoEn: text("creado_en").notNull(),
    expiraEn: text("expira_en").notNull(),
    revocadoEn: text("revocado_en"),
    ultimoUsoEn: text("ultimo_uso_en"),
  },
  (t) => ({
    usuarioIdx: index("idx_disp_usuario").on(t.usuarioId),
    tokenIdx: index("idx_disp_token").on(t.tokenHash),
  })
);

export const codigosRecuperacion = sqliteTable(
  "codigos_recuperacion",
  {
    id: cuid(),
    usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
    codigoHash: text("codigo_hash").notNull(),
    usadoEn: text("usado_en"),
    creadoEn: text("creado_en").notNull(),
    revocadoEn: text("revocado_en"),
  },
  (t) => ({
    usuarioIdx: index("idx_codigos_usuario").on(t.usuarioId),
  })
);

export const eventosSeguridad = sqliteTable(
  "eventos_seguridad",
  {
    id: cuid(),
    usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
    tipoEvento: text("tipo_evento").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadataSegura: text("metadata_segura"),
    creadoEn: text("creado_en").notNull(),
  },
  (t) => ({
    usuarioIdx: index("idx_eventos_usuario").on(t.usuarioId),
    tipoIdx: index("idx_eventos_tipo").on(t.tipoEvento, t.creadoEn),
  })
);

// ─── Motor de Ingresos ────────────────────────────

export const ofertas = sqliteTable("ofertas", {
  id: cuid(),
  nombre: text("nombre").notNull().unique(),
  categoria: text("categoria", { enum: ["Ancla", "Recurrente", "Volumen medio", "Volumen alto", "Evento"] }).notNull(),
  target: real("target").notNull().default(0),
  ticket: real("ticket").notNull().default(0),
});

export const ventasIngresos = sqliteTable(
  "ventas_ingresos",
  {
    id: cuid(),
    fecha: text("fecha").notNull(),
    ofertaId: text("oferta_id").notNull().references(() => ofertas.id),
    monto: real("monto").notNull(),
    nota: text("nota"),
    esAnticipo: integer("es_anticipo", { mode: "boolean" }).notNull().default(false),
    totalDeal: real("total_deal"),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
  },
  (t) => ({
    ofertaIdx: index("vi_oferta_idx").on(t.ofertaId),
    fechaIdx: index("vi_fecha_idx").on(t.fecha),
  })
);

export const egresos = sqliteTable(
  "egresos",
  {
    id: cuid(),
    fecha: text("fecha").notNull(),
    categoria: text("categoria", {
      enum: ["Nómina", "Aviones", "Hoteles", "Transportes", "Comidas", "Otro"],
    }).notNull(),
    ofertaId: text("oferta_id").references(() => ofertas.id),
    monto: real("monto").notNull(),
    nota: text("nota"),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
  },
  (t) => ({
    categoriaIdx: index("eg_categoria_idx").on(t.categoria),
    fechaIdx: index("eg_fecha_idx").on(t.fecha),
  })
);

// ─── Métricas Meta Ads (registro manual, sin conexión a Meta) ────────────

export const metaAdsReportes = sqliteTable(
  "meta_ads_reportes",
  {
    id: cuid(),
    fechaInicio: text("fecha_inicio").notNull(),
    fechaFin: text("fecha_fin").notNull(),
    titulo: text("titulo"),
    observacionGeneral: text("observacion_general"),
    presupuestoTotalActual: real("presupuesto_total_actual"),
    creadoPor: text("creado_por").notNull().references(() => usuarios.id),
    actualizadoPor: text("actualizado_por").references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    fechasIdx: index("meta_ads_reportes_fechas_idx").on(t.fechaInicio, t.fechaFin),
  })
);

export const metaAdsGrupos = sqliteTable(
  "meta_ads_grupos",
  {
    id: cuid(),
    reporteId: text("reporte_id").notNull().references(() => metaAdsReportes.id, { onDelete: "cascade" }),
    seccionPrincipal: text("seccion_principal").notNull(),
    nombre: text("nombre").notNull(),
    subtitulo: text("subtitulo"),
    presupuestoTotalActual: real("presupuesto_total_actual"),
    observacion: text("observacion"),
    sinCampanasActivas: integer("sin_campanas_activas", { mode: "boolean" }).notNull().default(false),
    orden: integer("orden").notNull().default(0),
  },
  (t) => ({
    reporteIdx: index("meta_ads_grupos_reporte_idx").on(t.reporteId),
  })
);

export const metaAdsCampanas = sqliteTable(
  "meta_ads_campanas",
  {
    id: cuid(),
    grupoId: text("grupo_id").notNull().references(() => metaAdsGrupos.id, { onDelete: "cascade" }),
    // Referencia a sí misma (campana → segmentación). El FK real vive en la
    // migración SQL (meta_ads_campanas.campana_padre_id REFERENCES meta_ads_campanas).
    // Aquí se declara como texto plano para evitar la referencia circular de tipos.
    campanaPadreId: text("campana_padre_id"),
    nombre: text("nombre").notNull(),
    ubicacionPublico: text("ubicacion_publico"),
    presupuesto: real("presupuesto"),
    detallePresupuesto: text("detalle_presupuesto"),
    leads: integer("leads"),
    costoPorLead: real("costo_por_lead"),
    moneda: text("moneda").notNull().default("USD"),
    estado: text("estado", { enum: ["Activa", "Inactiva"] }).notNull().default("Activa"),
    observaciones: text("observaciones"),
    recomendaciones: text("recomendaciones"),
    orden: integer("orden").notNull().default(0),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    grupoIdx: index("meta_ads_campanas_grupo_idx").on(t.grupoId),
    padreIdx: index("meta_ads_campanas_padre_idx").on(t.campanaPadreId),
  })
);

// ─── Podcast Performance & AI Intelligence ────────────
// Solo se persiste lo que BOS no puede deducir de los datos ya existentes: las metas
// configurables y el reporte diario manual (prospección + compromiso). Las métricas
// de pipeline y follow-ups se calculan on-the-fly desde historial_etapas / tareas_seguimiento.

export const podcastMetas = sqliteTable(
  "podcast_metas",
  {
    id: cuid(),
    clave: text("clave").notNull(),
    nombre: text("nombre").notNull(),
    valor: real("valor").notNull(),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ claveUq: uniqueIndex("podcast_metas_clave_uq").on(t.clave) })
);

export const podcastReportesDiarios = sqliteTable(
  "podcast_reportes_diarios",
  {
    id: cuid(),
    usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
    fecha: text("fecha").notNull(), // YYYY-MM-DD en ET
    prospectosEncontrados: integer("prospectos_encontrados"),
    prospectosContactados: integer("prospectos_contactados"),
    respuestas: integer("respuestas"),
    interesados: integer("interesados"),
    compromisoContactos: integer("compromiso_contactos"),
    compromisoFollowups: integer("compromiso_followups"),
    compromisoPodcasts: integer("compromiso_podcasts"),
    compromisoNota: text("compromiso_nota"),
    bloqueos: text("bloqueos"),
    estado: text("estado", { enum: ["borrador", "enviado"] }).notNull().default("borrador"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    usuarioFechaUq: uniqueIndex("podcast_reportes_usuario_fecha_uq").on(t.usuarioId, t.fecha),
    fechaIdx: index("podcast_reportes_fecha_idx").on(t.fecha),
  })
);

// Agenda de podcasts: día + hora + invitado (persona del CRM). `fecha` y `hora` son
// texto a propósito para que la cuadrícula del calendario compare strings sin timezone.
export const podcastCitas = sqliteTable(
  "podcast_citas",
  {
    id: cuid(),
    personaId: text("persona_id").notNull().references(() => personas.id),
    fecha: text("fecha").notNull(), // YYYY-MM-DD
    hora: text("hora").notNull(), // HH:MM (24h)
    estado: text("estado", { enum: ["agendado", "realizado", "cancelado"] }).notNull().default("agendado"),
    nota: text("nota"),
    creadoPor: text("creado_por").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ fechaIdx: index("podcast_citas_fecha_idx").on(t.fecha) })
);
