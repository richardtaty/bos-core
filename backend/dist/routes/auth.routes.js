"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const zod_1 = require("zod");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const pin_service_1 = require("../services/pin.service");
exports.authRouter = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
// ─── Login ────────────────────────────────────────────────────
exports.authRouter.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const [usuario] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, parsed.data.email));
    if (!usuario || !usuario.activo) {
        res.status(401).json({ error: "Credenciales inválidas" });
        return;
    }
    const valido = await bcryptjs_1.default.compare(parsed.data.password, usuario.passwordHash);
    if (!valido) {
        res.status(401).json({ error: "Credenciales inválidas" });
        return;
    }
    // Cargar departamentos (M:N)
    const deptos = await client_1.db
        .select({ departamentoId: schema_1.usuarioDepartamentos.departamentoId })
        .from(schema_1.usuarioDepartamentos)
        .where((0, drizzle_orm_1.eq)(schema_1.usuarioDepartamentos.usuarioId, usuario.id));
    const departamentoIds = deptos.map((d) => d.departamentoId);
    const departamentoId = departamentoIds[0] ?? usuario.departamentoId ?? null;
    const usuarioRes = {
        id: usuario.id, nombre: usuario.nombre, rol: usuario.rol,
        departamentoId, departamentoIds,
    };
    // ── SUPER_ADMIN con PIN habilitado → token temporal ──
    if (usuario.rol === "SUPER_ADMIN" && usuario.pinHabilitado) {
        // Verificar si hay dispositivo confiable
        const deviceToken = req.body.deviceToken;
        if (deviceToken && await (0, pin_service_1.esDispositivoConfiable)(usuario.id, deviceToken)) {
            // Dispositivo confiable → acceso completo sin PIN
            const token = (0, auth_1.firmarToken)({ ...usuarioRes, pin_verified: true });
            res.json({ token, usuario: usuarioRes, dispositivoConfiable: true });
            return;
        }
        // Token temporal (5 min, solo para verificar PIN)
        const tempToken = (0, auth_1.firmarToken)({ ...usuarioRes, temp: true, pin_pending: true }, "5m");
        res.json({
            tempToken,
            requierePin: true,
            usuario: usuarioRes,
        });
        return;
    }
    // ── Acceso normal (no SUPER_ADMIN o PIN no habilitado) ──
    const token = (0, auth_1.firmarToken)({ ...usuarioRes, pin_verified: false });
    res.json({ token, usuario: usuarioRes });
});
// ─── Verificar PIN ─────────────────────────────────────────────
const pinSchema = zod_1.z.object({ pin: zod_1.z.string().min(4).max(20) });
exports.authRouter.post("/pin/verify", auth_1.requireAuth, async (req, res) => {
    const user = req.user;
    // Solo tokens temporales (pin_pending) pueden verificar
    if (!user.pin_pending) {
        res.status(400).json({ error: "No se requiere verificación de PIN" });
        return;
    }
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "PIN inválido" });
        return;
    }
    const result = await (0, pin_service_1.verificarPin)(user.id, parsed.data.pin, req);
    if (result.bloqueado) {
        res.status(429).json({ error: "Demasiados intentos. Espera 15 minutos e intenta de nuevo." });
        return;
    }
    if (!result.ok) {
        res.status(401).json({ error: "PIN incorrecto" });
        return;
    }
    // PIN correcto → generar token completo
    const deptos = await client_1.db
        .select({ departamentoId: schema_1.usuarioDepartamentos.departamentoId })
        .from(schema_1.usuarioDepartamentos)
        .where((0, drizzle_orm_1.eq)(schema_1.usuarioDepartamentos.usuarioId, user.id));
    const departamentoIds = deptos.map((d) => d.departamentoId);
    const token = (0, auth_1.firmarToken)({
        id: user.id, rol: user.rol, nombre: user.nombre,
        departamentoId: user.departamentoId,
        departamentoIds: departamentoIds.length > 0 ? departamentoIds : user.departamentoIds,
        pin_verified: true,
    });
    // Crear dispositivo confiable si se pidió
    let deviceToken = null;
    if (req.body.confiarDispositivo) {
        deviceToken = await (0, pin_service_1.crearDispositivoConfiable)(user.id, req);
    }
    res.json({
        token,
        usuario: {
            id: user.id, nombre: user.nombre, rol: user.rol,
            departamentoId: user.departamentoId,
            departamentoIds: departamentoIds.length > 0 ? departamentoIds : user.departamentoIds,
        },
        deviceToken,
    });
});
// ─── Estado del PIN ────────────────────────────────────────────
exports.authRouter.get("/pin/status", auth_1.requireAuth, async (req, res) => {
    // Solo SUPER_ADMIN puede ver su estado de PIN
    if (req.user.rol !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Solo SUPER_ADMIN puede gestionar el PIN" });
        return;
    }
    const status = await (0, pin_service_1.obtenerPinStatus)(req.user.id);
    // Verificar dispositivo confiable
    const deviceToken = req.cookies?.bos_device;
    status.tieneDispositivoConfiable = deviceToken
        ? await (0, pin_service_1.esDispositivoConfiable)(req.user.id, deviceToken)
        : false;
    res.json(status);
});
// ─── Configurar PIN ────────────────────────────────────────────
const setupPinSchema = zod_1.z.object({
    pin: zod_1.z.string().min(4).max(20),
    passwordActual: zod_1.z.string().min(1),
});
exports.authRouter.post("/pin/setup", auth_1.requireAuth, async (req, res) => {
    if (req.user.rol !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Solo SUPER_ADMIN puede configurar el PIN" });
        return;
    }
    const parsed = setupPinSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        await (0, pin_service_1.configurarPin)(req.user.id, parsed.data.pin, parsed.data.passwordActual, req);
        const codigos = await (0, pin_service_1.generarCodigosRecuperacion)(req.user.id);
        res.json({ ok: true, codigosRecuperacion: codigos });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// ─── Cambiar PIN ───────────────────────────────────────────────
const changePinSchema = zod_1.z.object({
    pinActual: zod_1.z.string().min(4).max(20),
    pinNuevo: zod_1.z.string().min(4).max(20),
});
exports.authRouter.put("/pin/change", auth_1.requireAuth, async (req, res) => {
    if (req.user.rol !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Solo SUPER_ADMIN puede cambiar el PIN" });
        return;
    }
    const parsed = changePinSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        await (0, pin_service_1.cambiarPin)(req.user.id, parsed.data.pinActual, parsed.data.pinNuevo, req);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// ─── Desactivar PIN ────────────────────────────────────────────
const disablePinSchema = zod_1.z.object({
    pinActual: zod_1.z.string().min(4).max(20),
    passwordActual: zod_1.z.string().min(1),
});
exports.authRouter.delete("/pin/disable", auth_1.requireAuth, async (req, res) => {
    if (req.user.rol !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Solo SUPER_ADMIN puede desactivar el PIN" });
        return;
    }
    const parsed = disablePinSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        await (0, pin_service_1.desactivarPin)(req.user.id, parsed.data.pinActual, parsed.data.passwordActual, req);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// ─── Recuperación con código ───────────────────────────────────
const recoverySchema = zod_1.z.object({
    codigo: zod_1.z.string().min(1),
});
exports.authRouter.post("/pin/recovery", auth_1.requireAuth, async (req, res) => {
    const user = req.user;
    if (!user.pin_pending) {
        res.status(400).json({ error: "No se requiere recuperación" });
        return;
    }
    const parsed = recoverySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Código inválido" });
        return;
    }
    const ok = await (0, pin_service_1.usarCodigoRecuperacion)(user.id, parsed.data.codigo, req);
    if (!ok) {
        res.status(401).json({ error: "Código de recuperación inválido o ya utilizado" });
        return;
    }
    // Desbloquear y generar token completo
    await client_1.db.update(schema_1.usuarios).set({
        pinIntentosFallidos: 0,
        pinBloqueadoHasta: null,
        ultimoAccesoPin: new Date().toISOString(),
    }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, user.id));
    const deptos = await client_1.db
        .select({ departamentoId: schema_1.usuarioDepartamentos.departamentoId })
        .from(schema_1.usuarioDepartamentos)
        .where((0, drizzle_orm_1.eq)(schema_1.usuarioDepartamentos.usuarioId, user.id));
    const departamentoIds = deptos.map((d) => d.departamentoId);
    const token = (0, auth_1.firmarToken)({
        id: user.id, rol: user.rol, nombre: user.nombre,
        departamentoId: user.departamentoId,
        departamentoIds: departamentoIds.length > 0 ? departamentoIds : user.departamentoIds,
        pin_verified: true,
    });
    res.json({ token, usuario: { id: user.id, nombre: user.nombre, rol: user.rol, departamentoId: user.departamentoId, departamentoIds } });
});
// ─── Regenerar códigos de recuperación ─────────────────────────
exports.authRouter.post("/pin/recovery-codes/regenerate", auth_1.requireAuth, async (req, res) => {
    if (req.user.rol !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Solo SUPER_ADMIN" });
        return;
    }
    const codigos = await (0, pin_service_1.generarCodigosRecuperacion)(req.user.id);
    res.json({ codigosRecuperacion: codigos });
});
// ─── Cerrar todas las sesiones ─────────────────────────────────
exports.authRouter.delete("/security/sessions", auth_1.requireAuth, async (req, res) => {
    if (req.user.rol !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Solo SUPER_ADMIN" });
        return;
    }
    await (0, pin_service_1.revocarDispositivos)(req.user.id, req);
    res.json({ ok: true });
});
