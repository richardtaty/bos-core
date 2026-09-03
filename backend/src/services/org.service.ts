import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { departamentos, equipos, equipoMiembros, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

// ─── Departamentos ────────────────────────────────────────

export async function listarDepartamentos() {
  return db.select().from(departamentos).where(eq(departamentos.activo, true));
}

export async function crearDepartamento(input: { nombre: string; descripcion?: string }, autorId: string) {
  const id = crypto.randomUUID();
  await db.insert(departamentos).values({
    id,
    nombre: input.nombre,
    descripcion: input.descripcion,
    activo: true,
    createdAt: new Date(),
  });
  await registrarAuditoria({
    entidad: "Departamento",
    entidadId: id,
    accion: `Departamento creado: "${input.nombre}"`,
    autorId,
  });
  const [d] = await db.select().from(departamentos).where(eq(departamentos.id, id));
  return d;
}

// ─── Equipos ──────────────────────────────────────────────

export async function listarEquipos(departamentoId?: string) {
  const cond = departamentoId ? eq(equipos.departamentoId, departamentoId) : undefined;
  const filas = await db.select().from(equipos).where(cond);
  return filas;
}

export async function crearEquipo(input: { nombre: string; departamentoId: string; supervisorId?: string }, autorId: string) {
  const id = crypto.randomUUID();
  await db.insert(equipos).values({
    id,
    nombre: input.nombre,
    departamentoId: input.departamentoId,
    supervisorId: input.supervisorId,
    createdAt: new Date(),
  });
  await registrarAuditoria({
    entidad: "Equipo",
    entidadId: id,
    accion: `Equipo creado: "${input.nombre}"`,
    autorId,
  });
  const [e] = await db.select().from(equipos).where(eq(equipos.id, id));
  return e;
}

// ─── Miembros ─────────────────────────────────────────────

export async function agregarMiembro(equipoId: string, usuarioId: string, cargo: string, autorId: string) {
  await db.insert(equipoMiembros).values({ equipoId, usuarioId, cargo });

  // Actualizar el cargo en usuarios también
  await db.update(usuarios).set({ cargo }).where(eq(usuarios.id, usuarioId));

  await registrarAuditoria({
    entidad: "EquipoMiembro",
    entidadId: equipoId,
    accion: `Miembro agregado al equipo con cargo: ${cargo}`,
    autorId,
  });
  return { ok: true, equipoId, usuarioId, cargo };
}

export async function removerMiembro(equipoId: string, usuarioId: string, autorId: string) {
  await db.delete(equipoMiembros).where(
    and(eq(equipoMiembros.equipoId, equipoId), eq(equipoMiembros.usuarioId, usuarioId))
  );
  await registrarAuditoria({
    entidad: "EquipoMiembro",
    entidadId: equipoId,
    accion: "Miembro removido del equipo",
    autorId,
  });
  return { ok: true };
}

export async function miembrosDelEquipo(equipoId: string) {
  return db
    .select({
      usuarioId: equipoMiembros.usuarioId,
      nombre: usuarios.nombre,
      email: usuarios.email,
      cargo: equipoMiembros.cargo,
    })
    .from(equipoMiembros)
    .innerJoin(usuarios, eq(equipoMiembros.usuarioId, usuarios.id))
    .where(eq(equipoMiembros.equipoId, equipoId));
}

// ─── Organigrama ──────────────────────────────────────────

export async function organigrama(deptoId?: string) {
  const whereDepto = deptoId ? eq(departamentos.id, deptoId) : eq(departamentos.activo, true);
  const deptos = await db.select().from(departamentos).where(whereDepto);
  const resultado = [];

  for (const d of deptos) {
    const eqs = await db.select().from(equipos).where(eq(equipos.departamentoId, d.id));
    const equiposConMiembros = [];

    for (const equipo of eqs) {
      const miembros = await miembrosDelEquipo(equipo.id);
      const [supervisor] = equipo.supervisorId
        ? await db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, equipo.supervisorId))
        : [null];

      equiposConMiembros.push({
        ...equipo,
        supervisor,
        miembros,
      });
    }

    resultado.push({
      ...d,
      equipos: equiposConMiembros,
    });
  }

  return resultado;
}
