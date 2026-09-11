import { useEffect, useState } from "react";
import { api, type DesempenoMiDTO, type HistorialMiembroDTO } from "../api/client";
import { EstadoIABadge, TendenciaBadge, ScoreBar } from "../components/PodcastBadges";
import { BloqueCanales, ChipEstado, Embudo, Tarjeta, fechaLarga } from "../components/PodcastUI";
import { useAuth } from "../api/AuthContext";

// PODCAST → MI DESEMPEÑO.
//
// Un USUARIO normal ve exactamente lo suyo y no ve ningún selector: la página se comporta igual
// que siempre. Un ADMIN (o SUPER_ADMIN) sí puede elegir a otra persona del equipo — y esa consulta
// la autoriza el BACKEND, no esta pantalla: cambiar el id a mano devuelve 403.
//
// El embudo sale del mismo lugar que el de "Reporte de equipo", así que las dos pantallas no pueden
// mostrar cifras distintas para la misma persona y la misma fecha.

export function PodcastMiDesempenoPage() {
  const { usuario } = useAuth();
  const [d, setD] = useState<DesempenoMiDTO | null>(null);
  const [miembros, setMiembros] = useState<HistorialMiembroDTO[]>([]);
  const [puedeVerEquipo, setPuedeVerEquipo] = useState(false);
  // null = "Mi desempeño". El id real solo se usa cuando se consulta a otra persona.
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quién más se puede consultar. El backend devuelve sólo a la propia persona cuando no hay
  // permiso de ver al equipo, así que el selector no se inventa la lista ni los nombres.
  useEffect(() => {
    api.podcastHistorialMiembros()
      .then((r) => {
        setMiembros(r.miembros);
        setPuedeVerEquipo(r.puedeVerEquipo);
      })
      .catch(() => { /* el selector es opcional: si falla, la página sigue mostrando lo propio */ });
  }, []);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const x = seleccionado ? await api.podcastDesempenoUsuario(seleccionado) : await api.podcastDesempenoMi();
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
  }, [seleccionado]);

  if (cargando && !d) return <p className="text-sm text-neutral-500">Cargando...</p>;
  if (!d) return <p className="text-sm text-danger-600">{error ?? "No se pudo cargar el desempeño."}</p>;

  const nombreMostrado = seleccionado ? miembros.find((m) => m.usuarioId === seleccionado)?.nombre ?? "Integrante" : "Mi desempeño";
  const score = d.score;
  const nivelScore = score ? (score.total >= 80 ? "text-success-600" : score.total >= 50 ? "text-amber-600" : "text-danger-600") : "";

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-semibold text-neutral-800">
          {seleccionado ? `Desempeño de ${nombreMostrado}` : "Mi desempeño"} · Podcast
        </h1>
        <EstadoIABadge nivel={d.estadoIA} />
      </div>
      <p className="text-sm text-neutral-500 mb-4">{fechaLarga(d.fecha)}</p>

      {/* Selector de persona. Solo aparece si el backend dice que esta cuenta puede ver al equipo. */}
      {puedeVerEquipo && miembros.length > 1 && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4">
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">¿De quién quieres ver el desempeño?</span>
            <select
              value={seleccionado ?? ""}
              onChange={(e) => setSeleccionado(e.target.value || null)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Mi desempeño</option>
              {miembros
                .filter((m) => !m.esYo)
                .map((m) => (
                  <option key={m.usuarioId} value={m.usuarioId}>{m.nombre}</option>
                ))}
            </select>
          </label>
          <p className="text-[11px] text-neutral-400 mt-2">
            Solo se puede consultar a integrantes del equipo de Podcast. El servidor lo verifica igual,
            aunque se cambie el id a mano.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

      {/* Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-neutral-500 mb-1">Performance Score</p>
          {score ? (
            <>
              <p className={`text-5xl font-bold ${nivelScore}`}>{score.total}</p>
              <p className="text-xs text-neutral-500 mt-1">de 100</p>
              {score.parcial && (
                <span className="mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-warning-500/10 text-warning-600">
                  Parcial
                </span>
              )}
            </>
          ) : (
            <>
              <p className="text-5xl font-bold text-neutral-300">—</p>
              <p className="text-xs text-neutral-400 mt-1 text-center">
                Solo se calcula sobre el día en curso
              </p>
            </>
          )}
        </div>
        <div className="md:col-span-2 bg-neutral-50 border border-neutral-200 rounded-xl p-5 flex flex-col gap-3 justify-center">
          {score ? (
            <>
              {score.actividadDisponible ? (
                <ScoreBar label="Actividad (20%)" valor={score.actividad} max={20} />
              ) : (
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">Actividad (20%)</span>
                  <span className="font-medium text-neutral-400">sin dato — no hubo Cierre diario</span>
                </div>
              )}
              <ScoreBar label="Follow-up (20%)" valor={score.followup} max={20} />
              <ScoreBar label="Resultados (40%)" valor={score.resultados} max={40} />
              <ScoreBar label="Continuidad (20%)" valor={score.continuidad} max={20} />
              {score.parcial && (
                <p className="text-[11px] text-neutral-500 mt-1">
                  Ese día no quedó registrado el Cierre diario, así que la prospección no se cuenta como
                  cero: el total se arma solo con lo que sí es real (CRM y seguimientos) y se reparte
                  sobre los {score.maxDisponible} puntos que se pueden medir.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-neutral-500">
              El score usa los follow-ups vencidos de hoy y la actividad de los últimos 7 días: no se
              puede reconstruir hacia atrás sin inventar datos.
            </p>
          )}
        </div>
      </div>

      {/* Estado del Cierre diario de la fecha */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <ChipEstado estado={d.estadoReporte} />
        <span className="text-xs text-neutral-500">
          {d.estadoReporte === "enviado"
            ? "El Cierre diario de esa fecha quedó enviado."
            : d.estadoReporte === "borrador"
              ? "Hay un borrador sin enviar: sus cifras no cuentan como información del día."
              : "No hubo Cierre diario esa fecha. No es lo mismo que un día de cero actividad."}
        </span>
      </div>

      {/* Embudo */}
      <div className="mb-4">
        <Tarjeta titulo="Embudo del día">
          <Embudo funnel={d.funnel} />
          <p className="text-xs text-neutral-400 mt-3">
            Los tres primeros escalones son lo que se registra en el Cierre diario. Los cuatro últimos
            son movimientos reales del Pipeline, los haya reportado alguien o no. No se suman entre sí.
          </p>
        </Tarjeta>
      </div>

      {/* Canales */}
      {d.canales.length > 0 && (
        <div className="mb-4">
          <BloqueCanales canales={d.canales} />
        </div>
      )}

      {/* Comparaciones */}
      <Tarjeta titulo="Hoy vs ayer vs promedio 7 días">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-600 border-b border-neutral-200">
                <th className="py-2 pr-2">KPI</th>
                <th className="py-2 px-2 text-right">Hoy</th>
                <th className="py-2 px-2 text-right">Ayer</th>
                <th className="py-2 px-2 text-right">Prom. 7d</th>
                <th className="py-2 px-2 text-right">Meta</th>
                <th className="py-2 px-2 text-right">% meta</th>
                <th className="py-2 px-2 text-right">vs ayer</th>
                <th className="py-2 pl-2">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {d.comparaciones.map((c) => (
                <tr key={c.clave} className="border-b border-neutral-100">
                  <td className="py-2 pr-2 text-neutral-700">{c.label}</td>
                  <td className={`py-2 px-2 text-right font-semibold ${c.disponible ? "text-neutral-800" : "text-neutral-300"}`}>{c.hoy ?? "—"}</td>
                  <td className={`py-2 px-2 text-right ${c.ayer === null ? "text-neutral-300" : "text-neutral-500"}`}>{c.ayer ?? "—"}</td>
                  <td className={`py-2 px-2 text-right ${c.promedio7 === null ? "text-neutral-300" : "text-neutral-500"}`}>{c.promedio7 ?? "—"}</td>
                  <td className="py-2 px-2 text-right text-neutral-500">{c.meta ?? "—"}</td>
                  <td className="py-2 px-2 text-right text-neutral-500">{c.cumplimiento !== null ? `${c.cumplimiento}%` : "—"}</td>
                  <td className={`py-2 px-2 text-right font-medium ${c.variacionAyer === null ? "text-neutral-400" : c.variacionAyer >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {c.variacionAyer === null ? "—" : `${c.variacionAyer > 0 ? "+" : ""}${c.variacionAyer}%`}
                  </td>
                  <td className="py-2 pl-2"><TendenciaBadge tendencia={c.tendencia} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-400 mt-3">
          "—" significa que ese día no hay dato registrado, no un cero.
        </p>
      </Tarjeta>

      {/* Alertas */}
      {d.alertas.length > 0 && (
        <div className="mt-4">
          <Tarjeta titulo="Alertas del monitor de IA">
            <div className="flex flex-col gap-3">
              {d.alertas.map((a) => (
                <div key={a.tipo} className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold ${a.nivel === "intervencion" ? "text-danger-600" : "text-amber-600"}`}>
                      {a.nivel === "intervencion" ? "🔴" : "🟡"} {a.titulo}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-700">{a.evidencia}</p>
                  <p className="text-sm text-neutral-500">{a.comparacion}</p>
                  <p className="text-sm text-neutral-600 mt-1"><b>Causa:</b> {a.causa}</p>
                  <p className="text-sm text-neutral-600"><b>Acción:</b> {a.accion}</p>
                </div>
              ))}
            </div>
          </Tarjeta>
        </div>
      )}

      {seleccionado && usuario?.id === seleccionado && (
        <p className="text-xs text-neutral-400 mt-4">
          Estás viendo tu propia ficha desde el selector del equipo.
        </p>
      )}
    </div>
  );
}
