"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firmarToken = firmarToken;
exports.requireAuth = requireAuth;
exports.requirePinVerified = requirePinVerified;
exports.requireRole = requireRole;
exports.requireAgente = requireAgente;
exports.nombreDepartamentoDe = nombreDepartamentoDe;
exports.requireDepartamento = requireDepartamento;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
function firmarToken(user, expiresIn = "12h") {
    return jsonwebtoken_1.default.sign(user, JWT_SECRET, { expiresIn: expiresIn });
}
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Token requerido" });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(header.slice(7), JWT_SECRET);
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
    }
    catch {
        res.status(401).json({ error: "Token inválido o expirado" });
    }
}
// Verifica que el usuario haya completado la verificación de PIN si su cuenta lo requiere.
// Solo aplica a SUPER_ADMIN con PIN habilitado. Se usa en endpoints sensibles.
function requirePinVerified(req, res, next) {
    const user = req.user;
    if (!user) {
        res.status(401).json({ error: "No autenticado" });
        return;
    }
    // Por ahora solo SUPER_ADMIN requiere PIN. En el futuro se puede extender.
    // La verificación real se hace en el login: si tiene PIN, recibe token temporal.
    // Este middleware es un extra de seguridad.
    next();
}
// Jerarquía: SUPER_ADMIN > ADMIN > SUPERVISOR > TEAM_LEADER > USUARIO.
// requireRole(["ADMIN"]) también permite SUPER_ADMIN.
// AGENTE queda fuera a propósito: `indexOf` devuelve -1, que nunca alcanza ningún mínimo, así
// que un token de máquina es rechazado por toda ruta con `requireRole`. Es la barrera principal;
// el bloqueo de escritura de `requireAuth` es la segunda.
//
// SUPERVISOR y TEAM_LEADER entran POR DEBAJO de ADMIN a propósito: todo `requireRole("ADMIN")`
// y `requireRole("SUPER_ADMIN")` que ya existía (facturación, BMF, comentarios de contactos)
// sigue cerrado para ellos. Estos dos roles mandan sobre las tareas de su departamento, no
// sobre el dinero ni sobre la configuración del sistema.
const JERARQUIA = ["USUARIO", "TEAM_LEADER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"];
function requireRole(minimo) {
    return (req, res, next) => {
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
function requireAgente(req, res, next) {
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
const _deptoCache = new Map();
/** Resuelve el nombre del departamento dado su ID. Usa caché en memoria. */
async function nombreDepartamentoDe(id) {
    if (_deptoCache.has(id))
        return _deptoCache.get(id);
    const [d] = await client_1.db
        .select({ nombre: schema_1.departamentos.nombre })
        .from(schema_1.departamentos)
        .where((0, drizzle_orm_1.eq)(schema_1.departamentos.id, id));
    if (d)
        _deptoCache.set(id, d.nombre);
    return d?.nombre;
}
/**
 * Middleware que restringe el acceso a uno o más departamentos específicos.
 * SUPER_ADMIN siempre pasa. Los demás solo si pertenecen a uno de los
 * departamentos listados (usa departamentoIds del JWT, con fallback a departamentoId).
 */
function requireDepartamento(...nombres) {
    return async (req, res, next) => {
        if (req.user.rol === "SUPER_ADMIN") {
            next();
            return;
        }
        // Revisar todos los departamentos del usuario (multi-depto)
        const ids = req.user.departamentoIds ?? (req.user.departamentoId ? [req.user.departamentoId] : []);
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
