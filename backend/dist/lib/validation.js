"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearSolicitudFundingSchema = exports.actualizarCitaPodcastSchema = exports.crearCitaPodcastSchema = exports.guardarMetasPodcastSchema = exports.guardarReportePodcastSchema = exports.cerrarVentaSchema = exports.actualizarPlanPagoSchema = exports.registrarPagoSchema = exports.actualizarComentariosSchema = exports.cambiarPasswordSchema = exports.crearUsuarioSchema = exports.moverEtapaSchema = exports.crearInteraccionSchema = exports.actualizarNegociosSchema = exports.actualizarPersonaSchema = exports.crearPersonaSchema = void 0;
const zod_1 = require("zod");
const estados_usa_1 = require("./estados-usa");
// El estado debe salir de la lista cerrada, no ser texto libre. Antes era
// `z.string().min(1)` y por ahí entraron "Sin estado", "USA - ESTE" y "Floria".
// El mensaje no lista los 52 valores porque sería ilegible; ver estados-usa.ts.
const estadoSchema = zod_1.z.enum(estados_usa_1.ESTADOS_USA, {
    errorMap: () => ({
        message: 'Estado inválido. Debe ser uno de los 50 estados de EE.UU., "Washington D.C." o "Fuera de USA".',
    }),
});
const fechaNacimientoSchema = zod_1.z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)");
exports.crearPersonaSchema = zod_1.z.object({
    nombre: zod_1.z.string().min(2, "El nombre es obligatorio"),
    telefono: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal("")),
    ciudad: zod_1.z.string().min(1, "La ciudad es obligatoria"),
    estado: estadoSchema,
    fuente: zod_1.z.string().min(1, "La fuente es obligatoria"),
    referidoPor: zod_1.z.string().optional(),
    responsableId: zod_1.z.string().min(1),
    fechaNacimiento: fechaNacimientoSchema.optional(),
    tags: zod_1.z.array(zod_1.z.string()).min(1, "Debe asignar al menos una etiqueta"),
    negocios: zod_1.z.array(zod_1.z.string()).optional().default([]),
}).refine((data) => data.fuente !== "Referido" || !!data.referidoPor, { message: "Debe indicar quién refirió al contacto", path: ["referidoPor"] });
/**
 * Edición de los datos de contacto de una ficha ya creada.
 *
 * Todos los campos son opcionales: se manda solo lo que cambió. Se permite mandar "" en
 * teléfono, correo y fecha de nacimiento para *vaciar* el campo; ciudad y estado no se
 * pueden vaciar porque son obligatorios al crear y dejarlos en blanco sería un retroceso.
 *
 * A propósito NO incluye etiquetas, fuente ni referidoPor: esos tienen reglas propias de
 * creación (mínimo una etiqueta, "Referido" exige referidoPor) que este PATCH no valida.
 */
exports.actualizarPersonaSchema = zod_1.z
    .object({
    telefono: zod_1.z.string().optional(),
    email: zod_1.z.string().email("Correo inválido").optional().or(zod_1.z.literal("")),
    ciudad: zod_1.z.string().min(1, "La ciudad no puede quedar vacía").optional(),
    estado: estadoSchema.optional(),
    fechaNacimiento: fechaNacimientoSchema.optional().or(zod_1.z.literal("")),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar",
});
exports.actualizarNegociosSchema = zod_1.z.object({
    negocios: zod_1.z.array(zod_1.z.string()),
});
exports.crearInteraccionSchema = zod_1.z.object({
    tipo: zod_1.z.enum(["Llamada", "WhatsApp", "Email", "Reunion", "Nota"]),
    nota: zod_1.z.string().min(1, "La nota es obligatoria"),
    proximoSeguimiento: zod_1.z.string().datetime({ message: "Fecha de próximo seguimiento inválida" }),
    notaSeguimiento: zod_1.z.string().optional(),
});
exports.moverEtapaSchema = zod_1.z.object({
    etapaId: zod_1.z.string().min(1),
    motivoPerdida: zod_1.z.string().optional(),
});
exports.crearUsuarioSchema = zod_1.z.object({
    nombre: zod_1.z.string().min(2, "El nombre es obligatorio"),
    email: zod_1.z.string().email("Email inválido"),
    password: zod_1.z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    rol: zod_1.z.enum(["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "TEAM_LEADER", "USUARIO"]),
    departamentoId: zod_1.z.string().optional(),
    cargo: zod_1.z.string().optional(),
    supervisorId: zod_1.z.string().optional(),
});
exports.cambiarPasswordSchema = zod_1.z.object({
    passwordActual: zod_1.z.string().min(1),
    passwordNueva: zod_1.z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
});
exports.actualizarComentariosSchema = zod_1.z.object({
    comentarios: zod_1.z.string(),
});
exports.registrarPagoSchema = zod_1.z.object({
    monto: zod_1.z.number().positive("El monto debe ser mayor a cero"),
    nota: zod_1.z.string().optional(),
    proximaFechaCobro: zod_1.z.string().datetime().optional(),
    proximoPago: zod_1.z.number().positive().optional(),
    metodoPago: zod_1.z.string().optional(),
    fecha: zod_1.z.string().datetime().optional(), // para meter ventas atrasadas con su fecha real
});
// Actualizar el plan de pagos de un deal (próximo pago / fecha / método) sin registrar un pago.
exports.actualizarPlanPagoSchema = zod_1.z.object({
    proximoPago: zod_1.z.number().positive().nullable().optional(),
    fechaProximoPago: zod_1.z.string().datetime().nullable().optional(),
    metodoPago: zod_1.z.string().nullable().optional(),
});
// Cerrar una venta en un solo paso: fija el total acordado, mueve el registro a la etapa
// ganada y registra el cobro de hoy. Solo exige la fecha del próximo cobro si queda saldo.
exports.cerrarVentaSchema = zod_1.z.object({
    montoTotal: zod_1.z.number().positive("El monto total debe ser mayor a cero"),
    montoCobrado: zod_1.z.number().positive("El monto cobrado hoy debe ser mayor a cero"),
    proximaFechaCobro: zod_1.z.string().datetime().optional(),
    metodoPago: zod_1.z.string().optional(),
    nota: zod_1.z.string().optional(),
});
// ─── Podcast Performance ─────────────────────────────────
// Reporte diario: solo lo que BOS no puede calcular solo (prospección manual + compromiso
// estructurado + bloqueos). El frontend manda el estado completo del formulario en cada guardado.
exports.guardarReportePodcastSchema = zod_1.z.object({
    prospectosEncontrados: zod_1.z.number().int().nonnegative().optional(),
    prospectosContactados: zod_1.z.number().int().nonnegative().optional(),
    respuestas: zod_1.z.number().int().nonnegative().optional(),
    interesados: zod_1.z.number().int().nonnegative().optional(),
    compromisoContactos: zod_1.z.number().int().nonnegative().optional(),
    compromisoFollowups: zod_1.z.number().int().nonnegative().optional(),
    compromisoPodcasts: zod_1.z.number().int().nonnegative().optional(),
    compromisoNota: zod_1.z.string().optional(),
    bloqueos: zod_1.z.string().optional(),
    enviar: zod_1.z.boolean().optional(),
});
exports.guardarMetasPodcastSchema = zod_1.z.object({
    metas: zod_1.z
        .array(zod_1.z.object({
        clave: zod_1.z.string().min(1, "La clave es obligatoria"),
        nombre: zod_1.z.string().min(1, "El nombre es obligatorio"),
        valor: zod_1.z.number().nonnegative("El valor debe ser mayor o igual a cero"),
    }))
        .min(1, "Debe enviar al menos una meta"),
});
// ─── Calendario de podcasts (citas) ──────────────────────
exports.crearCitaPodcastSchema = zod_1.z.object({
    personaId: zod_1.z.string().min(1, "El invitado es obligatorio"),
    fecha: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
    hora: zod_1.z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida (HH:MM)"),
    estado: zod_1.z.enum(["agendado", "realizado", "cancelado"]).optional(),
    nota: zod_1.z.string().optional(),
});
exports.actualizarCitaPodcastSchema = zod_1.z
    .object({
    personaId: zod_1.z.string().min(1, "El invitado es obligatorio").optional(),
    fecha: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").optional(),
    hora: zod_1.z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida (HH:MM)").optional(),
    estado: zod_1.z.enum(["agendado", "realizado", "cancelado"]).optional(),
    nota: zod_1.z.string().optional(),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar",
});
// ─── BMF Digital Funding — aplicación pública (inglés) ───────
exports.crearSolicitudFundingSchema = zod_1.z.object({
    // Paso 1 — Negocio
    empresaLegal: zod_1.z.string().min(1, "Legal business name is required"),
    dba: zod_1.z.string().optional(),
    empresaDireccion: zod_1.z.string().optional(),
    empresaCiudad: zod_1.z.string().min(1, "City is required"),
    empresaEstado: estadoSchema,
    empresaZip: zod_1.z.string().optional(),
    industria: zod_1.z.string().min(1, "Industry is required"),
    estructuraNegocio: zod_1.z.string().optional(),
    fechaInicioNegocio: zod_1.z.string().optional(),
    sitioWeb: zod_1.z.string().optional(),
    // Paso 2 — Dueño
    propietarioNombre: zod_1.z.string().min(1, "First name is required"),
    propietarioApellido: zod_1.z.string().min(1, "Last name is required"),
    propietarioEmail: zod_1.z.string().email("Valid email is required"),
    propietarioTelefono: zod_1.z.string().optional(),
    porcentajePropiedad: zod_1.z.number().optional(),
    // Paso 3 — Financiamiento
    montoSolicitado: zod_1.z.number().positive("Requested amount must be greater than 0"),
    propositoFondos: zod_1.z.string().min(1, "Purpose of funds is required"),
    ingresoMensualEstimado: zod_1.z.number().optional(),
    depositosMensualesPromedio: zod_1.z.number().optional(),
    tieneFinanciamientoActual: zod_1.z.boolean().optional(),
    saldoFinanciamientoActual: zod_1.z.number().optional(),
    // Paso 4 — Información del negocio
    ein: zod_1.z.string().optional(),
    bancoNombre: zod_1.z.string().optional(),
    depositosMensualesAprox: zod_1.z.number().optional(),
    // Consentimiento
    consentimiento: zod_1.z.boolean().refine((v) => v === true, "You must confirm the information is accurate"),
    // Atribución (utm / fuente / campaña)
    fuente: zod_1.z.string().optional(),
    campana: zod_1.z.string().optional(),
    utmSource: zod_1.z.string().optional(),
    utmMedium: zod_1.z.string().optional(),
    utmCampaign: zod_1.z.string().optional(),
    landingPage: zod_1.z.string().optional(),
    // Honeypot anti-spam (los bots lo rellenan; los humanos no lo ven)
    website: zod_1.z.string().optional(),
});
