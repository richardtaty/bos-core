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

// Tipos de registro del Calendario (SALA DE OFERTAS → Calendario). Valor estructurado,
// nunca se deduce por el texto del título. 'seguimiento' es también el tipo de los
// seguimientos que el CRM agenda desde interacciones/cobros (default de la tabla).
export const TIPOS_REGISTRO_CALENDARIO = ["alerta", "recordatorio", "seguimiento"] as const;
export const crearRegistroCalendarioSchema = z.object({
  personaId: z.string().min(1, "Selecciona un cliente"),
  tipo: z.enum(TIPOS_REGISTRO_CALENDARIO),
  // Fecha en la que debe realizarse la alerta/recordatorio/seguimiento. ISO con hora
  // (la hora es opcional desde el formulario; sin hora se guarda al mediodía).
  fecha: z.string().datetime({ message: "Fecha inválida" }),
  titulo: z.string().min(1, "El título o motivo es obligatorio").max(300, "El título es demasiado largo"),
  nota: z.string().optional(),
});

// Reagendar (cambiar de fecha/hora) un registro existente del Calendario / seguimiento.
// La fecha es ISO con hora (la hora es opcional en el formulario; sin hora se conserva el
// comportamiento del Calendario de guardar al mediodía). Nunca se cambia el id: es la MISMA
// fila real de `tareas_seguimiento`, no una cita nueva.
export const reagendarTareaSeguimientoSchema = z.object({
  fecha: z.string().datetime({ message: "Fecha inválida" }),
});

export const moverEtapaSchema = z.object({
  etapaId: z.string().min(1),
  motivoPerdida: z.string().optional(),
});

export const crearUsuarioSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  rol: z.enum(["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USUARIO"]),
  departamentoId: z.string().optional(),
  cargo: z.string().optional(),
  supervisorId: z.string().optional(),
});

// ─── Recursos Humanos → Personal ────────────────────────────────
// Solo datos LABORALES. A propósito no acepta rol, activo, password ni departamentos:
// el perfil laboral y el acceso al CRM se administran por separado (usuarios.routes.ts).
export const actualizarPerfilLaboralSchema = z
  .object({
    cargo: z.string().max(120, "El cargo es demasiado largo").nullable().optional(),
    estadoLaboral: z.enum(["ACTIVO", "INACTIVO"]).optional(),
    notas: z.string().max(2000, "Las notas son demasiado largas").nullable().optional(),
  })
  .refine(
    (d) => d.cargo !== undefined || d.estadoLaboral !== undefined || d.notas !== undefined,
    { message: "No hay cambios de información laboral que guardar" },
  );

// ─── RRHH → Asistencia: jornada esperada ────────────────────────
// La semana se envía (y se guarda) como una fila por día; nunca como texto libre.
const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const diaHorarioSchema = z.object({
  diaSemana: z.number().int().min(0, "Día inválido").max(6, "Día inválido"),
  laborable: z.boolean(),
  horaInicio: z.string().regex(HORA_HHMM, "La hora debe tener formato HH:MM").nullable().optional(),
  horaFin: z.string().regex(HORA_HHMM, "La hora debe tener formato HH:MM").nullable().optional(),
  // Máximo 24 h: un día no puede tener más minutos programados que los que tiene.
  minutosEsperados: z.number().int().min(0).max(24 * 60, "La jornada no puede superar 24 horas").optional(),
});

export const guardarHorarioSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio").max(80).optional(),
  dias: z.array(diaHorarioSchema).min(1, "Debe incluir al menos un día").max(7, "La semana tiene 7 días"),
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
  // "Monto total del negocio": solo se envía al registrar el PRIMER pago de un trato que
  // aún no tiene total definido (registros.valor == null). El backend lo fija una sola vez.
  montoTotal: z.number().positive("El monto total debe ser mayor a cero").optional(),
  nota: z.string().optional(),
  proximaFechaCobro: z.string().datetime().optional(),
  proximoPago: z.number().positive().optional(),
  metodoPago: z.string().optional(),
  fecha: z.string().datetime().optional(), // para meter ventas atrasadas con su fecha real
  // Clave de idempotencia generada por el frontend al abrir el modal de pago. Un doble clic
  // o reintento con la misma clave no crea un segundo pago (índice único en pagos).
  idempotencyKey: z.string().min(1, "Clave de idempotencia inválida").optional(),
});

// Actualizar el plan de pagos de un deal (próximo pago / fecha / método) sin registrar un pago.
export const actualizarPlanPagoSchema = z.object({
  proximoPago: z.number().positive().nullable().optional(),
  fechaProximoPago: z.string().datetime().nullable().optional(),
  metodoPago: z.string().nullable().optional(),
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

// ─── 📅 Calendario de Marketing ───────────────────────────
// Un elemento del calendario es una RELACIÓN a un proyecto existente + su fecha.
// El proyecto no se crea aquí (eso vive en Marketing → Proyectos); solo se valida que el
// ID venga y que la fecha tenga formato YYYY-MM-DD.
export const crearPublicacionMarketingSchema = z.object({
  proyectoId: z.string().min(1, "El proyecto es obligatorio"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  nota: z.string().max(10000, "La nota es demasiado larga").optional().nullable(),
});

// Edición de un elemento del Calendario de Marketing: todos los campos opcionales.
// nota vacía o null = se BORRA la nota (regla 13). Sin nota en el body = se conserva.
export const actualizarPublicacionMarketingSchema = z.object({
  proyectoId: z.string().min(1, "El proyecto es obligatorio").optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").optional(),
  nota: z.string().max(10000, "La nota es demasiado larga").optional().nullable(),
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
export type CrearRegistroCalendarioInput = z.infer<typeof crearRegistroCalendarioSchema>;
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

// ─── 🎂 Próximos cumpleaños ──────────────────────────────
// día/mes/año de nacimiento. `mes`/`dia`/`nombre` son opcionales en el schema porque al
// vincular un contacto con fecha_nacimiento el backend los deduce de la ficha; el
// servicio valida que al final queden día y mes presentes y coherentes (p. ej. no
// existe el 31 de abril). `anio` (nacimiento) es opcional y solo sirve para la edad.

const mesCumpleSchema = z.number().int("El mes debe ser un número entero").min(1, "El mes debe estar entre 1 y 12").max(12, "El mes debe estar entre 1 y 12");
const diaCumpleSchema = z.number().int("El día debe ser un número entero").min(1, "El día debe estar entre 1 y 31").max(31, "El día debe estar entre 1 y 31");
const anioCumpleSchema = z.number().int("El año debe ser un número entero").min(1800, "El año de nacimiento no puede ser anterior a 1800").max(new Date().getFullYear(), "El año de nacimiento no puede ser futuro");

export const crearCumpleanoSchema = z
  .object({
    personaId: z.string().min(1, "Contacto inválido").optional(),
    nombre: z.string().trim().min(2, "El nombre es obligatorio").max(200, "El nombre no puede superar 200 caracteres").optional(),
    mes: mesCumpleSchema.optional(),
    dia: diaCumpleSchema.optional(),
    anio: anioCumpleSchema.optional(),
    notas: z.string().max(2000, "Las notas no pueden superar 2000 caracteres").optional(),
  })
  .refine((d) => !!d.personaId || (!!d.nombre && !!d.mes && !!d.dia), {
    message: "Indica el día, el mes y el nombre, o vincula un contacto existente.",
    path: ["nombre"],
  });

export const actualizarCumpleanoSchema = z
  .object({
    // null = desvincular el contacto (el registro sigue existiendo como cumpleaños suelto)
    personaId: z.string().min(1, "Contacto inválido").nullable().optional(),
    nombre: z.string().trim().min(2, "El nombre es obligatorio").max(200, "El nombre no puede superar 200 caracteres").optional(),
    mes: mesCumpleSchema.optional(),
    dia: diaCumpleSchema.optional(),
    anio: anioCumpleSchema.nullable().optional(),
    notas: z.string().max(2000, "Las notas no pueden superar 2000 caracteres").nullable().optional(),
    activo: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "No se envió ningún campo para actualizar",
  });

export type CrearCumpleanoInput = z.infer<typeof crearCumpleanoSchema>;
export type ActualizarCumpleanoInput = z.infer<typeof actualizarCumpleanoSchema>;

// ─── RECURSOS HUMANOS → Control de Sueldo ───────────────────────
// El monto viaja SIEMPRE en centavos enteros: nunca un decimal en punto flotante, para que
// un sueldo no se desvíe por redondeo binario. La conversión a dólares es solo de pantalla.
export const guardarSalarioSchema = z.object({
  montoCentavos: z
    .number()
    .int("El monto debe venir en centavos enteros")
    .min(0, "El sueldo no puede ser negativo")
    // Tope de cordura ($10,000,000.00): un monto mayor casi siempre es un error de tipeo.
    .max(1_000_000_000, "El sueldo indicado es demasiado alto. Revisa el monto."),
  // Primer día desde el que aplica. El sueldo de un mes es el último monto vigente a fin de mes.
  vigenteDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato AAAA-MM-DD"),
  notas: z.string().max(300, "Las notas no pueden superar 300 caracteres").nullable().optional(),
});

// ─── RECURSOS HUMANOS → Asistencia · Check-ins de actividad ─────
// Solo viaja el ID del check-in. Nunca el user_id: la identidad sale del token, así nadie
// puede responder el check-in de otra persona cambiando el cuerpo de la petición.
export const responderCheckinSchema = z.object({
  checkinId: z.string().trim().min(1, "Falta el check-in a responder"),
});
