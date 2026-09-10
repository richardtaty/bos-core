import { Router, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { responderCheckinSchema } from "../lib/validation";
import { CheckinNoEncontradoError, responderCheckin } from "../services/checkins.service";
import {
  JornadaYaActivaError,
  SinHorasPendientesError,
  SinJornadaActivaError,
  TipoSesionIncorrectoError,
  estadoMiActividad,
  estadoMiJornada,
  iniciarJornada,
  iniciarReposicion,
  pendientesDelMes,
  terminarJornada,
  terminarReposicion,
} from "../services/asistencia.service";

// ─── Mi jornada (GENERAL → Mi día) ──────────────────────────────
// Control de la PROPIA jornada. Vive aparte de /api/rrhh a propósito: consultar la
// asistencia de TODA la plantilla exige ser Super Admin o Admin (requireAccesoRRHH), pero
// cada persona puede fichar su propia entrada y salida — eso no es un privilegio.
//
// SEGURIDAD (regla dura): la identidad sale SIEMPRE del token (`req.user.id`). El cuerpo de
// la petición se ignora por completo, así que no existe forma de iniciar o terminar la
// jornada de otra persona enviando un user_id/employee_id distinto. No hay endpoint de
// escritura que acepte la identidad del cliente.
//
// Persistencia real en SQLite: sobrevive a refresh, cierre de sesión, cambio de dispositivo
// y deploy. Nada de localStorage ni de estado de frontend.

export const jornadaRouter = Router();
jornadaRouter.use(requireAuth);

function responderError(res: Response, e: unknown): void {
  const mensaje = e instanceof Error ? e.message : "Error inesperado";
  // Un estado imposible (ya activa / no hay ninguna abierta / nada que reponer / la sesión
  // abierta es del otro tipo) es un conflicto, no un error de formato: 409 para que el
  // frontend pueda distinguirlo y recargar su estado.
  const esConflicto =
    e instanceof JornadaYaActivaError ||
    e instanceof SinJornadaActivaError ||
    e instanceof SinHorasPendientesError ||
    e instanceof TipoSesionIncorrectoError;
  res.status(esConflicto ? 409 : 400).json({ error: mensaje });
}

// Estado de hoy del usuario autenticado: jornada activa (si la hay) y tiempo ya trabajado.
jornadaRouter.get("/actual", async (req, res) => {
  try {
    res.json(await estadoMiJornada(req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});

// Iniciar jornada. Sin body: la hora la sella el servidor.
jornadaRouter.post("/iniciar", async (req, res) => {
  try {
    res.status(201).json(await iniciarJornada(req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});

// Terminar la jornada abierta. Cierra la MISMA sesión; nunca crea una nueva para la salida.
jornadaRouter.post("/terminar", async (req, res) => {
  try {
    res.json(await terminarJornada(req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});

// ─── Check-ins de actividad ─────────────────────────────────────
// La alerta «¿Sigues activo?» sigue al usuario por CUALQUIER módulo del CRM, no solo a Mi día.
//
// Un check-in es SOLO un registro de actividad: no descuenta sueldo, no reduce horas, no cierra
// la jornada ni marca ausencia. Las horas trabajadas dependen siempre de started_at/ended_at.
//
// Sin sesión abierta no hay check-ins: el poll responde `activa: false` sin tocar nada.
jornadaRouter.get("/checkin", async (req, res) => {
  try {
    res.json(await estadoMiActividad(req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});

// «Sigo activo». El id va en el CUERPO, no en la ruta (regla del proyecto: una ruta con
// `/:id` después de una específica se la come Express). El servicio filtra por `user_id`, que
// sale del token, así que responder el check-in de otra persona es imposible.
jornadaRouter.post("/checkin/responder", async (req, res) => {
  const parsed = responderCheckinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const { aplicado, checkin } = await responderCheckin(req.user!.id, parsed.data.checkinId);
    // Ya respondido por otra pestaña NO es un error: se devuelve el registro real, con su
    // responded_at original. Un solo registro y una sola hora de respuesta.
    res.json({ aplicado, checkin });
  } catch (e) {
    if (e instanceof CheckinNoEncontradoError) {
      res.status(404).json({ error: e.message });
      return;
    }
    responderError(res, e);
  }
});

// El DETALLE de check-ins NO se expone aquí a propósito. Vive en RRHH → Asistencia, que ya
// tiene su propio control de acceso: es donde el requisito pide el historial, y así un empleado
// nunca puede ver por adelantado los horarios que le quedan por delante. Ampliar esto a
// cualquier usuario autenticado añadiría un permiso que hoy no existe.

// ─── Reposición de horas ────────────────────────────────────────
// Recuperar dentro del MISMO mes las horas que quedaron pendientes. Es una sesión nueva e
// independiente: NUNCA modifica la jornada original ni recalcula meses pasados.

// Horas pendientes del mes en curso, para la tarjeta de Mi día.
jornadaRouter.get("/pendientes", async (req, res) => {
  try {
    res.json(await pendientesDelMes(req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});

// Iniciar reposición. Falla si ya hay cualquier sesión abierta o si no hay déficit de horas.
jornadaRouter.post("/reposicion/iniciar", async (req, res) => {
  try {
    res.status(201).json(await iniciarReposicion(req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});

// Terminar la reposición en curso. Guarda la salida en la MISMA sesión; las horas salen del
// reloj del servidor, nunca de lo que el usuario escriba.
jornadaRouter.post("/reposicion/terminar", async (req, res) => {
  try {
    res.json(await terminarReposicion(req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});
