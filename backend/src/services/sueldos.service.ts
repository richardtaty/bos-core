import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { salarios } from "../db/schema";
import { diasDelMes, esFechaValida, esMesValido, mesActualET } from "../lib/fechas-negocio";
import { asegurarEmpleado, totalesDelMes } from "./asistencia.service";
import { listarPersonal, type EstadoLaboral } from "./rrhh.service";
import { registrarAuditoria } from "./auditoria.service";

// ─── Recursos Humanos → Control de Sueldo ───────────────────────
//
// Responde una sola pregunta: dado un mes, ¿cuánto se estima pagarle a cada persona según lo
// que tenía programado y lo que realmente trabajó? Es un CONTROL INTERNO.
//
// Lo que este módulo NO hace, a propósito:
//   · nómina fiscal, impuestos, retenciones, deducciones legales ni beneficios
//   · pagos, transferencias, ACH, Stripe ni ningún sistema externo
//   · estado "pagado / pendiente" — solo se calcula y se consulta el estimado
//   · overtime automático, bonos ni comisiones
//   · descuentos por tardanza, ausencia, check-ins o feriados
//   · calendarios de feriados inventados
//
// Las horas NO se guardan aquí: se leen de Asistencia (vía `totalesDelMes`), que es la fuente
// de verdad. Control de Sueldo no mantiene un segundo contador.
//
// DINERO: todo se guarda y se calcula en CENTAVOS ENTEROS. Nunca coma flotante — un sueldo no
// puede bailar por redondeo binario. Los dólares son solo formato de pantalla.

export class SalarioInvalidoError extends Error {}

/** Tope de cordura ($10,000,000.00): un monto mayor casi siempre es un error de tipeo. */
const MAX_CENTAVOS = 1_000_000_000;

export interface SalarioDTO {
  id: string;
  userId: string;
  empleadoId: string;
  /** Monto mensual en centavos enteros (el dato real). */
  montoCentavos: number;
  /** Primer día (AAAA-MM-DD) desde el que aplica este monto. */
  vigenteDesde: string;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Por qué un estimado puede no existir. NUNCA se asume sueldo completo ni cero cuando falta
 * información: se dice qué falta.
 *   · SIN_SUELDO               → a esa persona no se le ha configurado sueldo mensual
 *   · SIN_JORNADA_ESPERADA     → su horario no tiene horas programadas ese mes (no se divide
 *                                por cero ni se inventa una jornada)
 */
export type EstadoCalculo = "OK" | "SIN_SUELDO" | "SIN_JORNADA_ESPERADA";

/** Una persona en el período consultado, con sus horas y su estimado. */
export interface FilaSueldoDTO {
  userId: string;
  /** Perfil laboral (empleados.id). null mientras la persona no tenga ninguno creado. */
  empleadoId: string | null;
  nombre: string;
  cargo: string | null;
  estadoLaboral: EstadoLaboral;
  departamentos: { id: string; nombre: string }[];
  /** Sueldo que aplica AL PERÍODO consultado (no necesariamente el de hoy). */
  montoCentavos: number | null;
  vigenteDesde: string | null;
  minutosProgramados: number;
  horarioConfigurado: boolean;
  sesionesFinalizadas: number;
  sesionesAbiertas: number;
  segundosRegistrados: number;
  minutosRegistrados: number;
  /** Programadas − registradas. Puede ser negativa. Es información, no una sanción. */
  diferenciaMinutos: number;
  /** null si no se puede calcular (ver `estado`). */
  estimadoCentavos: number | null;
  estado: EstadoCalculo;
}

export interface ResumenPeriodoDTO {
  /** Cuántas personas entran en el filtro actual. */
  empleados: number;
  /** Suma de los sueldos mensuales base aplicables al período. */
  totalBaseCentavos: number;
  /** Suma de los estimados calculados. Mismo cálculo que cada fila, no una cifra aparte. */
  totalEstimadoCentavos: number;
}

export interface ControlSueldoDTO {
  mes: string;
  desde: string;
  hasta: string;
  filas: FilaSueldoDTO[];
  resumen: ResumenPeriodoDTO;
}

export interface FiltrosSueldos {
  mes?: string;
  userId?: string;
  departamentoId?: string;
}

// ─── Dinero ─────────────────────────────────────────────────────

/**
 * Parte proporcional del monto, en centavos, sin coma flotante.
 *
 * Se calcula con enteros grandes y redondeo a la mitad hacia arriba: no hay ninguna
 * multiplicación en punto flotante en el camino. La proporción NUNCA pasa de 1: en esta
 * etapa no existe política de overtime, así que trabajar de más no paga de más.
 */
export function calcularProporcionalCentavos(centavos: number, parte: number, total: number): number {
  if (total <= 0 || parte <= 0) return 0;
  const acotado = Math.min(parte, total);
  // (2·a·p + t) / (2·t) con BigInt = redondeo exacto a la mitad hacia arriba.
  const numerador = BigInt(centavos) * BigInt(acotado) * 2n + BigInt(total);
  const denominador = BigInt(total) * 2n;
  return Number(numerador / denominador);
}

// ─── Lectura ────────────────────────────────────────────────────

function aSalarioDTO(fila: typeof salarios.$inferSelect): SalarioDTO {
  return {
    id: fila.id,
    userId: fila.userId,
    empleadoId: fila.empleadoId,
    montoCentavos: fila.montoCentavos,
    vigenteDesde: fila.vigenteDesde,
    notas: fila.notas,
    createdAt: fila.createdAt.toISOString(),
    updatedAt: fila.updatedAt.toISOString(),
  };
}

/** Historial salarial de una persona, del más reciente al más antiguo. Nunca se borra. */
export async function historialSalarial(userId: string): Promise<SalarioDTO[]> {
  const filas = await db
    .select()
    .from(salarios)
    .where(eq(salarios.userId, userId))
    .orderBy(desc(salarios.vigenteDesde));
  return filas.map(aSalarioDTO);
}

/**
 * El sueldo que aplicaba a un período: el último monto cuya vigencia empezó en o antes del
 * último día de ese mes. Consultar septiembre sigue devolviendo el monto de septiembre
 * aunque hoy la persona gane otra cosa — no se recalculan meses pasados con un sueldo nuevo.
 */
function vigenteEnPeriodo(historial: SalarioDTO[], hasta: string): SalarioDTO | null {
  return historial.find((s) => s.vigenteDesde <= hasta) ?? null;
}

/** Rango de días del negocio del período pedido. Un mes mal escrito no cae al mes actual. */
function resolverPeriodo(mes?: string): { mes: string; desde: string; hasta: string } {
  if (mes !== undefined && !esMesValido(mes)) {
    throw new SalarioInvalidoError("El mes debe tener el formato AAAA-MM (por ejemplo 2026-09).");
  }
  const elegido = mes ?? mesActualET();
  const dias = diasDelMes(elegido);
  return { mes: elegido, desde: dias[0], hasta: dias[dias.length - 1] };
}

export async function listarControlSueldo(filtros: FiltrosSueldos): Promise<ControlSueldoDTO> {
  const { mes, desde, hasta } = resolverPeriodo(filtros.mes);

  // La plantilla sale de RRHH → Personal: mismas personas, mismos departamentos, misma
  // relación por ID real. Control de Sueldo no mantiene una lista propia de empleados.
  const plantilla = await listarPersonal();

  const visibles = plantilla.filter((p) => {
    if (filtros.userId && p.userId !== filtros.userId) return false;
    if (filtros.departamentoId && !p.departamentos.some((d) => d.id === filtros.departamentoId)) return false;
    return true;
  });

  // Todas las vigencias de una sola pasada, agrupadas por persona.
  const todosLosSalarios = await db.select().from(salarios);
  const historialPorUsuario = new Map<string, SalarioDTO[]>();
  for (const fila of todosLosSalarios) {
    const lista = historialPorUsuario.get(fila.userId) ?? [];
    lista.push(aSalarioDTO(fila));
    historialPorUsuario.set(fila.userId, lista);
  }
  for (const lista of historialPorUsuario.values()) {
    lista.sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
  }

  const userIds = visibles.map((p) => p.userId);
  const totales = await totalesDelMes(userIds, mes);

  const filas: FilaSueldoDTO[] = visibles.map((p) => {
    const salario = vigenteEnPeriodo(historialPorUsuario.get(p.userId) ?? [], hasta);
    const t = totales.get(p.userId);

    const minutosProgramados = t?.minutosProgramados ?? 0;
    const segundosRegistrados = t?.segundosRegistrados ?? 0;
    const minutosRegistrados = Math.round(segundosRegistrados / 60);

    // Ni sueldo completo ni cero a ciegas: si falta el monto o la jornada esperada, el
    // estimado es null y `estado` dice exactamente qué falta.
    let estado: EstadoCalculo = "OK";
    let estimadoCentavos: number | null = null;
    if (!salario) {
      estado = "SIN_SUELDO";
    } else if (minutosProgramados <= 0) {
      estado = "SIN_JORNADA_ESPERADA";
    } else {
      estimadoCentavos = calcularProporcionalCentavos(
        salario.montoCentavos,
        segundosRegistrados,
        minutosProgramados * 60,
      );
    }

    return {
      userId: p.userId,
      empleadoId: p.empleadoId,
      nombre: p.nombre,
      cargo: p.cargo,
      estadoLaboral: p.estadoLaboral,
      departamentos: p.departamentos,
      montoCentavos: salario?.montoCentavos ?? null,
      vigenteDesde: salario?.vigenteDesde ?? null,
      minutosProgramados,
      horarioConfigurado: t?.horarioConfigurado ?? false,
      sesionesFinalizadas: t?.sesionesFinalizadas ?? 0,
      sesionesAbiertas: t?.sesionesAbiertas ?? 0,
      segundosRegistrados,
      minutosRegistrados,
      diferenciaMinutos: minutosProgramados - minutosRegistrados,
      estimadoCentavos,
      estado,
    };
  });

  // Orden estable y predecible: activos primero, luego alfabético — el mismo criterio que la
  // lista de Personal, para que las dos pantallas se lean igual.
  filas.sort((a, b) => {
    if (a.estadoLaboral !== b.estadoLaboral) return a.estadoLaboral === "ACTIVO" ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  const totalBaseCentavos = filas.reduce((acc, f) => acc + (f.montoCentavos ?? 0), 0);
  const totalEstimadoCentavos = filas.reduce((acc, f) => acc + (f.estimadoCentavos ?? 0), 0);

  return {
    mes,
    desde,
    hasta,
    filas,
    resumen: { empleados: filas.length, totalBaseCentavos, totalEstimadoCentavos },
  };
}

/** Detalle del período para UNA persona, con su historial salarial completo. */
export async function detalleControlSueldo(
  userId: string,
  mes?: string,
): Promise<{ periodo: ControlSueldoDTO; fila: FilaSueldoDTO; historial: SalarioDTO[] }> {
  const periodo = await listarControlSueldo({ mes, userId });
  const fila = periodo.filas[0];
  if (!fila) {
    throw new SalarioInvalidoError("Persona no encontrada en la plantilla.");
  }
  return { periodo, fila, historial: await historialSalarial(userId) };
}

// ─── Escritura ──────────────────────────────────────────────────

export interface GuardarSalarioInput {
  montoCentavos: number;
  vigenteDesde: string;
  notas?: string | null;
}

export interface ResultadoGuardarSalarioDTO {
  userId: string;
  /** true = ya existía un monto para esa misma fecha y se corrigió esa vigencia. */
  reemplazo: boolean;
  historial: SalarioDTO[];
}

/**
 * Registra el sueldo mensual de una persona creando una VIGENCIA NUEVA.
 *
 * El monto anterior NO se borra: queda en el historial y sigue siendo el que aplica a los
 * meses anteriores a esta fecha. Corregir el monto de una fecha que ya tiene vigencia
 * actualiza esa fila (dos montos distintos para el mismo día se contradicen), pero nunca
 * toca las demás.
 */
export async function guardarSalario(
  userId: string,
  input: GuardarSalarioInput,
  autorId: string,
): Promise<ResultadoGuardarSalarioDTO> {
  if (!Number.isInteger(input.montoCentavos)) {
    throw new SalarioInvalidoError("El monto debe venir en centavos enteros.");
  }
  if (input.montoCentavos < 0) {
    throw new SalarioInvalidoError("El sueldo no puede ser negativo.");
  }
  if (input.montoCentavos > MAX_CENTAVOS) {
    throw new SalarioInvalidoError("El sueldo indicado es demasiado alto. Revisa el monto.");
  }
  if (!esFechaValida(input.vigenteDesde)) {
    throw new SalarioInvalidoError("La fecha de vigencia no es una fecha válida (AAAA-MM-DD).");
  }

  // El perfil laboral se asegura aquí (misma lógica que Asistencia): el monto siempre queda
  // colgado de un empleado real, listo para una futura nómina.
  const empleadoId = await asegurarEmpleado(userId);

  const ahora = new Date();
  const [existente] = await db
    .select()
    .from(salarios)
    .where(and(eq(salarios.userId, userId), eq(salarios.vigenteDesde, input.vigenteDesde)));

  let reemplazo = false;
  if (existente) {
    reemplazo = true;
    await db
      .update(salarios)
      .set({
        montoCentavos: input.montoCentavos,
        empleadoId,
        notas: input.notas?.trim() || null,
        createdBy: autorId,
        updatedAt: ahora,
      })
      .where(eq(salarios.id, existente.id));
  } else {
    await db.insert(salarios).values({
      id: crypto.randomUUID(),
      userId,
      empleadoId,
      montoCentavos: input.montoCentavos,
      vigenteDesde: input.vigenteDesde,
      notas: input.notas?.trim() || null,
      createdBy: autorId,
      createdAt: ahora,
      updatedAt: ahora,
    });
  }

  // `personaId` de la bitácora apunta a `personas` (contactos del CRM), NO a usuarios: aquí
  // va solo el autor y la entidad, que es la persona de la plantilla.
  await registrarAuditoria({
    entidad: "SalarioRRHH",
    entidadId: userId,
    accion: `${reemplazo ? "Sueldo corregido" : "Sueldo configurado"} — ${(input.montoCentavos / 100).toFixed(2)} desde ${input.vigenteDesde}`,
    autorId,
  });

  return { userId, reemplazo, historial: await historialSalarial(userId) };
}
