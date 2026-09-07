import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { cumpleanos, cumpleanosRecordatorios } from "../db/schema";
import { DIAS_AVISO_CUMPLEANOS } from "../lib/cumpleanos-config";
import {
  hoyET,
  ymd,
  clamp,
  proximaOcurrencia,
  diasEntre,
  sumarDiasCalendario,
} from "../lib/cumpleanos-fechas";

// ─── 🎂 Worker del módulo "Próximos cumpleaños" ─────────────────────────────────
// Un `setInterval` dentro del mismo proceso (una sola máquina en Fly), igual que
// `funding-worker.service.ts` — el proyecto no tiene cron externo.
//
// Cada 10 minutos recorre los cumpleaños ACTIVOS y, para cada uno cuyo próximo
// cumpleaños (ET) cae dentro de la ventana de aviso [hoy, hoy + DIAS_AVISO],
// se asegura de que exista UNA sola fila de recordatorio para esa ocurrencia
// (año). La unicidad la garantiza el índice único (cumpleanos_id, anio) en la BD:
// aunque dos ticks o dos guardados corran a la vez, el segundo INSERT choca y se
// descarta (ON CONFLICT DO NOTHING). Nunca pisa un 'realizado' ni resucita un
// 'cancelado': si ya hay fila para ese año, no la toca.
//
// También se invoca en proceso desde el POST/PATCH del módulo (asegurarRecordatorio)
// para que un cumpleaños recién agregado que ya cae en la ventana genere su
// recordatorio AL INSTANTE, sin esperar al siguiente tick.

/** Cada cuánto revisa el worker (10 min). La generación es idempotente y barata. */
const INTERVALO_CUMPLEANOS_MS = 10 * 60 * 1000;

/**
 * Garantiza que exista el recordatorio (pendiente) de la próxima ocurrencia de un
 * cumpleaños si esa ocurrencia cae en la ventana de aviso. No-op si el registro no
 * existe, está desactivado, la ocurrencia está fuera de la ventana o ya hay una fila
 * para ese año (ON CONFLICT DO NOTHING lo cubre).
 */
export async function asegurarRecordatorio(cumpleanosId: string): Promise<void> {
  const [c] = await db.select().from(cumpleanos).where(eq(cumpleanos.id, cumpleanosId));
  if (!c || !c.activo) return;

  const hoy = hoyET();
  const occ = proximaOcurrencia(c.mes, c.dia, hoy);
  const dias = diasEntre(hoy, occ);
  if (dias < 0 || dias > DIAS_AVISO_CUMPLEANOS) return;

  await db
    .insert(cumpleanosRecordatorios)
    .values({
      id: crypto.randomUUID(),
      cumpleanosId,
      anio: occ.y,
      fechaCumpleanos: ymd(occ),
      estado: "pendiente",
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

/**
 * Reconciliación tras cambiar día/mes de un cumpleaños (sin borrar nada):
 * - Recalcula la ocurrencia real de CADA recordatorio existente bajo la fecha nueva.
 * - Las filas pendientes cuyo año quedó en el pasado (la ocasión ya no es la próxima)
 *   se marcan 'cancelado' — la ocasión dejó de existir, no se borra el historial.
 * - La fila pendiente del año vigente se recalibra a su nueva fecha real.
 * - 'realizado'/'cancelado' jamás se tocan (son historia).
 * - Al final `asegurarRecordatorio` crea la del año vigente si corresponde.
 */
export async function reconciliarTrasEdicion(
  cumpleanosId: string,
  mes: number,
  dia: number,
): Promise<void> {
  const filas = await db
    .select()
    .from(cumpleanosRecordatorios)
    .where(eq(cumpleanosRecordatorios.cumpleanosId, cumpleanosId));

  if (filas.length > 0) {
    const hoy = hoyET();
    const proxima = proximaOcurrencia(mes, dia, hoy);

    for (const r of filas) {
      if (r.estado !== "pendiente") continue; // realizados/cancelados: historia, no se tocan

      if (r.anio < proxima.y) {
        // La ocasión que esta fila anunciaba quedó en el pasado con la fecha nueva.
        await db
          .update(cumpleanosRecordatorios)
          .set({ estado: "cancelado" })
          .where(eq(cumpleanosRecordatorios.id, r.id));
      } else if (r.anio === proxima.y) {
        // Sigue siendo la ocurrencia vigente: recalibrar su fecha con el nuevo día/mes.
        const fechaReal = ymd(clamp(mes, dia, r.anio));
        if (r.fechaCumpleanos !== fechaReal) {
          await db
            .update(cumpleanosRecordatorios)
            .set({ fechaCumpleanos: fechaReal })
            .where(eq(cumpleanosRecordatorios.id, r.id));
        }
      }
      // r.anio > proxima.y no debería existir (nunca se crean recordatorios futuros).
    }
  }

  await asegurarRecordatorio(cumpleanosId);
}

/** Revisa todos los cumpleaños activos y asegura sus recordatorios en ventana. */
export async function generarRecordatoriosPendientes(): Promise<void> {
  const activos = await db
    .select({ id: cumpleanos.id })
    .from(cumpleanos)
    .where(eq(cumpleanos.activo, true));

  for (const a of activos) {
    try {
      await asegurarRecordatorio(a.id);
    } catch (err) {
      console.error(`[🎂worker] error asegurando recordatorio de ${a.id}:`, err);
    }
  }
}

/** Recordatorios pendientes cuya fecha está en la ventana [hoy, hoy + DIAS_AVISO]. */
export async function recordatoriosEnVentana(): Promise<
  { id: string; cumpleanosId: string; anio: number; fechaCumpleanos: string }[]
> {
  const hoy = hoyET();
  const fin = sumarDiasCalendario(hoy, DIAS_AVISO_CUMPLEANOS);
  const filas = await db
    .select({
      id: cumpleanosRecordatorios.id,
      cumpleanosId: cumpleanosRecordatorios.cumpleanosId,
      anio: cumpleanosRecordatorios.anio,
      fechaCumpleanos: cumpleanosRecordatorios.fechaCumpleanos,
    })
    .from(cumpleanosRecordatorios)
    .innerJoin(cumpleanos, eq(cumpleanosRecordatorios.cumpleanosId, cumpleanos.id))
    .where(
      and(
        eq(cumpleanosRecordatorios.estado, "pendiente"),
        eq(cumpleanos.activo, true),
        gte(cumpleanosRecordatorios.fechaCumpleanos, ymd(hoy)),
        lte(cumpleanosRecordatorios.fechaCumpleanos, ymd(fin)),
      ),
    )
    .orderBy(cumpleanosRecordatorios.fechaCumpleanos);
  return filas;
}

/**
 * Enciende el worker (un solo proceso, una sola máquina en Fly). No requiere
 * variables de entorno ni servicios externos: la generación es idempotente y barata.
 * Corre una pasada inmediata al arrancar y luego cada INTERVALO_CUMPLEANOS_MS.
 */
export function iniciarCumpleanosWorker(): void {
  generarRecordatoriosPendientes().catch((err) =>
    console.error("[🎂worker] error en pasada inicial:", err),
  );
  setInterval(() => {
    generarRecordatoriosPendientes().catch((err) =>
      console.error("[🎂worker] error en pasada periódica:", err),
    );
  }, INTERVALO_CUMPLEANOS_MS);
  console.log("[🎂worker] activo — revisa cumpleaños en ventana cada 10 min");
}
