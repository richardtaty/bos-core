import { z } from "zod";
import { ESTADOS_USA } from "./estados-usa";

// El estado debe salir de la lista cerrada, no ser texto libre. Antes era
// `z.string().min(1)` y por ahí entraron "Sin estado", "USA - ESTE" y "Floria".
// El mensaje no lista los 52 valores porque sería ilegible; ver estados-usa.ts.
const estadoSchema = z.enum(ESTADOS_USA, {
  errorMap: () => ({
    message: 'Estado inválido. Debe ser uno de los 50 estados de EE.UU., "Washington D.C." o "Fuera de USA".',
  }),
});

const fechaNacimientoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)");

export const crearPersonaSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  telefono: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  ciudad: z.string().min(1, "La ciudad es obligatoria"),
  estado: estadoSchema,
  fuente: z.string().min(1, "La fuente es obligatoria"),
  referidoPor: z.string().optional(),
  responsableId: z.string().min(1),
  fechaNacimiento: fechaNacimientoSchema.optional(),
  tags: z.array(z.string()).min(1, "Debe asignar al menos una etiqueta"),
  negocios: z.array(z.string()).optional().default([]),
}).refine(
  (data) => data.fuente !== "Referido" || !!data.referidoPor,
  { message: "Debe indicar quién refirió al contacto", path: ["referidoPor"] }
);

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
export const actualizarPersonaSchema = z
  .object({
    telefono: z.string().optional(),
    email: z.string().email("Correo inválido").optional().or(z.literal("")),
    ciudad: z.string().min(1, "La ciudad no puede quedar vacía").optional(),
    estado: estadoSchema.optional(),
    fechaNacimiento: fechaNacimientoSchema.optional().or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar",
  });

export const actualizarNegociosSchema = z.object({
  negocios: z.array(z.string()),
});

export const crearInteraccionSchema = z.object({
  tipo: z.enum(["Llamada", "WhatsApp", "Email", "Reunion", "Nota"]),
  nota: z.string().min(1, "La nota es obligatoria"),
  proximoSeguimiento: z.string().datetime({ message: "Fecha de próximo seguimiento inválida" }),
  notaSeguimiento: z.string().optional(),
});

export const moverEtapaSchema = z.object({
  etapaId: z.string().min(1),
  motivoPerdida: z.string().optional(),
});

export const crearUsuarioSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  rol: z.enum(["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "TEAM_LEADER", "USUARIO"]),
  departamentoId: z.string().optional(),
  cargo: z.string().optional(),
  supervisorId: z.string().optional(),
});

export const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
});

export const actualizarComentariosSchema = z.object({
  comentarios: z.string(),
});

export const registrarPagoSchema = z.object({
  monto: z.number().positive("El monto debe ser mayor a cero"),
  nota: z.string().optional(),
  proximaFechaCobro: z.string().datetime().optional(),
  proximoPago: z.number().positive().optional(),
  metodoPago: z.string().optional(),
  fecha: z.string().datetime().optional(), // para meter ventas atrasadas con su fecha real
});

// Actualizar el plan de pagos de un deal (próximo pago / fecha / método) sin registrar un pago.
export const actualizarPlanPagoSchema = z.object({
  proximoPago: z.number().positive().nullable().optional(),
  fechaProximoPago: z.string().datetime().nullable().optional(),
  metodoPago: z.string().nullable().optional(),
});

// Cerrar una venta en un solo paso: fija el total acordado, mueve el registro a la etapa
// ganada y registra el cobro de hoy. Solo exige la fecha del próximo cobro si queda saldo.
export const cerrarVentaSchema = z.object({
  montoTotal: z.number().positive("El monto total debe ser mayor a cero"),
  montoCobrado: z.number().positive("El monto cobrado hoy debe ser mayor a cero"),
  proximaFechaCobro: z.string().datetime().optional(),
  metodoPago: z.string().optional(),
  nota: z.string().optional(),
});

// ─── Podcast Performance ─────────────────────────────────
// Reporte diario: solo lo que BOS no puede calcular solo (prospección manual + compromiso
// estructurado + bloqueos). El frontend manda el estado completo del formulario en cada guardado.
export const guardarReportePodcastSchema = z.object({
  prospectosEncontrados: z.number().int().nonnegative().optional(),
  prospectosContactados: z.number().int().nonnegative().optional(),
  respuestas: z.number().int().nonnegative().optional(),
  interesados: z.number().int().nonnegative().optional(),
  compromisoContactos: z.number().int().nonnegative().optional(),
  compromisoFollowups: z.number().int().nonnegative().optional(),
  compromisoPodcasts: z.number().int().nonnegative().optional(),
  compromisoNota: z.string().optional(),
  bloqueos: z.string().optional(),
  enviar: z.boolean().optional(),
});

export const guardarMetasPodcastSchema = z.object({
  metas: z
    .array(
      z.object({
        clave: z.string().min(1, "La clave es obligatoria"),
        nombre: z.string().min(1, "El nombre es obligatorio"),
        valor: z.number().nonnegative("El valor debe ser mayor o igual a cero"),
      })
    )
    .min(1, "Debe enviar al menos una meta"),
});

// ─── Calendario de podcasts (citas) ──────────────────────
export const crearCitaPodcastSchema = z.object({
  personaId: z.string().min(1, "El invitado es obligatorio"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida (HH:MM)"),
  estado: z.enum(["agendado", "realizado", "cancelado"]).optional(),
  nota: z.string().optional(),
});

export const actualizarCitaPodcastSchema = z
  .object({
    personaId: z.string().min(1, "El invitado es obligatorio").optional(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").optional(),
    hora: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida (HH:MM)").optional(),
    estado: z.enum(["agendado", "realizado", "cancelado"]).optional(),
    nota: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar",
  });

// ─── BMF Digital Funding — aplicación pública (inglés) ───────
export const crearSolicitudFundingSchema = z.object({
  // Paso 1 — Negocio
  empresaLegal: z.string().min(1, "Legal business name is required"),
  dba: z.string().optional(),
  empresaDireccion: z.string().optional(),
  empresaCiudad: z.string().min(1, "City is required"),
  empresaEstado: estadoSchema,
  empresaZip: z.string().optional(),
  industria: z.string().min(1, "Industry is required"),
  estructuraNegocio: z.string().optional(),
  fechaInicioNegocio: z.string().optional(),
  sitioWeb: z.string().optional(),
  // Paso 2 — Dueño
  propietarioNombre: z.string().min(1, "First name is required"),
  propietarioApellido: z.string().min(1, "Last name is required"),
  propietarioEmail: z.string().email("Valid email is required"),
  propietarioTelefono: z.string().optional(),
  porcentajePropiedad: z.number().optional(),
  // Paso 3 — Financiamiento
  montoSolicitado: z.number().positive("Requested amount must be greater than 0"),
  propositoFondos: z.string().min(1, "Purpose of funds is required"),
  ingresoMensualEstimado: z.number().optional(),
  depositosMensualesPromedio: z.number().optional(),
  tieneFinanciamientoActual: z.boolean().optional(),
  saldoFinanciamientoActual: z.number().optional(),
  // Paso 4 — Información del negocio
  ein: z.string().optional(),
  bancoNombre: z.string().optional(),
  depositosMensualesAprox: z.number().optional(),
  // Consentimiento
  consentimiento: z.boolean().refine((v) => v === true, "You must confirm the information is accurate"),
  // Atribución (utm / fuente / campaña)
  fuente: z.string().optional(),
  campana: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  landingPage: z.string().optional(),
  // Honeypot anti-spam (los bots lo rellenan; los humanos no lo ven)
  website: z.string().optional(),
});

export type CrearPersonaInput = z.infer<typeof crearPersonaSchema>;
export type CrearSolicitudFundingInput = z.infer<typeof crearSolicitudFundingSchema>;
export type ActualizarPersonaInput = z.infer<typeof actualizarPersonaSchema>;
export type CrearInteraccionInput = z.infer<typeof crearInteraccionSchema>;
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type CambiarPasswordInput = z.infer<typeof cambiarPasswordSchema>;
export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;

// ─── Activos digitales de un cliente ─────────────────────
// Un cliente puede tener N activos (landings, funnels, etc.). El frontend manda el objeto
// completo tanto al crear como al editar (el modal siempre tiene todos los campos cargados),
// así que hay un solo esquema. Los textos opcionales vacíos se convierten en undefined para
// guardar NULL en la base en vez de cadenas de espacio.

// "URL válida": admite con o sin protocolo (se normaliza al abrirla en el frontend), pero
// exige un dominio razonable. Rechaza espacios y cadenas sueltas.
function esUrlValida(url: string): boolean {
  const candidata = url.includes("://") ? url : `https://${url}`;
  try {
    const parsed = new URL(candidata);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

const textoTamVacio = (max: number, mensaje: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? undefined : v),
    z.string().trim().max(max, mensaje).optional()
  );

export const activoDigitalSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(150, "El nombre no puede superar 150 caracteres"),
    url: textoTamVacio(500, "La URL no puede superar 500 caracteres"),
    tipo: z.enum(["Landing", "Funnel", "Thank You Page", "Formulario", "Dominio", "Automatización", "Otro"]),
    // Texto libre (máx 60): si el usuario eligió "Otro" en el dropdown guarda lo que escribió.
    plataforma: textoTamVacio(60, "La plataforma no puede superar 60 caracteres"),
    objetivo: textoTamVacio(300, "El objetivo no puede superar 300 caracteres"),
    activo: z.boolean().optional(),
    notas: textoTamVacio(2000, "Las notas no pueden superar 2000 caracteres"),
  })
  .superRefine((data, ctx) => {
    const url = data.url?.trim() ?? "";
    // La URL es obligatoria para los tipos que SON una página/dominio; "Otro" admite no tenerla.
    if (data.tipo !== "Otro" && !url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Agrega la URL del activo (ej. https://cliente.com/pagina)", path: ["url"] });
    } else if (url && !esUrlValida(url)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL no válida. Escribe algo como https://cliente.com/pagina", path: ["url"] });
    }
  });

export type ActivoDigitalInput = z.infer<typeof activoDigitalSchema>;
