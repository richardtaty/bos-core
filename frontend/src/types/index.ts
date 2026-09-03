// Jerarquía: SUPER_ADMIN > ADMIN > SUPERVISOR > TEAM_LEADER > USUARIO.
// SUPERVISOR y TEAM_LEADER mandan sobre las tareas de su departamento, no sobre
// facturación ni configuración — ver JERARQUIA en backend/src/middleware/auth.ts.
export type Rol = "SUPER_ADMIN" | "ADMIN" | "SUPERVISOR" | "TEAM_LEADER" | "USUARIO";

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
  personaId: string;
  personaNombre: string;
  responsableId: string;
  responsableNombre: string;
}

export interface Cumpleanero {
  personaId: string;
  personaNombre: string;
  fechaNacimiento: string;
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

export type EstadoTarea =
  | "solicitud" | "backlog" | "pendiente" | "por_hacer"
  | "en_proceso" | "bloqueada" | "en_revision" | "requiere_ajustes"
  | "completada" | "aprobado" | "publicado" | "cancelado";

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

export interface DashboardCEO {
  departamentos: {
    id: string;
    nombre: string;
    total: number;
    completadas: number;
    atrasadas: number;
    produccionHoy: number;
    estado: "saludable" | "advertencia" | "critico";
  }[];
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
