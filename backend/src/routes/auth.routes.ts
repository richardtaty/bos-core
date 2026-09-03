import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { usuarios, usuarioDepartamentos } from "../db/schema";
import { firmarToken, requireAuth } from "../middleware/auth";
import {
  obtenerPinStatus, verificarPin, configurarPin, cambiarPin, desactivarPin,
  esDispositivoConfiable, crearDispositivoConfiable, revocarDispositivos,
  generarCodigosRecuperacion, usarCodigoRecuperacion,
} from "../services/pin.service";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// ─── Login ────────────────────────────────────────────────────

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, parsed.data.email));
  if (!usuario || !usuario.activo) { res.status(401).json({ error: "Credenciales inválidas" }); return; }

  const valido = await bcrypt.compare(parsed.data.password, usuario.passwordHash);
  if (!valido) { res.status(401).json({ error: "Credenciales inválidas" }); return; }

  // Cargar departamentos (M:N)
  const deptos = await db
    .select({ departamentoId: usuarioDepartamentos.departamentoId })
    .from(usuarioDepartamentos)
    .where(eq(usuarioDepartamentos.usuarioId, usuario.id));
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
    if (deviceToken && await esDispositivoConfiable(usuario.id, deviceToken)) {
      // Dispositivo confiable → acceso completo sin PIN
      const token = firmarToken({ ...usuarioRes, pin_verified: true });
      res.json({ token, usuario: usuarioRes, dispositivoConfiable: true });
      return;
    }

    // Token temporal (5 min, solo para verificar PIN)
    const tempToken = firmarToken({ ...usuarioRes, temp: true, pin_pending: true }, "5m");
    res.json({
      tempToken,
      requierePin: true,
      usuario: usuarioRes,
    });
    return;
  }

  // ── Acceso normal (no SUPER_ADMIN o PIN no habilitado) ──
  const token = firmarToken({ ...usuarioRes, pin_verified: false });
  res.json({ token, usuario: usuarioRes });
});

// ─── Verificar PIN ─────────────────────────────────────────────

const pinSchema = z.object({ pin: z.string().min(4).max(20) });

authRouter.post("/pin/verify", requireAuth, async (req, res) => {
  const user = req.user!;

  // Solo tokens temporales (pin_pending) pueden verificar
  if (!(user as any).pin_pending) {
    res.status(400).json({ error: "No se requiere verificación de PIN" });
    return;
  }

  const parsed = pinSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "PIN inválido" }); return; }

  const result = await verificarPin(user.id, parsed.data.pin, req);
  if (result.bloqueado) {
    res.status(429).json({ error: "Demasiados intentos. Espera 15 minutos e intenta de nuevo." });
    return;
  }
  if (!result.ok) {
    res.status(401).json({ error: "PIN incorrecto" });
    return;
  }

  // PIN correcto → generar token completo
  const deptos = await db
    .select({ departamentoId: usuarioDepartamentos.departamentoId })
    .from(usuarioDepartamentos)
    .where(eq(usuarioDepartamentos.usuarioId, user.id));
  const departamentoIds = deptos.map((d) => d.departamentoId);

  const token = firmarToken({
    id: user.id, rol: user.rol, nombre: user.nombre,
    departamentoId: user.departamentoId,
    departamentoIds: departamentoIds.length > 0 ? departamentoIds : (user as any).departamentoIds,
    pin_verified: true,
  });

  // Crear dispositivo confiable si se pidió
  let deviceToken: string | null = null;
  if (req.body.confiarDispositivo) {
    deviceToken = await crearDispositivoConfiable(user.id, req);
  }

  res.json({
    token,
    usuario: {
      id: user.id, nombre: user.nombre, rol: user.rol,
      departamentoId: user.departamentoId,
      departamentoIds: departamentoIds.length > 0 ? departamentoIds : (user as any).departamentoIds,
    },
    deviceToken,
  });
});

// ─── Estado del PIN ────────────────────────────────────────────

authRouter.get("/pin/status", requireAuth, async (req, res) => {
  // Solo SUPER_ADMIN puede ver su estado de PIN
  if (req.user!.rol !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Solo SUPER_ADMIN puede gestionar el PIN" });
    return;
  }
  const status = await obtenerPinStatus(req.user!.id);
  // Verificar dispositivo confiable
  const deviceToken = req.cookies?.bos_device;
  status.tieneDispositivoConfiable = deviceToken
    ? await esDispositivoConfiable(req.user!.id, deviceToken)
    : false;
  res.json(status);
});

// ─── Configurar PIN ────────────────────────────────────────────

const setupPinSchema = z.object({
  pin: z.string().min(4).max(20),
  passwordActual: z.string().min(1),
});

authRouter.post("/pin/setup", requireAuth, async (req, res) => {
  if (req.user!.rol !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Solo SUPER_ADMIN puede configurar el PIN" });
    return;
  }
  const parsed = setupPinSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  try {
    await configurarPin(req.user!.id, parsed.data.pin, parsed.data.passwordActual, req);
    const codigos = await generarCodigosRecuperacion(req.user!.id);
    res.json({ ok: true, codigosRecuperacion: codigos });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ─── Cambiar PIN ───────────────────────────────────────────────

const changePinSchema = z.object({
  pinActual: z.string().min(4).max(20),
  pinNuevo: z.string().min(4).max(20),
});

authRouter.put("/pin/change", requireAuth, async (req, res) => {
  if (req.user!.rol !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Solo SUPER_ADMIN puede cambiar el PIN" });
    return;
  }
  const parsed = changePinSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  try {
    await cambiarPin(req.user!.id, parsed.data.pinActual, parsed.data.pinNuevo, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ─── Desactivar PIN ────────────────────────────────────────────

const disablePinSchema = z.object({
  pinActual: z.string().min(4).max(20),
  passwordActual: z.string().min(1),
});

authRouter.delete("/pin/disable", requireAuth, async (req, res) => {
  if (req.user!.rol !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Solo SUPER_ADMIN puede desactivar el PIN" });
    return;
  }
  const parsed = disablePinSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  try {
    await desactivarPin(req.user!.id, parsed.data.pinActual, parsed.data.passwordActual, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ─── Recuperación con código ───────────────────────────────────

const recoverySchema = z.object({
  codigo: z.string().min(1),
});

authRouter.post("/pin/recovery", requireAuth, async (req, res) => {
  const user = req.user!;
  if (!(user as any).pin_pending) {
    res.status(400).json({ error: "No se requiere recuperación" });
    return;
  }
  const parsed = recoverySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Código inválido" }); return; }

  const ok = await usarCodigoRecuperacion(user.id, parsed.data.codigo, req);
  if (!ok) { res.status(401).json({ error: "Código de recuperación inválido o ya utilizado" }); return; }

  // Desbloquear y generar token completo
  await db.update(usuarios).set({
    pinIntentosFallidos: 0,
    pinBloqueadoHasta: null,
    ultimoAccesoPin: new Date().toISOString(),
  }).where(eq(usuarios.id, user.id));

  const deptos = await db
    .select({ departamentoId: usuarioDepartamentos.departamentoId })
    .from(usuarioDepartamentos)
    .where(eq(usuarioDepartamentos.usuarioId, user.id));
  const departamentoIds = deptos.map((d) => d.departamentoId);

  const token = firmarToken({
    id: user.id, rol: user.rol, nombre: user.nombre,
    departamentoId: user.departamentoId,
    departamentoIds: departamentoIds.length > 0 ? departamentoIds : (user as any).departamentoIds,
    pin_verified: true,
  });

  res.json({ token, usuario: { id: user.id, nombre: user.nombre, rol: user.rol, departamentoId: user.departamentoId, departamentoIds } });
});

// ─── Regenerar códigos de recuperación ─────────────────────────

authRouter.post("/pin/recovery-codes/regenerate", requireAuth, async (req, res) => {
  if (req.user!.rol !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Solo SUPER_ADMIN" });
    return;
  }
  const codigos = await generarCodigosRecuperacion(req.user!.id);
  res.json({ codigosRecuperacion: codigos });
});

// ─── Cerrar todas las sesiones ─────────────────────────────────

authRouter.delete("/security/sessions", requireAuth, async (req, res) => {
  if (req.user!.rol !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Solo SUPER_ADMIN" });
    return;
  }
  await revocarDispositivos(req.user!.id, req);
  res.json({ ok: true });
});
