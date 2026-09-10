import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { usePermisos } from "../hooks/usePermisos";
import type { Asistencia, Checkin, DiaHorario, HorarioEsperado, PersonalRRHH, PersonaTrabajando, SesionJornada } from "../types";
import {
  etiquetaEstadoCheckin,
  etiquetaMes,
  etiquetaTipoSesion,
  fmtCheckin,
  fmtDuracion,
  fmtFechaLarga,
  fmtHora12ET,
  fmtMinutos,
  mesActualET,
  nombreDia,
  transcurrido,
} from "../lib/jornada-formato";

// ─── RECURSOS HUMANOS → Asistencia ──────────────────────────────
// Historial de jornadas: quién entró, a qué hora, a qué hora salió y cuánto trabajó.
//
// Lo que esta pantalla NO hace (a propósito, todavía): sueldos, tarifas, nómina, pagos,
// descuentos por tardanza, penalizaciones. Solo registra tiempo.
//
// CHECK-INS: se muestran como historial de actividad para consulta. Un check-in sin respuesta
// NO descuenta sueldo, NO reduce horas y NO cierra la jornada — las horas trabajadas siguen
// saliendo de la entrada y la salida. Los cancelados (los que nunca llegaron a ocurrir) quedan
// fuera del denominador de «7 de 8».
//
// Todo se relaciona por el `userId` real de la persona. Las fechas se ordenan por el
// instante real (no por texto) y el día del negocio es el de Florida, igual que el resto
// del CRM. Una jornada sin terminar se muestra como "Abierta" y NUNCA suma tiempo: no se
// inventa una hora de salida.

type FiltroPersona = "TODAS" | string;

function claseEstado(estado: string): string {
  return estado === "ABIERTA"
    ? "bg-warning-50 text-warning-700 border-warning-200"
    : "bg-success-50 text-success-700 border-success-200";
}

function claseCheckin(estado: Checkin["estado"]): string {
  switch (estado) {
    case "RESPONDIDO":
      return "bg-success-50 text-success-700 border-success-200";
    case "SIN_RESPUESTA":
      return "bg-danger-50 text-danger-700 border-danger-200";
    case "CANCELADO":
      return "bg-neutral-100 text-neutral-500 border-neutral-200";
    default:
      return "bg-warning-50 text-warning-700 border-warning-200";
  }
}

/**
 * Una jornada del historial. El tipo (Regular / Reposición) se ve como chip porque una
 * reposición NO es la jornada de ese día: es una sesión aparte para recuperar horas.
 */
function FilaSesion({ sesion: s, ahora }: { sesion: SesionJornada; ahora: number }) {
  const [abierto, setAbierto] = useState(false);
  const esReposicion = s.sessionType === "REPOSICION";

  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl">
      <div className="p-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-[160px] flex-1">
          <p className="text-sm font-medium text-neutral-900">{s.personaNombre}</p>
          <p className="text-[11px] text-neutral-500">
            {esReposicion
              ? "Recupera horas pendientes del mes"
              : s.minutosProgramados > 0
                ? `Esperado ese día: ${fmtMinutos(s.minutosProgramados)}`
                : "Sin jornada esperada definida"}
          </p>
        </div>

        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
            esReposicion
              ? "bg-primary-50 text-primary-700 border-primary-200"
              : "bg-neutral-100 text-neutral-600 border-neutral-200"
          }`}
        >
          {etiquetaTipoSesion(s.sessionType)}
        </span>

        <div className="text-xs text-neutral-600">
          <span className="text-neutral-500">Entrada: </span>
          <span className="font-medium text-neutral-800">{fmtHora12ET(s.startedAt)}</span>
        </div>

        <div className="text-xs text-neutral-600">
          <span className="text-neutral-500">Salida: </span>
          {s.endedAt ? (
            <span className="font-medium text-neutral-800">{fmtHora12ET(s.endedAt)}</span>
          ) : (
            <span className="text-warning-700">— sin registrar</span>
          )}
        </div>

        <div className="text-xs text-neutral-600 min-w-[110px]">
          <span className="text-neutral-500">Trabajado: </span>
          {s.estado === "ABIERTA" ? (
            <span className="font-medium text-warning-700">
              en curso ({transcurrido(s.startedAt, ahora)})
            </span>
          ) : (
            <span className="font-medium text-neutral-800">{fmtDuracion(s.duracionSegundos)}</span>
          )}
        </div>

        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${claseEstado(s.estado)}`}>
          {s.estado === "ABIERTA" ? "Abierta" : "Finalizada"}
        </span>

        {/* Check-ins: solo si la sesión tuvo alguno. Es informativo, nunca una nota. */}
        {s.checkins && s.checkins.total > 0 && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="text-[10px] px-2 py-0.5 rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100"
            title="Ver el detalle de la actividad"
          >
            Check-ins: {s.checkins.respondidos} de {s.checkins.total} respondidos {abierto ? "▲" : "▼"}
          </button>
        )}
      </div>

      {abierto && s.checkins && s.checkins.total > 0 && <CheckinsDetalle jornadaId={s.id} />}
    </div>
  );
}

/**
 * Detalle de los check-ins de una jornada. Se pide SOLO al desplegarlo: el historial puede
 * tener muchos días y no tiene sentido traerlos todos al abrir la pantalla.
 */
function CheckinsDetalle({ jornadaId }: { jornadaId: string }) {
  const [items, setItems] = useState<Checkin[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .checkinsDeJornada(jornadaId)
      .then((r) => {
        if (vivo) setItems(r.checkins);
      })
      .catch((e) => {
        if (vivo) setError(e instanceof ApiError ? e.message : "No se pudo leer la actividad.");
      });
    return () => {
      vivo = false;
    };
  }, [jornadaId]);

  if (error) return <p className="text-[11px] text-danger-600 px-3 pb-3">{error}</p>;
  if (!items) return <p className="text-[11px] text-neutral-500 px-3 pb-3">Leyendo actividad…</p>;
  if (items.length === 0) {
    return (
      <p className="text-[11px] text-neutral-500 px-3 pb-3">
        No se programó ninguna verificación de actividad en esta sesión.
      </p>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div className="flex flex-wrap gap-1.5">
        {items.map((c) => (
          <span
            key={c.id}
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${claseCheckin(c.estado)}`}
            title={`Programado: ${fmtHora12ET(c.scheduledAt)} · ${etiquetaEstadoCheckin(c.estado)}`}
          >
            {fmtCheckin(c.scheduledAt, c.estado, c.respondedAt)}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-neutral-400 mt-2">
        Solo actividad registrada. No afecta a las horas trabajadas ni al sueldo.
      </p>
    </div>
  );
}

/** Minutos entre dos horas HH:MM (una salida pasada de medianoche suma 24 h). */
function minutosEntre(inicio: string, fin: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) return null;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  let min = h2 * 60 + m2 - (h1 * 60 + m1);
  if (min < 0) min += 24 * 60;
  return min;
}

export function AsistenciaPage() {
  const permisos = usePermisos();

  const [personal, setPersonal] = useState<PersonalRRHH[]>([]);
  const [persona, setPersona] = useState<FiltroPersona>("TODAS");
  const [mes, setMes] = useState(() => mesActualET());

  const [data, setData] = useState<Asistencia | null>(null);
  const [enCurso, setEnCurso] = useState<PersonaTrabajando[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // El horario esperado se edita en un panel aparte, solo para quien administra RRHH.
  const [horario, setHorario] = useState<HorarioEsperado | null>(null);
  const [borrador, setBorrador] = useState<DiaHorario[]>([]);
  const [panelHorario, setPanelHorario] = useState(false);
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  const [avisoHorario, setAvisoHorario] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [historial, trabajando] = await Promise.all([
        api.listarAsistencia({
          userId: persona === "TODAS" ? undefined : persona,
          mes: mes || undefined,
        }),
        api.asistenciaEnCurso(),
      ]);
      setData(historial);
      setEnCurso(trabajando);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "No se pudo cargar la asistencia.");
    } finally {
      setCargando(false);
    }
  }, [persona, mes]);

  useEffect(() => {
    if (permisos.cargando || !permisos.puedeVerRRHH) return;
    void consultar();
  }, [permisos.cargando, permisos.puedeVerRRHH, consultar]);

  // La lista de personas solo se usa para el filtro: no se vuelve a pedir al cambiar de mes.
  useEffect(() => {
    if (permisos.cargando || !permisos.puedeVerRRHH) return;
    void (async () => {
      try {
        setPersonal(await api.listarPersonal());
      } catch {
        /* el filtro por persona es opcional: si falla, el historial general sigue sirviendo */
      }
    })();
  }, [permisos.cargando, permisos.puedeVerRRHH]);

  const abrirHorario = useCallback(async () => {
    setAvisoHorario(null);
    try {
      const h = await api.obtenerHorario();
      setHorario(h);
      setBorrador(h.dias);
      setPanelHorario(true);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "No se pudo cargar la jornada esperada.");
    }
  }, []);

  async function guardarHorario() {
    if (guardandoHorario) return;
    setGuardandoHorario(true);
    setAvisoHorario(null);
    setError(null);
    try {
      const h = await api.guardarHorario({
        nombre: horario?.nombre,
        dias: borrador.map((d) => ({
          diaSemana: d.diaSemana,
          laborable: d.laborable,
          horaInicio: d.horaInicio,
          horaFin: d.horaFin,
          minutosEsperados: d.minutosEsperados,
        })),
      });
      setHorario(h);
      setBorrador(h.dias);
      setAvisoHorario("Jornada esperada guardada.");
      await consultar();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "No se pudo guardar la jornada esperada.");
    } finally {
      setGuardandoHorario(false);
    }
  }

  function cambiarDia(diaSemana: number, cambios: Partial<DiaHorario>) {
    setBorrador((prev) => prev.map((d) => (d.diaSemana === diaSemana ? { ...d, ...cambios } : d)));
  }

  // Historial agrupado por día del negocio, más reciente primero. Se agrupa por el instante
  // real de inicio que ya viene calculado desde el backend (nunca por texto).
  const grupos = useMemo(() => {
    const porFecha = new Map<string, Asistencia["sesiones"]>();
    for (const s of data?.sesiones ?? []) {
      const lista = porFecha.get(s.fecha) ?? [];
      lista.push(s);
      porFecha.set(s.fecha, lista);
    }
    return [...porFecha.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  // Reloj visual para las jornadas abiertas (no es un dato guardado).
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!(data?.sesiones ?? []).some((s) => s.estado === "ABIERTA")) return;
    const id = window.setInterval(() => setAhora(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [data]);

  if (!permisos.cargando && !permisos.puedeVerRRHH) return <Navigate to="/mi-dia" replace />;

  const resumen = data?.resumen;
  const personaNombre = (id: string) => personal.find((p) => p.userId === id)?.nombre;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">Asistencia</h1>
          <p className="text-sm text-neutral-500">
            {mes ? `Jornadas de ${etiquetaMes(mes)}` : "Historial de jornadas"}
            {persona !== "TODAS" && personaNombre(persona) ? ` · ${personaNombre(persona)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void (panelHorario ? setPanelHorario(false) : abrirHorario())}
          className="text-xs px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 font-medium"
        >
          {panelHorario ? "Ocultar jornada esperada" : "⚙ Jornada esperada"}
        </button>
      </div>

      {/* ── Filtros ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
        >
          <option value="TODAS">Todas las personas</option>
          {personal.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.nombre}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
        />
        {(persona !== "TODAS" || mes) && (
          <button
            type="button"
            onClick={() => {
              setPersona("TODAS");
              setMes("");
            }}
            className="text-xs px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
          >
            Quitar filtros
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

      {/* ── Quién está trabajando ahora ───────────────── */}
      {enCurso.length > 0 && (
        <div className="mb-5 rounded-xl border border-warning-200 bg-warning-50 p-4">
          <h2 className="text-sm font-semibold text-warning-800 mb-2">
            🟡 Trabajando ahora ({enCurso.length})
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {enCurso.map((p) => (
              <p key={p.userId} className="text-xs text-warning-800">
                {p.personaNombre} · desde las {fmtHora12ET(p.startedAt)}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Totales del período ──────────────────────── */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Tiempo trabajado</p>
            <p className="text-lg font-semibold text-neutral-800">{fmtDuracion(resumen.totalSegundos)}</p>
            <p className="text-[11px] text-neutral-500">
              {resumen.sesionesFinalizadas} jornada{resumen.sesionesFinalizadas !== 1 ? "s" : ""} finalizada
              {resumen.sesionesFinalizadas !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Jornada esperada</p>
            <p className="text-lg font-semibold text-neutral-800">
              {resumen.horarioConfigurado ? fmtMinutos(resumen.minutosProgramados) : "Sin configurar"}
            </p>
            <p className="text-[11px] text-neutral-500">
              {resumen.minutosProgramados === null
                ? "Elige una persona para comparar"
                : resumen.horarioConfigurado
                  ? "Horas programadas del período"
                  : "Su jornada aún no está definida"}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Jornadas abiertas</p>
            <p className="text-lg font-semibold text-neutral-800">{resumen.sesionesAbiertas}</p>
            <p className="text-[11px] text-neutral-500">No suman al tiempo trabajado</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Período</p>
            <p className="text-sm font-semibold text-neutral-800 mt-1">
              {resumen.desde} → {resumen.hasta}
            </p>
            <p className="text-[11px] text-neutral-500">Días del negocio (Florida)</p>
          </div>
        </div>
      )}

      {/* ── Regulares vs repuestas ──────────────────────
          Se separan a propósito: una reposición no ocurrió dentro de la jornada del día que
          quedó corta, así que mezclarlas daría una lectura falsa de ese día. */}
      {resumen && resumen.minutosProgramados !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Horas regulares</p>
            <p className="text-lg font-semibold text-neutral-800">{fmtDuracion(resumen.totalSegundosRegulares)}</p>
            <p className="text-[11px] text-neutral-500">De sus jornadas del día</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Horas repuestas</p>
            <p className="text-lg font-semibold text-neutral-800">{fmtDuracion(resumen.totalSegundosReposicion)}</p>
            <p className="text-[11px] text-neutral-500">
              {resumen.minutosReposicionAcreditables > 0
                ? `Cuentan ${fmtMinutos(resumen.minutosReposicionAcreditables)} (el resto excede el mes)`
                : "Sesiones aparte para recuperar horas"}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Horas que cuentan</p>
            <p className="text-lg font-semibold text-neutral-800">{fmtMinutos(resumen.minutosAcreditables)}</p>
            <p className="text-[11px] text-neutral-500">
              Sobre {fmtMinutos(resumen.minutosProgramados)} programadas
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Pendientes del mes</p>
            <p className="text-lg font-semibold text-neutral-800">{fmtMinutos(resumen.minutosPendientes)}</p>
            <p className="text-[11px] text-neutral-500">
              {resumen.minutosExcedidos > 0
                ? `Además hay ${fmtMinutos(resumen.minutosExcedidos)} repuestas de más que no suman`
                : "Lo que falta para completar el mes"}
            </p>
          </div>
        </div>
      )}

      {/* ── Jornada esperada ─────────────────────────── */}
      {panelHorario && (
        <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-sm font-semibold text-neutral-700">⚙ Jornada esperada</h2>
          </div>
          <p className="text-xs text-neutral-500 mb-4">
            Define, día por día, la jornada que se espera. No se asume ninguna regla fija (ni 8 h
            ni media jornada): lo que se registre aquí es lo que el sistema compara. Un día no
            laborable no genera horas esperadas.
          </p>

          <div className="space-y-2">
            {borrador.map((d) => {
              const calculado = d.horaInicio && d.horaFin ? minutosEntre(d.horaInicio, d.horaFin) : null;
              const minutos = d.laborable ? (d.minutosEsperados || calculado || 0) : 0;
              return (
                <div
                  key={d.diaSemana}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2"
                >
                  <label className="flex items-center gap-2 w-40 shrink-0">
                    <input
                      type="checkbox"
                      checked={d.laborable}
                      onChange={(e) => cambiarDia(d.diaSemana, { laborable: e.target.checked })}
                      className="rounded border-neutral-300"
                    />
                    <span className={`text-sm ${d.laborable ? "text-neutral-800 font-medium" : "text-neutral-500"}`}>
                      {nombreDia(d.diaSemana)}
                    </span>
                  </label>

                  {d.laborable ? (
                    <>
                      <input
                        type="time"
                        value={d.horaInicio ?? ""}
                        onChange={(e) =>
                          cambiarDia(d.diaSemana, { horaInicio: e.target.value || null, minutosEsperados: 0 })
                        }
                        className="border border-neutral-200 bg-white text-neutral-800 rounded-lg px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-neutral-500">a</span>
                      <input
                        type="time"
                        value={d.horaFin ?? ""}
                        onChange={(e) =>
                          cambiarDia(d.diaSemana, { horaFin: e.target.value || null, minutosEsperados: 0 })
                        }
                        className="border border-neutral-200 bg-white text-neutral-800 rounded-lg px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-neutral-600">
                        {minutos > 0 ? `= ${fmtMinutos(minutos)}` : "Sin horas definidas"}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-neutral-500">No laborable</span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-neutral-500 mt-3">
            Si un día se marca como laborable pero se deja sin horas, se guarda con 0 minutos
            esperados en lugar de asumir una duración: la jornada real la defines tú.
          </p>

          {avisoHorario && <p className="text-xs text-success-700 mt-3">{avisoHorario}</p>}

          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => void guardarHorario()}
              disabled={guardandoHorario}
              className="text-sm px-4 py-2 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 disabled:cursor-not-allowed"
            >
              {guardandoHorario ? "Guardando…" : "Guardar jornada esperada"}
            </button>
          </div>
        </div>
      )}

      {/* ── Historial ────────────────────────────────── */}
      {cargando && <p className="text-sm text-neutral-500 py-8 text-center">Cargando la asistencia…</p>}

      {!cargando && grupos.length === 0 && (
        <p className="text-sm text-neutral-600 text-center py-8">
          No hay jornadas registradas en este período.
        </p>
      )}

      <div className="space-y-5">
        {!cargando &&
          grupos.map(([fecha, sesiones]) => (
            <div key={fecha}>
              <h3 className="text-sm font-medium text-neutral-700 mb-2 capitalize">{fmtFechaLarga(fecha)}</h3>
              <div className="space-y-2">
                {sesiones.map((s) => (
                  <FilaSesion key={s.id} sesion={s} ahora={ahora} />
                ))}
              </div>
            </div>
          ))}
      </div>

      <p className="text-[11px] text-neutral-500 mt-6">
        Horas en Eastern Time (misma zona del CRM). Una jornada sin terminar queda como
        «Abierta» y no se le asigna una hora de salida ni una duración: el tiempo en curso es
        solo un indicador visual. Las horas repuestas se muestran aparte porque son una sesión
        distinta, no parte de la jornada del día. Los check-ins son solo actividad registrada:
        no descuentan sueldo, no reducen horas y no marcan ausencias.
      </p>
    </div>
  );
}
