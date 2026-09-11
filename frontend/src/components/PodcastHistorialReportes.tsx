import { useCallback, useEffect, useState } from "react";
import {
  api,
  type CanalProspeccionDTO,
  type DetalleHistorialDTO,
  type FilaHistorialDTO,
  type HistorialMiembroDTO,
} from "../api/client";
import { useAuth } from "../api/AuthContext";

/** Suma un campo de todos los canales. Los totales no se guardan: se derivan del desglose. */
function sumar(canales: CanalProspeccionDTO[], campo: "contactados" | "respuestas" | "interesados"): number {
  return canales.reduce((acc, c) => acc + c[campo], 0);
}

// HISTORIAL Y CONSULTA de los Reportes Diarios de Podcast (PODCAST → Cierre diario → Historial).
//
// Esta vista es SOLO LECTURA sobre los mismos registros que genera el Cierre diario: no crea
// reportes, no los duplica, no los modifica y no genera resúmenes. Un reporte que no existe se
// muestra como "no hay reporte", NUNCA como un reporte con ceros.

// ─── Fechas (hora de Florida, igual que el resto del módulo) ──────

const ZONA = "America/New_York";

/** Hoy en Florida, como YYYY-MM-DD. */
function hoyET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function sumarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}

/** "2026-09-09" → "9 de septiembre de 2026". Se arma con las partes para no correr el día. */
function fechaLarga(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/** Timestamp real → "9 sep 2026 · 6:14 PM" (en hora de Florida). */
function fechaHora(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: ZONA });
  const hora = d.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONA });
  return `${dia} · ${hora}`;
}

// ─── Piezas de UI (mismas que usa el Cierre diario) ───────────────

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">{titulo}</h3>
      {children}
    </div>
  );
}

function BadgeEstado({ estado }: { estado: "borrador" | "enviado" | null }) {
  if (!estado) return null;
  const enviado = estado === "enviado";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${enviado ? "bg-success-500/10 text-success-600" : "bg-neutral-200 text-neutral-600"}`}>
      {enviado ? "Enviado" : "Borrador"}
    </span>
  );
}

/** Número escrito a mano. `null` = no lo llenó → "—", nunca un 0 que nadie escribió. */
function NumeroManual({ label, valor, meta }: { label: string; valor: number | null; meta?: number | null }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3">
      <p className="text-xs text-neutral-500">{label}{meta != null && <span className="text-neutral-400"> · meta {meta}</span>}</p>
      <p className={`text-xl font-semibold ${valor === null ? "text-neutral-300" : "text-neutral-800"}`}>{valor ?? "—"}</p>
    </div>
  );
}

/** Bloque de texto original. Vacío = "Sin respuesta." (no se inventa contenido). */
function TextoOriginal({ texto }: { texto: string | null }) {
  if (!texto || !texto.trim()) return <p className="text-sm text-neutral-400">Sin respuesta.</p>;
  return <p className="text-sm text-neutral-700 whitespace-pre-wrap">{texto}</p>;
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <p className="text-xs text-neutral-500">
      {label}: <span className="text-neutral-700">{valor}</span>
    </p>
  );
}

// ─── Vista ────────────────────────────────────────────────────────

export function PodcastHistorialReportes() {
  const { usuario } = useAuth();

  const [miembros, setMiembros] = useState<HistorialMiembroDTO[]>([]);
  const [puedeVerEquipo, setPuedeVerEquipo] = useState(false);
  const [miembroId, setMiembroId] = useState<string>(""); // "" = todos los miembros
  const [fecha, setFecha] = useState<string>(hoyET);

  const [detalle, setDetalle] = useState<DetalleHistorialDTO | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [reportesDelDia, setReportesDelDia] = useState<FilaHistorialDTO[]>([]);
  const [listado, setListado] = useState<FilaHistorialDTO[]>([]);
  const [truncado, setTruncado] = useState(false);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mostrarError = useCallback((e: unknown) => setError((e as Error).message), []);

  // Miembros reales del equipo (nunca hardcodeados). Sin permiso de equipo, el selector
  // solo contiene a la propia persona, y así lo impone también el backend.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await api.podcastHistorialMiembros();
        if (!vivo) return;
        setPuedeVerEquipo(d.puedeVerEquipo);
        setMiembros(d.miembros);
        if (!d.puedeVerEquipo) setMiembroId(d.miembros[0]?.usuarioId ?? "");
      } catch (e) {
        if (vivo) mostrarError(e);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [mostrarError]);

  // Reporte de la persona + fecha seleccionadas (una sola persona: no se mezcla nada).
  useEffect(() => {
    if (!miembroId) { setDetalle(null); return; }
    let vivo = true;
    setCargandoDetalle(true);
    (async () => {
      try {
        const d = await api.podcastHistorialDetalle(miembroId, fecha);
        if (vivo) setDetalle(d);
      } catch (e) {
        if (vivo) mostrarError(e);
      } finally {
        if (vivo) setCargandoDetalle(false);
      }
    })();
    return () => { vivo = false; };
  }, [miembroId, fecha, mostrarError]);

  // ¿Quién envió y quién no, en la fecha elegida? (solo cuando se miran todos los miembros)
  useEffect(() => {
    if (miembroId) return;
    let vivo = true;
    (async () => {
      try {
        const d = await api.podcastHistorial({ desde: fecha, hasta: fecha });
        if (vivo) setReportesDelDia(d.reportes);
      } catch (e) {
        if (vivo) mostrarError(e);
      }
    })();
    return () => { vivo = false; };
  }, [miembroId, fecha, mostrarError]);

  // Listado cronológico de reportes anteriores (más reciente primero, ordenado en el backend).
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await api.podcastHistorial(miembroId ? { usuarioId: miembroId } : {});
        if (vivo) { setListado(d.reportes); setTruncado(d.truncado); }
      } catch (e) {
        if (vivo) mostrarError(e);
      }
    })();
    return () => { vivo = false; };
  }, [miembroId, mostrarError]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const miembro = miembros.find((m) => m.usuarioId === miembroId);
  const esMiPropio = !!usuario && (miembroId ? miembroId === usuario.id : false);

  const abrirReporte = (fila: FilaHistorialDTO) => {
    setMiembroId(fila.usuarioId);
    setFecha(fila.fecha);
  };

  return (
    <div className="max-w-4xl">
      {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

      {/* Filtros: persona + fecha */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Miembro</span>
            <select
              value={miembroId}
              onChange={(e) => setMiembroId(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {puedeVerEquipo && <option value="">Todos</option>}
              {miembros.map((m) => (
                <option key={m.usuarioId} value={m.usuarioId}>{m.esYo ? `${m.nombre} (yo)` : m.nombre}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Fecha del reporte</span>
            <input
              type="date"
              value={fecha}
              max={hoyET()}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => setFecha(hoyET())}
              className={`text-sm px-3 py-2 rounded-lg border transition-colors ${fecha === hoyET() ? "bg-primary-100 text-primary-700 border-transparent" : "border-neutral-200 text-neutral-600 hover:border-primary-200"}`}
            >
              Hoy
            </button>
            <button
              onClick={() => setFecha(sumarDias(hoyET(), -1))}
              className={`text-sm px-3 py-2 rounded-lg border transition-colors ${fecha === sumarDias(hoyET(), -1) ? "bg-primary-100 text-primary-700 border-transparent" : "border-neutral-200 text-neutral-600 hover:border-primary-200"}`}
            >
              Ayer
            </button>
          </div>
        </div>
      </div>

      {/* Una persona y una fecha: su reporte, o el aviso de que no existe */}
      {miembroId && (
        <div className="mb-6">
          {cargandoDetalle && <p className="text-sm text-neutral-500">Cargando reporte...</p>}
          {!cargandoDetalle && detalle && !detalle.existe && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 text-center">
              <p className="text-sm font-medium text-neutral-700">
                {esMiPropio ? "No hay reporte para esta fecha." : "No hay reporte enviado para esta fecha."}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {detalle.usuarioNombre} · {fechaLarga(detalle.fecha)}
              </p>
            </div>
          )}
          {!cargandoDetalle && detalle && detalle.existe && (
            <DetalleReporte detalle={detalle} />
          )}
        </div>
      )}

      {/* Todos los miembros: quién ya envió y quién no, para la fecha elegida */}
      {!miembroId && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-neutral-700 mb-2">
            Reportes de {fechaLarga(fecha)}
          </h3>
          <div className="flex flex-col gap-2">
            {miembros.map((m) => {
              const fila = reportesDelDia.find((r) => r.usuarioId === m.usuarioId);
              return (
                <div key={m.usuarioId} className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{m.nombre}</p>
                    {fila?.enviadoEn && <p className="text-xs text-neutral-500">Enviado: {fechaHora(fila.enviadoEn)}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {fila ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-success-500/10 text-success-600">Enviado ✓</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-200 text-neutral-600">Sin reporte</span>
                    )}
                    <button
                      onClick={() => setMiembroId(m.usuarioId)}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      Ver
                    </button>
                  </div>
                </div>
              );
            })}
            {miembros.length === 0 && <p className="text-sm text-neutral-500">No hay miembros de Podcast registrados.</p>}
          </div>
        </div>
      )}

      {/* Historial cronológico: más reciente → más antigua */}
      <h3 className="text-sm font-medium text-neutral-700 mb-2">
        Reportes anteriores{miembro ? ` · ${miembro.nombre}` : ""}
      </h3>
      {listado.length === 0 ? (
        <p className="text-sm text-neutral-500">Todavía no hay reportes registrados.</p>
      ) : (
        <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-200 max-h-96 overflow-y-auto">
          {listado.map((r) => (
            <button
              key={r.id}
              onClick={() => abrirReporte(r)}
              className={`w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors ${
                miembroId === r.usuarioId && fecha === r.fecha ? "bg-primary-50" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">
                    {fechaLarga(r.fecha)}
                    {!miembroId && <span className="text-neutral-500 font-normal"> · {r.usuarioNombre}</span>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {r.estado === "enviado"
                      ? r.enviadoEn ? `Enviado: ${fechaHora(r.enviadoEn)}` : "Enviado"
                      : "Borrador sin enviar"}
                  </p>
                </div>
                <BadgeEstado estado={r.estado} />
              </div>
            </button>
          ))}
        </div>
      )}
      {truncado && (
        <p className="text-xs text-neutral-500 mt-2">
          Se muestran los reportes más recientes. Elige un miembro para ver su historial completo.
        </p>
      )}
    </div>
  );
}

// ─── Detalle completo, solo lectura ───────────────────────────────
// Exportado para que PODCAST → Resumen del equipo pueda abrir el reporte real reutilizando este
// MISMO componente, en vez de tener una segunda forma de pintar un reporte que podría divergir.

export function DetalleReporte({ detalle }: { detalle: DetalleHistorialDTO }) {
  const r = detalle.reporte;
  const c = detalle.compromiso;
  const m = detalle.metricas;
  const s = detalle.metricasReportadas;
  const tieneCompromiso =
    (c != null && [c.contactos, c.followups, c.podcasts].some((v) => v != null)) || !!c?.nota;

  // REPORTE HISTÓRICO vs MÉTRICA ACTUAL. Son dos cosas distintas y la pantalla no las mezcla:
  //   · con sello (migración 0038) → se muestran las cifras CONGELADAS al enviar, que son el
  //     reporte histórico de verdad; el CRM puede haber cambiado después y no las toca;
  //   · sin sello (reportes anteriores) → se muestran las cifras actuales, diciendo que no hay
  //     sello, en vez de fingir que son las de aquel día.
  const autoActual = m
    ? [
        { label: "Podcasts agendados", valor: m.agendados },
        { label: "Podcasts completados", valor: m.realizados },
        { label: "Reuniones del 1%", valor: m.reuniones },
        { label: "Ventas cerradas", valor: m.ventas },
        { label: "No-shows", valor: m.noShows },
        { label: "Follow-ups realizados", valor: m.followupsRealizados },
        { label: "Follow-ups vencidos", valor: m.followupsVencidos },
      ]
    : [];
  const autoSellado = s
    ? [
        { label: "Podcasts agendados", valor: s.agendados },
        { label: "Podcasts completados", valor: s.completados },
        { label: "Reuniones del 1%", valor: s.reuniones1 },
        { label: "Ventas cerradas", valor: s.convertidos },
        { label: "No-shows", valor: s.noShows },
        { label: "Follow-ups realizados", valor: s.followupsRealizados },
        { label: "Follow-ups vencidos", valor: s.followupsVencidos },
      ]
    : [];
  const auto = s ? autoSellado : autoActual;
  // Solo se avisa de las cifras que HOY dicen otra cosa: repetir las que coinciden es ruido.
  const cambiaron = s
    ? autoSellado
        .map((a, i) => ({ label: a.label, sellado: a.valor, actual: autoActual[i]?.valor }))
        .filter((d) => d.actual !== undefined && d.actual !== d.sellado)
    : [];

  return (
    <div className="border border-neutral-200 rounded-xl p-5">
      {/* Encabezado: persona + fecha del reporte + estado */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">Reporte de {detalle.usuarioNombre}</h2>
          <p className="text-sm text-neutral-500">Reporte del {fechaLarga(detalle.fecha)}</p>
        </div>
        <BadgeEstado estado={detalle.estado} />
      </div>

      {/* Fecha de envío — es un dato DISTINTO de la fecha del reporte (pueden ser días distintos) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 mb-4">
        {detalle.estado === "enviado" && (
          <Dato label="Enviado" valor={detalle.enviadoEn ? fechaHora(detalle.enviadoEn) : "sin hora registrada"} />
        )}
        {detalle.estado === "borrador" && <Dato label="Estado" valor="Borrador · todavía no enviado" />}
        {detalle.updatedAt && <Dato label="Última actualización" valor={fechaHora(detalle.updatedAt)} />}
      </div>

      {/* Automático: lo que BOS calculó ese día */}
      {(s || m) && (
        <div className="mb-4">
          <Tarjeta titulo={s ? "Lo que BOS reportó ese día" : "Lo que BOS calcula hoy de ese día"}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {auto.map((a) => (
                <div key={a.label} className="bg-white border border-neutral-200 rounded-lg p-3">
                  <p className="text-xs text-neutral-500">{a.label}</p>
                  <p className="text-xl font-semibold text-neutral-800">{a.valor}</p>
                </div>
              ))}
            </div>

            {s && (
              <p className="text-xs text-neutral-400 mt-2">
                Cifras selladas al enviar el reporte: no cambian después, aunque se corrija el CRM.
              </p>
            )}
            {!s && m && (
              <p className="text-xs text-neutral-400 mt-2">
                Este reporte es anterior al sello de cifras, así que se muestran las que el CRM tiene
                hoy. No se puede saber si ese día eran otras.
              </p>
            )}

            {cambiaron.length > 0 && (
              <div className="mt-3 pt-3 border-t border-neutral-200">
                <p className="text-xs font-semibold text-neutral-600 mb-1">
                  El CRM cambió después del envío
                </p>
                <ul className="space-y-0.5">
                  {cambiaron.map((d) => (
                    <li key={d.label} className="text-xs text-neutral-500">
                      {d.label}: reportado <span className="font-semibold text-neutral-700">{d.sellado}</span>,
                      hoy <span className="font-semibold text-neutral-700">{d.actual}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Lo reportado no se toca: es el registro histórico de ese día.
                </p>
              </div>
            )}
          </Tarjeta>
        </div>
      )}

      {/* Manual: lo que la persona escribió (esto es lo que no se puede deducir solo).
          Los reportes nuevos traen el desglose POR CANAL; los anteriores solo los totales
          sueltos y se muestran con esos, sin repartirlos por canal (nunca se registró). */}
      <div className="mb-4">
        {detalle.canales && detalle.canales.length > 0 ? (
          <Tarjeta titulo="Prospección registrada (por canal)">
            <div className="space-y-2">
              {detalle.canales.map((canal, i) => (
                // El índice en la llave porque el mismo canal puede repetirse en un día.
                <div key={`${canal.canal}-${i}`} className="bg-white border border-neutral-200 rounded-lg p-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                  <p className="text-sm font-medium text-neutral-800 w-28 shrink-0">{canal.canal}</p>
                  <p className="text-xs text-neutral-500">
                    Contactados <span className="text-sm font-semibold text-neutral-800">{canal.contactados}</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    Respuestas <span className="text-sm font-semibold text-neutral-800">{canal.respuestas}</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    Interesados <span className="text-sm font-semibold text-neutral-800">{canal.interesados}</span>
                  </p>
                </div>
              ))}
            </div>
            {/* Se suman al vuelo desde el desglose: no existen como cifra guardada aparte. */}
            <div className="mt-3 pt-3 border-t border-neutral-200 grid grid-cols-3 gap-3 text-sm">
              <p className="text-neutral-500">
                Total contactados <span className="font-semibold text-neutral-800">{sumar(detalle.canales, "contactados")}</span>
              </p>
              <p className="text-neutral-500">
                Total respuestas <span className="font-semibold text-neutral-800">{sumar(detalle.canales, "respuestas")}</span>
              </p>
              <p className="text-neutral-500">
                Total interesados <span className="font-semibold text-neutral-800">{sumar(detalle.canales, "interesados")}</span>
              </p>
            </div>
          </Tarjeta>
        ) : (
          <Tarjeta titulo="Prospección registrada">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* "Prospectos encontrados" desapareció del Cierre diario: en los reportes nuevos
                  viene en null y una tarjeta vacía solo confunde, así que no se muestra. */}
              {r?.prospectosEncontrados != null && (
                <NumeroManual label="Prospectos encontrados" valor={r.prospectosEncontrados} meta={detalle.metas?.prospectosEncontrados} />
              )}
              <NumeroManual label="Prospectos contactados" valor={r?.prospectosContactados ?? null} meta={detalle.metas?.prospectosContactados} />
              <NumeroManual label="Respuestas recibidas" valor={r?.respuestas ?? null} />
              <NumeroManual label="Interesados" valor={r?.interesados ?? null} />
            </div>
          </Tarjeta>
        )}
      </div>

      {/* El "Compromiso para mañana" salió del Cierre diario: en los reportes nuevos no existe y
          una tarjeta con tres guiones solo confunde. En los reportes anteriores se muestra igual
          que siempre, porque ahí sí se registró. */}
      {tieneCompromiso && (
        <div className="mb-4">
          <Tarjeta titulo="Compromiso para el día siguiente">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <NumeroManual label="Contactos" valor={c?.contactos ?? null} />
              <NumeroManual label="Follow-ups" valor={c?.followups ?? null} />
              <NumeroManual label="Podcasts agendados" valor={c?.podcasts ?? null} />
            </div>
            <span className="text-xs text-neutral-500">Nota</span>
            <TextoOriginal texto={c?.nota ?? null} />
          </Tarjeta>
        </div>
      )}

      <div>
        <Tarjeta titulo="¿Qué te bloqueó hoy?">
          <TextoOriginal texto={r?.bloqueos ?? null} />
        </Tarjeta>
      </div>
    </div>
  );
}
