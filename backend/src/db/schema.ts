import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex, blob } from "drizzle-orm/sqlite-core";

const cuid = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamp = (name: string) => integer(name, { mode: "timestamp" });

export const usuarios = sqliteTable("usuarios", {
  id: cuid(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // AGENTE es un rol de máquina (Hermes Agent), no de persona: solo lee, nunca escribe.
  // No está en la jerarquía de permisos ni se puede crear desde la interfaz — ver auth.ts.
  rol: text("rol", { enum: ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USUARIO", "AGENTE"] }).notNull().default("USUARIO"),
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

// ---------- Recursos Humanos ----------

// Perfil laboral de una persona que ya existe en `usuarios`. Relación 1:1 por ID real
// (user_id UNIQUE): RRHH nunca crea una segunda persona ni la relaciona por nombre/email.
// Aquí solo vive lo que es exclusivamente laboral. `estado_laboral` es independiente de
// `usuarios.activo` (acceso al CRM) a propósito — ver migración 0029.
export const empleados = sqliteTable(
  "empleados",
  {
    id: cuid(),
    userId: text("user_id").notNull().unique().references(() => usuarios.id),
    estadoLaboral: text("estado_laboral", { enum: ["ACTIVO", "INACTIVO"] }).notNull().default("ACTIVO"),
    notas: text("notas"),
    // Horario propio de esta persona (jornada esperada). NULL = usa el predeterminado.
    // Sin `.references()` a propósito: la columna se añadió con ALTER TABLE (migración 0030),
    // donde SQLite no admite claves foráneas; la integridad la garantiza el servicio.
    horarioId: text("horario_id"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ estadoLaboralIdx: index("empleados_estado_laboral_idx").on(t.estadoLaboral) })
);

// ─── Asistencia: jornada esperada (por día de la semana) ────────
// La semana NUNCA se guarda como texto libre: una fila por día en `horarioDias`.
export const horarios = sqliteTable("horarios", {
  id: cuid(),
  nombre: text("nombre").notNull(),
  esPredeterminado: integer("es_predeterminado", { mode: "boolean" }).notNull().default(false),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const horarioDias = sqliteTable(
  "horario_dias",
  {
    id: cuid(),
    horarioId: text("horario_id").notNull().references(() => horarios.id, { onDelete: "cascade" }),
    // 0 = domingo … 6 = sábado (igual que Date.getDay()).
    diaSemana: integer("dia_semana").notNull(),
    laborable: integer("laborable", { mode: "boolean" }).notNull().default(false),
    // Hora local del negocio, 'HH:MM'. Opcionales.
    horaInicio: text("hora_inicio"),
    horaFin: text("hora_fin"),
    // Fuente de verdad de la jornada esperada del día (permite sábado de media jornada).
    minutosEsperados: integer("minutos_esperados").notNull().default(0),
  },
  (t) => ({ unicoDia: uniqueIndex("horario_dias_unico").on(t.horarioId, t.diaSemana) })
);

// ─── Asistencia: sesiones de jornada reales ─────────────────────
// started_at/ended_at los pone SIEMPRE el servidor. ended_at NULL = jornada ABIERTA
// (una persona olvidó terminar: no se cierra sola ni se inventa una hora de salida).
// Un índice único parcial en la BD impide más de una jornada abierta por persona — de
// CUALQUIER tipo, así que también impide una jornada regular y una reposición a la vez.
//
// `session_type` distingue la jornada normal de una REPOSICION de horas (recuperar dentro del
// mismo mes lo que quedó pendiente, sin tocar la jornada original). Las filas anteriores a la
// migración 0032 quedan como REGULAR, que es lo que son.
export const jornadasLaborales = sqliteTable(
  "jornadas_laborales",
  {
    id: cuid(),
    userId: text("user_id").notNull().references(() => usuarios.id),
    empleadoId: text("empleado_id").notNull().references(() => empleados.id),
    sessionType: text("session_type", { enum: ["REGULAR", "REPOSICION"] }).notNull().default("REGULAR"),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    userStartedIdx: index("jornadas_user_started_idx").on(t.userId, t.startedAt),
    startedIdx: index("jornadas_started_idx").on(t.startedAt),
    userTipoStartedIdx: index("jornadas_user_tipo_started_idx").on(t.userId, t.sessionType, t.startedAt),
  })
);

// ─── Asistencia: check-ins aleatorios de actividad ──────────────
// Uno por cada bloque de 1 hora de una sesión activa, en un minuto aleatorio derivado de
// forma DETERMINISTA del id de la sesión (ver services/checkins.service.ts). Esa mezcla
// —aleatorio por persona, estable por sesión— es lo que permite materializarlos en cada
// lectura sin que un refresh los regenere y sin necesitar un proceso de fondo.
//
// Solo INFORMAN: no descuentan sueldo, no reducen horas y no cierran jornadas. Las horas
// trabajadas salen siempre de jornadas_laborales.started_at/ended_at.
export const jornadasCheckins = sqliteTable(
  "jornadas_checkins",
  {
    id: cuid(),
    jornadaId: text("jornada_id").notNull().references(() => jornadasLaborales.id),
    userId: text("user_id").notNull().references(() => usuarios.id),
    empleadoId: text("empleado_id").notNull().references(() => empleados.id),
    /** Bloque de 1 hora desde started_at: 0, 1, 2… */
    blockIndex: integer("block_index").notNull(),
    scheduledAt: timestamp("scheduled_at").notNull(),
    /** Primera vez que la alerta se sirvió al navegador. De aquí cuenta la ventana. */
    deliveredAt: timestamp("delivered_at"),
    respondedAt: timestamp("responded_at"),
    estado: text("estado", { enum: ["PENDIENTE", "RESPONDIDO", "SIN_RESPUESTA", "CANCELADO"] })
      .notNull()
      .default("PENDIENTE"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    // Idempotencia de la materialización: el INSERT con ON CONFLICT DO NOTHING choca aquí.
    bloqueUnico: uniqueIndex("jornadas_checkins_bloque_unico").on(t.jornadaId, t.blockIndex),
    jornadaIdx: index("jornadas_checkins_jornada_idx").on(t.jornadaId, t.scheduledAt),
  })
);

// ─── Control de Sueldo: sueldo mensual con vigencia ─────────────
// El dinero se guarda en CENTAVOS ENTEROS: nunca coma flotante. Un cambio de sueldo crea una
// VIGENCIA NUEVA y no borra la anterior, así que un mes pasado se sigue calculando con el
// monto que le correspondía. `vigente_desde` es un día del negocio (AAAA-MM-DD); el sueldo de
// un período es el último registro con vigente_desde <= último día de ese período.
export const salarios = sqliteTable(
  "salarios",
  {
    id: cuid(),
    userId: text("user_id").notNull().references(() => usuarios.id),
    empleadoId: text("empleado_id").notNull().references(() => empleados.id),
    montoCentavos: integer("monto_centavos").notNull(),
    vigenteDesde: text("vigente_desde").notNull(),
    notas: text("notas"),
    createdBy: text("created_by").references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    userVigenteIdx: index("salarios_user_vigente_idx").on(t.userId, t.vigenteDesde),
    // Una sola vigencia por persona y fecha: dos montos para el mismo día se contradicen.
    userFechaUnico: uniqueIndex("salarios_user_fecha_unico").on(t.userId, t.vigenteDesde),
  })
);

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
    // Tipo estructurado del registro del Calendario: 'alerta' | 'recordatorio' | 'seguimiento'.
    // Los seguimientos que agenda el CRM (interacciones/cobros) quedan como 'seguimiento'.
    tipo: text("tipo").notNull().default("seguimiento"),
    // Título/motivo corto que identifica el registro (ej. "Llamar para seguimiento").
    titulo: text("titulo"),
    completado: integer("completado", { mode: "boolean" }).notNull().default(false),
    // Cuándo y quién completó la tarea — para series diarias de "follow-ups realizados hoy".
    completadoEn: timestamp("completado_en"),
    completadoPor: text("completado_por"),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ personaEstadoIdx: index("tareas_persona_estado_idx").on(t.personaId, t.completado, t.fecha) })
);

// ---------- Activos digitales de un cliente (persona) ----------
// Uno-a-muchos: cada cliente puede tener N landings/funnels/formularios/dominios/etc.
// Nunca campos rígidos tipo landing_url — ver migración 0018. La columna `tipo` repite
// el enum de la migración a propósito para mantener el tipado de Drizzle en sync.

export const activosDigitales = sqliteTable(
  "activos_digitales",
  {
    id: cuid(),
    personaId: text("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    url: text("url"),
    tipo: text("tipo", { enum: ["Landing", "Funnel", "Thank You Page", "Formulario", "Dominio", "Automatización", "Otro"] })
      .notNull()
      .default("Landing"),
    plataforma: text("plataforma"),
    objetivo: text("objetivo"),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
    notas: text("notas"),
    autorId: text("autor_id").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ personaIdx: index("activos_digitales_persona_idx").on(t.personaId, t.activo, t.createdAt) })
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
    // Modalidad de pago de la oportunidad: PAGO_UNICO | ABONOS | RECURRENTE, o null = sin definir
    // (así quedan todos los tratos que ya existían — no se adivina ni se rellena). Es información
    // FINANCIERA del trato, no una etapa comercial: nunca se deduce del nombre ni del texto libre.
    // Para RECURRENTE, montoRecurrente + frecuenciaRecurrente describen el plan de cobro; ninguno
    // de los tres entra en "Pagado"/"Saldo", que siguen saliendo de sumar las filas de `pagos`.
    modalidadPago: text("modalidad_pago"),
    montoRecurrente: real("monto_recurrente"),
    frecuenciaRecurrente: text("frecuencia_recurrente"),
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
    // Clave de idempotencia: la manda el frontend al abrir el modal de pago y la reusa en
    // reintentos. El índice único (ver migración 0019) hace que un doble clic o un request
    // duplicado no cree dos pagos — la segunda inserción se descarta y se devuelve el primero.
    idempotencyKey: text("idempotency_key"),
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
    // El ÚNICO estado de trabajo terminado es "completada". Los estados "aprobado" y
    // "publicado" dejaron de existir (migración 0026 los migró a "completada"; aquí se
    // quitan del enum para que el código no pueda volver a escribirlos).
    estado: text("estado", {
      enum: [
        "solicitud", "backlog", "pendiente", "por_hacer",
        "en_proceso", "bloqueada", "en_revision", "requiere_ajustes",
        "completada", "cancelado",
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
    // Momento real en que la tarea pasó a EN PROCESO (started_at) y a FINALIZADA
    // (completed_at). started_at lo registra el módulo DEV (departamento = "DEV", es el
    // primer arranque histórico de la tarea). completed_at se registra para TODA tarea
    // al marcarla completada (ver actualizarTarea) y es la base de "producción del día".
    // Opcionales y aditivos — nunca se calculan retroactivamente (0026 rellenó los ya
    // terminados con la fecha de su propio updated_at).
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
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
    // Cuándo se envió (transición borrador → enviado). NULL en los reportes anteriores a la
    // migración 0036: el historial muestra "Enviado" sin hora y no se inventa el dato.
    enviadoEn: timestamp("enviado_en"),
    // Copia de las métricas automáticas del día en el momento del envío (JSON, migración 0038).
    // Las métricas automáticas se recalculan al leer —eso es lo que hace que no puedan contradecir
    // al CRM—, pero entonces un reporte viejo cambiaría solo si alguien corrige una tarjeta
    // semanas después. Este sello guarda lo que BOS calculaba al enviar. NULL en los reportes
    // anteriores a la migración: el historial muestra el valor actual y aclara que no hay sello.
    metricasSnapshot: text("metricas_snapshot"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    usuarioFechaUq: uniqueIndex("podcast_reportes_usuario_fecha_uq").on(t.usuarioId, t.fecha),
    fechaIdx: index("podcast_reportes_fecha_idx").on(t.fecha),
  })
);

// Prospección POR CANAL del Cierre diario (1:N del reporte). Un día puede prospectarse por
// varios canales y cada uno produce resultados distintos, así que el desglose es una fila por
// canal y no cuatro columnas más en el reporte. Los totales del día se SUMAN al leer; nunca se
// guarda una cifra total aparte que pudiera contradecir el desglose.
// Los reportes anteriores a la migración 0037 no tienen filas aquí y siguen usando sus columnas.
export const podcastReporteCanales = sqliteTable(
  "podcast_reporte_canales",
  {
    id: cuid(),
    reporteId: text("reporte_id").notNull().references(() => podcastReportesDiarios.id, { onDelete: "cascade" }),
    // Texto libre sin enum, igual que `interacciones.tipo`: la lista válida vive en
    // lib/validation.ts (CANALES_CONTACTO) y sumar un canal no debe exigir migración.
    canal: text("canal").notNull(),
    contactados: integer("contactados").notNull().default(0),
    respuestas: integer("respuestas").notNull().default(0),
    interesados: integer("interesados").notNull().default(0),
    orden: integer("orden").notNull().default(0),
  },
  (t) => ({
    reporteIdx: index("podcast_reporte_canales_reporte_idx").on(t.reporteId),
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

// Calendario de Marketing: correo/contenido programado asociado a un PROYECTO real.
// Una fila = un elemento del día (qué proyecto tiene contenido ese día). Solo guarda la
// RELACIÓN proyecto_id + fecha; el nombre se lee en vivo desde proyectos (un renombre del
// proyecto no rompe nada). Fuente SEPARADA de tareas y de cumpleaños — regla 16.
export const marketingCalendario = sqliteTable(
  "marketing_calendario",
  {
    id: cuid(),
    proyectoId: text("proyecto_id").notNull().references(() => proyectos.id),
    fecha: text("fecha").notNull(), // YYYY-MM-DD
    nota: text("nota"), // Texto libre (multilínea, sin límite práctico) de este elemento.
    creadoPor: text("creado_por").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    fechaIdx: index("marketing_calendario_fecha_idx").on(t.fecha),
    proyectoIdx: index("marketing_calendario_proyecto_idx").on(t.proyectoId),
  })
);

// ---------- 🎂 Módulo "Próximos cumpleaños" ----------
// Cada cumpleaños es un registro permanente independiente (una fila por persona, sin
// filas por año). La recurrencia anual se calcula en vuelo desde mes/día/año; cuando el
// próximo cumpleaños entra en la ventana de aviso (7 días), el worker crea UN recordatorio
// compartido por ocurrencia en cumpleanos_recordatorios. La clave de idempotencia de la
// BD es (cumpleanos_id, anio) — ver migración 0021.

export const cumpleanos = sqliteTable(
  "cumpleanos",
  {
    id: cuid(),
    // Vínculo opcional a la ficha. Cuando existe, el contacto se lee en vivo desde
    // personas — aquí nunca se duplica teléfono/email.
    personaId: text("persona_id").references(() => personas.id),
    nombre: text("nombre").notNull(),
    mes: integer("mes").notNull(),
    dia: integer("dia").notNull(),
    anio: integer("anio"),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
    notas: text("notas"),
    creadoPor: text("creado_por").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ personaUq: uniqueIndex("cumpleanos_persona_uq").on(t.personaId) })
);

export const cumpleanosRecordatorios = sqliteTable(
  "cumpleanos_recordatorios",
  {
    id: cuid(),
    cumpleanosId: text("cumpleanos_id").notNull().references(() => cumpleanos.id, { onDelete: "cascade" }),
    anio: integer("anio").notNull(), // año de la ocurrencia (ET)
    fechaCumpleanos: text("fecha_cumpleanos").notNull(), // YYYY-MM-DD (ET)
    estado: text("estado", { enum: ["pendiente", "realizado", "cancelado"] }).notNull().default("pendiente"),
    completadoPor: text("completado_por").references(() => usuarios.id),
    completadoEn: timestamp("completado_en"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ ocurrenciaUq: uniqueIndex("cumpleanos_recordatorio_uq").on(t.cumpleanosId, t.anio) })
);

// ---------- Tickets de soporte (DEV → Tickets) ----------
// Bandeja de solicitudes recibidas (problemas / correcciones / mejoras del CRM) que
// cualquier usuario autenticado puede crear desde el botón global "Crear ticket".
// CREAR está abierto a todos; VER queda restringido a SUPER_ADMIN vía el router /api/dev
// (mismas reglas que DEV → Tareas). NO son tareas DEV: ticket y tarea son conceptos
// distintos y no se convierten entre sí. Estados reales: PENDIENTE / COMPLETADO /
// CANCELADO (sin responsables ni workflow adicional); el ticket nunca se borra.

export const tickets = sqliteTable(
  "tickets",
  {
    id: cuid(),
    // Solicitante real: relación al ID del usuario autenticado (nunca texto libre).
    requestedByUserId: text("requested_by_user_id").notNull().references(() => usuarios.id),
    description: text("description").notNull(),
    prioridad: text("prioridad", { enum: ["Baja", "Normal", "Alta"] }).notNull().default("Normal"),
    // Estado estructurado del ticket (columna real, nunca inferido de texto/color).
    // Un ticket nuevo SIEMPRE nace PENDIENTE y el solicitante no lo elige.
    status: text("status", { enum: ["PENDIENTE", "COMPLETADO", "CANCELADO"] })
      .notNull()
      .default("PENDIENTE"),
    // Fechas de resolución (nullable): se llenan al pasar a COMPLETADO / CANCELADO.
    // created_at NUNCA se toca: el ticket conserva su fecha original de creación.
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    // Clave de idempotencia anti doble-clic: un reintento con la misma clave no crea
    // un segundo ticket (misma mecánica que pagos.idempotencyKey).
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    createdIdx: index("tickets_created_idx").on(t.createdAt),
    statusIdx: index("tickets_status_idx").on(t.status),
  })
);

// Adjuntos de un ticket: el binario vive aquí como BLOB (nunca base64 en `tickets`).
// Un adjunto pertenece a UN ticket por ID; imagen del Ticket A jamás aparece en Ticket B.
export const ticketAdjuntos = sqliteTable(
  "ticket_adjuntos",
  {
    id: cuid(),
    ticketId: text("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    nombreOriginal: text("nombre_original").notNull(),
    contentType: text("content_type").notNull(),
    tamanoBytes: integer("tamano_bytes").notNull(),
    datos: blob("datos", { mode: "buffer" }).notNull(),
    subidoPor: text("subido_por").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ ticketIdx: index("ticket_adjuntos_ticket_idx").on(t.ticketId) })
);
