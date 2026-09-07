import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { cumpleanos, cumpleanosRecordatorios, personas } from "../db/schema";
import { DIAS_AVISO_CUMPLEANOS, MAX_MESES, VENTANA_MESES_INICIAL, diaDeMes } from "../lib/cumpleanos-config";
import {
  diasEntre,
  diasEnMes,
  hoyET,
  proximaOcurrencia,
  sumarMesesCalendario,
  ymd,
} from "../lib/cumpleanos-fechas";
import { registrarAuditoria } from "./auditoria.service";
import { asegurarRecordatorio, recordatoriosEnVentana, reconciliarTrasEdicion } from "./cumpleanos-worker.service";
import type { ActualizarCumpleanoInput, CrearCumpleanoInput } from "../lib/validation";

// ─── 🎂 Servicio del módulo "Próximos cumpleaños" ────────────────────────────────
// La fuente de verdad es la tabla `cumpleanos`: una fila por persona (sin filas por
// año). La lista cronológica y los "Faltan N días" se CALCULAN en vuelo desde
// mes/día/año (ver cumpleanos-fechas.ts); el recordatorio compartido que aparece en
// Tareas vive en `cumpleanos_recordatorios` y lo genera el worker solo cuando la
// ocurrencia entra en la ventana de aviso.

// Errores de dominio para que la ruta los mapee a 403/400/404/409 según el caso.
export class CumpleanoNoEncontradoError extends Error {}
export class PersonaNoEncontradaError extends Error {}
export class CumpleanoDuplicadoError extends Error {}
export class DatoCumpleanoInvalidoError extends Error {}

/** Etiquetas en español para el historial de recordatorios. */
const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

/**
 * Valida día/mes. Se llama tras deducir los valores (el 29/02 es válido como fecha de
 * nacimiento; el ajuste a 28/02 en años no bisiestos lo hace `clamp` al calcular).
 */
function validarDiaMes(mes: number | undefined, dia: number | undefined): void {
  if (!mes || !dia) {
    throw new DatoCumpleanoInvalidoError("Debes indicar el día y el mes del cumpleaños.");
  }
  if (mes < 1 || mes > 12) {
    throw new DatoCumpleanoInvalidoError("El mes debe estar entre 1 y 12.");
  }
  if (dia < 1 || dia > diasEnMes(mes)) {
    throw new DatoCumpleanoInvalidoError(`El mes ${diaDeMes(mes, 1)} no tiene ${dia} días.`);
  }
}

function validarAnio(anio: number | null | undefined): void {
  if (anio == null) return;
  const hoy = hoyET();
  if (anio < 1800) throw new DatoCumpleanoInvalidoError("El año de nacimiento no puede ser anterior a 1800.");
  if (anio > hoy.y) throw new DatoCumpleanoInvalidoError("El año de nacimiento no puede ser futuro.");
}

/** Número con ceros a la izquierda para fechas. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Convierte una fila (cumpleanos + persona opcional) en el objeto público de la lista.
 * El nombre mostrado es el del CONTACTO cuando está vinculado (vive en personas, así
 * un renombre de la ficha se refleja aquí); el `nombre` propio del registro queda como
 * respaldo para cumpleaños sueltos.
 */
interface FilaCumpleano {
  id: string;
  personaId: string | null;
  nombre: string;
  mes: number;
  dia: number;
  anio: number | null;
  activo: boolean;
  notas: string | null;
  pNombre: string | null;
  pTelefono: string | null;
  pEmail: string | null;
}

interface CumpleanoDto {
  id: string;
  nombre: string;
  personaId: string | null;
  persona: { id: string; telefono: string | null; email: string | null } | null;
  mes: number;
  dia: number;
  anio: number | null;
  edad: number | null;
  nextBirthday: string; // YYYY-MM-DD (ET) de la próxima ocurrencia
  daysUntil: number;
  activo: boolean;
  notas: string | null;
}

function aDto(f: FilaCumpleano): CumpleanoDto {
  const hoy = hoyET();
  const occ = proximaOcurrencia(f.mes, f.dia, hoy);
  const nombre = f.personaId && f.pNombre ? f.pNombre : f.nombre;
  return {
    id: f.id,
    nombre,
    personaId: f.personaId,
    persona: f.personaId
      ? { id: f.personaId, telefono: f.pTelefono ?? null, email: f.pEmail ?? null }
      : null,
    mes: f.mes,
    dia: f.dia,
    anio: f.anio,
    edad: f.anio != null ? occ.y - f.anio : null,
    nextBirthday: ymd(occ),
    daysUntil: diasEntre(hoy, occ),
    activo: f.activo,
    notas: f.notas,
  };
}

/**
 * Consulta compartida de la lista: cumpleaños + datos de su contacto en vivo.
 * Por defecto solo los ACTIVOS (los que aparecen en la ventana). Cuando se busca
 * por nombre (`incluirInactivos`) también devuelve los desactivados, para que un
 * cumpleaños oculto siga siendo localizable y reactivable (no se borra nada).
 */
async function filasActivas(opts: { incluirInactivos?: boolean } = {}): Promise<FilaCumpleano[]> {
  const query = db
    .select({
      id: cumpleanos.id,
      personaId: cumpleanos.personaId,
      nombre: cumpleanos.nombre,
      mes: cumpleanos.mes,
      dia: cumpleanos.dia,
      anio: cumpleanos.anio,
      activo: cumpleanos.activo,
      notas: cumpleanos.notas,
      pNombre: personas.nombre,
      pTelefono: personas.telefono,
      pEmail: personas.email,
    })
    .from(cumpleanos)
    .leftJoin(personas, eq(cumpleanos.personaId, personas.id));
  if (!opts.incluirInactivos) query.where(eq(cumpleanos.activo, true));
  return query;
}

/**
 * Lista cronológica del módulo.
 *
 * - `meses`: ventana hacia adelante (3 por defecto; la UI lo expande 3→6→9→12). Como
 *   todo cumpleaños recurre en ≤12 meses, con `meses=12` aparecen todos los activos.
 * - `q`: búsqueda por nombre. Cuando hay búsqueda, la ventana se IGNORA y se devuelven
 *   las coincidencias activas (para encontrar a alguien lejano).
 */
export async function listarCumpleanos(params: { meses?: number; q?: string }) {
  const hoy = hoyET();
  const q = params.q?.trim().toLowerCase();
  const meses = Math.min(
    MAX_MESES,
    Math.max(1, Number.isFinite(params.meses) ? Math.floor(params.meses!) : VENTANA_MESES_INICIAL),
  );

  // La búsqueda por nombre también encuentra desactivados (para reactivarlos);
  // la ventana normal solo muestra activos.
  const filas = await filasActivas({ incluirInactivos: !!q });
  const totalActivos = filas.filter((f) => f.activo).length;

  // Sobre cada fila calculamos su próxima ocurrencia UNA vez y la reusamos.
  const conOcurrencia = filas.map((f) => {
    const occ = proximaOcurrencia(f.mes, f.dia, hoy);
    const nombre = f.personaId && f.pNombre ? f.pNombre : f.nombre;
    return { f, occ, daysUntil: diasEntre(hoy, occ), nombre: nombre.toLowerCase() };
  });

  let visibles: typeof conOcurrencia;
  if (q) {
    visibles = conOcurrencia.filter((c) => c.nombre.includes(q));
  } else {
    const finVentana = sumarMesesCalendario(hoy, meses);
    const diasVentana = diasEntre(hoy, finVentana);
    visibles = conOcurrencia.filter((c) => c.daysUntil <= diasVentana);
  }

  visibles.sort(
    (a, b) => a.daysUntil - b.daysUntil || a.f.nombre.localeCompare(b.f.nombre, "es"),
  );

  return {
    items: visibles.map((v) => aDto(v.f)),
    meses,
    total: visibles.length,
    totalActivos,
  };
}

/** Detalle de un cumpleaños + historial de recordatorios por año. Null si no existe. */
export async function obtenerCumpleano(id: string) {
  const [fila] = await db
    .select({
      id: cumpleanos.id,
      personaId: cumpleanos.personaId,
      nombre: cumpleanos.nombre,
      mes: cumpleanos.mes,
      dia: cumpleanos.dia,
      anio: cumpleanos.anio,
      activo: cumpleanos.activo,
      notas: cumpleanos.notas,
      pNombre: personas.nombre,
      pTelefono: personas.telefono,
      pEmail: personas.email,
    })
    .from(cumpleanos)
    .leftJoin(personas, eq(cumpleanos.personaId, personas.id))
    .where(eq(cumpleanos.id, id));
  if (!fila) return null;

  const recordatorios = await db
    .select()
    .from(cumpleanosRecordatorios)
    .where(eq(cumpleanosRecordatorios.cumpleanosId, id))
    .orderBy(desc(cumpleanosRecordatorios.anio));

  return {
    ...aDto(fila),
    recordatorios: recordatorios.map((r) => ({
      id: r.id,
      anio: r.anio,
      fechaCumpleanos: r.fechaCumpleanos,
      estado: r.estado,
      etiquetaEstado: ETIQUETA_ESTADO[r.estado] ?? r.estado,
      completadoPor: r.completadoPor,
      completadoEn: r.completadoEn,
    })),
  };
}

/** Resuelve personaId → persona (con error amable si no existe). */
async function personaO(personaId: string): Promise<typeof personas.$inferSelect> {
  const [p] = await db.select().from(personas).where(eq(personas.id, personaId));
  if (!p) throw new PersonaNoEncontradaError("El contacto vinculado no existe.");
  return p;
}

/** Comprueba que ningún otro cumpleaños use ya esa persona (el índice único lo exige). */
async function asegurarPersonaLibre(personaId: string, exceptoId?: string): Promise<void> {
  const [existente] = await db
    .select({ id: cumpleanos.id })
    .from(cumpleanos)
    .where(eq(cumpleanos.personaId, personaId));
  if (existente && existente.id !== exceptoId) {
    throw new CumpleanoDuplicadoError("Este contacto ya tiene un cumpleaños registrado.");
  }
}

/** Escribe fecha_nacimiento en la ficha cuando sabemos el año y la ficha no tiene fecha. */
async function respaldarEnFicha(persona: typeof personas.$inferSelect, mes: number, dia: number, anio: number | null): Promise<void> {
  if (anio == null || persona.fechaNacimiento) return;
  await db
    .update(personas)
    .set({
      fechaNacimiento: `${anio}-${pad(mes)}-${pad(dia)}`,
      updatedAt: new Date(),
    })
    .where(eq(personas.id, persona.id));
}

/**
 * Crea un cumpleaños. Puede venir vinculado a un contacto (`personaId`) o suelto
 * (solo nombre + día/mes). Si se vincula un contacto con fecha de nacimiento y no se
 * mandaron día/mes/año, se adoptan de la ficha. Si la ficha no tenía fecha y sí
 * sabemos el año, se la escribe (back-sync) para que los reportes viejos de "Mi día"
 * también lo vean. Después asegura el recordatorio: si cae en la ventana, se crea al
 * instante (no hay que esperar al worker).
 */
export async function crearCumpleano(input: CrearCumpleanoInput, autorId: string) {
  let persona: typeof personas.$inferSelect | null = null;
  if (input.personaId) {
    persona = await personaO(input.personaId);
    await asegurarPersonaLibre(persona.id);
  }

  let mes = input.mes;
  let dia = input.dia;
  let anio = input.anio;
  let nombre = input.nombre?.trim() || persona?.nombre || null;

  // Ficha con fecha real: si no mandaron nada de fecha, adoptarla de la ficha.
  if (persona?.fechaNacimiento) {
    const [py, pm, pd] = persona.fechaNacimiento.split("-").map(Number);
    if (!mes) mes = pm;
    if (!dia) dia = pd;
    if (anio == null && Number.isFinite(py)) anio = py;
  }

  validarDiaMes(mes, dia);
  validarAnio(anio);
  if (!nombre) throw new DatoCumpleanoInvalidoError("El nombre es obligatorio.");

  const id = crypto.randomUUID();
  const ahora = new Date();
  await db.insert(cumpleanos).values({
    id,
    personaId: persona?.id ?? null,
    nombre,
    mes: mes!,
    dia: dia!,
    anio: anio ?? null,
    activo: true,
    notas: input.notas?.trim() || null,
    creadoPor: autorId,
    createdAt: ahora,
    updatedAt: ahora,
  });

  if (persona) await respaldarEnFicha(persona, mes!, dia!, anio ?? null);

  await registrarAuditoria({
    entidad: "Cumpleano",
    entidadId: id,
    accion: `Cumpleaños creado: ${nombre} (${diaDeMes(mes!, dia!)})${persona ? " · vinculado a contacto" : ""}`,
    autorId,
    personaId: persona?.id,
  });

  await asegurarRecordatorio(id);
  return obtenerCumpleano(id);
}

/**
 * Edita un cumpleaños. Nunca crea otra fila. Si cambia día/mes llama a la
 * reconciliación (el worker la expone) para recalibrar/cancelar recordatorios sin
 * duplicar; si solo se reactiva, asegura el recordatorio al momento.
 */
export async function actualizarCumpleano(id: string, input: ActualizarCumpleanoInput, autorId: string) {
  const [actual] = await db.select().from(cumpleanos).where(eq(cumpleanos.id, id));
  if (!actual) throw new CumpleanoNoEncontradoError("Cumpleaños no encontrado.");

  // Determinar la persona final (vinculación actual / cambio / desvinculación).
  let personaFinalId: string | null;
  let personaFinal: typeof personas.$inferSelect | null = null;
  if (input.personaId !== undefined) {
    personaFinalId = input.personaId;
    if (personaFinalId) {
      personaFinal = await personaO(personaFinalId);
      if (personaFinalId !== actual.personaId) {
        await asegurarPersonaLibre(personaFinalId, actual.id);
      }
    }
  } else {
    personaFinalId = actual.personaId;
    if (personaFinalId) {
      personaFinal = await personaO(personaFinalId);
    }
  }

  // Deducir día/mes/año/nombre finales.
  let mes = input.mes;
  let dia = input.dia;
  let anio = input.anio !== undefined ? input.anio : actual.anio;
  let nombre = input.nombre?.trim();

  const acabaDeVincularFicha = personaFinalId && personaFinalId !== actual.personaId;
  if (acabaDeVincularFicha && personaFinal?.fechaNacimiento) {
    const [py, pm, pd] = personaFinal.fechaNacimiento.split("-").map(Number);
    if (input.mes === undefined) mes = pm;
    if (input.dia === undefined) dia = pd;
    if (input.anio === undefined && Number.isFinite(py)) anio = py;
  }
  if (!nombre) nombre = (personaFinalId && personaFinal ? personaFinal.nombre : actual.nombre) ?? actual.nombre;

  const mesFinal = mes ?? actual.mes;
  const diaFinal = dia ?? actual.dia;
  const anioFinal = anio ?? null;

  validarDiaMes(mesFinal, diaFinal);
  validarAnio(anioFinal);
  if (!nombre) throw new DatoCumpleanoInvalidoError("El nombre es obligatorio.");

  const ahora = new Date();
  const cambios: Record<string, unknown> = { updatedAt: ahora };
  if (nombre !== actual.nombre) cambios.nombre = nombre;
  if (personaFinalId !== actual.personaId) cambios.personaId = personaFinalId;
  if (mesFinal !== actual.mes) cambios.mes = mesFinal;
  if (diaFinal !== actual.dia) cambios.dia = diaFinal;
  if (anioFinal !== (actual.anio ?? null)) cambios.anio = anioFinal;
  if (input.notas !== undefined) cambios.notas = input.notas?.trim() || null;
  if (input.activo !== undefined) cambios.activo = input.activo;

  const mesODiaCambio = mesFinal !== actual.mes || diaFinal !== actual.dia;

  if (Object.keys(cambios).length > 1) {
    // "1" porque updatedAt siempre está; si solo cambió updatedAt no hay nada que escribir.
    // El cast es por las claves dinámicas del objeto (mismo patrón que personas.service).
    await db
      .update(cumpleanos)
      .set(cambios as Partial<typeof cumpleanos.$inferInsert>)
      .where(eq(cumpleanos.id, id));
  }

  if (personaFinal) {
    await respaldarEnFicha(personaFinal, mesFinal, diaFinal, anioFinal);
  }

  const detalle: string[] = [];
  if (cambios.nombre) detalle.push(`nombre → ${nombre}`);
  if (mesODiaCambio) detalle.push(`fecha → ${diaDeMes(mesFinal, diaFinal)}`);
  if (cambios.activo === false) detalle.push("desactivado");
  if (cambios.activo === true) detalle.push("reactivado");
  await registrarAuditoria({
    entidad: "Cumpleano",
    entidadId: id,
    accion: `Cumpleaños actualizado: ${nombre}${detalle.length ? ` (${detalle.join(" · ")})` : ""}`,
    autorId,
    personaId: personaFinalId ?? undefined,
  });

  if (mesODiaCambio) {
    await reconciliarTrasEdicion(id, mesFinal, diaFinal);
  } else if (input.activo === true && !actual.activo) {
    await asegurarRecordatorio(id);
  }

  return obtenerCumpleano(id);
}

/** Reactiva un cumpleaños (soft). Asegura recordatorio al instante si cae en ventana. */
export async function activarCumpleano(id: string, autorId: string) {
  const [actual] = await db.select().from(cumpleanos).where(eq(cumpleanos.id, id));
  if (!actual) throw new CumpleanoNoEncontradoError("Cumpleaños no encontrado.");
  if (!actual.activo) {
    await db.update(cumpleanos).set({ activo: true, updatedAt: new Date() }).where(eq(cumpleanos.id, id));
    await registrarAuditoria({
      entidad: "Cumpleano",
      entidadId: id,
      accion: "Cumpleaños reactivado",
      autorId,
      personaId: actual.personaId ?? undefined,
    });
  }
  await asegurarRecordatorio(id);
  return obtenerCumpleano(id);
}

/** Desactiva un cumpleaños (soft, sin borrado). Los recordatorios pendientes se ocultan. */
export async function desactivarCumpleano(id: string, autorId: string) {
  const [actual] = await db.select().from(cumpleanos).where(eq(cumpleanos.id, id));
  if (!actual) throw new CumpleanoNoEncontradoError("Cumpleaños no encontrado.");
  if (actual.activo) {
    await db.update(cumpleanos).set({ activo: false, updatedAt: new Date() }).where(eq(cumpleanos.id, id));
    await registrarAuditoria({
      entidad: "Cumpleano",
      entidadId: id,
      accion: "Cumpleaños desactivado",
      autorId,
      personaId: actual.personaId ?? undefined,
    });
  }
  return obtenerCumpleano(id);
}

/**
 * Recordatorios PENDIENTES de la ventana de aviso (el grupo "🎂 Cumpleaños" en Tareas).
 * Solo los de cumpleaños activos; decorados con el contacto en vivo.
 */
export async function listarRecordatoriosActivos() {
  const enVentana = await recordatoriosEnVentana();
  if (enVentana.length === 0) return [];

  const ids = [...new Set(enVentana.map((r) => r.cumpleanosId))];
  const cumple = await db
    .select({
      id: cumpleanos.id,
      personaId: cumpleanos.personaId,
      nombre: cumpleanos.nombre,
      pNombre: personas.nombre,
      pTelefono: personas.telefono,
      pEmail: personas.email,
    })
    .from(cumpleanos)
    .leftJoin(personas, eq(cumpleanos.personaId, personas.id))
    .where(inArray(cumpleanos.id, ids));
  const porId = new Map(cumple.map((c) => [c.id, c]));

  const hoy = hoyET();
  return enVentana
    .map((r) => {
      const c = porId.get(r.cumpleanosId);
      if (!c) return null;
      const nombre = c.personaId && c.pNombre ? c.pNombre : c.nombre;
      const fecha = r.fechaCumpleanos;
      const mes = Number(fecha.slice(5, 7));
      const dia = Number(fecha.slice(8, 10));
      return {
        id: r.id,
        cumpleanosId: r.cumpleanosId,
        nombre,
        personaId: c.personaId ?? null,
        persona: c.personaId
          ? { id: c.personaId, telefono: c.pTelefono ?? null, email: c.pEmail ?? null }
          : null,
        fechaCumpleanos: fecha,
        anio: r.anio,
        etiqueta: diaDeMes(mes, dia),
        daysUntil: diasEntre(hoy, { y: Number(fecha.slice(0, 4)), m: mes, d: dia }),
        // Para el subtítulo "en la ventana de los próximos 7 días" (información, no lógica).
        diasAviso: DIAS_AVISO_CUMPLEANOS,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((x) => x.daysUntil >= 0 && x.daysUntil <= DIAS_AVISO_CUMPLEANOS)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.nombre.localeCompare(b.nombre, "es"));
}

/** Marca "Realizado" (global) un recordatorio. Idempotente. */
export async function marcarRecordatorioRealizado(id: string, autorId: string) {
  const [r] = await db.select().from(cumpleanosRecordatorios).where(eq(cumpleanosRecordatorios.id, id));
  if (!r) throw new CumpleanoNoEncontradoError("Recordatorio no encontrado.");

  if (r.estado !== "realizado") {
    await db
      .update(cumpleanosRecordatorios)
      .set({ estado: "realizado", completadoPor: autorId, completadoEn: new Date() })
      .where(eq(cumpleanosRecordatorios.id, id));
    await registrarAuditoria({
      entidad: "CumpleanoRecordatorio",
      entidadId: id,
      accion: `Cumpleaños ${r.anio} marcado como felicitado`,
      autorId,
    });
  }

  return {
    id: r.id,
    cumpleanosId: r.cumpleanosId,
    anio: r.anio,
    estado: "realizado",
  };
}

/**
 * Integración con la ficha del cliente (flujo viejo de contactos). Cuando una PERSONA
 * tiene fecha_nacimiento (al crearla o al editarla por la ficha), este módulo queda en
 * sync: si no existe su fila en `cumpleanos`, la crea (y deja de crear la tarea-
 * seguimiento "🎂 Cumpleaños de …" de antes); si la fila vinculada ya existe pero su
 * fecha difiere de la ficha, la ficha manda (es la fecha real del contacto) y se
 * actualiza + reconcilia. Idempotente y nunca borra nada. Los errores no deben romper
 * el flujo del contacto: quien llama lo envuelve en try/catch.
 */
export async function sincronizarCumpleanosDePersona(personaId: string, autorId: string): Promise<void> {
  const [persona] = await db.select().from(personas).where(eq(personas.id, personaId));
  if (!persona?.fechaNacimiento) return;

  const [py, pm, pd] = persona.fechaNacimiento.split("-").map(Number);
  if (!Number.isFinite(py) || !Number.isFinite(pm) || !Number.isFinite(pd)) return;
  if (pm < 1 || pm > 12 || pd < 1 || pd > diasEnMes(pm)) return;

  const [existente] = await db.select().from(cumpleanos).where(eq(cumpleanos.personaId, personaId));

  if (!existente) {
    const id = crypto.randomUUID();
    const ahora = new Date();
    await db.insert(cumpleanos).values({
      id,
      personaId,
      nombre: persona.nombre,
      mes: pm,
      dia: pd,
      anio: py,
      activo: true,
      notas: "Sincronizado desde la fecha de nacimiento de la ficha.",
      creadoPor: autorId,
      createdAt: ahora,
      updatedAt: ahora,
    });
    await asegurarRecordatorio(id);
    return;
  }

  // Ya existe la fila vinculada: si la ficha cambió de fecha, se actualiza y reconcilia.
  if (existente.mes === pm && existente.dia === pd && (existente.anio ?? null) === py) return;
  await db
    .update(cumpleanos)
    .set({ mes: pm, dia: pd, anio: py, updatedAt: new Date() })
    .where(eq(cumpleanos.id, existente.id));
  await reconciliarTrasEdicion(existente.id, pm, pd);
}
