const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("bos_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(typeof payload === "string" ? payload : JSON.stringify(payload));
  }
}

// ---------- Tipos de respuesta con nombre propio ----------
// (evita tipos anónimos de varias líneas dentro de una llamada, que se han roto
// alguna vez al copiar/pegar en Terminal — con interfaz nombrada, si algo se corta
// mal, el error de TypeScript señala justo la línea, no columnas sueltas raras)

export interface ActividadUsuarioDTO {
  usuarioId: string;
  nombre: string;
  ingresos: number;
  contactosNuevos: number;
  interacciones: number;
  dealsGanados: number;
}

export interface ActividadDelDiaDTO {
  ingresosTotalHoy: number;
  ingresosTotalMes: number;
  contactosNuevosHoy: number;
  interaccionesHoy: number;
  dealsGanadosHoy: number;
  porUsuario: ActividadUsuarioDTO[];
}

export interface PagoDetalladoDTO {
  id: string;
  monto: number;
  nota: string | null;
  fecha: string;
  autorId: string;
  autorNombre: string;
  personaNombre: string | null;
  pipelineNombre: string;
}

export interface DiaVentaDTO {
  fecha: string;
  total: number;
  porUsuario: { usuarioId: string; nombre: string; total: number }[];
}

export interface VentasPorDiaDTO {
  dias: DiaVentaDTO[];
  totalGeneral: number;
  cantidadAbonos: number;
}

export interface ReportePodcastDTO {
  agendados: number;
  noShows: number;
  realizados: number;
  contenidoEntregado: number;
  contenidoPendiente: number;
  landingEntregada: number;
  landingPendiente: number;
  reuniones: number;
  ofertas: number;
  ventasCerradas: number;
  noCerraron: number;
  ingresos: number;
  ticketPromedio: number;
  conversionPodcastReunion: number;
  conversionReunionVenta: number;
  metaSemana: { podcasts: { actual: number; meta: number }; reuniones: { actual: number; meta: number } };
  alertas: { noShowsAltos: boolean; landingPendienteAlta: boolean; contenidoPendienteAlto: boolean };
}

// ─── Podcast Performance ────────────────────────────────

export interface MetasPodcastDTO {
  items: { clave: string; nombre: string; valor: number }[];
  metas: {
    prospectosEncontrados: number;
    prospectosContactados: number;
    podcastsAgendados: number;
    followupsRatio: number;
  };
}

export interface MetricasDiaDTO {
  fecha: string;
  encontrados: number;
  contactados: number;
  respuestas: number;
  interesados: number;
  followupsRealizados: number;
  followupsVencidos: number;
  agendados: number;
  realizados: number;
  reuniones: number;
  ventas: number;
  noShows: number;
}

export interface CompromisoDTO {
  contactos: number | null;
  followups: number | null;
  podcasts: number | null;
  nota: string | null;
}

export interface DesgloseScoreDTO {
  total: number;
  actividad: number;
  followup: number;
  resultados: number;
  continuidad: number;
}

export type NivelAlertaDTO = "normal" | "atencion" | "intervencion";
export type TendenciaDTO = "mejorando" | "estable" | "bajando";

export interface AlertaPodcastDTO {
  tipo: string;
  nivel: Exclude<NivelAlertaDTO, "normal">;
  titulo: string;
  evidencia: string;
  comparacion: string;
  causa: string;
  accion: string;
}

export interface ComparacionKpiDTO {
  clave: string;
  label: string;
  hoy: number;
  ayer: number;
  promedio7: number;
  meta: number | null;
  cumplimiento: number | null;
  variacionAyer: number | null;
  tendencia: TendenciaDTO;
}

export interface ReporteDiarioPodcastDTO {
  fecha: string;
  estado: "borrador" | "enviado" | null;
  reporte: {
    prospectosEncontrados: number | null;
    prospectosContactados: number | null;
    respuestas: number | null;
    interesados: number | null;
    bloqueos: string | null;
  } | null;
  compromisoHoy: CompromisoDTO | null;
  metricas: MetricasDiaDTO;
  compromisoAyer: CompromisoDTO | null;
  metas: MetasPodcastDTO["metas"];
}

export interface DesempenoMiDTO {
  usuarioId: string;
  fecha: string;
  score: DesgloseScoreDTO;
  metricas: MetricasDiaDTO;
  comparaciones: ComparacionKpiDTO[];
  metas: MetasPodcastDTO["metas"];
  compromisoAyer: CompromisoDTO | null;
  alertas: AlertaPodcastDTO[];
  estadoIA: NivelAlertaDTO;
}

export interface FilaEquipoPodcastDTO {
  usuarioId: string;
  nombre: string;
  score: DesgloseScoreDTO;
  contactados: number;
  followupsRealizados: number;
  agendados: number;
  realizados: number;
  pctMeta: number;
  tendencia: TendenciaDTO;
  estadoIA: NivelAlertaDTO;
}

export interface DesempenoEquipoDTO {
  fecha: string;
  metas: MetasPodcastDTO["metas"];
  equipo: FilaEquipoPodcastDTO[];
}

export interface InteligenciaPodcastDTO {
  fecha: string;
  equipo: { usuarioId: string; nombre: string; score: DesgloseScoreDTO; estadoIA: NivelAlertaDTO; agendados: number; realizados: number }[];
  funnel: {
    encontrados: number;
    contactados: number;
    respuestas: number;
    interesados: number;
    agendados: number;
    realizados: number;
    reuniones: number;
    ventas: number;
    noShows: number;
  };
  conversion: {
    contactoInteresado: number;
    interesadoAgendado: number;
    agendadoRealizado: number;
    realizadoReunion: number;
    reunionVenta: number;
  };
  ingresosPeriodo: number;
  saludPromedio: number;
  estadoGeneral: NivelAlertaDTO;
  alertas: (AlertaPodcastDTO & { usuarioId: string; nombre: string })[];
}

export interface CitaPodcastDTO {
  id: string;
  personaId: string;
  invitado: string;
  fecha: string;
  hora: string;
  estado: "agendado" | "realizado" | "cancelado";
  nota: string | null;
  creadoPor: string;
  creadoPorNombre: string;
  createdAt: string;
  updatedAt: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<{
      token?: string;
      tempToken?: string;
      requierePin?: boolean;
      dispositivoConfiable?: boolean;
      usuario: { id: string; nombre: string; rol: string; departamentoId?: string; departamentoIds?: string[] };
      deviceToken?: string;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  // ─── PIN (verificación en dos pasos) ──────────────────

  verifyPin: (pin: string, tempToken: string) =>
    request<{ token: string; usuario: any; deviceToken?: string }>(`/auth/pin/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tempToken}` },
      body: JSON.stringify({ pin }),
    }),

  pinStatus: () => request<{ habilitado: boolean; intentosFallidos: number; bloqueadoHasta: string | null; ultimoAcceso: string | null; ultimoCambio: string | null; tieneDispositivoConfiable: boolean }>("/auth/pin/status"),

  pinSetup: (pin: string, passwordActual: string) =>
    request<{ ok: boolean; codigosRecuperacion: string[] }>("/auth/pin/setup", {
      method: "POST",
      body: JSON.stringify({ pin, passwordActual }),
    }),

  pinChange: (pinActual: string, pinNuevo: string) =>
    request<{ ok: boolean }>("/auth/pin/change", {
      method: "PUT",
      body: JSON.stringify({ pinActual, pinNuevo }),
    }),

  pinDisable: (pinActual: string, passwordActual: string) =>
    request<{ ok: boolean }>("/auth/pin/disable", {
      method: "DELETE",
      body: JSON.stringify({ pinActual, passwordActual }),
    }),

  pinRecovery: (codigo: string, tempToken: string) =>
    request<{ token: string; usuario: any }>(`/auth/pin/recovery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tempToken}` },
      body: JSON.stringify({ codigo }),
    }),

  pinRegenerateCodes: () =>
    request<{ codigosRecuperacion: string[] }>("/auth/pin/recovery-codes/regenerate", { method: "POST" }),

  closeAllSessions: () =>
    request<{ ok: boolean }>("/auth/security/sessions", { method: "DELETE" }),

  ubicacionesClientes: () => request<{ ciudad: string; estado: string; total: number }[]>("/personas/ubicaciones"),

  cumpleanos: () => request<{ hoy: import("../types").Cumpleanero[]; proximos: import("../types").Cumpleanero[] }>("/personas/cumpleanos"),

  listarPersonas: (params: { search?: string; estado?: string; pagina?: number; limite?: number } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ items: import("../types").Persona[]; total: number; pagina: number; limite: number; totalPaginas: number }>(`/personas${qs ? `?${qs}` : ""}`);
  },

  obtenerFicha: (id: string) => request<import("../types").FichaPersona>(`/personas/${id}`),

  crearPersona: (data: unknown) =>
    request<import("../types").FichaPersona>("/personas", { method: "POST", body: JSON.stringify(data) }),

  registrarInteraccion: (personaId: string, data: unknown) =>
    request<{ interaccionId: string; tareaId: string }>(`/personas/${personaId}/interacciones`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  completarTarea: (tareaId: string) =>
    request<unknown>(`/personas/tareas/${tareaId}/completar`, { method: "PATCH" }),

  listarPipelines: () => request<import("../types").Pipeline[]>("/pipelines"),

  tableroKanban: (pipelineId: string) =>
    request<import("../types").TableroPipeline>(`/pipelines/${pipelineId}/tablero`),

  crearRegistro: (pipelineId: string, data: { personaId?: string; valor?: number }) =>
    request<import("../types").Registro>(`/pipelines/${pipelineId}/registros`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  moverEtapa: (registroId: string, etapaId: string, motivoPerdida?: string) =>
    request<import("../types").Registro>(`/pipelines/registros/${registroId}/etapa`, {
      method: "PATCH",
      body: JSON.stringify({ etapaId, motivoPerdida }),
    }),

  metricasPipeline: (pipelineId: string) =>
    request<{ total: number; ganados: number; perdidos: number; abiertos: number; valorAbierto: number; tasaConversion: number }>(
      `/pipelines/${pipelineId}/metricas`
    ),

  listarUsuarios: () => request<import("../types").Usuario[]>("/usuarios"),

  crearUsuario: (data: { nombre: string; email: string; password: string; rol: string; departamentoId?: string; cargo?: string; supervisorId?: string }) =>
    request<import("../types").Usuario>("/usuarios", { method: "POST", body: JSON.stringify(data) }),

  cambiarRol: (usuarioId: string, rol: string) =>
    request<{ ok: boolean }>(`/usuarios/${usuarioId}/rol`, { method: "PATCH", body: JSON.stringify({ rol }) }),

  cambiarEstadoUsuario: (usuarioId: string, activo: boolean) =>
    request<{ ok: boolean }>(`/usuarios/${usuarioId}/estado`, { method: "PATCH", body: JSON.stringify({ activo }) }),

  cambiarDepartamento: (usuarioId: string, departamentoIds: string[]) =>
    request<{ ok: boolean }>(`/usuarios/${usuarioId}/departamento`, { method: "PATCH", body: JSON.stringify({ departamentoIds }) }),

  restablecerPassword: (usuarioId: string, passwordNueva: string) =>
    request<{ ok: boolean }>(`/usuarios/${usuarioId}/password`, { method: "PATCH", body: JSON.stringify({ passwordNueva }) }),

  cambiarPassword: (passwordActual: string, passwordNueva: string) =>
    request<{ ok: boolean }>("/usuarios/me/password", {
      method: "PATCH",
      body: JSON.stringify({ passwordActual, passwordNueva }),
    }),

  actualizarComentarios: (personaId: string, comentarios: string) =>
    request<{ ok: boolean }>(`/personas/${personaId}/comentarios`, {
      method: "PATCH",
      body: JSON.stringify({ comentarios }),
    }),

  actualizarNegocios: (personaId: string, negocios: string[]) =>
    request<{ ok: boolean }>(`/personas/${personaId}/negocios`, {
      method: "PATCH",
      body: JSON.stringify({ negocios }),
    }),

  // Corregir datos de contacto. Se manda solo lo que cambió; "" vacía teléfono, correo o
  // fecha de nacimiento. El backend responde 403 si quien edita no es el responsable ni admin.
  actualizarPersona: (
    personaId: string,
    datos: { telefono?: string; email?: string; ciudad?: string; estado?: string; fechaNacimiento?: string }
  ) =>
    request<{ ok: boolean; sinCambios?: boolean; cambios?: string[] }>(`/personas/${personaId}`, {
      method: "PATCH",
      body: JSON.stringify(datos),
    }),

  listarTareasPendientes: (propias = false) =>
    request<import("../types").TareaPendiente[]>(`/personas/tareas/pendientes${propias ? "?propias=true" : ""}`),

  listarPagos: (registroId: string) =>
    request<import("../types").Pago[]>(`/pipelines/registros/${registroId}/pagos`),

  registrarPago: (registroId: string, data: { monto: number; nota?: string; proximaFechaCobro?: string; proximoPago?: number; metodoPago?: string; fecha?: string }) =>
    request<{ pagoId: string; totalPagado: number; saldoPendiente: number; tareaCreada: string | null }>(
      `/pipelines/registros/${registroId}/pagos`,
      { method: "POST", body: JSON.stringify(data) }
    ),

  actualizarPlanPago: (registroId: string, data: { proximoPago?: number | null; fechaProximoPago?: string | null; metodoPago?: string | null }) =>
    request<import("../types").Registro & { montoVencido?: number }>(
      `/pipelines/registros/${registroId}/plan-pago`,
      { method: "PATCH", body: JSON.stringify(data) }
    ),

  actualizarValorRegistro: (registroId: string, valor: number) =>
    request<{ valor: number; totalPagado: number; saldoPendiente: number }>(
      `/pipelines/registros/${registroId}/valor`,
      { method: "PATCH", body: JSON.stringify({ valor }) }
    ),

  cerrarVenta: (registroId: string, data: { montoTotal: number; montoCobrado: number; proximaFechaCobro?: string; metodoPago?: string; nota?: string }) =>
    request<{ valorTotal: number | null; cobrado: number; saldoPendiente: number; proximoPago: number | null; fechaProximoPago: string | null; metodoPago: string | null; montoVencido: number }>(
      `/pipelines/registros/${registroId}/cerrar-venta`,
      { method: "POST", body: JSON.stringify(data) }
    ),

  actividadDelDia: () => request<ActividadDelDiaDTO>("/reportes/actividad-hoy"),

  miFacturacion: () => request<{ hoy: number; mes: number }>("/reportes/mi-facturacion"),

  commandCenter: () => request<import("../types").CommandCenter>("/reportes/command-center"),

  askBos: (pregunta: string) => request<{ respuesta: string }>("/reportes/ask-bos", { method: "POST", body: JSON.stringify({ pregunta }) }),

  ceoMode: () => request<import("../types").CeoMode>("/reportes/ceo-mode"),

  listarPagosDetallado: (params: { desde?: string; hasta?: string; usuarioId?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<PagoDetalladoDTO[]>(`/reportes/pagos${qs ? `?${qs}` : ""}`);
  },

  ventasPorDia: (params: { desde?: string; hasta?: string; usuarioId?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<VentasPorDiaDTO>(`/reportes/ventas-por-dia${qs ? `?${qs}` : ""}`);
  },

  reportePodcast: () => request<ReportePodcastDTO>("/podcast/reporte"),

  // ─── Podcast Performance ───────────────────────────────

  podcastMetas: () => request<MetasPodcastDTO>("/podcast/metas"),

  guardarPodcastMetas: (metas: { clave: string; nombre: string; valor: number }[]) =>
    request<MetasPodcastDTO>("/podcast/metas", { method: "PUT", body: JSON.stringify({ metas }) }),

  podcastReporteDiario: () => request<ReporteDiarioPodcastDTO>("/podcast/reporte-diario"),

  guardarPodcastReporte: (data: Record<string, unknown>) =>
    request<ReporteDiarioPodcastDTO>("/podcast/reporte-diario", { method: "POST", body: JSON.stringify(data) }),

  podcastDesempenoMi: () => request<DesempenoMiDTO>("/podcast/desempeno/mi"),

  podcastDesempenoEquipo: () => request<DesempenoEquipoDTO>("/podcast/desempeno/equipo"),

  podcastInteligencia: () => request<InteligenciaPodcastDTO>("/podcast/inteligencia"),

  // ─── Calendario de podcasts (citas) ────────────────────

  podcastCitas: (desde?: string, hasta?: string) => {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const s = qs.toString();
    return request<CitaPodcastDTO[]>(`/podcast/citas${s ? `?${s}` : ""}`);
  },

  crearPodcastCita: (data: { personaId: string; fecha: string; hora: string; estado?: string; nota?: string }) =>
    request<CitaPodcastDTO>("/podcast/citas", { method: "POST", body: JSON.stringify(data) }),

  actualizarPodcastCita: (id: string, data: Record<string, unknown>) =>
    request<CitaPodcastDTO>(`/podcast/citas/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  eliminarPodcastCita: (id: string) =>
    request<{ ok: boolean }>(`/podcast/citas/${id}`, { method: "DELETE" }),

  // ─── Tareas operativas ───────────────────────────────────

  listarTareas: (params: { responsableId?: string; departamento?: string; estado?: string; prioridad?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").TareaOperativa[]>(`/tareas${qs ? `?${qs}` : ""}`);
  },

  misTareas: () => request<import("../types").TareaOperativa[]>("/tareas/mis-tareas"),

  obtenerTarea: (id: string) => request<import("../types").TareaOperativa>(`/tareas/${id}`),

  crearTarea: (data: {
    titulo: string;
    descripcion?: string;
    responsableId: string;
    departamento?: string;
    prioridad?: string;
    fechaInicio?: string;
    fechaLimite?: string;
    aprobadorId?: string;
    proyectoId?: string;
    canal?: string;
    tipoContenido?: string;
    fechaPublicacion?: string;
    tipoTarea?: string;
    tiempoEstimado?: number;
    solicitanteId?: string;
    criteriosTerminado?: string;
    sprint?: string;
  }) => request<import("../types").TareaOperativa>("/tareas", { method: "POST", body: JSON.stringify(data) }),

  actualizarTarea: (id: string, data: Record<string, unknown>) =>
    request<import("../types").TareaOperativa>(`/tareas/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  agregarChecklistItem: (tareaId: string, texto: string) =>
    request<import("../types").ChecklistItem>(`/tareas/${tareaId}/checklist`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    }),

  toggleChecklistItem: (itemId: string, completado: boolean) =>
    request<{ ok: boolean }>(`/tareas/checklist/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ completado }),
    }),

  eliminarChecklistItem: (itemId: string) =>
    request<{ ok: boolean }>(`/tareas/checklist/${itemId}`, { method: "DELETE" }),

  agregarComentarioTarea: (tareaId: string, texto: string) =>
    request<import("../types").ComentarioTarea>(`/tareas/${tareaId}/comentarios`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    }),

  kpiUsuario: (usuarioId?: string) =>
    request<import("../types").KpiUsuario>(usuarioId ? `/tareas/kpi/${usuarioId}` : "/tareas/kpi"),

  // ─── Marketing v2: Bloqueos ─────────────────────────────
  bloquearTarea: (id: string, data: { motivo: string; dependeDe?: string }) =>
    request<import("../types").TareaOperativa>(`/tareas/${id}/bloquear`, { method: "POST", body: JSON.stringify(data) }),

  desbloquearTarea: (id: string) =>
    request<import("../types").TareaOperativa>(`/tareas/${id}/desbloquear`, { method: "POST" }),

  // ─── Marketing v2: Extensiones ──────────────────────────
  solicitarExtension: (tareaId: string, data: { motivo: string; porcentajeCompletado?: number; tiempoAdicionalMinutos?: number; nuevaFecha: string; dificultad?: string }) =>
    request<import("../types").SolicitudExtension>(`/tareas/${tareaId}/extension`, { method: "POST", body: JSON.stringify(data) }),

  listarSolicitudesExtension: (params: { tareaId?: string; estado?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").SolicitudExtension[]>(`/tareas/extensiones${qs ? `?${qs}` : ""}`);
  },

  resolverExtension: (id: string, aprobada: boolean) =>
    request<{ id: string; estado: string }>(`/tareas/extensiones/${id}`, { method: "PATCH", body: JSON.stringify({ aprobada }) }),

  // ─── Marketing v2: Reportes diarios ─────────────────────
  miReporteHoy: () => request<import("../types").ReporteDiario>("/reportes-diarios/hoy"),

  obtenerReporte: (id: string) => request<import("../types").ReporteDiario>(`/reportes-diarios/${id}`),

  listarReportes: (params: { usuarioId?: string; fecha?: string; estado?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").ReporteDiario[]>(`/reportes-diarios${qs ? `?${qs}` : ""}`);
  },

  enviarReporte: (id: string) =>
    request<import("../types").ReporteDiario>(`/reportes-diarios/${id}/enviar`, { method: "POST" }),

  revisarReporte: (id: string, decision: string) =>
    request<import("../types").ReporteDiario>(`/reportes-diarios/${id}/revisar`, { method: "POST", body: JSON.stringify({ decision }) }),

  actualizarReporte: (id: string, data: Record<string, unknown>) =>
    request<import("../types").ReporteDiario>(`/reportes-diarios/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  panelLiderReportes: (fecha?: string) => {
    const qs = fecha ? `?fecha=${fecha}` : "";
    return request<import("../types").PanelLiderMarketing>(`/reportes-diarios/lider/equipo${qs}`);
  },

  // ─── Marketing v2: Recursos ─────────────────────────────
  listarRecursos: (params: { cliente?: string; categoria?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").Recurso[]>(`/recursos${qs ? `?${qs}` : ""}`);
  },

  crearRecurso: (data: { nombre: string; url: string; descripcion?: string; cliente?: string; categoria?: string; visibleRoles?: string }) =>
    request<import("../types").Recurso>("/recursos", { method: "POST", body: JSON.stringify(data) }),

  actualizarRecurso: (id: string, data: Record<string, unknown>) =>
    request<import("../types").Recurso>(`/recursos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  eliminarRecurso: (id: string) =>
    request<{ ok: boolean }>(`/recursos/${id}`, { method: "DELETE" }),

  // ─── Actividad ───────────────────────────────────────────

  timelineGlobal: (limite = 100) =>
    request<import("../types").EventoActividad[]>(`/actividad?limite=${limite}`),

  actividadUsuario: (usuarioId: string) =>
    request<import("../types").EventoActividad[]>(`/actividad/usuario/${usuarioId}`),

  miActividad: () => request<import("../types").EventoActividad[]>("/actividad/mi-actividad"),

  resumenEjecutivo: () => request<import("../types").ResumenEjecutivo>("/actividad/resumen"),

  // ─── Archivos ────────────────────────────────────────────

  listarArchivos: (params: { entidad?: string; entidadId?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").Archivo[]>(`/archivos${qs ? `?${qs}` : ""}`);
  },

  crearArchivo: (data: { nombre: string; url: string; tipo?: string; tamanoBytes?: number; entidad: string; entidadId: string }) =>
    request<import("../types").Archivo>("/archivos", { method: "POST", body: JSON.stringify(data) }),

  eliminarArchivo: (id: string) =>
    request<{ ok: boolean }>(`/archivos/${id}`, { method: "DELETE" }),

  // ─── Org ─────────────────────────────────────────────────

  listarDepartamentos: () => request<import("../types").Departamento[]>("/org/departamentos"),

  organigrama: () => request<any[]>("/org/organigrama"),

  listarEquipos: (departamentoId?: string) => {
    const qs = departamentoId ? `?departamentoId=${departamentoId}` : "";
    return request<import("../types").Equipo[]>(`/org/equipos${qs}`);
  },

  miembrosEquipo: (equipoId: string) =>
    request<import("../types").MiembroEquipo[]>(`/org/equipos/${equipoId}/miembros`),

  // ─── Proyectos ───────────────────────────────────────────

  listarProyectos: (params: { departamentoId?: string; responsableId?: string; estado?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").Proyecto[]>(`/proyectos${qs ? `?${qs}` : ""}`);
  },

  obtenerProyecto: (id: string) => request<import("../types").Proyecto>(`/proyectos/${id}`),

  crearProyecto: (data: {
    nombre: string;
    objetivo?: string;
    cliente?: string;
    responsableId: string;
    departamentoId: string;
    fechaInicio?: string;
    fechaEntrega?: string;
    prioridad?: string;
  }) => request<import("../types").Proyecto>("/proyectos", { method: "POST", body: JSON.stringify(data) }),

  actualizarProyecto: (id: string, data: Record<string, unknown>) =>
    request<import("../types").Proyecto>(`/proyectos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  cambiarActivoProyecto: (id: string, activo: boolean) =>
    request<import("../types").Proyecto>(`/proyectos/${id}/activo`, { method: "PATCH", body: JSON.stringify({ activo }) }),

  agregarComentarioProyecto: (proyectoId: string, texto: string) =>
    request<import("../types").ComentarioProyecto>(`/proyectos/${proyectoId}/comentarios`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    }),

  // ─── Tareas extendidas ───────────────────────────────────

  reasignarTarea: (id: string, responsableId: string) =>
    request<import("../types").TareaOperativa>(`/tareas/${id}/reasignar`, {
      method: "PATCH",
      body: JSON.stringify({ responsableId }),
    }),

  registrarTiempo: (id: string, minutos: number) =>
    request<{ tareaId: string; tiempoInvertido: number; minutosAgregados: number }>(`/tareas/${id}/tiempo`, {
      method: "PATCH",
      body: JSON.stringify({ minutos }),
    }),

  calendarioEditorial: (params: { canal?: string; desde?: string; hasta?: string; responsableId?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").TareaOperativa[]>(`/tareas/calendario${qs ? `?${qs}` : ""}`);
  },

  // ─── Dashboards ──────────────────────────────────────────

  dashboardLider: () => request<import("../types").DashboardLider>("/reportes/dashboard-lider"),

  dashboardCEO: () => request<import("../types").DashboardCEO>("/reportes/dashboard-ceo"),

  // ─── BMF — Business Market Finders ────────────────────────

  listarBmfLenders: () => request<import("../types").BmfLender[]>("/bmf/lenders"),

  crearBmfLender: (data: { nombre: string; contacto?: string; email?: string; telefono?: string; productos?: string; montoMinimo?: number; montoMaximo?: number; tiempoRespuestaDias?: number; estado?: string; observaciones?: string }) =>
    request<import("../types").BmfLender>("/bmf/lenders", { method: "POST", body: JSON.stringify(data) }),

  obtenerBmfLender: (id: string) => request<import("../types").BmfLender>(`/bmf/lenders/${id}`),

  actualizarBmfLender: (id: string, data: Record<string, unknown>) =>
    request<import("../types").BmfLender>(`/bmf/lenders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  listarBmfFundings: (params: { estado?: string; agenteId?: string; lenderId?: string; clienteId?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").BmfFunding[]>(`/bmf/fundings${qs ? `?${qs}` : ""}`);
  },

  crearBmfFunding: (data: { clienteId: string; agenteId: string; lenderId?: string; montoSolicitado: number; observaciones?: string }) =>
    request<import("../types").BmfFunding>("/bmf/fundings", { method: "POST", body: JSON.stringify(data) }),

  obtenerBmfFunding: (id: string) => request<import("../types").BmfFunding>(`/bmf/fundings/${id}`),

  actualizarBmfFunding: (id: string, data: Record<string, unknown>) =>
    request<import("../types").BmfFunding>(`/bmf/fundings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  listarBmfSolicitudes: () => request<import("../types").BmfSolicitud[]>("/bmf/solicitudes"),
  obtenerBmfSolicitud: (id: string) => request<import("../types").BmfSolicitudDetalle>(`/bmf/solicitudes/${id}`),

  listarBmfLlamadas: (params: { personaId?: string; agenteId?: string; desde?: string; hasta?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").BmfLlamada[]>(`/bmf/llamadas${qs ? `?${qs}` : ""}`);
  },

  registrarBmfLlamada: (data: { personaId: string; agenteId: string; duracionMinutos?: number; resultado?: string; observaciones?: string }) =>
    request<import("../types").BmfLlamada>("/bmf/llamadas", { method: "POST", body: JSON.stringify(data) }),

  statsBmfLlamadas: (params: { agenteId?: string; desde?: string; hasta?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ total: number; porAgente: { agenteId: string; agenteNombre: string; total: number; contesto: number; noContesto: number; buzon: number }[]; porDia: { fecha: string; total: number }[] }>(`/bmf/llamadas/stats${qs ? `?${qs}` : ""}`);
  },

  listarBmfComisiones: (params: { agenteId?: string; estado?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<import("../types").BmfComision[]>(`/bmf/comisiones${qs ? `?${qs}` : ""}`);
  },

  crearBmfComision: (data: { agenteId: string; fundingId: string; monto: number; porcentaje: number }) =>
    request<import("../types").BmfComision>("/bmf/comisiones", { method: "POST", body: JSON.stringify(data) }),

  pagarBmfComision: (id: string) =>
    request<import("../types").BmfComision>(`/bmf/comisiones/${id}`, { method: "PATCH" }),

  bmfDashboard: () => request<import("../types").BmfDashboard>("/bmf/dashboard"),

  bmfDashboardAdmin: () => request<import("../types").BmfDashboardAdmin>("/bmf/dashboard/admin"),

  bmfScoreCliente: (personaId: string) => request<import("../types").BmfScore>(`/bmf/score/${personaId}`),

  bmfProduccionAgente: (params: { desde?: string; hasta?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ agenteId: string; agenteNombre: string; totalFundings: number; montoSolicitado: number; aprobados: number; montoAprobado: number; conversion: number }[]>(`/bmf/reportes/produccion-agente${qs ? `?${qs}` : ""}`);
  },

  bmfProduccionLender: (params: { desde?: string; hasta?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Record<string, unknown>[]>(`/bmf/reportes/produccion-lender${qs ? `?${qs}` : ""}`);
  },

  bmfFundingMensual: (anio?: number) => {
    const qs = anio ? `?anio=${anio}` : "";
    return request<{ mes: number; solicitado: number; aprobado: number; count: number; ganados: number; perdidos: number }[]>(`/bmf/reportes/funding-mensual${qs}`);
  },

  bmfPipelineReport: () => request<{ estado: string; count: number; montoTotal: number }[]>("/bmf/reportes/pipeline"),

  bmfReporteLlamadas: (params: { desde?: string; hasta?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Record<string, unknown>[]>(`/bmf/reportes/llamadas${qs ? `?${qs}` : ""}`);
  },

  bmfRanking: (params: { desde?: string; hasta?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ agenteId: string; agenteNombre: string; totalFundings: number; montoSolicitado: number; montoAprobado: number; llamadas: number; conversion: number }[]>(`/bmf/reportes/ranking${qs ? `?${qs}` : ""}`);
  },

  bmfKpiAgente: (agenteId: string) => request<Record<string, unknown>>(`/bmf/reportes/kpi-agente/${agenteId}`),

  // ─── Motor de Ingresos ─────────────────────────────────

  listarOfertas: () => request<import("../types").Oferta[]>("/ingresos/ofertas"),

  resumenIngresos: (mes?: string) => {
    const qs = mes ? `?mes=${mes}` : "";
    return request<import("../types").ResumenIngresos>(`/ingresos/resumen${qs}`);
  },

  resumenHoy: () => request<import("../types").ResumenHoy>("/ingresos/resumen/hoy"),

  tickerIngresos: () => request<{ hoy: { facturado: number; meta: number; pct: number }; ultimos7dias: { fecha: string; total: number }[]; ofertas: import("../types").TickerItem[] }>("/ingresos/ticker"),

  ventasPorOferta: (mes?: string) => {
    const qs = mes ? `?mes=${mes}` : "";
    return request<import("../types").OfertaConProgreso[]>(`/ingresos/ofertas/progreso${qs}`);
  },

  egresosPorCategoria: (mes?: string) => {
    const qs = mes ? `?mes=${mes}` : "";
    return request<import("../types").EgresoCategoria[]>(`/ingresos/egresos/categorias${qs}`);
  },

  adelantosPendientes: () => request<import("../types").AdelantoPendiente[]>("/ingresos/adelantos"),

  rentabilidadPorLinea: (mes?: string) => {
    const qs = mes ? `?mes=${mes}` : "";
    return request<import("../types").RentabilidadLinea[]>(`/ingresos/rentabilidad${qs}`);
  },

  actividadReciente: (limite = 12) => request<import("../types").ActividadIngreso[]>(`/ingresos/actividad?limite=${limite}`),

  registrarVenta: (data: { fecha: string; ofertaId: string; monto: number; nota?: string; esAnticipo?: boolean; totalDeal?: number }) =>
    request<{ id: string }>("/ingresos/ventas", { method: "POST", body: JSON.stringify(data) }),

  eliminarVenta: (id: string) =>
    request<{ ok: boolean }>(`/ingresos/ventas/${id}`, { method: "DELETE" }),

  registrarEgreso: (data: { fecha: string; categoria: string; monto: number; ofertaId?: string; nota?: string }) =>
    request<{ id: string }>("/ingresos/egresos", { method: "POST", body: JSON.stringify(data) }),

  eliminarEgreso: (id: string) =>
    request<{ ok: boolean }>(`/ingresos/egresos/${id}`, { method: "DELETE" }),

  // ─── Métricas Meta Ads ─────────────────────────────────
  listarMetaAds: () => request<import("../types").MetaAdsReporteResumen[]>("/meta-ads"),

  obtenerMetaAds: (id: string) => request<import("../types").MetaAdsReporte>(`/meta-ads/${id}`),

  crearMetaAds: (data: import("../types").MetaAdsReporteInput) =>
    request<import("../types").MetaAdsReporte>("/meta-ads", { method: "POST", body: JSON.stringify(data) }),

  actualizarMetaAds: (id: string, data: import("../types").MetaAdsReporteInput) =>
    request<import("../types").MetaAdsReporte>(`/meta-ads/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  eliminarMetaAds: (id: string) =>
    request<{ ok: boolean }>(`/meta-ads/${id}`, { method: "DELETE" }),

  // ─── Activos digitales de un cliente (pestaña en la ficha de persona) ─────
  listarActivosDigitales: (personaId: string) =>
    request<import("../types").ActivoDigital[]>(`/personas/${personaId}/activos-digitales`),

  crearActivoDigital: (personaId: string, data: Record<string, unknown>) =>
    request<import("../types").ActivoDigital>(`/personas/${personaId}/activos-digitales`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  actualizarActivoDigital: (personaId: string, activoId: string, data: Record<string, unknown>) =>
    request<import("../types").ActivoDigital>(`/personas/${personaId}/activos-digitales/${activoId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  eliminarActivoDigital: (personaId: string, activoId: string) =>
    request<{ ok: boolean }>(`/personas/${personaId}/activos-digitales/${activoId}`, { method: "DELETE" }),
};

export { getToken };
