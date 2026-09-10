import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { departamentos, empleados, usuarioDepartamentos, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

// ─── Recursos Humanos → Personal ────────────────────────────────
//
// La plantilla NO es una segunda base de personas: es la vista laboral de las personas que
// ya existen en `usuarios`. Por eso aquí nunca se inserta en `usuarios` (eso es "Mi Equipo"
// / usuarios.service.ts, el flujo oficial de altas) y nunca se duplica a nadie. Toda
// relación va por ID: `empleados.user_id` → `usuarios.id`.
//
// Separación deliberada (alcance, puntos 12/13/24):
//   · `usuarios`              → persona + acceso al CRM (rol, contraseña, activo, PIN).
//   · `empleados`             → SOLO lo laboral (estado laboral, notas internas).
//   · `usuarios.cargo`        → cargo/puesto. Ya existía en el CRM y ya lo usan "Mi Equipo",
//                               reportes y organigrama: se REUTILIZA. Es dato laboral, no
//                               de acceso — por eso sí se edita desde RRHH.
//   · `usuario_departamentos` → departamento/área. Ya existía: se REUTILIZA (nunca se
//                               guarda el nombre del departamento como texto).
//
// Editar aquí NUNCA toca login, contraseña, rol, permisos ni autenticación.

export type EstadoLaboral = "ACTIVO" | "INACTIVO";

/** Una persona de la plantilla, tal como la ve Recursos Humanos. */
export interface PersonalDTO {
  /** ID real de la persona en `usuarios`. Es la llave de todo el sistema. */
  userId: string;
  /** ID del perfil laboral, o null si aún no se ha editado (se crea al primer guardado). */
  empleadoId: string | null;
  nombre: string;
  email: string;
  /** Cargo/puesto (usuarios.cargo). Distinto del rol de permisos del CRM. */
  cargo: string | null;
  /** Estado LABORAL. Independiente de `accesoActivo`. */
  estadoLaboral: EstadoLaboral;
  /** Notas internas de RRHH. Dato privado: solo sale por /api/rrhh. */
  notas: string | null;
  /** Departamentos/unidades reales de la persona (M:N, con fallback a la columna legacy). */
  departamentos: { id: string; nombre: string }[];
  supervisorId: string | null;
  supervisorNombre: string | null;
  /**
   * ¿Su cuenta del CRM está habilitada? Es información DISTINTA del estado laboral: alguien
   * de baja puede seguir con acceso, y alguien sin acceso puede seguir activo laboralmente.
   * Se expone solo como aviso en la ficha — nunca se sincroniza automáticamente con él.
   */
  accesoActivo: boolean;
}

/** El rol de máquina (Hermes Agent) no es una persona: nunca aparece en la plantilla. */
const ROL_MAQUINA = "AGENTE";

export class PersonalNoEncontradoError extends Error {}

/**
 * Toda la plantilla, activos primero y luego alfabético. Incluye a quien todavía no tiene
 * perfil laboral: se muestra con los datos reales de `usuarios` y estado ACTIVO por
 * defecto, así nadie tiene que "volver a crear" a los que ya existen uno por uno.
 */
export async function listarPersonal(): Promise<PersonalDTO[]> {
  const filasUsuarios = await db.select().from(usuarios);
  const filasEmpleados = await db.select().from(empleados);
  const filasDeptos = await db.select().from(usuarioDepartamentos);
  const filasNombreDepto = await db.select().from(departamentos);

  const personas = filasUsuarios.filter((u) => u.rol !== ROL_MAQUINA);

  const nombreDeptoPorId = new Map(filasNombreDepto.map((d) => [d.id, d.nombre]));
  const deptosPorUsuario = new Map<string, string[]>();
  for (const fila of filasDeptos) {
    const arr = deptosPorUsuario.get(fila.usuarioId) ?? [];
    arr.push(fila.departamentoId);
    deptosPorUsuario.set(fila.usuarioId, arr);
  }

  const perfilPorUsuario = new Map(filasEmpleados.map((e) => [e.userId, e]));
  const nombrePorId = new Map(personas.map((u) => [u.id, u.nombre]));

  const dto = personas.map((u) => {
    const perfil = perfilPorUsuario.get(u.id);
    const idsDeptos = deptosPorUsuario.get(u.id) ?? (u.departamentoId ? [u.departamentoId] : []);
    return {
      userId: u.id,
      empleadoId: perfil?.id ?? null,
      nombre: u.nombre,
      email: u.email,
      cargo: u.cargo,
      // Sin perfil laboral el estado por defecto es ACTIVO: no se inventa una baja.
      estadoLaboral: (perfil?.estadoLaboral ?? "ACTIVO") as EstadoLaboral,
      notas: perfil?.notas ?? null,
      departamentos: idsDeptos
        .map((id) => ({ id, nombre: nombreDeptoPorId.get(id) ?? "" }))
        .filter((d) => d.nombre !== ""),
      supervisorId: u.supervisorId,
      supervisorNombre: u.supervisorId ? nombrePorId.get(u.supervisorId) ?? null : null,
      accesoActivo: u.activo,
    } satisfies PersonalDTO;
  });

  // Activos primero (punto 10); dentro de cada grupo, alfabético.
  return dto.sort((a, b) => {
    if (a.estadoLaboral !== b.estadoLaboral) return a.estadoLaboral === "ACTIVO" ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/** La ficha laboral de una persona. Mismo DTO que la lista; null si el ID no existe. */
export async function obtenerPersonal(userId: string): Promise<PersonalDTO | null> {
  const todas = await listarPersonal();
  return todas.find((p) => p.userId === userId) ?? null;
}

export interface ActualizarPerfilLaboralInput {
  /** Solo se escribe si viene la llave; `""` la deja vacía y `null` la borra. */
  cargo?: string | null;
  estadoLaboral?: EstadoLaboral;
  notas?: string | null;
}

/**
 * Guarda datos LABORALES de una persona que ya existe. Crea el perfil laboral la primera
 * vez (upsert) — nunca crea a la persona. Devuelve la ficha ya actualizada.
 *
 * Lo que NO hace, por diseño: no cambia rol, contraseña, activo, PIN ni departamentos.
 * Dar de baja laboral a alguien no le quita el acceso al CRM, y desactivarle el acceso no
 * lo da de baja: son dos cosas distintas y se administran por separado.
 */
export async function actualizarPerfilLaboral(
  userId: string,
  input: ActualizarPerfilLaboralInput,
  autorId: string,
): Promise<PersonalDTO> {
  const [persona] = await db.select().from(usuarios).where(eq(usuarios.id, userId));
  if (!persona || persona.rol === ROL_MAQUINA) {
    throw new PersonalNoEncontradoError("Persona no encontrada en la plantilla.");
  }

  const cambios: string[] = [];

  // ── Cargo: campo laboral que YA existe en usuarios.cargo (no se duplica en `empleados`).
  if (input.cargo !== undefined) {
    const cargo = input.cargo?.trim() ? input.cargo.trim() : null;
    await db.update(usuarios).set({ cargo }).where(eq(usuarios.id, userId));
    cambios.push(`Cargo: ${cargo ?? "sin cargo"}`);
  }

  // ── Estado laboral y notas: viven en el perfil laboral, aparte del acceso al CRM.
  const tocaPerfil = input.estadoLaboral !== undefined || input.notas !== undefined;
  if (tocaPerfil) {
    const [perfil] = await db.select().from(empleados).where(eq(empleados.userId, userId));
    const ahora = new Date();
    if (perfil) {
      await db
        .update(empleados)
        .set({
          ...(input.estadoLaboral !== undefined ? { estadoLaboral: input.estadoLaboral } : {}),
          ...(input.notas !== undefined ? { notas: input.notas?.trim() ? input.notas.trim() : null } : {}),
          updatedAt: ahora,
        })
        .where(eq(empleados.userId, userId));
    } else {
      await db.insert(empleados).values({
        id: crypto.randomUUID(),
        userId,
        estadoLaboral: input.estadoLaboral ?? "ACTIVO",
        notas: input.notas?.trim() ? input.notas.trim() : null,
        createdAt: ahora,
        updatedAt: ahora,
      });
    }
    if (input.estadoLaboral !== undefined) cambios.push(`Estado laboral: ${input.estadoLaboral}`);
    if (input.notas !== undefined) cambios.push("Notas de RRHH actualizadas");
  }

  if (cambios.length > 0) {
    await registrarAuditoria({
      entidad: "PersonalRRHH",
      entidadId: userId,
      accion: `Perfil laboral actualizado — ${cambios.join("; ")}`,
      autorId,
    });
  }

  const actualizado = await obtenerPersonal(userId);
  if (!actualizado) throw new PersonalNoEncontradoError("Persona no encontrada en la plantilla.");
  return actualizado;
}
