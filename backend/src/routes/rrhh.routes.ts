import { Router, type Response } from "express";
import { requireAuth, requireAccesoRRHH } from "../middleware/auth";
import { actualizarPerfilLaboralSchema, guardarHorarioSchema, guardarSalarioSchema } from "../lib/validation";
import {
  PersonalNoEncontradoError,
  actualizarPerfilLaboral,
  listarPersonal,
  obtenerPersonal,
} from "../services/rrhh.service";
import {
  FiltroInvalidoError,
  HorarioInvalidoError,
  checkinsDeJornada,
  guardarHorarioPredeterminado,
  listarAsistencia,
  obtenerHorarioPredeterminado,
  quienEstaTrabajandoHoy,
} from "../services/asistencia.service";
import {
  SalarioInvalidoError,
  detalleControlSueldo,
  guardarSalario,
  listarControlSueldo,
} from "../services/sueldos.service";

// ─── RECURSOS HUMANOS ───────────────────────────────────────────
// Fase 1: únicamente el módulo Personal (la plantilla laboral real).
//
// Todas las rutas exigen requireAccesoRRHH: la regla vive en lib/rrhh-config.ts y es la
// misma que aplica el frontend para mostrar la sección. Un USUARIO o SUPERVISOR recibe 403
// aunque conozca la URL — el menú no es la única barrera.
//
// Este router NO expone endpoints generales: nada de RRHH sale por /api/usuarios ni por
// ningún otro módulo. Aquí están los datos laborales, incluidos los privados (notas), y
// por eso el acceso está cerrado a los roles de mando.
//
// Tareas futuras (Asistencia, Control de Sueldo) se colgarán de este mismo prefijo usando
// el `userId`/`empleadoId` que ya devuelve esta API. Aún no existen.

export const rrhhRouter = Router();
rrhhRouter.use(requireAuth);
rrhhRouter.use(requireAccesoRRHH);

function responderError(res: Response, e: unknown): void {
  if (e instanceof PersonalNoEncontradoError) {
    res.status(404).json({ error: e.message });
    return;
  }
  if (e instanceof HorarioInvalidoError) {
    res.status(422).json({ error: e.message });
    return;
  }
  // Un filtro mal escrito es un error del cliente, no un 400 genérico de negocio.
  if (e instanceof FiltroInvalidoError || e instanceof SalarioInvalidoError) {
    res.status(400).json({ error: e.message });
    return;
  }
  const mensaje = e instanceof Error ? e.message : "Error inesperado";
  res.status(400).json({ error: mensaje });
}

// Plantilla completa (activos primero). Quien todavía no tiene perfil laboral también
// aparece: se toman sus datos reales de `usuarios`.
rrhhRouter.get("/personal", async (_req, res) => {
  try {
    res.json(await listarPersonal());
  } catch (e) {
    responderError(res, e);
  }
});

// Ficha laboral de una persona. `:id` es el ID REAL del usuario en el CRM.
rrhhRouter.get("/personal/:id", async (req, res) => {
  try {
    const persona = await obtenerPersonal(req.params.id);
    if (!persona) {
      res.status(404).json({ error: "Persona no encontrada en la plantilla." });
      return;
    }
    res.json(persona);
  } catch (e) {
    responderError(res, e);
  }
});

// Guardar datos laborales (cargo, estado laboral, notas). Nunca toca el acceso al CRM.
rrhhRouter.patch("/personal/:id", async (req, res) => {
  const parsed = actualizarPerfilLaboralSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await actualizarPerfilLaboral(req.params.id, parsed.data, req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});

// ─── RECURSOS HUMANOS → Asistencia ──────────────────────────────
// Consulta de la asistencia de la plantilla. Fichar la PROPIA jornada NO está aquí: eso
// vive en /api/jornada y lo puede hacer cualquier usuario autenticado desde Mi día.
// Ver la asistencia de otras personas exige el mismo acceso que el resto de RRHH.
//
// Solo lee tiempo trabajado. No hay sueldo, tarifas, nómina ni pagos.
// Los CHECK-INS de actividad SÍ se consultan aquí (fase 4): son historial para consulta y no
// entran en ninguna cuenta de horas ni de dinero.

// Historial de jornadas con totales. Filtros: ?userId= &mes=YYYY-MM  o  ?desde=&hasta=.
rrhhRouter.get("/asistencia", async (req, res) => {
  const { userId, mes, desde, hasta } = req.query;
  try {
    res.json(
      await listarAsistencia({
        userId: typeof userId === "string" && userId ? userId : undefined,
        mes: typeof mes === "string" && mes ? mes : undefined,
        desde: typeof desde === "string" && desde ? desde : undefined,
        hasta: typeof hasta === "string" && hasta ? hasta : undefined,
      }),
    );
  } catch (e) {
    responderError(res, e);
  }
});

// Quién tiene la jornada abierta ahora mismo.
rrhhRouter.get("/asistencia/en-curso", async (_req, res) => {
  try {
    res.json(await quienEstaTrabajandoHoy());
  } catch (e) {
    responderError(res, e);
  }
});

// Check-ins de actividad de UNA jornada, al desplegarla en el historial.
// Va ANTES de cualquier ruta con `/:id` con el mismo prefijo (regla de Express del proyecto):
// si estuviera después, `/asistencia/jornada` se leería como un id y nunca llegaría aquí.
//
// Es el detalle de una persona concreta, así que exige el mismo acceso que el resto de RRHH
// (lo pone el router). No se amplía ningún permiso: quien ya veía la asistencia de la
// plantilla es exactamente quien puede ver esto.
rrhhRouter.get("/asistencia/jornada/:id/checkins", async (req, res) => {
  try {
    res.json(await checkinsDeJornada(req.params.id));
  } catch (e) {
    responderError(res, e);
  }
});

// Jornada esperada (por día de la semana). Sin configurar devuelve la semana vacía, con
// todo no laborable y 0 minutos: no se inventan horarios.
rrhhRouter.get("/asistencia/horario", async (_req, res) => {
  try {
    res.json(await obtenerHorarioPredeterminado());
  } catch (e) {
    responderError(res, e);
  }
});

rrhhRouter.put("/asistencia/horario", async (req, res) => {
  const parsed = guardarHorarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await guardarHorarioPredeterminado(parsed.data, req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});

// ─── RECURSOS HUMANOS → Control de Sueldo ───────────────────────
// Control INTERNO: sueldo mensual + horas programadas + horas registradas → sueldo ESTIMADO
// a pagar del período. Nada de nómina fiscal, impuestos, deducciones, overtime automático ni
// pagos — eso no existe todavía y no se simula aquí.
//
// Es información sensible, así que todo cuelga del mismo `requireAccesoRRHH` del router: un
// usuario sin autorización recibe 403 aunque llame a la API directamente. Nadie puede leer ni
// menos fijar su propio sueldo desde otro módulo: no hay endpoint para eso.
//
// Las horas NO se guardan aquí: salen de Asistencia (totalesDelMes), la misma fuente que ve
// el usuario en ese módulo.

// Listado del período. Por defecto, el mes en curso. Filtros: ?mes=AAAA-MM & userId= & departamentoId=.
rrhhRouter.get("/sueldos", async (req, res) => {
  const { mes, userId, departamentoId } = req.query;
  try {
    res.json(
      await listarControlSueldo({
        mes: typeof mes === "string" && mes ? mes : undefined,
        userId: typeof userId === "string" && userId ? userId : undefined,
        departamentoId: typeof departamentoId === "string" && departamentoId ? departamentoId : undefined,
      }),
    );
  } catch (e) {
    responderError(res, e);
  }
});

// Detalle del período para UNA persona, con su historial salarial completo (nunca se borra).
rrhhRouter.get("/sueldos/:userId", async (req, res) => {
  const { mes } = req.query;
  try {
    res.json(
      await detalleControlSueldo(
        req.params.userId,
        typeof mes === "string" && mes ? mes : undefined,
      ),
    );
  } catch (e) {
    responderError(res, e);
  }
});

// Configurar o actualizar el sueldo mensual. Cada cambio crea una VIGENCIA NUEVA: el monto
// anterior queda en el historial y sigue aplicando a los meses anteriores a esta fecha.
rrhhRouter.post("/sueldos/:userId", async (req, res) => {
  const parsed = guardarSalarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(await guardarSalario(req.params.userId, parsed.data, req.user!.id));
  } catch (e) {
    responderError(res, e);
  }
});
