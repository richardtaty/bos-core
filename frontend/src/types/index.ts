// Jerarquía: SUPER_ADMIN > ADMIN > SUPERVISOR > USUARIO.
// SUPERVISOR manda sobre las tareas de su departamento, no sobre
// facturación ni configuración — ver JERARQUIA en backend/src/middleware/auth.ts.
export type Rol = "SUPER_ADMIN" | "ADMIN" | "SUPERVISOR" | "USUARIO";

export interface Usuario {
  id: string;
  nombre: string;
  email?: string;
  rol: Rol;
  activo?: boolean;
  departamentoId?: string | null;
  departamentoIds?: string[];
  cargo?: string | null;
  supervisorId?: string | null;
}

export interface Persona {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  ciudad: string;
  estado: string;
  fuente: string;
  referidoPor?: string | null;
  responsableId?: string;
  responsableNombre?: string;
  tags: string[];
  negocios: string[];
  empresa?: string | null;
  industria?: string | null;
  facturacionMensualEstimada?: number | null;
  tiempoEnNegocio?: string | null;
  fundingSolicitado?: number | null;
  fundingAnterior?: number | null;
  temperatura?: "frio" | "tibio" | "caliente" | null;
  prioridad?: "baja" | "media" | "alta" | "urgente" | null;
  estadoProceso?: string | null;
  fechaNacimiento?: string | null;
  updatedAt: string;
}

export interface Interaccion {
  id: string;
  tipo: string;
  nota: string;
  fecha: string;
  autorNombre: string;
}

export interface TareaSeguimiento {
  id: string;
  fecha: string;
  nota: string | null;
  completado: boolean;
}

export interface RegistroPersona {
  id: string;
  valor: number | null;
  pipelineNombre: string;
  etapaNombre: string;
}

export interface HistorialItem {
  id: string;
  entidad: string;
  accion: string;
  fecha: string;
  autorNombre: string;
}

export interface TareaPendiente {
  id: string;
  fecha: string;
  nota: string | null;
  // Tipo estructurado del registro del Calendario ('alerta' | 'recordatorio' | 'seguimiento').
  tipo: string;
  // Título/motivo corto (opcional en los seguimientos que agenda el CRM).
  titulo: string | null;
  personaId: string;
  personaNombre: string;
  responsableId: string;
  responsableNombre: string;
}

// ─── 📅 Registros del Calendario (SALA DE OFERTAS → Calendario) ─────────
// Alerta / Recordatorio / Seguimiento. Se guardan en la misma tabla que alimenta el resumen
// ATRASADAS/PARA HOY/PRÓXIMAS. Valor estructurado, nunca deducido por el texto.

export type TipoRegistroCalendario = "alerta" | "recordatorio" | "seguimiento";

export interface RegistroCalendarioInput {
  personaId: string;
  tipo: TipoRegistroCalendario;
  fecha: string; // ISO
  titulo: string;
  nota?: string;
}

export interface Cumpleanero {
  personaId: string;
  personaNombre: string;
  fechaNacimiento: string;
}

// ─── 🎂 Próximos cumpleaños (módulo propio) ─────────────────

/** Contacto vinculado a un cumpleaños (solo lo mínimo: el resto vive en su ficha). */
export interface VinculoPersonaCumpleanos {
  id: string;
  telefono: string | null;
  email: string | null;
}

/** Fila de la lista cronológica del módulo (un registro por persona). */
export interface Cumpleano {
  id: string;
  nombre: string;
  personaId: string | null;
  persona: VinculoPersonaCumpleanos | null;
  mes: number;
  dia: number;
  anio: number | null;
  edad: number | null;
  nextBirthday: string; // YYYY-MM-DD (ET) de la próxima ocurrencia
  daysUntil: number;
  activo: boolean;
  notas: string | null;
}

/** Un recordatorio por año (historial en el detalle). */
export interface RecordatorioCumpleano {
  id: string;
  anio: number;
  fechaCumpleanos: string;
  estado: "pendiente" | "realizado" | "cancelado";
  etiquetaEstado: string;
  completadoPor: string | null;
  completadoEn: string | null;
}

export interface CumpleanoDetalle extends Cumpleano {
  recordatorios: RecordatorioCumpleano[];
}

/** Recordatorio pendiente en la ventana de aviso (el grupo "🎂 Cumpleaños" de Tareas). */
export interface RecordatorioCumpleanoActivo {
  id: string;
  cumpleanosId: string;
  nombre: string;
  personaId: string | null;
  persona: VinculoPersonaCumpleanos | null;
  fechaCumpleanos: string;
  anio: number;
  etiqueta: string; // "14 de septiembre"
  daysUntil: number;
  diasAviso: number;
}

export interface ListaCumpleanos {
  items: Cumpleano[];
  meses: number;
  total: number;
  totalActivos: number;
}

/** Cumpleaños activos de un mes (para la cuadrícula del Calendario de Marketing). */
export interface CumpleanoDelMes {
  id: string;
  nombre: string;
  personaId: string | null;
  mes: number;
  dia: number;
}

export interface FichaPersona extends Persona {
  comentarios?: string | null;
  interacciones: Interaccion[];
  tareas: TareaSeguimiento[];
  registros: RegistroPersona[];
  timeline: { tipo: string; fecha: string; autor: string; detalle: string }[];
  historial: HistorialItem[];
}

export interface Etapa {
  id: string;
  nombre: string;
  orden: number;
  esGanada: boolean;
  esPerdida: boolean;
}

export interface Registro {
  id: string;
  personaId: string | null;
  personaNombre?: string | null;
  valor: number | null;
  etapaId: string;
  totalPagado?: number;
  saldoPendiente?: number | null;
  proximoPago?: number | null;
  fechaProximoPago?: string | null;
  metodoPago?: string | null;
  montoVencido?: number;
}

export interface Pago {
  id: string;
  registroId: string;
  monto: number;
  nota: string | null;
  fecha: string;
}

export interface AccionDinero {
  personaNombre: string | null;
  pipelineNombre: string | null;
  monto: number;
  tipo: "vencido" | "programado" | "caliente";
  probabilidad: number;
}

export interface ItemDinero {
  registroId: string;
  personaNombre: string | null;
  pipelineNombre: string | null;
  monto: number;
  fecha: string | null;
}

export interface OfertaCaliente {
  registroId: string;
  personaNombre: string | null;
  pipelineNombre: string | null;
  monto: number;
  etapaNombre: string | null;
}

export interface Alerta {
  severidad: "critica" | "advertencia" | "info";
  titulo: string;
  detalle: string;
  enlace: string;
}

export interface OportunidadScore {
  personaNombre: string | null;
  pipelineNombre: string | null;
  etapaNombre: string | null;
  valor: number | null;
  score: number;
  accion: string;
}

export interface CommandCenter {
  resumen: {
    vendido: number;
    cobrado: number;
    cobradoMes: number;
    cashGap: number;
    vencido: number;
    proximos7dias: number;
    proximos30dias: number;
    pipelineCaliente: number;
  };
  moneyToday: {
    cobrosVencidos: ItemDinero[];
    pagosProgramados: ItemDinero[];
    ofertasCalientes: OfertaCaliente[];
  };
  topAcciones: AccionDinero[];
  alertas: Alerta[];
  oportunidades: OportunidadScore[];
}

export interface CeoMode {
  dinero: { cobrado: number; vendido: number; vencido: number };
  ventas: { deals: number; conversion: number; ticketPromedio: number };
  pipeline: { total: number; caliente: number };
  equipo: { topPerformer: string | null; cuelloBotella: string | null };
  proximaDecision: { personaNombre: string | null; accion: string; pipelineNombre: string | null; valor: number | null } | null;
  topAcciones: AccionDinero[];
}

export interface ColumnaKanban extends Etapa {
  registros: Registro[];
}

export interface TableroPipeline {
  id: string;
  nombre: string;
  etapas: ColumnaKanban[];
}

export interface Pipeline {
  id: string;
  nombre: string;
  etapas: Etapa[];
}

// ─── Tareas Operativas ─────────────────────────────────────

// El ÚNICO estado de trabajo terminado es "completada": "aprobado"/"publicado" dejaron de
// existir en tareas_operativas (migración 0026 los migró a "completada"). BMF y
// reportes-diarios usan su propio estado "aprobado" en otras tablas: ese no se toca aquí.
export type EstadoTarea =
  | "solicitud" | "backlog" | "pendiente" | "por_hacer"
  | "en_proceso" | "bloqueada" | "en_revision" | "requiere_ajustes"
  | "completada" | "cancelado";

export type Prioridad = "baja" | "media" | "alta" | "urgente";

export type TipoTarea =
  | "diseno_grafico" | "video" | "pagina_web"
  | "email_marketing" | "automatizacion" | "redes_sociales"
  | "publicidad" | "reporte_analisis" | "revision" | "administracion";

export interface ChecklistItem {
  id: string;
  tareaId: string;
  texto: string;
  completado: boolean;
  orden: number;
}

export interface ComentarioTarea {
  id: string;
  autorId: string;
  autorNombre: string;
  texto: string;
  fecha: string;
}

export interface TareaOperativa {
  id: string;
  titulo: string;
  descripcion: string | null;
  responsableId: string;
  responsableNombre: string;
  departamento: string;
  prioridad: Prioridad;
  fechaInicio: string | null;
  fechaLimite: string | null;
  estado: EstadoTarea;
  aprobadorId: string | null;
  proyectoId: string | null;
  porcentajeAvance: number;
  canal: string | null;
  tipoContenido: string | null;
  fechaPublicacion: string | null;
  subtareaDe: string | null;
  tiempoInvertido: number;
  // ─── Marketing v2 ────────────────────────
  tipoTarea: TipoTarea | null;
  tiempoEstimado: number;
  solicitanteId: string | null;
  /** Quién delegó la tarea. Conserva el control aunque ya no sea el responsable. */
  asignadoPorId: string | null;
  criteriosTerminado: string | null;
  bloqueoMotivo: string | null;
  bloqueoDependeDe: string | null;
  bloqueoDesde: string | null;
  fechaLimiteOriginal: string | null;
  sprint: string | null;
  resultadoFinal: string | null;
  createdAt: string;
  updatedAt: string;
  /** Momento real del paso a EN PROCESO (módulo DEV). null si aún no ocurrió. */
  startedAt: string | null;
  /** Momento real del paso a FINALIZADA (módulo DEV). null si aún no ocurrió. */
  completedAt: string | null;
  checklist?: ChecklistItem[];
  comentarios?: ComentarioTarea[];
  subtareas?: TareaOperativa[];
}

export interface KpiUsuario {
  total: number;
  completadas: number;
  enProgreso: number;
  enRevision: number;
  atrasadas: number;
  bloqueadas: number;
  tiempoTotal: number;
  publicadas: number;
}

// ─── Marketing v2: Reportes diarios ─────────────────────

export type EstadoReporte = "no_iniciado" | "en_elaboracion" | "enviado" | "revisado" | "requiere_correccion" | "aprobado";

export interface ReporteDiario {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  fecha: string;
  tareasAsignadas: string | null;
  tareasCompletadas: string | null;
  tareasPendientes: string | null;
  tiempoUtilizado: string | null;
  enlaces: string | null;
  dificultades: string | null;
  necesitaRevision: string | null;
  apoyoRequerido: string | null;
  observaciones: string | null;
  estado: EstadoReporte;
  revisadoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Marketing v2: Solicitudes de extensión ─────────────

export interface SolicitudExtension {
  id: string;
  tareaId: string;
  solicitanteId: string;
  solicitanteNombre: string;
  motivo: string;
  porcentajeCompletado: number;
  tiempoAdicionalMinutos: number;
  nuevaFecha: string | null;
  dificultad: string | null;
  estado: "pendiente" | "aprobada" | "rechazada";
  autorizadorId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Marketing v2: Recursos ─────────────────────────────

export interface Recurso {
  id: string;
  nombre: string;
  url: string;
  descripcion: string | null;
  cliente: string | null;
  categoria: string | null;
  visibleRoles: string;
  autorId: string;
  autorNombre: string;
  createdAt: string;
  updatedAt: string;
}

export interface PanelLiderMarketing {
  miembros: { usuarioId: string; nombre: string; cargo: string }[];
  reportes: ReporteDiario[];
  resumen: { entregados: number; pendientes: number; total: number };
}

// ─── Actividad ─────────────────────────────────────────────

export interface EventoActividad {
  id: string;
  tipo: string;
  accion: string;
  detalle: string;
  autorId: string;
  autorNombre: string;
  entidad: string;
  entidadId: string;
  fecha: string;
  categoria: string;
}

// ─── Archivos ──────────────────────────────────────────────

export interface Archivo {
  id: string;
  nombre: string;
  url: string;
  tipo: "imagen" | "video" | "documento" | "otro";
  tamanoBytes: number;
  entidad: string;
  entidadId: string;
  autorId: string;
  autorNombre: string;
  fecha: string;
}

// ─── Tickets de soporte (DEV → Tickets) ────────────────────

export type PrioridadTicket = "Baja" | "Normal" | "Alta";

/** Estados reales del ticket. Nace PENDIENTE; el solicitante no elige estado. */
export type EstadoTicket = "PENDIENTE" | "COMPLETADO" | "CANCELADO";

/** Las dos únicas acciones para resolver un ticket pendiente. */
export type EstadoResolucionTicket = "COMPLETADO" | "CANCELADO";

/** Los tres contadores del panel de DEV → Tickets (conteos reales, no fijos). */
export interface TicketEstadisticas {
  recibidos: number;
  completados: number;
  cancelados: number;
}

export interface TicketAdjunto {
  id: string;
  nombreOriginal: string;
  contentType: string;
  tamanoBytes: number;
  createdAt: string;
}

export interface Ticket {
  id: string;
  requestedByUserId: string;
  solicitanteNombre: string;
  solicitudEmail: string | null;
  solicitudCargo: string | null;
  description: string;
  prioridad: PrioridadTicket;
  status: EstadoTicket;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  adjuntosCount: number;
  adjuntos?: TicketAdjunto[];
}

// ─── Dashboard Ejecutivo ───────────────────────────────────

export interface ResumenEjecutivo {
  tareasPendientes: number;
  tareasVencidas: number;
}

// ─── Estructura Organizacional ────────────────────────────

export interface Departamento {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  createdAt: string;
}

export interface Equipo {
  id: string;
  nombre: string;
  departamentoId: string;
  supervisorId: string | null;
  supervisor?: { id: string; nombre: string } | null;
  miembros?: MiembroEquipo[];
  createdAt: string;
}

export interface MiembroEquipo {
  usuarioId: string;
  nombre: string;
  email?: string;
  cargo: string;
}

// ─── Proyectos ────────────────────────────────────────────

export interface Proyecto {
  id: string;
  nombre: string;
  objetivo: string | null;
  cliente: string | null;
  responsableId: string;
  responsableNombre: string;
  departamentoId: string;
  departamentoNombre: string;
  fechaInicio: string | null;
  fechaEntrega: string | null;
  prioridad: Prioridad;
  estado: "activo" | "en_proceso" | "completado" | "en_revision" | "cancelado" | "en_pausa";
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  tareas?: TareaOperativa[];
  comentarios?: ComentarioProyecto[];
}

export interface ComentarioProyecto {
  id: string;
  autorId: string;
  autorNombre: string;
  texto: string;
  fecha: string;
}

// ─── 📅 Calendario de Marketing ───────────────────────────
// Elemento del Calendario de Marketing: un correo/contenido programado asociado a un
// proyecto EXISTENTE. Guarda la relación por proyectoId; el nombre se lee en vivo.
export interface PublicacionMarketing {
  id: string;
  proyectoId: string;
  proyectoNombre: string;
  fecha: string; // YYYY-MM-DD
  nota: string | null; // texto libre de este elemento (null si no tiene)
  creadoPor: string;
  creadoPorNombre: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Dashboards ───────────────────────────────────────────

export interface DashboardLider {
  departamento: string;
  miembros: { usuarioId: string; nombre: string; cargo: string }[];
  produccionHoy: number;
  produccionSemana: number;
  totalTareas: number;
  kpisIndividuales: {
    usuarioId: string;
    nombre: string;
    cargo: string;
    total: number;
    completadas: number;
    enProgreso: number;
    atrasadas: number;
  }[];
  cuellosDeBotella: number;
  cuellos: TareaOperativa[];
  vencidas: number;
  proximasEntregas: TareaOperativa[];
  proximasPublicaciones: TareaOperativa[];
}

/** Una tarea real que compone un contador del CEO Dashboard (contador = cantidad de filas). */
export interface TareaDetalleDashboard {
  id: string;
  titulo: string;
  responsableNombre: string;
  fechaLimite: string | null;
  estado: string;
  completadaEn: string | null;
}

export interface DepartamentoCEO {
  id: string;
  nombre: string;
  total: number;
  /** Tareas activas (ni terminadas ni canceladas) — base de totalTareasActivas. */
  totalActivas: number;
  completadas: number;
  atrasadas: number;
  produccionHoy: number;
  estado: "saludable" | "advertencia" | "critico";
  /** Las tareas EXACTAS que forman cada contador: lista y número SIEMPRE coinciden. */
  completadasDetalle: TareaDetalleDashboard[];
  atrasadasDetalle: TareaDetalleDashboard[];
  produccionHoyDetalle: TareaDetalleDashboard[];
}

export interface DashboardCEO {
  departamentos: DepartamentoCEO[];
  actividad: EventoActividad[];
  usuariosActivos: string[];
  usuariosSinActividad: string[];
  alertas: string[];
  riesgos: string[];
  totalTareasActivas: number;
  produccionTotalHoy: number;
}

// ─── BMF — Business Market Finders ─────────────────────────

export interface BmfLender {
  id: string;
  nombre: string;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  productos: string | null;
  montoMinimo: number | null;
  montoMaximo: number | null;
  tiempoRespuestaDias: number | null;
  estado: string;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
  kpis?: {
    operaciones: number;
    fundingGenerado: number;
    conversion: number;
  };
}

export interface BmfFunding {
  id: string;
  clienteId: string;
  clienteNombre: string;
  agenteId: string;
  agenteNombre: string;
  lenderId: string | null;
  lenderNombre: string | null;
  montoSolicitado: number;
  montoAprobado: number | null;
  fechaCreacion: string;
  fechaAprobacion: string | null;
  fechaFunding: string | null;
  estado: string;
  comisionPorcentaje: number | null;
  comisionMonto: number | null;
  observaciones: string | null;
  createdAt?: string;
  updatedAt: string;
  comisiones?: BmfComision[];
  llamadas?: BmfLlamada[];
}

export interface BmfLlamada {
  id: string;
  personaId: string;
  personaNombre: string;
  agenteId: string;
  agenteNombre: string;
  fecha: string;
  duracionMinutos: number | null;
  resultado: string;
  observaciones: string | null;
}

export interface BmfComision {
  id: string;
  agenteId: string;
  agenteNombre: string;
  fundingId: string;
  clienteNombre?: string;
  monto: number;
  porcentaje: number;
  estado: "pendiente" | "pagada";
  fechaPago: string | null;
  createdAt: string;
}

export interface BmfDashboard {
  clientesActivos: number;
  leadsNuevos: number;
  seguimientosPendientes: number;
  seguimientosVencidos: number;
  solicitudesAbiertas: number;
  solicitudesAprobadas: number;
  solicitudesPerdidas: number;
  fundingMes: number;
  fundingHistorico: number;
  pipelineActivo: number;
  renovacionesProximas: number;
  lendersActivos: number;
  agentesActivos: number;
  conversion: number;
  comisionesGeneradas: number;
  comisionesPendientes: number;
  actividadHoy: number;
  agentes: { usuarioId: string; nombre: string }[];
}

export interface BmfDashboardAdmin {
  agentesSinActividad: { usuarioId: string; nombre: string }[];
  kpisPorAgente: {
    usuarioId: string;
    nombre: string;
    cargo: string;
    llamadasHoy: number;
    clientesAtendidos: number;
    fundingProducido: number;
    seguimientosVencidos: number;
    conversion: number;
  }[];
  clientesSinContacto: { id: string; nombre: string; agenteNombre: string; diasSinContacto: number }[];
  renovacionesProximas: { id: string; clienteNombre: string; montoSolicitado: number; fechaCreacion: string }[];
}

export interface BmfScore {
  personaId: string;
  nivel: "verde" | "amarillo" | "rojo";
  puntaje: number;
  diasSinContacto: number;
  seguimientosVencidos: number;
  totalLlamadas: number;
}

// Solicitud de financiamiento digital (landing/chat). La lista devuelve un subconjunto;
// el detalle devuelve todos los campos + documentos/ofertas/mensajes.
export interface BmfSolicitud {
  id: string;
  applicationId: string;
  personaId: string;
  registroId: string | null;
  empresaLegal: string | null;
  industria: string | null;
  montoSolicitado: number | null;
  propietarioNombre: string | null;
  propietarioApellido: string | null;
  propietarioEmail: string | null;
  empresaCiudad: string | null;
  empresaEstado: string | null;
  estadoDocumentos: "pendiente" | "parcial" | "completo";
  createdAt: string;
  personaNombre: string | null;
  etapaNombre: string | null;
}

export interface BmfSolicitudDocumento {
  id: string;
  tipo: string;
  nombre: string;
  estado: string;
  tamanoBytes: number;
  contentType: string | null;
  createdAt: string;
}

export interface BmfSolicitudOferta {
  id: string;
  lenderId: string | null;
  monto: number | null;
  plazo: string | null;
  frecuenciaPago: string | null;
  totalPagar: number | null;
  factorRate: number | null;
  estado: string;
  createdAt: string;
}

export interface BmfSolicitudMensaje {
  id: string;
  direccion: "entrante" | "saliente";
  remitente: string | null;
  destinatario: string | null;
  asunto: string | null;
  cuerpo: string | null;
  generadoPorIA: boolean;
  estado: string;
  createdAt: string;
}

export interface BmfSolicitudDetalle {
  id: string;
  applicationId: string;
  personaId: string;
  registroId: string | null;
  empresaLegal: string | null;
  dba: string | null;
  empresaDireccion: string | null;
  empresaCiudad: string | null;
  empresaEstado: string | null;
  empresaZip: string | null;
  industria: string | null;
  estructuraNegocio: string | null;
  fechaInicioNegocio: string | null;
  sitioWeb: string | null;
  propietarioNombre: string | null;
  propietarioApellido: string | null;
  propietarioEmail: string | null;
  propietarioTelefono: string | null;
  porcentajePropiedad: number | null;
  montoSolicitado: number | null;
  propositoFondos: string | null;
  ingresoMensualEstimado: number | null;
  depositosMensualesPromedio: number | null;
  tieneFinanciamientoActual: boolean;
  saldoFinanciamientoActual: number | null;
  ein: string | null;
  bancoNombre: string | null;
  depositosMensualesAprox: number | null;
  estadoDocumentos: "pendiente" | "parcial" | "completo";
  fuente: string | null;
  consentimiento: boolean;
  consentimientoFecha: string | null;
  createdAt: string;
  updatedAt: string;
  persona: { id: string; nombre: string; email?: string | null; telefono?: string | null } | null;
  etapaNombre: string | null;
  documentos: BmfSolicitudDocumento[];
  ofertas: BmfSolicitudOferta[];
  mensajes: BmfSolicitudMensaje[];
}

// ─── Motor de Ingresos ─────────────────────────────────

export interface Oferta {
  id: string;
  nombre: string;
  categoria: "Ancla" | "Recurrente" | "Volumen medio" | "Volumen alto" | "Evento";
  target: number;
  ticket: number;
}

export interface VentaIngreso {
  id: string;
  fecha: string;
  ofertaId: string;
  ofertaNombre?: string;
  monto: number;
  nota?: string | null;
  esAnticipo: boolean;
  totalDeal?: number | null;
  autorId: string;
  autorNombre?: string;
}

export interface Egreso {
  id: string;
  fecha: string;
  categoria: string;
  ofertaId?: string | null;
  ofertaNombre?: string | null;
  monto: number;
  nota?: string | null;
  autorId: string;
  autorNombre?: string;
}

export interface ResumenIngresos {
  mes: string;
  metaMensual: number;
  facturado: number;
  pctMeta: number;
  gastos: number;
  gananciaNeta: number;
  margen: number;
}

export interface ResumenHoy {
  fecha: string;
  facturado: number;
  metaDiaria: number;
  pct: number;
  cumplida: boolean;
}

export interface OfertaConProgreso {
  ofertaId: string;
  nombre: string;
  categoria: string;
  target: number;
  ticket: number;
  actual: number;
  pct: number;
}

export interface TickerItem {
  nombre: string;
  categoria: string;
  target: number;
  actual: number;
  pct: number;
}

export interface AdelantoPendiente {
  id: string;
  fecha: string;
  ofertaId: string;
  ofertaNombre: string;
  monto: number;
  totalDeal: number;
  saldoPendiente: number;
  nota?: string | null;
}

export interface EgresoCategoria {
  categoria: string;
  monto: number;
  pct: number;
}

export interface RentabilidadLinea {
  ofertaId?: string | null;
  ofertaNombre: string;
  ingresos: number;
  egresos: number;
  neto: number;
}

export interface ActividadIngreso {
  tipo: "ingreso" | "egreso";
  id: string;
  fecha: string;
  monto: number;
  ofertaNombre?: string;
  categoria?: string;
  nota?: string | null;
}

// ─── Métricas Meta Ads (registro manual) ──────────────────────

export interface MetaAdsSegmentacion {
  id: string;
  nombre: string;
  ubicacionPublico: string | null;
  presupuesto: number | null;
  leads: number | null;
  costoPorLead: number | null;
  observacion: string | null;
  orden: number;
}

export interface MetaAdsCampana {
  id: string;
  nombre: string;
  ubicacionPublico: string | null;
  presupuesto: number | null;
  detallePresupuesto: string | null;
  leads: number | null;
  costoPorLead: number | null;
  moneda: string | null;
  estado: "Activa" | "Inactiva";
  observaciones: string | null;
  recomendaciones: string | null;
  orden: number;
  segmentaciones: MetaAdsSegmentacion[];
}

export interface MetaAdsGrupo {
  id: string;
  seccionPrincipal: string;
  nombre: string;
  subtitulo: string | null;
  presupuestoTotalActual: number | null;
  observacion: string | null;
  sinCampanasActivas: boolean;
  orden: number;
  campanas: MetaAdsCampana[];
}

export interface MetaAdsResumen {
  totalCampanas: number;
  activas: number;
  inactivas: number;
  totalLeads: number;
}

export interface MetaAdsReporteResumen {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  titulo: string | null;
  presupuestoTotalActual: number | null;
  creadoPor: string;
  creadoPorNombre: string | null;
  actualizadoPor: string | null;
  actualizadoPorNombre: string | null;
  createdAt: string;
  updatedAt: string;
  resumen: MetaAdsResumen;
}

export interface MetaAdsReporte extends MetaAdsReporteResumen {
  observacionGeneral: string | null;
  grupos: MetaAdsGrupo[];
}

// ─── Payloads de entrada (formulario) ──────────────────────────

export interface MetaAdsSegmentacionInput {
  nombre: string;
  ubicacionPublico?: string;
  presupuesto?: number | null;
  leads?: number | null;
  costoPorLead?: number | null;
  observacion?: string;
}

export interface MetaAdsCampanaInput {
  nombre: string;
  ubicacionPublico?: string;
  presupuesto?: number | null;
  detallePresupuesto?: string;
  leads?: number | null;
  costoPorLead?: number | null;
  moneda?: string;
  estado?: "Activa" | "Inactiva";
  observaciones?: string;
  recomendaciones?: string;
  segmentaciones?: MetaAdsSegmentacionInput[];
}

export interface MetaAdsGrupoInput {
  seccionPrincipal: string;
  nombre: string;
  subtitulo?: string;
  presupuestoTotalActual?: number | null;
  observacion?: string;
  sinCampanasActivas?: boolean;
  campanas?: MetaAdsCampanaInput[];
}

export interface MetaAdsReporteInput {
  fechaInicio: string;
  fechaFin: string;
  titulo?: string;
  observacionGeneral?: string;
  presupuestoTotalActual?: number | null;
  grupos: MetaAdsGrupoInput[];
}

// ─── Activos digitales de un cliente (pestaña de la ficha) ──────────
// Cada cliente puede tener N activos (landings, funnels, formularios, dominios, etc.).
// Relación uno-a-muchos con la persona — nunca campos rígidos tipo landing_url.

export type TipoActivoDigital =
  | "Landing"
  | "Funnel"
  | "Thank You Page"
  | "Formulario"
  | "Dominio"
  | "Automatización"
  | "Otro";

export interface ActivoDigital {
  id: string;
  personaId: string;
  nombre: string;
  url: string | null;
  tipo: TipoActivoDigital;
  plataforma: string | null;
  objetivo: string | null;
  activo: boolean;
  notas: string | null;
  autorId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Recursos Humanos → Personal ────────────────────────────────────
// La plantilla NO es una segunda base de personas: es la vista laboral de las personas que
// ya existen en `usuarios`. Todo se relaciona por `userId` (ID real), nunca por nombre ni
// email. `estadoLaboral` (RRHH) y `accesoActivo` (CRM) son cosas distintas a propósito.

export type EstadoLaboral = "ACTIVO" | "INACTIVO";

export interface PersonalRRHH {
  /** ID real de la persona en el CRM. Llave para Asistencia y futuro Control de Sueldo. */
  userId: string;
  /** ID del perfil laboral (null hasta el primer guardado). */
  empleadoId: string | null;
  nombre: string;
  email: string;
  /** Cargo/puesto. No confundir con el rol de permisos del CRM. */
  cargo: string | null;
  estadoLaboral: EstadoLaboral;
  notas: string | null;
  departamentos: { id: string; nombre: string }[];
  supervisorId: string | null;
  supervisorNombre: string | null;
  /** ¿Su cuenta del CRM está habilitada? Independiente del estado laboral. */
  accesoActivo: boolean;
}

// ─── Recursos Humanos → Asistencia / Mi jornada ─────────────────────
// Solo tiempo: cuándo entró, cuándo salió y cuánto trabajó. Nada de sueldo, tarifas ni nómina.
// La duración SIEMPRE se calcula desde startedAt/endedAt; no se guarda como texto.
// `estado` y `duracionSegundos` son null/"ABIERTA" mientras la jornada siga abierta: no se
// inventa una hora de salida ni una duración ficticia.

export type EstadoSesionJornada = "ABIERTA" | "FINALIZADA";

/**
 * REGULAR = jornada normal del día. REPOSICION = sesión aparte para recuperar dentro del mes
 * las horas que quedaron pendientes. Una reposición NUNCA modifica la jornada original.
 */
export type TipoSesionJornada = "REGULAR" | "REPOSICION";

/**
 * Estado de un check-in de actividad. Los cancelados son los que nunca llegaron a ocurrir
 * (porque la sesión terminó antes): quedan fuera del denominador de «7 de 8».
 */
export type EstadoCheckin = "PENDIENTE" | "RESPONDIDO" | "SIN_RESPUESTA" | "CANCELADO";

export interface Checkin {
  id: string;
  jornadaId: string;
  /** Bloque de 1 hora desde el inicio de la sesión (0, 1, 2…). Máximo uno por bloque. */
  blockIndex: number;
  /** Instante en que toca la alerta. Lo decide el servidor, no el navegador. */
  scheduledAt: string;
  /** Primera vez que la alerta se mostró. De aquí cuenta la ventana de respuesta. */
  deliveredAt: string | null;
  respondedAt: string | null;
  estado: EstadoCheckin;
  /** Fin de la ventana de respuesta. null mientras no se haya mostrado. */
  expiraEn: string | null;
}

export interface ConteoCheckins {
  /** Denominador de «7 de 8»: NO incluye los cancelados, que nunca llegaron a ocurrir. */
  total: number;
  respondidos: number;
  sinRespuesta: number;
  pendientes: number;
  cancelados: number;
}

export interface SesionJornada {
  id: string;
  /** ID real de la persona (usuarios.id). */
  userId: string;
  /** ID del perfil laboral — la relación estructurada del futuro Control de Sueldo. */
  empleadoId: string;
  personaNombre: string;
  sessionType: TipoSesionJornada;
  startedAt: string;
  /** null mientras la jornada siga abierta. */
  endedAt: string | null;
  estado: EstadoSesionJornada;
  /** Segundos reales trabajados. null si sigue abierta. */
  duracionSegundos: number | null;
  duracionMinutos: number | null;
  /** Día del negocio (Florida) en que inició, formato YYYY-MM-DD. */
  fecha: string;
  /** Minutos que ese día tenía programados según el horario de la persona. */
  minutosProgramados: number;
  /**
   * Conteo de check-ins de la sesión (solo informativo: no afecta a las horas ni al sueldo).
   * null en las respuestas que no los piden, como Mi día.
   */
  checkins: ConteoCheckins | null;
}

export interface ResumenAsistencia {
  sesionesFinalizadas: number;
  /** Jornadas sin terminar: se muestran aparte y NO suman al tiempo trabajado. */
  sesionesAbiertas: number;
  /** Tiempo TOTAL del período: regulares + reposiciones. */
  totalSegundos: number;
  totalMinutos: number;
  /** Horas programadas del período. null si la consulta no es de una persona concreta. */
  minutosProgramados: number | null;
  /** false = esa persona todavía no tiene jornada esperada configurada. */
  horarioConfigurado: boolean;
  desde: string;
  hasta: string;

  // ─── Regulares vs repuestas (se muestran SEPARADAS) ───────────
  /** Tiempo de jornadas regulares: lo que se compara contra lo programado. */
  totalSegundosRegulares: number;
  totalSegundosReposicion: number;
  /** Cuánto de la reposición cubre déficit real (el resto es exceso que no acredita). */
  minutosReposicionAcreditables: number;
  /** Lo que cuenta para cumplir el mes. Nunca supera `minutosProgramados`. */
  minutosAcreditables: number;
  /** Lo que falta para completar el mes. */
  minutosPendientes: number;
  /** Reposición por encima del déficit: queda en el historial, no paga. */
  minutosExcedidos: number;
}

export interface Asistencia {
  sesiones: SesionJornada[];
  resumen: ResumenAsistencia;
}

export interface DiaHorario {
  /** 0 = domingo … 6 = sábado (misma convención que Date.getDay). */
  diaSemana: number;
  laborable: boolean;
  horaInicio: string | null;
  horaFin: string | null;
  minutosEsperados: number;
}

export interface HorarioEsperado {
  id: string | null;
  nombre: string;
  esPredeterminado: boolean;
  /** Siempre los 7 días, aunque falten filas. */
  dias: DiaHorario[];
}

export interface EstadoMiJornada {
  activa: SesionJornada | null;
  sesionesHoy: SesionJornada[];
  totalHoySegundos: number;
  minutosProgramadosHoy: number;
  fecha: string;
}

export interface PersonaTrabajando {
  userId: string;
  personaNombre: string;
  startedAt: string;
}

// ─── Check-ins de actividad (alerta global) ─────────────────────────
// Un check-in es SOLO un registro de actividad para consulta: no descuenta sueldo, no reduce
// horas, no cierra la jornada ni marca ausencia. Las horas trabajadas salen de
// startedAt/endedAt, nunca de cuántos check-ins se respondieron.

export interface EstadoCheckinActividad {
  /** true = hay una sesión abierta (regular o reposición) y por tanto puede haber alertas. */
  activa: boolean;
  /** El check-in que toca mostrar ahora, o null. */
  checkin: Checkin | null;
}

export interface RespuestaCheckin {
  /** true = esta petición escribió la respuesta; false = otra pestaña ya la había dado. */
  aplicado: boolean;
  /** El estado real guardado, con su hora de respuesta original. */
  checkin: Checkin;
}

export interface CheckinsDeJornada {
  /** La sesión con sus conteos, para el chip «Check-ins: 7 de 8». */
  sesion: SesionJornada;
  /** El detalle línea a línea: hora, estado y hora de respuesta. */
  checkins: Checkin[];
}

// ─── Reposición de horas (horas pendientes del mes) ─────────────────

export interface PendientesMes {
  /** Mes del negocio al que se refiere el cálculo (AAAA-MM). */
  mes: string;
  minutosProgramados: number;
  /** false = no hay jornada esperada configurada, así que no hay nada que reponer. */
  horarioConfigurado: boolean;
  minutosRegulares: number;
  minutosReposicion: number;
  minutosAcreditables: number;
  /** Lo que falta para completar el mes. 0 = nada que reponer. */
  minutosPendientes: number;
  /** Reposición que excede el déficit: queda en el historial, no acredita. */
  minutosExcedidos: number;
  /** true solo si hay déficit Y no hay ya una sesión abierta. */
  puedeReponer: boolean;
}

// ─── Recursos Humanos → Control de Sueldo ───────────────────────────
// Control INTERNO del sueldo estimado a pagar. NO es nómina: no hay impuestos, deducciones,
// overtime automático ni pagos. Todo el dinero viaja en CENTAVOS ENTEROS.

/** Por qué un estimado puede no existir. Nunca se asume sueldo completo ni cero a ciegas. */
export type EstadoCalculoSueldo = "OK" | "SIN_SUELDO" | "SIN_JORNADA_ESPERADA";

/** Una persona en el período consultado, con sus horas y su estimado. */
export interface FilaSueldo {
  userId: string;
  empleadoId: string | null;
  nombre: string;
  cargo: string | null;
  estadoLaboral: EstadoLaboral;
  departamentos: { id: string; nombre: string }[];
  /** Sueldo que aplica AL PERÍODO consultado, no necesariamente el vigente hoy. */
  montoCentavos: number | null;
  vigenteDesde: string | null;
  minutosProgramados: number;
  horarioConfigurado: boolean;
  sesionesFinalizadas: number;
  sesionesAbiertas: number;
  /** TOTAL registrado: regulares + reposiciones. */
  segundosRegistrados: number;
  minutosRegistrados: number;
  /** Programadas − registradas. Puede ser negativa. Es información, no una sanción. */
  diferenciaMinutos: number;

  // ─── Horas que cuentan (el estimado se calcula sobre `minutosAcreditables`) ───
  minutosRegulares: number;
  /** Reposición registrada, incluido el exceso que no acredita. */
  minutosReposicion: number;
  sesionesReposicion: number;
  /** Regulares (topadas a lo programado) + reposición acreditable. */
  minutosAcreditables: number;
  /** Lo que falta para completar el mes. */
  minutosPendientes: number;
  /** Reposición por encima del déficit: se conserva en el historial, no paga. */
  minutosExcedidos: number;

  /** null si no se puede calcular (ver `estado`). */
  estimadoCentavos: number | null;
  estado: EstadoCalculoSueldo;
}

export interface ResumenPeriodoSueldo {
  empleados: number;
  totalBaseCentavos: number;
  totalEstimadoCentavos: number;
}

export interface ControlSueldo {
  mes: string;
  desde: string;
  hasta: string;
  filas: FilaSueldo[];
  resumen: ResumenPeriodoSueldo;
}

/** Una vigencia salarial. El historial nunca se borra: los meses pasados no se recalculan. */
export interface Salario {
  id: string;
  userId: string;
  empleadoId: string;
  montoCentavos: number;
  vigenteDesde: string;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DetalleControlSueldo {
  periodo: ControlSueldo;
  fila: FilaSueldo;
  historial: Salario[];
}

export interface ResultadoGuardarSalario {
  userId: string;
  /** true = ya existía un monto para esa misma fecha y se corrigió esa vigencia. */
  reemplazo: boolean;
  historial: Salario[];
}
