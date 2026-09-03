import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { db } from "../db/client";
import {
  personas,
  personaTags,
  tags,
  negocios,
  personaNegocios,
  usuarios,
  interacciones,
  tareasSeguimiento,
  registros,
  pipelines,
  etapas,
  bitacoraAuditoria,
} from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";
import type { CrearPersonaInput, CrearInteraccionInput } from "../lib/validation";

export async function listarPersonas(params: { search?: string; estado?: string; responsableId?: string; pagina?: number; limite?: number }) {
  const condiciones = [
    params.search
      ? or(
          like(personas.nombre, `%${params.search}%`),
          like(personas.email, `%${params.search}%`),
          like(personas.telefono, `%${params.search}%`)
        )
      : undefined,
    params.estado ? eq(personas.estado, params.estado) : undefined,
    params.responsableId ? eq(personas.responsableId, params.responsableId) : undefined,
  ].filter(Boolean);

  const pagina = Math.max(1, params.pagina ?? 1);
  const limite = Math.min(100, Math.max(1, params.limite ?? 25));

  const filas = await db
    .select({
      id: personas.id,
      nombre: personas.nombre,
      telefono: personas.telefono,
      email: personas.email,
      ciudad: personas.ciudad,
      estado: personas.estado,
      fuente: personas.fuente,
      fechaNacimiento: personas.fechaNacimiento,
      responsableNombre: usuarios.nombre,
      updatedAt: personas.updatedAt,
    })
    .from(personas)
    .leftJoin(usuarios, eq(personas.responsableId, usuarios.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(personas.updatedAt));

  const total = filas.length;
  const paginadas = filas.slice((pagina - 1) * limite, pagina * limite);

  const paginaIds = paginadas.map(f => f.id);
  if (paginaIds.length === 0) {
    return { items: [], total, pagina, limite, totalPaginas: Math.ceil(total / limite) };
  }

  const tagsPorPersona = await db
    .select({ personaId: personaTags.personaId, tagNombre: tags.nombre })
    .from(personaTags)
    .innerJoin(tags, eq(personaTags.tagId, tags.id))
    .where(inArray(personaTags.personaId, paginaIds));

  const negociosPorPersona = await db
    .select({ personaId: personaNegocios.personaId, negocioNombre: negocios.nombre })
    .from(personaNegocios)
    .innerJoin(negocios, eq(personaNegocios.negocioId, negocios.id))
    .where(inArray(personaNegocios.personaId, paginaIds));

  const items = paginadas.map((p) => ({
    ...p,
    tags: tagsPorPersona.filter((t) => t.personaId === p.id).map((t) => t.tagNombre),
    negocios: negociosPorPersona.filter((n) => n.personaId === p.id).map((n) => n.negocioNombre),
  }));

  return { items, total, pagina, limite, totalPaginas: Math.ceil(total / limite) };
}

export async function obtenerFichaPersona(id: string) {
  const [persona] = await db.select().from(personas).where(eq(personas.id, id));
  if (!persona) return null;

  const tagsPersona = await db
    .select({ nombre: tags.nombre })
    .from(personaTags)
    .innerJoin(tags, eq(personaTags.tagId, tags.id))
    .where(eq(personaTags.personaId, id));

  const negociosPersona = await db
    .select({ nombre: negocios.nombre })
    .from(personaNegocios)
    .innerJoin(negocios, eq(personaNegocios.negocioId, negocios.id))
    .where(eq(personaNegocios.personaId, id));

  const interaccionesPersona = await db
    .select({
      id: interacciones.id,
      tipo: interacciones.tipo,
      nota: interacciones.nota,
      fecha: interacciones.fecha,
      autorNombre: usuarios.nombre,
    })
    .from(interacciones)
    .innerJoin(usuarios, eq(interacciones.autorId, usuarios.id))
    .where(eq(interacciones.personaId, id))
    .orderBy(desc(interacciones.fecha));

  const tareas = await db
    .select()
    .from(tareasSeguimiento)
    .where(eq(tareasSeguimiento.personaId, id))
    .orderBy(tareasSeguimiento.fecha);

  const registrosPersona = await db
    .select({
      id: registros.id,
      valor: registros.valor,
      pipelineNombre: pipelines.nombre,
      etapaNombre: etapas.nombre,
      updatedAt: registros.updatedAt,
    })
    .from(registros)
    .innerJoin(pipelines, eq(registros.pipelineId, pipelines.id))
    .innerJoin(etapas, eq(registros.etapaId, etapas.id))
    .where(eq(registros.personaId, id));

  const bitacora = await db
    .select({
      id: bitacoraAuditoria.id,
      entidad: bitacoraAuditoria.entidad,
      accion: bitacoraAuditoria.accion,
      fecha: bitacoraAuditoria.fecha,
      autorNombre: usuarios.nombre,
    })
    .from(bitacoraAuditoria)
    .innerJoin(usuarios, eq(bitacoraAuditoria.autorId, usuarios.id))
    .where(eq(bitacoraAuditoria.personaId, id))
    .orderBy(desc(bitacoraAuditoria.fecha))
    .limit(100);

  const timeline = [
    ...interaccionesPersona.map((i) => ({
      tipo: "interaccion" as const,
      fecha: i.fecha,
      autor: i.autorNombre,
      detalle: `${i.tipo}: ${i.nota}`,
    })),
    ...bitacora.map((b) => ({
      tipo: "auditoria" as const,
      fecha: b.fecha,
      autor: b.autorNombre,
      detalle: b.accion,
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  return {
    ...persona,
    tags: tagsPersona.map((t) => t.nombre),
    negocios: negociosPersona.map((n) => n.nombre),
    interacciones: interaccionesPersona,
    tareas,
    registros: registrosPersona,
    timeline,
    historial: bitacora,
  };
}

export async function crearPersona(input: CrearPersonaInput, autorId: string) {
  const id = crypto.randomUUID();
  const ahora = new Date();

  await db.insert(personas).values({
    id,
    nombre: input.nombre,
    telefono: input.telefono,
    email: input.email || undefined,
    ciudad: input.ciudad,
    estado: input.estado,
    fuente: input.fuente,
    referidoPor: input.fuente === "Referido" ? input.referidoPor : undefined,
    responsableId: input.responsableId,
    fechaNacimiento: input.fechaNacimiento || undefined,
    createdAt: ahora,
    updatedAt: ahora,
  });

  for (const nombreTag of input.tags) {
    const [existente] = await db.select().from(tags).where(eq(tags.nombre, nombreTag));
    const tag = existente ?? { id: crypto.randomUUID(), nombre: nombreTag };
    if (!existente) await db.insert(tags).values(tag);
    await db.insert(personaTags).values({ personaId: id, tagId: tag.id });
  }

  for (const nombreNegocio of input.negocios ?? []) {
    const [existente] = await db.select().from(negocios).where(eq(negocios.nombre, nombreNegocio));
    const negocio = existente ?? { id: crypto.randomUUID(), nombre: nombreNegocio };
    if (!existente) await db.insert(negocios).values(negocio);
    await db.insert(personaNegocios).values({ personaId: id, negocioId: negocio.id });
  }

  // Si el contacto tiene fecha de nacimiento, crear tarea de seguimiento para su próximo cumpleaños
  if (input.fechaNacimiento) {
    const proximoCumple = calcularProximoCumpleanos(input.fechaNacimiento);
    await db.insert(tareasSeguimiento).values({
      id: crypto.randomUUID(),
      personaId: id,
      fecha: proximoCumple,
      nota: `🎂 Cumpleaños de ${input.nombre}`,
      autorId,
      createdAt: new Date(),
    });
  }

  await registrarAuditoria({
    entidad: "Persona",
    entidadId: id,
    accion: `Contacto creado — fuente: ${input.fuente}${input.referidoPor ? ` (referido por ${input.referidoPor})` : ""}`,
    autorId,
    personaId: id,
  });

  return obtenerFichaPersona(id);
}

// Registrar interacción + agendar seguimiento en una sola operación: ambos son obligatorios,
// nunca queda una interacción sin su próximo seguimiento (regla de negocio ya definida en el CRM).
export async function registrarInteraccion(personaId: string, input: CrearInteraccionInput, autorId: string) {
  const interaccionId = crypto.randomUUID();
  const tareaId = crypto.randomUUID();
  const fechaSeguimiento = new Date(input.proximoSeguimiento);

  await db.insert(interacciones).values({
    id: interaccionId,
    personaId,
    tipo: input.tipo,
    nota: input.nota,
    autorId,
    fecha: new Date(),
  });

  await db.insert(tareasSeguimiento).values({
    id: tareaId,
    personaId,
    fecha: fechaSeguimiento,
    nota: input.notaSeguimiento ?? `Seguimiento de ${input.tipo.toLowerCase()}`,
    autorId,
    createdAt: new Date(),
  });

  await registrarAuditoria({
    entidad: "Interaccion",
    entidadId: interaccionId,
    accion: `Interacción registrada (${input.tipo}) y seguimiento agendado para ${fechaSeguimiento.toISOString()}`,
    autorId,
    personaId,
  });

  return { interaccionId, tareaId };
}

export async function completarTarea(tareaId: string, autorId: string) {
  const [tarea] = await db.select().from(tareasSeguimiento).where(eq(tareasSeguimiento.id, tareaId));
  if (!tarea) throw new Error("Tarea no encontrada");

  await db.update(tareasSeguimiento).set({ completado: true, completadoEn: new Date(), completadoPor: autorId }).where(eq(tareasSeguimiento.id, tareaId));

  await registrarAuditoria({
    entidad: "TareaSeguimiento",
    entidadId: tareaId,
    accion: "Tarea de seguimiento marcada como completada",
    autorId,
    personaId: tarea.personaId,
  });

  // Si es una tarea de cumpleaños, crear la del próximo año automáticamente
  if (tarea.nota?.includes("🎂 Cumpleaños")) {
    const [persona] = await db.select({ fechaNacimiento: personas.fechaNacimiento, nombre: personas.nombre })
      .from(personas).where(eq(personas.id, tarea.personaId));
    if (persona?.fechaNacimiento) {
      // Calcular el próximo cumpleaños: siempre para el año siguiente al actual,
      // porque el de este año ya fue felicitado (acabamos de completar su tarea).
      const partes = persona.fechaNacimiento.split("-").map(Number);
      const ahora = new Date();
      const et = new Date(ahora.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const proximoCumple = new Date(et.getFullYear() + 1, partes[1] - 1, partes[2]);
      await db.insert(tareasSeguimiento).values({
        id: crypto.randomUUID(),
        personaId: tarea.personaId,
        fecha: proximoCumple,
        nota: `🎂 Cumpleaños de ${persona.nombre}`,
        autorId,
        createdAt: new Date(),
      });
    }
  }

  return { ...tarea, completado: true };
}

// Reemplaza por completo el conjunto de negocios de interés de un contacto — mismo patrón
// de "borrar todo y volver a insertar" que es seguro porque la tabla de unión es pequeña.
export async function actualizarNegocios(personaId: string, nombresNegocios: string[], autorId: string) {
  const [persona] = await db.select().from(personas).where(eq(personas.id, personaId));
  if (!persona) throw new Error("Persona no encontrada");

  await db.delete(personaNegocios).where(eq(personaNegocios.personaId, personaId));

  for (const nombreNegocio of nombresNegocios) {
    const [existente] = await db.select().from(negocios).where(eq(negocios.nombre, nombreNegocio));
    const negocio = existente ?? { id: crypto.randomUUID(), nombre: nombreNegocio };
    if (!existente) await db.insert(negocios).values(negocio);
    await db.insert(personaNegocios).values({ personaId, negocioId: negocio.id });
  }

  await registrarAuditoria({
    entidad: "Persona",
    entidadId: personaId,
    accion: `Negocios de interés actualizados: ${nombresNegocios.join(", ") || "ninguno"}`,
    autorId,
    personaId,
  });

  return { ok: true };
}

export async function actualizarComentarios(personaId: string, comentarios: string, autorId: string) {
  const [persona] = await db.select().from(personas).where(eq(personas.id, personaId));
  if (!persona) throw new Error("Persona no encontrada");

  await db.update(personas).set({ comentarios, updatedAt: new Date() }).where(eq(personas.id, personaId));

  await registrarAuditoria({
    entidad: "Persona",
    entidadId: personaId,
    accion: "Comentarios del cliente actualizados",
    autorId,
    personaId,
  });

  return { ok: true };
}

/**
 * El autor no tiene permiso sobre esta ficha. Es una clase propia (y no un Error normal)
 * para que la ruta pueda distinguirla de "no encontrada" y responder 403 en vez de 404.
 */
export class SinPermisoError extends Error {}

// Nombres en español para la bitácora, y qué campos se pueden dejar vacíos. Ciudad y estado
// son NOT NULL en la tabla y obligatorios al crear, así que no se pueden vaciar.
const CAMPOS_EDITABLES = [
  { clave: "telefono", etiqueta: "Teléfono", vaciable: true },
  { clave: "email", etiqueta: "Correo", vaciable: true },
  { clave: "ciudad", etiqueta: "Ciudad", vaciable: false },
  { clave: "estado", etiqueta: "Estado", vaciable: false },
  { clave: "fechaNacimiento", etiqueta: "Fecha de nacimiento", vaciable: true },
] as const;

/**
 * Corrige los datos de contacto de una ficha ya creada.
 *
 * Permiso: el responsable del contacto, o cualquier ADMIN / SUPER_ADMIN. La verificación
 * vive aquí y no en la ruta porque necesita la persona ya cargada para comparar
 * `responsableId` — así no se consulta la misma fila dos veces.
 *
 * Solo escribe los campos que de verdad cambiaron, y deja en la bitácora el antes y el
 * después de cada uno, para que se pueda reconstruir quién corrigió qué.
 */
export async function actualizarDatosPersona(
  personaId: string,
  datos: Record<string, string | undefined>,
  autor: { id: string; rol: string }
) {
  const [persona] = await db.select().from(personas).where(eq(personas.id, personaId));
  if (!persona) throw new Error("Persona no encontrada");

  const esAdmin = autor.rol === "ADMIN" || autor.rol === "SUPER_ADMIN";
  if (!esAdmin && persona.responsableId !== autor.id) {
    throw new SinPermisoError(
      "Solo el responsable de este contacto o un administrador puede editar sus datos."
    );
  }

  const cambios: Record<string, string | null> = {};
  const detalle: string[] = [];

  for (const campo of CAMPOS_EDITABLES) {
    if (datos[campo.clave] === undefined) continue;
    const enviado = datos[campo.clave] as string;
    const nuevo = enviado === "" && campo.vaciable ? null : enviado;
    const anterior = (persona as Record<string, unknown>)[campo.clave] as string | null ?? null;
    if (nuevo === anterior) continue;
    cambios[campo.clave] = nuevo;
    detalle.push(`${campo.etiqueta}: "${anterior ?? "(vacío)"}" → "${nuevo ?? "(vacío)"}"`);
  }

  // Nada cambió de verdad (mandaron los mismos valores). No se escribe ni se audita, para no
  // llenar la bitácora de entradas vacías.
  if (detalle.length === 0) return { ok: true, sinCambios: true };

  await db
    .update(personas)
    // El cast es porque `cambios` se arma con claves dinámicas; los valores ya están
    // validados por actualizarPersonaSchema y solo se vacían los campos que aceptan null.
    .set({ ...(cambios as Partial<typeof personas.$inferInsert>), updatedAt: new Date() })
    .where(eq(personas.id, personaId));

  await registrarAuditoria({
    entidad: "Persona",
    entidadId: personaId,
    accion: "Datos de contacto actualizados",
    detalle: detalle.join(" | "),
    autorId: autor.id,
    personaId,
  });

  return { ok: true, cambios: detalle };
}

// Calendario global: todas las tareas de seguimiento pendientes, con la persona y su responsable —
// la base tanto de "Mi día" (filtrado por responsable) como del calendario completo del equipo.
export async function listarTareasPendientes(responsableId?: string) {
  const condiciones = [
    eq(tareasSeguimiento.completado, false),
    responsableId ? eq(personas.responsableId, responsableId) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      id: tareasSeguimiento.id,
      fecha: tareasSeguimiento.fecha,
      nota: tareasSeguimiento.nota,
      personaId: personas.id,
      personaNombre: personas.nombre,
      responsableId: personas.responsableId,
      responsableNombre: usuarios.nombre,
    })
    .from(tareasSeguimiento)
    .innerJoin(personas, eq(tareasSeguimiento.personaId, personas.id))
    .innerJoin(usuarios, eq(personas.responsableId, usuarios.id))
    .where(and(...condiciones))
    .orderBy(tareasSeguimiento.fecha);

  return filas;
}

// Calcula la fecha del próximo cumpleaños a partir de una fecha de nacimiento (YYYY-MM-DD).
// Si el cumpleaños de este año ya pasó, devuelve el del año siguiente.
export function calcularProximoCumpleanos(fechaNacimiento: string): Date {
  const partes = fechaNacimiento.split("-").map(Number);
  const mes = partes[1];
  const dia = partes[2];

  const ahora = new Date();
  // Usar Eastern Time para consistencia con el resto del sistema
  const et = new Date(ahora.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const añoActual = et.getFullYear();

  // Cumpleaños este año
  const cumpleEsteAño = new Date(añoActual, mes - 1, dia);

  // Si ya pasó (o es hoy), usar el año siguiente
  // Para "hoy": queremos que la tarea aparezca como "para hoy", no crear la del año siguiente todavía
  const hoyInicio = new Date(et.getFullYear(), et.getMonth(), et.getDate());
  if (cumpleEsteAño < hoyInicio) {
    return new Date(añoActual + 1, mes - 1, dia);
  }

  return cumpleEsteAño;
}

// Contactos que cumplen años hoy (comparando día y mes en Eastern Time)
export async function cumpleanosHoy() {
  const filas = await db
    .select({
      id: personas.id,
      nombre: personas.nombre,
      fechaNacimiento: personas.fechaNacimiento,
    })
    .from(personas);

  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hoyMes = et.getMonth() + 1;
  const hoyDia = et.getDate();

  return filas
    .filter((p) => {
      if (!p.fechaNacimiento) return false;
      const [, mes, dia] = p.fechaNacimiento.split("-").map(Number);
      return mes === hoyMes && dia === hoyDia;
    })
    .map((p) => ({
      personaId: p.id,
      personaNombre: p.nombre,
      fechaNacimiento: p.fechaNacimiento!,
    }));
}

// Próximos cumpleaños en los siguientes N días (excluyendo hoy)
export async function proximosCumpleanos(dias = 14) {
  const filas = await db
    .select({
      id: personas.id,
      nombre: personas.nombre,
      fechaNacimiento: personas.fechaNacimiento,
    })
    .from(personas);

  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hoy = new Date(et.getFullYear(), et.getMonth(), et.getDate());
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + dias);

  return filas
    .filter((p) => {
      if (!p.fechaNacimiento) return false;
      const partes = p.fechaNacimiento.split("-").map(Number);
      const mes = partes[1];
      const dia = partes[2];

      // Cumpleaños este año
      const cumpleEsteAño = new Date(hoy.getFullYear(), mes - 1, dia);
      // Si ya pasó hoy, usar el año siguiente
      const fechaCumple = cumpleEsteAño <= hoy
        ? new Date(hoy.getFullYear() + 1, mes - 1, dia)
        : cumpleEsteAño;

      return fechaCumple > hoy && fechaCumple <= limite;
    })
    .map((p) => ({
      personaId: p.id,
      personaNombre: p.nombre,
      fechaNacimiento: p.fechaNacimiento!,
    }));
}

// Ubicaciones de clientes para el mapa
export async function ubicacionesClientes() {
  const filas = await db
    .select({
      ciudad: personas.ciudad,
      estado: personas.estado,
    })
    .from(personas)
    .orderBy(personas.estado, personas.ciudad);

  // Agrupar y contar en JavaScript (evita problemas con count() en el driver proxy)
  const conteo = new Map<string, { ciudad: string; estado: string; total: number }>();
  for (const f of filas) {
    const key = `${f.ciudad}|${f.estado}`;
    const existente = conteo.get(key);
    if (existente) {
      existente.total++;
    } else {
      conteo.set(key, { ciudad: f.ciudad, estado: f.estado, total: 1 });
    }
  }

  return Array.from(conteo.values());
}
