import { useEffect, useState } from "react";
import {
  api,
  type DesempenoEquipoDTO,
  type DetalleHistorialDTO,
  type FilaEquipoPodcastDTO,
  type MetasPodcastDTO,
  type MiembroDetalleDTO,
} from "../api/client";
import { useAuth } from "../api/AuthContext";
import { TendenciaBadge } from "../components/PodcastBadges";
import { BloqueCanales, ChipEstado, Dato, Embudo, Tarjeta, fechaLarga, hoyET, periodoTexto, sumarDias } from "../components/PodcastUI";
import { DetalleReporte } from "../components/PodcastHistorialReportes";

// PODCAST → REPORTE DE EQUIPO.
//
// Esta es la evolución de la antigua página "Equipo" (misma ruta /podcast/equipo, no se duplica).
// Ahora cuenta el MISMO embudo que "Mi desempeño" — Contactados → Respuestas → Interesados →
// Agendados → Completados → 1% → Convertidos, más "En seguimiento" — y baja al detalle de cada
// persona reutilizando el visor de reportes que ya existe.
//
// Dos cosas que la pantalla dice de frente:
//   · Quien no envió su Cierre diario NO cuenta como 0. Cuenta como nada, y se muestra "Sin reporte".
//   · El score y la tendencia solo se pueden calcular sobre el día en curso: usan los follow-ups
//     vencidos de hoy y la actividad de los últimos 7 días. En un período pasado se muestran "—".

function ColorScore(total: number): string {
  return total >= 80 ? "text-success-600" : total >= 50 ? "text-amber-600" : "text-danger-600";
}

// Editor de metas — solo Super Admin. Muestra las metas y las deja editables.
function MetasEditor() {
  const [metas, setMetas] = useState<MetasPodcastDTO | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.podcastMetas().then(setMetas);
  }, []);

  if (!metas) return null;

  const setValor = (clave: string, valor: number) => {
    setMetas((m) => m && ({ ...m, items: m.items.map((it) => (it.clave === clave ? { ...it, valor } : it)) }));
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const nueva = await api.guardarPodcastMetas(metas.items);
      setMetas(nueva);
      setMensaje("Metas actualizadas.");
    } catch (e) {
      setMensaje((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-6">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">Metas del equipo (Super Admin)</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metas.items.map((it) => (
          <label key={it.clave} className="block">
            <span className="text-xs text-neutral-500">{it.nombre}</span>
            <input
              type="number"
              min={0}
              value={it.valor}
              onChange={(e) => setValor(it.clave, Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={guardar}
          disabled={guardando}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-100 disabled:text-primary-800"
        >
          Guardar metas
        </button>
        {mensaje && <span className="text-sm text-primary-600">{mensaje}</span>}
      </div>
    </div>
  );
}

// ─── Detalle de un integrante ─────────────────────────────────────

/**
 * El nivel 2: lo que esa persona hizo en el período, y sus Cierres diarios de esos días.
 *
 * Cada día de la lista abre el MISMO visor de reportes del Historial (`DetalleReporte`) — no hay
 * una segunda forma de pintar un reporte en el módulo. Como ese visor incluye la tarjeta
 * "¿Qué te bloqueó hoy?", ese texto queda accesible sin escribir nada nuevo.
 */
function DetalleMiembroModal({
  miembro,
  periodo,
  onClose,
}: {
  miembro: FilaEquipoPodcastDTO;
  periodo: { desde: string; hasta: string };
  onClose: () => void;
}) {
  const [d, setD] = useState<MiembroDetalleDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporteAbierto, setReporteAbierto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const x = await api.podcastDesempenoMiembro(miembro.usuarioId, periodo);
        if (vivo) setD(x);
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    })();
    return () => { vivo = false; };
  }, [miembro.usuarioId, periodo.desde, periodo.hasta]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[5vh] pb-8 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-neutral-50 rounded-xl shadow-2xl w-full max-w-2xl mx-4 border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-800">{miembro.nombre}</h2>
            <p className="text-sm text-neutral-500">{periodoTexto(periodo.desde, periodo.hasta)}</p>
          </div>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800 shrink-0">Cerrar</button>
        </div>

        <div className="p-5 overflow-x-hidden">
          {error && <p className="text-sm text-danger-600">{error}</p>}
          {!error && !d && <p className="text-sm text-neutral-500">Cargando detalle...</p>}

          {d && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {d.diasPeriodo === 1 ? (
                  <ChipEstado estado={d.dias[0]?.estado ?? "sin_reporte"} />
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-200 text-neutral-600">
                    Cierres diarios enviados: {d.reportesEnviados} / {d.diasPeriodo}
                  </span>
                )}
                <span className="text-xs text-neutral-500">
                  {d.reportesEnviados === 0
                    ? "No envió ningún Cierre diario en el período. No es lo mismo que no haber trabajado."
                    : "Solo los días con Cierre diario enviado traen cifras de prospección."}
                </span>
              </div>

              <Tarjeta titulo="Embudo del período">
                <Embudo funnel={d.funnel} compacto />
              </Tarjeta>

              {d.canales.length > 0 && <BloqueCanales canales={d.canales} titulo="Prospección por canal" />}

              <Tarjeta titulo="Score">
                {d.score ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <p className={`text-4xl font-bold ${ColorScore(d.score.total)}`}>{d.score.total}</p>
                    <div className="text-xs text-neutral-500">
                      <p>Actividad {d.score.actividadDisponible ? d.score.actividad.toFixed(1) : "sin dato"} / 20</p>
                      <p>Follow-up {d.score.followup.toFixed(1)} / 20 · Resultados {d.score.resultados.toFixed(1)} / 40 · Continuidad {d.score.continuidad.toFixed(1)} / 20</p>
                      {d.score.parcial && (
                        <p className="text-warning-600 font-medium mt-1">
                          Parcial: no hubo Cierre diario ese día, así que la prospección no se cuenta como cero.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">
                    El score solo se puede calcular sobre el día en curso: usa los follow-ups vencidos de
                    hoy y la actividad de los últimos 7 días, que no se pueden reconstruir hacia atrás.
                  </p>
                )}
              </Tarjeta>

              <Tarjeta titulo="Cierres diarios del período">
                <div className="flex flex-col gap-2">
                  {[...d.dias].reverse().map((dia) => (
                    <div
                      key={dia.fecha}
                      className="bg-white border border-neutral-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-neutral-800">{fechaLarga(dia.fecha)}</p>
                        <p className="text-xs text-neutral-500">
                          {dia.prospeccion
                            ? `Contactados ${dia.prospeccion.contactados ?? "—"} · Respuestas ${dia.prospeccion.respuestas ?? "—"} · Interesados ${dia.prospeccion.interesados ?? "—"}`
                            : dia.estado === "borrador"
                              ? "Tiene un borrador, todavía sin enviar"
                              : "Sin prospección registrada ese día"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <ChipEstado estado={dia.estado} />
                        {/* Solo se puede abrir un reporte ENVIADO: un borrador no es información
                            oficial del día, y el backend tampoco lo muestra a terceros. */}
                        {dia.estado === "enviado" && (
                          <button
                            onClick={() => setReporteAbierto(dia.fecha)}
                            className="text-xs text-primary-600 hover:underline"
                          >
                            Ver reporte
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Tarjeta>
            </div>
          )}
        </div>
      </div>

      {reporteAbierto && (
        <ModalReporte usuarioId={miembro.usuarioId} fecha={reporteAbierto} onClose={() => setReporteAbierto(null)} />
      )}
    </div>
  );
}

/** El reporte real de una persona en una fecha. Reutiliza el MISMO `DetalleReporte` del Historial. */
function ModalReporte({ usuarioId, fecha, onClose }: { usuarioId: string; fecha: string; onClose: () => void }) {
  const [detalle, setDetalle] = useState<DetalleHistorialDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const x = await api.podcastHistorialDetalle(usuarioId, fecha);
        if (vivo) setDetalle(x);
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    })();
    return () => { vivo = false; };
  }, [usuarioId, fecha]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[5vh] pb-8 overflow-y-auto" onClick={onClose}>
      <div className="bg-neutral-50 rounded-xl shadow-2xl w-full max-w-2xl mx-4 border border-neutral-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end px-5 pt-4">
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Cerrar</button>
        </div>
        <div className="p-5 pt-3">
          {error && <p className="text-sm text-danger-600">{error}</p>}
          {!error && !detalle && <p className="text-sm text-neutral-500">Cargando reporte...</p>}
          {!error && detalle && !detalle.existe && (
            <p className="text-sm text-neutral-600">No hay reporte enviado para esta fecha.</p>
          )}
          {!error && detalle && detalle.existe && <DetalleReporte detalle={detalle} />}
        </div>
      </div>
    </div>
  );
}

// ─── Vista ────────────────────────────────────────────────────────

type Atajo = "hoy" | "ayer" | "7" | "30" | "dia";

export function PodcastEquipoPage() {
  const { usuario } = useAuth();
  const [periodo, setPeriodo] = useState<{ desde: string; hasta: string }>(() => ({ desde: hoyET(), hasta: hoyET() }));
  const [atajo, setAtajo] = useState<Atajo>("hoy");
  const [d, setD] = useState<DesempenoEquipoDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<FilaEquipoPodcastDTO | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const x = await api.podcastDesempenoEquipo(periodo);
        if (vivo) {
          setD(x);
          setError(null);
        }
      } catch (e) {
        if (vivo) setError((e as Error).message);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [periodo.desde, periodo.hasta]);

  const irA = (cual: Atajo, desde: string, hasta: string) => {
    setAtajo(cual);
    setPeriodo({ desde, hasta });
  };

  const boton = (cual: Atajo, texto: string, desde: string, hasta: string) => (
    <button
      onClick={() => irA(cual, desde, hasta)}
      className={`text-sm px-3 py-2 rounded-lg border transition-colors ${atajo === cual ? "bg-primary-100 text-primary-700 border-transparent" : "border-neutral-200 text-neutral-600 hover:border-primary-200"}`}
    >
      {texto}
    </button>
  );

  const hoy = hoyET();

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-neutral-800 mb-1">Reporte de equipo</h1>
      <p className="text-sm text-neutral-500 mb-4">
        {periodoTexto(periodo.desde, periodo.hasta)} · Meta: {d?.metas.prospectosContactados ?? "—"} contactos, {d?.metas.podcastsAgendados ?? "—"} podcasts agendados/día
      </p>

      {/* Período: un día suelto o los atajos de 7 y 30 días. */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Día</span>
            <input
              type="date"
              value={periodo.hasta}
              max={hoy}
              onChange={(e) => e.target.value && irA("dia", e.target.value, e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {boton("hoy", "Hoy", hoy, hoy)}
            {boton("ayer", "Ayer", sumarDias(hoy, -1), sumarDias(hoy, -1))}
            {boton("7", "Últimos 7 días", sumarDias(hoy, -6), hoy)}
            {boton("30", "Últimos 30 días", sumarDias(hoy, -29), hoy)}
          </div>
        </div>
      </div>

      {usuario?.rol === "SUPER_ADMIN" && <MetasEditor />}

      {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}
      {cargando && !d && <p className="text-sm text-neutral-500">Cargando reporte...</p>}

      {d && (
        <>
          {/* EMBUDO DEL EQUIPO — la misma secuencia que ve cada persona en "Mi desempeño". */}
          <div className="mb-4">
            <Tarjeta titulo="Embudo del equipo">
              <Embudo funnel={d.funnel} />
              <p className="text-xs text-neutral-400 mt-3">
                Los tres primeros escalones se calculan solo sobre los Cierres diarios enviados
                {d.diasPeriodo > 1 && ` en los ${d.diasPeriodo} días del período`}; quien no reportó no suma cero.
                Los cuatro últimos son movimientos reales del Pipeline y no dependen de que alguien reporte.
              </p>
            </Tarjeta>
          </div>

          {d.canales.length > 0 && (
            <div className="mb-4">
              <BloqueCanales canales={d.canales} titulo="Prospección por canal del equipo" />
            </div>
          )}

          {/* PERSONAS — la fila se abre para ver el detalle individual. */}
          <div className="mb-4">
            <Tarjeta titulo="Equipo">
              {d.equipo.length === 0 ? (
                <p className="text-sm text-neutral-500">Aún no hay usuarios asignados al departamento Podcast.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-600 border-b border-neutral-200">
                        <th className="py-2 pr-3">Integrante</th>
                        <th className="py-2 px-3 text-right">Score</th>
                        <th className="py-2 px-3 text-right">Contactados</th>
                        <th className="py-2 px-3 text-right hidden sm:table-cell">Respuestas</th>
                        <th className="py-2 px-3 text-right hidden md:table-cell">Interesados</th>
                        <th className="py-2 px-3 text-right">Agendados</th>
                        <th className="py-2 px-3 text-right hidden sm:table-cell">Completados</th>
                        <th className="py-2 px-3 text-right hidden md:table-cell">1%</th>
                        <th className="py-2 px-3 text-right hidden md:table-cell">Convertidos</th>
                        <th className="py-2 px-3 text-right hidden lg:table-cell">Follow-ups</th>
                        <th className="py-2 px-3 text-right hidden sm:table-cell">% Meta</th>
                        <th className="py-2 px-3 hidden sm:table-cell">Tendencia</th>
                        <th className="py-2 pl-3">Cierre diario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.equipo.map((f) => (
                        <tr
                          key={f.usuarioId}
                          onClick={() => setAbierto(f)}
                          className="border-b border-neutral-100 cursor-pointer hover:bg-primary-50/50"
                          title="Ver el detalle de esta persona"
                        >
                          <td className="py-2 pr-3 font-medium text-primary-700">{f.nombre}</td>
                          <td className={`py-2 px-3 text-right font-bold ${f.score ? ColorScore(f.score.total) : "text-neutral-300"}`}>
                            {f.score ? f.score.total : "—"}
                          </td>
                          <td className={`py-2 px-3 text-right ${f.contactados === null ? "text-neutral-300" : "text-neutral-700"}`}>{f.contactados ?? "—"}</td>
                          <td className={`py-2 px-3 text-right hidden sm:table-cell ${f.respuestas === null ? "text-neutral-300" : "text-neutral-700"}`}>{f.respuestas ?? "—"}</td>
                          <td className={`py-2 px-3 text-right hidden md:table-cell ${f.interesados === null ? "text-neutral-300" : "text-neutral-700"}`}>{f.interesados ?? "—"}</td>
                          <td className="py-2 px-3 text-right text-neutral-700">{f.agendados}</td>
                          <td className="py-2 px-3 text-right hidden sm:table-cell text-neutral-700">{f.completados}</td>
                          <td className="py-2 px-3 text-right hidden md:table-cell text-neutral-700">{f.reuniones1}</td>
                          <td className="py-2 px-3 text-right hidden md:table-cell text-neutral-700">{f.transaccionaron}</td>
                          <td className="py-2 px-3 text-right hidden lg:table-cell text-neutral-700">{f.followupsRealizados}</td>
                          <td className={`py-2 px-3 text-right hidden sm:table-cell font-medium ${f.pctMeta >= 100 ? "text-success-600" : "text-neutral-700"}`}>{f.pctMeta}%</td>
                          <td className="py-2 px-3 hidden sm:table-cell">
                            {f.tendencia ? <TendenciaBadge tendencia={f.tendencia} /> : <span className="text-xs text-neutral-300">—</span>}
                          </td>
                          <td className="py-2 pl-3">
                            {f.estado ? (
                              <ChipEstado estado={f.estado} />
                            ) : (
                              <span className="text-xs text-neutral-500 whitespace-nowrap">{f.reportesEnviados} / {f.diasPeriodo} días</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-neutral-400 mt-3">
                Los números de cada persona salen del mismo cálculo que "Mi desempeño", así que para la
                misma fecha los dos coinciden. "—" es un dato que no se registró, no un cero.
                {" "}En un período de varios días, el score y la tendencia no se muestran: solo se pueden
                calcular sobre el día en curso.
              </p>
            </Tarjeta>
          </div>

          {/* RESUMEN EN NÚMEROS — para leer de un vistazo sin abrir la tabla. */}
          <div className="mb-4">
            <Tarjeta titulo="Resumen del período">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Dato label="Equipo" valor={d.equipo.length} nota="integrantes de Podcast" />
                <Dato label="Cierres diarios enviados" valor={d.reportesEnviados} nota={`sobre ${d.equipo.length * d.diasPeriodo} posibles`} />
                <Dato label="Convertidos" valor={d.funnel.transaccionaron} nota="ventas cerradas en el Pipeline" />
                <Dato label="Tasa de respuesta" valor={d.funnel.tasaRespuesta} nota="Respuestas / Contactados" />
              </div>
            </Tarjeta>
          </div>
        </>
      )}

      {abierto && (
        <DetalleMiembroModal miembro={abierto} periodo={periodo} onClose={() => setAbierto(null)} />
      )}
    </div>
  );
}
