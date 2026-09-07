import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { departamentos } from "../db/schema";
import { UNIDADES_AUDIENCIA } from "../lib/cumpleanos-config";

// AGENTE es un rol de máquina (Hermes Agent), no de persona. A propósito NO aparece en
// JERARQUIA más abajo: así `requireRole` lo rechaza en todas las rutas normales del sistema y
// el agente solo puede llegar a su propia superficie de lectura (`/api/agente`).
export type Rol = "SUPER_ADMIN" | "ADMIN" | "SUPERVISOR" | "USUARIO" | "AGENTE";

export interface AuthUser {
  id: string;
  rol: Rol;
  nombre: string;
  departamentoId?: string | null;       // legacy, primer departamento
  departamentoIds?: string[];            // todos los departamentos del usuario
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

export function firmarToken(user: AuthUser & { temp?: boolean; pin_pending?: boolean; pin_verified?: boolean }, expiresIn: string | number = "12h" as any): string {
  return jwt.sign(user as any, JWT_SECRET, { expiresIn: expiresIn as any });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as AuthUser & { temp?: boolean; pin_pending?: boolean };
    req.user = payload;

    // Token temporal (PIN pendiente) solo puede acceder a endpoints de verificación
    if (payload.temp && payload.pin_pending) {
      const path = req.path;
      const esEndpointPin = path === "/pin/verify" || path === "/pin/recovery";
      if (!esEndpointPin) {
        res.status(403).json({ error: "Verificación de PIN requerida para acceder a este recurso." });
        return;
      }
    }

    // Un token de máquina (Hermes Agent) es de solo lectura. El corte va aquí y no como
    // middleware global en index.ts: cada router monta `requireAuth` por su cuenta, así que un
    // middleware global correría antes de descifrar el token y vería `req.user` vacío.
    // Aquí el rol ya está disponible y el bloqueo cubre toda ruta autenticada.
    if (payload.rol === "AGENTE" && req.method !== "GET") {
      res.status(403).json({ error: "La credencial de agente es de solo lectura." });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

// Verifica que el usuario haya completado la verificación de PIN si su cuenta lo requiere.
// Solo aplica a SUPER_ADMIN con PIN habilitado. Se usa en endpoints sensibles.
export function requirePinVerified(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as AuthUser & { pin_verified?: boolean };
  if (!user) { res.status(401).json({ error: "No autenticado" }); return; }
  // Por ahora solo SUPER_ADMIN requiere PIN. En el futuro se puede extender.
  // La verificación real se hace en el login: si tiene PIN, recibe token temporal.
  // Este middleware es un extra de seguridad.
  next();
}

// Jerarquía: SUPER_ADMIN > ADMIN > SUPERVISOR > USUARIO.
// requireRole(["ADMIN"]) también permite SUPER_ADMIN.
// AGENTE queda fuera a propósito: `indexOf` devuelve -1, que nunca alcanza ningún mínimo, así
// que un token de máquina es rechazado por toda ruta con `requireRole`. Es la barrera principal;
// el bloqueo de escritura de `requireAuth` es la segunda.
//
// SUPERVISOR entra POR DEBAJO de ADMIN a propósito: todo `requireRole("ADMIN")`
// y `requireRole("SUPER_ADMIN")` que ya existía (facturación, BMF, comentarios de contactos)
// sigue cerrado para él. Este rol manda sobre las tareas de su departamento, no
// sobre el dinero ni sobre la configuración del sistema.
const JERARQUIA: Rol[] = ["USUARIO", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"];

export function requireRole(minimo: Rol) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const nivelUsuario = JERARQUIA.indexOf(req.user.rol);
    const nivelMinimo = JERARQUIA.indexOf(minimo);
    if (nivelUsuario < nivelMinimo) {
      res.status(403).json({ error: `Requiere rol ${minimo} o superior` });
      return;
    }
    next();
  };
}

/**
 * Deja pasar solo al agente de máquina y al Super Admin. Se usa en `/api/agente`, que no puede
 * apoyarse en `requireRole` porque AGENTE está fuera de la jerarquía a propósito.
 * El Super Admin también entra para poder probar los mismos endpoints con su propia sesión.
 */
export function requireAgente(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  if (req.user.rol !== "AGENTE" && req.user.rol !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Requiere credencial de agente" });
    return;
  }
  next();
}

// ─── Aislamiento por unidad de negocio ────────────────────────

// Caché de nombre de departamento → evita consultar la BD en cada request.
const _deptoCache = new Map<string, string>();

/** Resuelve el nombre del departamento dado su ID. Usa caché en memoria. */
export async function nombreDepartamentoDe(id: string): Promise<string | undefined> {
  if (_deptoCache.has(id)) return _deptoCache.get(id);
  const [d] = await db
    .select({ nombre: departamentos.nombre })
    .from(departamentos)
    .where(eq(departamentos.id, id));
  if (d) _deptoCache.set(id, d.nombre);
  return d?.nombre;
}

/**
 * Middleware que restringe el acceso a uno o más departamentos específicos.
 * SUPER_ADMIN siempre pasa. Los demás solo si pertenecen a uno de los
 * departamentos listados (usa departamentoIds del JWT, con fallback a departamentoId).
 */
export function requireDepartamento(...nombres: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.user!.rol === "SUPER_ADMIN") {
      next();
      return;
    }

    // Revisar todos los departamentos del usuario (multi-depto)
    const ids = req.user!.departamentoIds ?? (req.user!.departamentoId ? [req.user!.departamentoId] : []);
    if (ids.length === 0) {
      res.status(403).json({ error: "No tienes un departamento asignado." });
      return;
    }

    // Verificar si al menos uno de los departamentos del usuario coincide
    for (const id of ids) {
      const nombre = await nombreDepartamentoDe(id);
      if (nombre && nombres.includes(nombre)) {
        next();
        return;
      }
    }

    res.status(403).json({ error: "No tienes acceso a este recurso." });
  };
}

// ─── Acceso al módulo 🎂 Próximos cumpleaños ───────────────────
// Regla exacta (matriz de acceso): SUPER_ADMIN ∨ ADMIN ∨ Marketing ∨ Podcast. ADMIN y
// SUPER_ADMIN entran SIEMPRE, aunque su departamento sea Ventas u Operaciones. Marketing
// y Podcast entran por NOMBRE de unidad (como requireDepartamento), resuelto por el caché
// de nombreDepartamentoDe — nunca se hardcodean IDs. El resto del sistema (Ventas,
// Operaciones, BMF, etc.) recibe 403. Frontend y backend aplican la misma regla.

/** ¿Puede este usuario acceder al módulo de cumpleaños? Consulta nombres → es async. */
export async function puedeAccederCumpleanos(user: AuthUser): Promise<boolean> {
  if (user.rol === "SUPER_ADMIN" || user.rol === "ADMIN") return true;
  const ids = user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
  for (const id of ids) {
    const nombre = await nombreDepartamentoDe(id);
    if (nombre && UNIDADES_AUDIENCIA.includes(nombre)) return true;
  }
  return false;
}

/**
 * Middleware que exige acceso al módulo 🎂. Envuelve puedeAccederCumpleanos y responde
 * 403 cuando el usuario no es ADMIN/SUPER_ADMIN ni miembro de Marketing/Podcast.
 */
export async function requireAccesoCumpleanos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const puede = await puedeAccederCumpleanos(req.user);
  if (!puede) {
    res.status(403).json({ error: "No tienes acceso a este recurso." });
    return;
  }
  next();
}

// ─── Autorización fina para la gestión de integrantes ─────────────
// No usa requireRole porque SUPERVISOR gestiona SOLO a su propio
// departamento sin heredar los poderes de ADMIN. Aquí viven las reglas
// anti-escalamiento (un rol nunca administra la cuenta de un rol superior).

/** Roles con gestión global de integrantes (ven y administran a toda la empresa). */
export function esGestionGlobal(rol: Rol): boolean {
  return rol === "SUPER_ADMIN" || rol === "ADMIN";
}

/** Roles que pueden administrar cuentas de otros (globales + supervisor de su área). */
export const ROLES_QUE_ADMINISTRAN: Rol[] = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"];

/**
 * Roles que `actor` puede asignar a otro usuario (al crearlo o al cambiar su rol).
 * SUPER_ADMIN → todos; ADMIN → no crea ni asciende a ADMIN/SUPER_ADMIN; SUPERVISOR
 * solo mueve a los suyos entre USUARIO (nunca crea ni asciende a SUPERVISOR o superior).
 */
export function rolesAsignables(actor: Rol): Rol[] {
  switch (actor) {
    case "SUPER_ADMIN":
      return ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USUARIO"];
    case "ADMIN":
      return ["SUPERVISOR", "USUARIO"];
    case "SUPERVISOR":
      return ["USUARIO"];
    default:
      return [];
  }
}

/**
 * ¿Puede `actor` administrar la cuenta (rol/estado/contraseña) de `objetivo`?
 * La barrera es por jerarquía: un rol nunca administra a uno superior.
 */
export function puedeAdministrarCuenta(actor: Rol, objetivo: Rol): boolean {
  if (actor === "SUPER_ADMIN") return true;
  if (actor === "ADMIN") return objetivo !== "SUPER_ADMIN";
  if (actor === "SUPERVISOR") return objetivo === "USUARIO";
  return false;
}

/** Departamentos del usuario: la M:N, con fallback a la columna legacy. */
export function departamentoIdsDe(user: Pick<AuthUser, "departamentoId" | "departamentoIds">): string[] {
  return user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
}

/** ¿Comparten al menos un departamento? */
export function compartenDepartamento(
  a: Pick<AuthUser, "departamentoId" | "departamentoIds">,
  b: Pick<AuthUser, "departamentoId" | "departamentoIds">,
): boolean {
  const idsA = departamentoIdsDe(a);
  const idsB = departamentoIdsDe(b);
  return idsA.some((id) => idsB.includes(id));
}
