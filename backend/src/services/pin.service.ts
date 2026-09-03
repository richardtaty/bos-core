import bcrypt from "bcryptjs";
import crypto from "crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "../db/client";
import { usuarios, dispositivosConfiables, codigosRecuperacion, eventosSeguridad } from "../db/schema";

// ─── Helpers ──────────────────────────────────────────────────

const ahora = () => new Date().toISOString();

/** PINs demasiado simples (secuencias, repeticiones) */
const PINES_PROHIBIDOS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "7890",
  "4321", "5432", "6543", "7654", "8765", "9876",
  "0123", "0987",
]);

function pinEsValido(pin: string): boolean {
  if (!/^\d{4,}$/.test(pin) || pin.length < 4) return false;
  if (PINES_PROHIBIDOS.has(pin)) return false;
  // No secuencias repetitivas (ej: 1212, 6969)
  if (pin[0] === pin[2] && pin[1] === pin[3] && pin[0] !== pin[1]) return false;
  return true;
}

async function registrarEvento(usuarioId: string, tipo: string, req?: any, meta?: string) {
  await db.insert(eventosSeguridad).values({
    id: crypto.randomUUID(),
    usuarioId,
    tipoEvento: tipo,
    ip: req?.ip ?? req?.socket?.remoteAddress ?? null,
    userAgent: req?.headers?.["user-agent"] ?? null,
    metadataSegura: meta ?? null,
    creadoEn: ahora(),
  });
}

// ─── Dispositivos confiables ──────────────────────────────────

export async function esDispositivoConfiable(usuarioId: string, deviceToken: string): Promise<boolean> {
  if (!deviceToken) return false;
  const hash = crypto.createHash("sha256").update(deviceToken).digest("hex");
  const [d] = await db
    .select()
    .from(dispositivosConfiables)
    .where(
      and(
        eq(dispositivosConfiables.usuarioId, usuarioId),
        eq(dispositivosConfiables.tokenHash, hash),
        isNull(dispositivosConfiables.revocadoEn),
        gt(dispositivosConfiables.expiraEn, ahora()),
      )
    );
  if (d) {
    await db.update(dispositivosConfiables).set({ ultimoUsoEn: ahora() }).where(eq(dispositivosConfiables.id, d.id));
  }
  return !!d;
}

export async function crearDispositivoConfiable(usuarioId: string, req?: any): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const expira = new Date(Date.now() + 12 * 3600 * 1000).toISOString(); // 12 horas
  await db.insert(dispositivosConfiables).values({
    id: crypto.randomUUID(),
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

export async function revocarDispositivos(usuarioId: string, req?: any) {
  await db
    .update(dispositivosConfiables)
    .set({ revocadoEn: ahora() })
    .where(
      and(
        eq(dispositivosConfiables.usuarioId, usuarioId),
        isNull(dispositivosConfiables.revocadoEn),
      )
    );
  await registrarEvento(usuarioId, "dispositivos_revocados", req);
}

// ─── Códigos de recuperación ──────────────────────────────────

export async function generarCodigosRecuperacion(usuarioId: string): Promise<string[]> {
  // Invalidar códigos anteriores
  await db
    .update(codigosRecuperacion)
    .set({ revocadoEn: ahora() })
    .where(
      and(
        eq(codigosRecuperacion.usuarioId, usuarioId),
        isNull(codigosRecuperacion.revocadoEn),
        isNull(codigosRecuperacion.usadoEn),
      )
    );

  const codigos: string[] = [];
  for (let i = 0; i < 8; i++) {
    const codigo = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("");
    const hash = await bcrypt.hash(codigo, 10);
    await db.insert(codigosRecuperacion).values({
      id: crypto.randomUUID(),
      usuarioId,
      codigoHash: hash,
      creadoEn: ahora(),
    });
    codigos.push(codigo);
  }
  return codigos;
}

export async function usarCodigoRecuperacion(usuarioId: string, codigo: string, req?: any): Promise<boolean> {
  const disponibles = await db
    .select()
    .from(codigosRecuperacion)
    .where(
      and(
        eq(codigosRecuperacion.usuarioId, usuarioId),
        isNull(codigosRecuperacion.usadoEn),
        isNull(codigosRecuperacion.revocadoEn),
      )
    );

  for (const c of disponibles) {
    const valido = await bcrypt.compare(codigo, c.codigoHash);
    if (valido) {
      await db.update(codigosRecuperacion).set({ usadoEn: ahora() }).where(eq(codigosRecuperacion.id, c.id));
      await registrarEvento(usuarioId, "codigo_recuperacion_usado", req);
      return true;
    }
  }
  return false;
}

// ─── PIN ──────────────────────────────────────────────────────

export interface PinStatus {
  habilitado: boolean;
  intentosFallidos: number;
  bloqueadoHasta: string | null;
  ultimoAcceso: string | null;
  ultimoCambio: string | null;
  tieneDispositivoConfiable: boolean;
}

export async function obtenerPinStatus(usuarioId: string): Promise<PinStatus> {
  const [u] = await db.select({
    pinHabilitado: usuarios.pinHabilitado,
    pinIntentosFallidos: usuarios.pinIntentosFallidos,
    pinBloqueadoHasta: usuarios.pinBloqueadoHasta,
    ultimoAccesoPin: usuarios.ultimoAccesoPin,
    pinActualizadoEn: usuarios.pinActualizadoEn,
  }).from(usuarios).where(eq(usuarios.id, usuarioId));

  if (!u) throw new Error("Usuario no encontrado");

  return {
    habilitado: u.pinHabilitado ?? false,
    intentosFallidos: u.pinIntentosFallidos ?? 0,
    bloqueadoHasta: u.pinBloqueadoHasta ?? null,
    ultimoAcceso: u.ultimoAccesoPin ?? null,
    ultimoCambio: u.pinActualizadoEn ?? null,
    tieneDispositivoConfiable: false,
  };
}

export async function verificarPin(usuarioId: string, pin: string, req?: any): Promise<{ ok: boolean; bloqueado: boolean }> {
  const [u] = await db.select({
    pinHash: usuarios.pinHash,
    pinHabilitado: usuarios.pinHabilitado,
    pinIntentosFallidos: usuarios.pinIntentosFallidos,
    pinBloqueadoHasta: usuarios.pinBloqueadoHasta,
  }).from(usuarios).where(eq(usuarios.id, usuarioId));

  if (!u?.pinHabilitado || !u.pinHash) {
    return { ok: true, bloqueado: false }; // PIN no requerido
  }

  // Verificar bloqueo
  if (u.pinBloqueadoHasta && u.pinBloqueadoHasta > ahora()) {
    return { ok: false, bloqueado: true };
  }

  const valido = await bcrypt.compare(pin, u.pinHash);
  if (valido) {
    // Resetear intentos
    await db.update(usuarios).set({
      pinIntentosFallidos: 0,
      pinBloqueadoHasta: null,
      ultimoAccesoPin: ahora(),
    }).where(eq(usuarios.id, usuarioId));
    await registrarEvento(usuarioId, "pin_verificacion_exitosa", req);
    return { ok: true, bloqueado: false };
  }

  // Incrementar intentos fallidos
  const intentos = (u.pinIntentosFallidos ?? 0) + 1;
  const bloqueoMinutos = intentos >= 5 ? 15 : 0;
  const bloqueadoHasta = bloqueoMinutos > 0
    ? new Date(Date.now() + bloqueoMinutos * 60 * 1000).toISOString()
    : null;

  await db.update(usuarios).set({
    pinIntentosFallidos: intentos,
    pinBloqueadoHasta: bloqueadoHasta,
  }).where(eq(usuarios.id, usuarioId));

  await registrarEvento(usuarioId, intentos >= 5 ? "pin_bloqueo_temporal" : "pin_verificacion_fallida", req,
    JSON.stringify({ intento: intentos, bloqueado: intentos >= 5 }));

  return { ok: false, bloqueado: intentos >= 5 };
}

export async function configurarPin(usuarioId: string, pin: string, passwordActual: string, req?: any): Promise<void> {
  const [u] = await db.select({ passwordHash: usuarios.passwordHash, pinHash: usuarios.pinHash, pinHabilitado: usuarios.pinHabilitado })
    .from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u) throw new Error("Usuario no encontrado");

  // Verificar contraseña actual
  const passValida = await bcrypt.compare(passwordActual, u.passwordHash);
  if (!passValida) throw new Error("Contraseña actual incorrecta");

  if (!pinEsValido(pin)) throw new Error("El PIN no es válido. Usa al menos 4 dígitos y evita secuencias simples.");

  const hash = await bcrypt.hash(pin, 10);
  await db.update(usuarios).set({
    pinHash: hash,
    pinHabilitado: true,
    pinActualizadoEn: ahora(),
    pinIntentosFallidos: 0,
    pinBloqueadoHasta: null,
  }).where(eq(usuarios.id, usuarioId));

  // Invalidar dispositivos y generar códigos de recuperación
  await revocarDispositivos(usuarioId, req);
  await generarCodigosRecuperacion(usuarioId);
  await registrarEvento(usuarioId, u.pinHabilitado ? "pin_cambiado" : "pin_activado", req);
}

export async function cambiarPin(usuarioId: string, pinActual: string, pinNuevo: string, req?: any): Promise<void> {
  const [u] = await db.select({ pinHash: usuarios.pinHash, pinHabilitado: usuarios.pinHabilitado })
    .from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u?.pinHabilitado || !u.pinHash) throw new Error("El PIN no está habilitado");

  const valido = await bcrypt.compare(pinActual, u.pinHash);
  if (!valido) throw new Error("PIN actual incorrecto");

  if (!pinEsValido(pinNuevo)) throw new Error("El nuevo PIN no es válido.");

  const hash = await bcrypt.hash(pinNuevo, 10);
  await db.update(usuarios).set({
    pinHash: hash,
    pinActualizadoEn: ahora(),
  }).where(eq(usuarios.id, usuarioId));

  await revocarDispositivos(usuarioId, req);
  await registrarEvento(usuarioId, "pin_cambiado", req);
}

export async function desactivarPin(usuarioId: string, pinActual: string, passwordActual: string, req?: any): Promise<void> {
  const [u] = await db.select({ passwordHash: usuarios.passwordHash, pinHash: usuarios.pinHash, pinHabilitado: usuarios.pinHabilitado })
    .from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u) throw new Error("Usuario no encontrado");

  const passValida = await bcrypt.compare(passwordActual, u.passwordHash);
  if (!passValida) throw new Error("Contraseña actual incorrecta");

  const pinValido = await bcrypt.compare(pinActual, u.pinHash!);
  if (!pinValido) throw new Error("PIN actual incorrecto");

  await db.update(usuarios).set({
    pinHash: null,
    pinHabilitado: false,
    pinActualizadoEn: null,
    pinIntentosFallidos: 0,
    pinBloqueadoHasta: null,
  }).where(eq(usuarios.id, usuarioId));

  // Invalidar todo
  await revocarDispositivos(usuarioId, req);
  await db.update(codigosRecuperacion).set({ revocadoEn: ahora() })
    .where(and(eq(codigosRecuperacion.usuarioId, usuarioId), isNull(codigosRecuperacion.revocadoEn)));
  await registrarEvento(usuarioId, "pin_desactivado", req);
}
