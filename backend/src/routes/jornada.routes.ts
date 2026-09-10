import { Router, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import {
  JornadaYaActivaError,
  SinJornadaActivaError,
  estadoMiJornada,
  iniciarJornada,
  terminarJornada,
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
  // Un estado imposible (ya activa / no hay ninguna abierta) es un conflicto, no un error
  // de formato: 409 para que el frontend pueda distinguirlo y recargar su estado.
  const esConflicto = e instanceof JornadaYaActivaError || e instanceof SinJornadaActivaError;
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
