"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.esDispositivoConfiable = esDispositivoConfiable;
exports.crearDispositivoConfiable = crearDispositivoConfiable;
exports.revocarDispositivos = revocarDispositivos;
exports.generarCodigosRecuperacion = generarCodigosRecuperacion;
exports.usarCodigoRecuperacion = usarCodigoRecuperacion;
exports.obtenerPinStatus = obtenerPinStatus;
exports.verificarPin = verificarPin;
exports.configurarPin = configurarPin;
exports.cambiarPin = cambiarPin;
exports.desactivarPin = desactivarPin;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
// ─── Helpers ──────────────────────────────────────────────────
const ahora = () => new Date().toISOString();
/** PINs demasiado simples (secuencias, repeticiones) */
const PINES_PROHIBIDOS = new Set([
    "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
    "1234", "2345", "3456", "4567", "5678", "6789", "7890",
    "4321", "5432", "6543", "7654", "8765", "9876",
    "0123", "0987",
]);
function pinEsValido(pin) {
    if (!/^\d{4,}$/.test(pin) || pin.length < 4)
        return false;
    if (PINES_PROHIBIDOS.has(pin))
        return false;
    // No secuencias repetitivas (ej: 1212, 6969)
    if (pin[0] === pin[2] && pin[1] === pin[3] && pin[0] !== pin[1])
        return false;
    return true;
}
async function registrarEvento(usuarioId, tipo, req, meta) {
    await client_1.db.insert(schema_1.eventosSeguridad).values({
        id: crypto_1.default.randomUUID(),
        usuarioId,
        tipoEvento: tipo,
        ip: req?.ip ?? req?.socket?.remoteAddress ?? null,
        userAgent: req?.headers?.["user-agent"] ?? null,
        metadataSegura: meta ?? null,
        creadoEn: ahora(),
    });
}
// ─── Dispositivos confiables ──────────────────────────────────
async function esDispositivoConfiable(usuarioId, deviceToken) {
    if (!deviceToken)
        return false;
    const hash = crypto_1.default.createHash("sha256").update(deviceToken).digest("hex");
    const [d] = await client_1.db
        .select()
        .from(schema_1.dispositivosConfiables)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.dispositivosConfiables.usuarioId, usuarioId), (0, drizzle_orm_1.eq)(schema_1.dispositivosConfiables.tokenHash, hash), (0, drizzle_orm_1.isNull)(schema_1.dispositivosConfiables.revocadoEn), (0, drizzle_orm_1.gt)(schema_1.dispositivosConfiables.expiraEn, ahora())));
    if (d) {
        await client_1.db.update(schema_1.dispositivosConfiables).set({ ultimoUsoEn: ahora() }).where((0, drizzle_orm_1.eq)(schema_1.dispositivosConfiables.id, d.id));
    }
    return !!d;
}
async function crearDispositivoConfiable(usuarioId, req) {
    const token = crypto_1.default.randomBytes(32).toString("hex");
    const hash = crypto_1.default.createHash("sha256").update(token).digest("hex");
    const expira = new Date(Date.now() + 12 * 3600 * 1000).toISOString(); // 12 horas
    await client_1.db.insert(schema_1.dispositivosConfiables).values({
        id: crypto_1.default.randomUUID(),
        usuarioId,
        tokenHash: hash,
        nombreDispositivo: req?.headers?.["user-agent"]?.slice(0, 100) ?? "Desconocido",
        userAgent: req?.headers?.["user-agent"] ?? null,
        ipCreacion: req?.ip ?? null,
        creadoEn: ahora(),
        expiraEn: expira,
    });
    await registrarEvento(usuarioId, "dispositivo_confiable_creado", req);
    return token;
}
async function revocarDispositivos(usuarioId, req) {
    await client_1.db
        .update(schema_1.dispositivosConfiables)
        .set({ revocadoEn: ahora() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.dispositivosConfiables.usuarioId, usuarioId), (0, drizzle_orm_1.isNull)(schema_1.dispositivosConfiables.revocadoEn)));
    await registrarEvento(usuarioId, "dispositivos_revocados", req);
}
// ─── Códigos de recuperación ──────────────────────────────────
async function generarCodigosRecuperacion(usuarioId) {
    // Invalidar códigos anteriores
    await client_1.db
        .update(schema_1.codigosRecuperacion)
        .set({ revocadoEn: ahora() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.codigosRecuperacion.usuarioId, usuarioId), (0, drizzle_orm_1.isNull)(schema_1.codigosRecuperacion.revocadoEn), (0, drizzle_orm_1.isNull)(schema_1.codigosRecuperacion.usadoEn)));
    const codigos = [];
    for (let i = 0; i < 8; i++) {
        const codigo = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("");
        const hash = await bcryptjs_1.default.hash(codigo, 10);
        await client_1.db.insert(schema_1.codigosRecuperacion).values({
            id: crypto_1.default.randomUUID(),
            usuarioId,
            codigoHash: hash,
            creadoEn: ahora(),
        });
        codigos.push(codigo);
    }
    return codigos;
}
async function usarCodigoRecuperacion(usuarioId, codigo, req) {
    const disponibles = await client_1.db
        .select()
        .from(schema_1.codigosRecuperacion)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.codigosRecuperacion.usuarioId, usuarioId), (0, drizzle_orm_1.isNull)(schema_1.codigosRecuperacion.usadoEn), (0, drizzle_orm_1.isNull)(schema_1.codigosRecuperacion.revocadoEn)));
    for (const c of disponibles) {
        const valido = await bcryptjs_1.default.compare(codigo, c.codigoHash);
        if (valido) {
            await client_1.db.update(schema_1.codigosRecuperacion).set({ usadoEn: ahora() }).where((0, drizzle_orm_1.eq)(schema_1.codigosRecuperacion.id, c.id));
            await registrarEvento(usuarioId, "codigo_recuperacion_usado", req);
            return true;
        }
    }
    return false;
}
async function obtenerPinStatus(usuarioId) {
    const [u] = await client_1.db.select({
        pinHabilitado: schema_1.usuarios.pinHabilitado,
        pinIntentosFallidos: schema_1.usuarios.pinIntentosFallidos,
        pinBloqueadoHasta: schema_1.usuarios.pinBloqueadoHasta,
        ultimoAccesoPin: schema_1.usuarios.ultimoAccesoPin,
        pinActualizadoEn: schema_1.usuarios.pinActualizadoEn,
    }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    if (!u)
        throw new Error("Usuario no encontrado");
    return {
        habilitado: u.pinHabilitado ?? false,
        intentosFallidos: u.pinIntentosFallidos ?? 0,
        bloqueadoHasta: u.pinBloqueadoHasta ?? null,
        ultimoAcceso: u.ultimoAccesoPin ?? null,
        ultimoCambio: u.pinActualizadoEn ?? null,
        tieneDispositivoConfiable: false,
    };
}
async function verificarPin(usuarioId, pin, req) {
    const [u] = await client_1.db.select({
        pinHash: schema_1.usuarios.pinHash,
        pinHabilitado: schema_1.usuarios.pinHabilitado,
        pinIntentosFallidos: schema_1.usuarios.pinIntentosFallidos,
        pinBloqueadoHasta: schema_1.usuarios.pinBloqueadoHasta,
    }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    if (!u?.pinHabilitado || !u.pinHash) {
        return { ok: true, bloqueado: false }; // PIN no requerido
    }
    // Verificar bloqueo
    if (u.pinBloqueadoHasta && u.pinBloqueadoHasta > ahora()) {
        return { ok: false, bloqueado: true };
    }
    const valido = await bcryptjs_1.default.compare(pin, u.pinHash);
    if (valido) {
        // Resetear intentos
        await client_1.db.update(schema_1.usuarios).set({
            pinIntentosFallidos: 0,
            pinBloqueadoHasta: null,
            ultimoAccesoPin: ahora(),
        }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
        await registrarEvento(usuarioId, "pin_verificacion_exitosa", req);
        return { ok: true, bloqueado: false };
    }
    // Incrementar intentos fallidos
    const intentos = (u.pinIntentosFallidos ?? 0) + 1;
    const bloqueoMinutos = intentos >= 5 ? 15 : 0;
    const bloqueadoHasta = bloqueoMinutos > 0
        ? new Date(Date.now() + bloqueoMinutos * 60 * 1000).toISOString()
        : null;
    await client_1.db.update(schema_1.usuarios).set({
        pinIntentosFallidos: intentos,
        pinBloqueadoHasta: bloqueadoHasta,
    }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    await registrarEvento(usuarioId, intentos >= 5 ? "pin_bloqueo_temporal" : "pin_verificacion_fallida", req, JSON.stringify({ intento: intentos, bloqueado: intentos >= 5 }));
    return { ok: false, bloqueado: intentos >= 5 };
}
async function configurarPin(usuarioId, pin, passwordActual, req) {
    const [u] = await client_1.db.select({ passwordHash: schema_1.usuarios.passwordHash, pinHash: schema_1.usuarios.pinHash, pinHabilitado: schema_1.usuarios.pinHabilitado })
        .from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    if (!u)
        throw new Error("Usuario no encontrado");
    // Verificar contraseña actual
    const passValida = await bcryptjs_1.default.compare(passwordActual, u.passwordHash);
    if (!passValida)
        throw new Error("Contraseña actual incorrecta");
    if (!pinEsValido(pin))
        throw new Error("El PIN no es válido. Usa al menos 4 dígitos y evita secuencias simples.");
    const hash = await bcryptjs_1.default.hash(pin, 10);
    await client_1.db.update(schema_1.usuarios).set({
        pinHash: hash,
        pinHabilitado: true,
        pinActualizadoEn: ahora(),
        pinIntentosFallidos: 0,
        pinBloqueadoHasta: null,
    }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    // Invalidar dispositivos y generar códigos de recuperación
    await revocarDispositivos(usuarioId, req);
    await generarCodigosRecuperacion(usuarioId);
    await registrarEvento(usuarioId, u.pinHabilitado ? "pin_cambiado" : "pin_activado", req);
}
async function cambiarPin(usuarioId, pinActual, pinNuevo, req) {
    const [u] = await client_1.db.select({ pinHash: schema_1.usuarios.pinHash, pinHabilitado: schema_1.usuarios.pinHabilitado })
        .from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    if (!u?.pinHabilitado || !u.pinHash)
        throw new Error("El PIN no está habilitado");
    const valido = await bcryptjs_1.default.compare(pinActual, u.pinHash);
    if (!valido)
        throw new Error("PIN actual incorrecto");
    if (!pinEsValido(pinNuevo))
        throw new Error("El nuevo PIN no es válido.");
    const hash = await bcryptjs_1.default.hash(pinNuevo, 10);
    await client_1.db.update(schema_1.usuarios).set({
        pinHash: hash,
        pinActualizadoEn: ahora(),
    }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    await revocarDispositivos(usuarioId, req);
    await registrarEvento(usuarioId, "pin_cambiado", req);
}
async function desactivarPin(usuarioId, pinActual, passwordActual, req) {
    const [u] = await client_1.db.select({ passwordHash: schema_1.usuarios.passwordHash, pinHash: schema_1.usuarios.pinHash, pinHabilitado: schema_1.usuarios.pinHabilitado })
        .from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    if (!u)
        throw new Error("Usuario no encontrado");
    const passValida = await bcryptjs_1.default.compare(passwordActual, u.passwordHash);
    if (!passValida)
        throw new Error("Contraseña actual incorrecta");
    const pinValido = await bcryptjs_1.default.compare(pinActual, u.pinHash);
    if (!pinValido)
        throw new Error("PIN actual incorrecto");
    await client_1.db.update(schema_1.usuarios).set({
        pinHash: null,
        pinHabilitado: false,
        pinActualizadoEn: null,
        pinIntentosFallidos: 0,
        pinBloqueadoHasta: null,
    }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    // Invalidar todo
    await revocarDispositivos(usuarioId, req);
    await client_1.db.update(schema_1.codigosRecuperacion).set({ revocadoEn: ahora() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.codigosRecuperacion.usuarioId, usuarioId), (0, drizzle_orm_1.isNull)(schema_1.codigosRecuperacion.revocadoEn)));
    await registrarEvento(usuarioId, "pin_desactivado", req);
}
