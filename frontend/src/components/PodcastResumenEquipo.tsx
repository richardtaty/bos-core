import { useEffect, useState } from "react";
import {
  api,
  type CanalConsolidadoDTO,
  type DetalleHistorialDTO,
  type FilaEquipoResumenDTO,
  type ResumenEquipoDTO,
} from "../api/client";
import { DetalleReporte } from "./PodcastHistorialReportes";
import { AvisoDiscrepancia } from "./PodcastUI";

// RESUMEN AUTOMÁTICO DE LOS REPORTES DIARIOS DE PODCAST (PODCAST → Cierre diario → Resumen del
// equipo).
//
// Es una vista de SOLO LECTURA armada con los MISMOS reportes del Cierre diario. No crea reportes,
// no los duplica, no los modifica y no guarda ningún resumen: el backend lo reconstruye entero en
// cada consulta sobre los datos reales de la fecha elegida.
//
// Dos reglas que se ven en toda la pantalla:
//   · Quien no envió su cierre NO cuenta como 0. Cuenta como nada, y se muestra "Sin reporte".
//   · Los totales se calculan SOLO sobre reportes enviados, y acá se dice sobre cuántos.

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

/** "2026-09-11" → "11 de septiembre de 2026". Se arma con las partes para no correr el día. */
function fechaLarga(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/** Timestamp real → "11 sep 2026 · 6:14 PM" (en hora de Florida). */
function fechaHora(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: ZONA });
  const hora = d.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONA });
  return `${dia} · ${hora}`;
}

// ─── Piezas de UI (las mismas del Cierre diario y del Historial) ──

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">{titulo}</h3>
      {children}
    </div>
  );
}

/** Celda de métrica. `null` = no registrado → "—", nunca un 0 que nadie escribió. */
function Dato({ label, valor, nota }: { label: string; valor: number | null; nota?: string | null }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-xl font-semibold ${valor === null ? "text-neutral-300" : "text-neutral-800"}`}>{valor ?? "—"}</p>
      {nota && <p className="text-[11px] text-neutral-400 mt-0.5">{nota}</p>}
    </div>
  );
}

/** Estado real del reporte de una persona ese día. Son tres cosas distintas, no dos. */
function ChipEstado({ estado }: { estado: FilaEquipoResumenDTO["estado"] }) {
  const mapa = {
    enviado: { texto: "Enviado ✓", clase: "bg-success-500/10 text-success-600" },
    borrador: { texto: "Borrador sin enviar", clase: "bg-warning-500/10 text-warning-600" },
    sin_reporte: { texto: "Sin reporte", clase: "bg-neutral-200 text-neutral-600" },
  } as const;
  const { texto, clase } = mapa[estado];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${clase}`}>{texto}</span>;
}

// ─── Vista ────────────────────────────────────────────────────────

export function PodcastResumenEquipo() {
  const [fecha, setFecha] = useState<string>(hoyET);
  const [data, setData] = useState<ResumenEquipoDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const d = await api.podcastResumenEquipo(fecha);
        if (vivo) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (vivo) setError((e as Error).message);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [fecha]);

  /** "ayer: 120 (+13)" — solo si ayer tuvo reportes enviados con ese dato. */
  const notaAyer = (campo: "contactados" | "respuestas" | "interesados", valorHoy: number | null): string | null => {
    const a = data?.comparacionAyer;
    if (!a) return null;
    const v = a[campo];
    if (v === null) return null;
    if (valorHoy === null) return `ayer: ${v}`;
    const delta = valorHoy - v;
    return `ayer: ${v} (${delta > 0 ? "+" : ""}${delta})`;
  };

  if (cargando && !data) return <p className="text-sm text-neutral-500">Cargando resumen...</p>;

  return (
    <div className="max-w-4xl">
      {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

      {/* Fecha del resumen: por defecto hoy, pero cualquier día anterior se reconstruye igual */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Fecha del resumen</span>
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

      {data && (
        <>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-800">Resumen del {fechaLarga(data.fecha)}</h2>
            <p className="text-sm text-neutral-500">
              Reportes enviados: <span className="font-semibold text-neutral-800">{data.reportes.enviados} / {data.reportes.esperados}</span>
            </p>
          </div>

          {/* PROSPECCIÓN — solo de reportes enviados. Quien no reportó no suma cero: no suma. */}
          <div className="mb-4">
            <Tarjeta titulo="Prospección del equipo">
              <div className="grid grid-cols-3 gap-3">
                <Dato label="Contactados" valor={data.prospeccion.contactados} nota={notaAyer("contactados", data.prospeccion.contactados)} />
                <Dato label="Respuestas" valor={data.prospeccion.respuestas} nota={notaAyer("respuestas", data.prospeccion.respuestas)} />
                <Dato label="Interesados" valor={data.prospeccion.interesados} nota={notaAyer("interesados", data.prospeccion.interesados)} />
              </div>
              <p className="text-xs text-neutral-500 mt-3">
                Calculado sobre {data.prospeccion.reportesEnviados === 1 ? "el único reporte enviado" : `los ${data.prospeccion.reportesEnviados} reportes enviados`} ese día.
                {data.prospeccion.reportesEnviados > data.prospeccion.reportesConProspeccion && (
                  <> {data.prospeccion.reportesEnviados - data.prospeccion.reportesConProspeccion} no registró prospección y no se cuenta como cero.</>
                )}
                {data.comparacionAyer && <> Comparado con el {fechaLarga(data.comparacionAyer.fecha)}, que tuvo {data.comparacionAyer.reportesEnviados} {data.comparacionAyer.reportesEnviados === 1 ? "reporte enviado" : "reportes enviados"}.</>}
              </p>
            </Tarjeta>
          </div>

          {/* POR CANAL — el desglose suma exactamente lo mismo que el total de arriba */}
          {data.canales.length > 0 && (
            <div className="mb-4">
              <Tarjeta titulo="Prospección por canal">
                <div className="space-y-2">
                  {data.canales.map((c) => (
                    <FilaCanal key={c.canal} canal={c} />
                  ))}
                </div>
              </Tarjeta>
            </div>
          )}

          {/* RESULTADOS — datos del CRM, no de los reportes. Una sola cifra por concepto: las
              mismas reglas y la misma fuente que el Cierre diario y Mi desempeño. */}
          <div className="mb-4">
            <Tarjeta titulo="Resultados del día (del CRM, no del reporte)">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Dato label="Podcasts agendados" valor={data.resultados.agendados} />
                <Dato label="Podcasts completados" valor={data.resultados.completados} />
                <Dato label="1% completados" valor={data.resultados.reuniones1} />
                <Dato label="Convertidos" valor={data.resultados.convertidos} />
                <Dato label="No-shows" valor={data.resultados.noShows} />
                <Dato label="Follow-ups realizados" valor={data.resultados.followupsRealizados} />
                <Dato label="Follow-ups vencidos" valor={data.resultados.followupsVencidos} />
                <Dato label="En seguimiento" valor={data.resultados.enSeguimiento} nota="foto del momento" />
              </div>
              <AvisoDiscrepancia discrepancias={data.resultados.discrepancias} />
              <p className="text-xs text-neutral-400 mt-2">
                Son los eventos reales del día en el CRM, los haya reportado alguien o no. No se suman a la prospección.
              </p>
            </Tarjeta>
          </div>

          {/* EQUIPO — quién entregó y quién no. Solo lo enviado es información oficial del día. */}
          <div className="mb-4">
            <Tarjeta titulo="Equipo">
              <div className="flex flex-col gap-2">
                {data.equipo.map((p) => (
                  <div key={p.usuarioId} className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-800">{p.nombre}</p>
                      <p className="text-xs text-neutral-500">
                        {p.estado === "enviado" && (p.enviadoEn ? `Enviado: ${fechaHora(p.enviadoEn)}` : "Enviado")}
                        {p.estado === "borrador" && "Tiene un borrador, todavía sin enviar"}
                        {p.estado === "sin_reporte" && "No envió su Cierre diario"}
                        {p.estado === "enviado" && p.registroProspeccion && p.contactados !== null && (
                          <> · Contactados {p.contactados} · Respuestas {p.respuestas ?? "—"} · Interesados {p.interesados ?? "—"}</>
                        )}
                        {p.estado === "enviado" && !p.registroProspeccion && " · Sin prospección registrada"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <ChipEstado estado={p.estado} />
                      {/* Solo se puede abrir un reporte ENVIADO: un borrador no es información
                          oficial del día y el backend tampoco lo muestra a terceros. */}
                      {p.estado === "enviado" && (
                        <button
                          onClick={() => setAbierto(p.usuarioId)}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          Ver reporte
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {data.equipo.length === 0 && <p className="text-sm text-neutral-500">No hay miembros de Podcast registrados.</p>}
              </div>
              {data.fecha !== hoyET() && (
                <p className="text-xs text-neutral-400 mt-3">
                  La lista de "sin reporte" se arma con el equipo actual de Podcast: la membresía no guarda
                  fecha de alta ni de baja, así que no se puede reconstruir quién estaba ese día.
                </p>
              )}
            </Tarjeta>
          </div>

          {/* BLOQUEOS — agrupados por tema, siempre con el texto original de cada persona */}
          <div className="mb-4">
            <Tarjeta titulo="Bloqueos principales">
              {data.bloqueos.temas.length === 0 && data.bloqueos.otros.length === 0 && (
                <p className="text-sm text-neutral-500">
                  {data.reportes.enviados === 0 ? "No hubo reportes enviados ese día." : "Nadie registró un bloqueo ese día."}
                </p>
              )}
              <div className="space-y-3">
                {data.bloqueos.temas.map((t) => (
                  <div key={t.clave} className="bg-white border border-neutral-200 rounded-lg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-neutral-800">{t.etiqueta}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.personas.length >= 2 ? "bg-warning-500/10 text-warning-600" : "bg-neutral-200 text-neutral-600"}`}>
                        {t.personas.length === 1 ? "1 persona" : `${t.personas.length} personas`}
                      </span>
                    </div>
                    {/* El resumen NUNCA reemplaza al reporte: se lee exactamente qué escribió cada uno. */}
                    <div className="space-y-2">
                      {t.personas.map((p) => (
                        <div key={p.usuarioId} className="border-l-2 border-neutral-200 pl-3">
                          <p className="text-xs text-neutral-500">{p.nombre}</p>
                          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{p.texto}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {data.bloqueos.otros.length > 0 && (
                  <div className="bg-white border border-neutral-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-neutral-800 mb-2">Otros bloqueos</p>
                    <div className="space-y-2">
                      {data.bloqueos.otros.map((p) => (
                        <div key={p.usuarioId} className="border-l-2 border-neutral-200 pl-3">
                          <p className="text-xs text-neutral-500">{p.nombre}</p>
                          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{p.texto}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {data.bloqueos.sinBloqueo.length > 0 && (
                <p className="text-xs text-neutral-500 mt-3">
                  Sin bloqueo: {data.bloqueos.sinBloqueo.map((p) => p.nombre).join(", ")}.
                </p>
              )}
            </Tarjeta>
          </div>

          {/* ATENCIÓN — hechos verificables, sin calificar a nadie */}
          <div className="mb-4">
            <Tarjeta titulo="Requiere atención">
              {data.atencion.length === 0 ? (
                <p className="text-sm text-neutral-500">Sin señales que requieran atención ese día.</p>
              ) : (
                <div className="space-y-2">
                  {data.atencion.map((s) => (
                    <div key={s.clave} className="bg-warning-500/10 border border-warning-500/20 rounded-lg p-3">
                      <p className="text-sm font-medium text-neutral-800">{s.titulo}</p>
                      <p className="text-xs text-neutral-600 mt-0.5">{s.detalle}</p>
                    </div>
                  ))}
                </div>
              )}
            </Tarjeta>
          </div>
        </>
      )}

      {abierto && <ModalReporte usuarioId={abierto} fecha={fecha} onClose={() => setAbierto(null)} />}
    </div>
  );
}

/** Una línea del desglose consolidado por canal. "—" cuando el reporte viejo no traía ese dato. */
function FilaCanal({ canal }: { canal: CanalConsolidadoDTO }) {
  const sinDetalle = canal.canal === "Sin detalle de canal";
  return (
    <div className={`border rounded-lg p-3 flex flex-wrap items-center gap-x-6 gap-y-1 ${sinDetalle ? "bg-neutral-100 border-neutral-200" : "bg-white border-neutral-200"}`}>
      <p className="text-sm font-medium text-neutral-800 w-40 shrink-0">{canal.canal}</p>
      <p className="text-xs text-neutral-500">Contactados <span className="text-sm font-semibold text-neutral-800">{canal.contactados ?? "—"}</span></p>
      <p className="text-xs text-neutral-500">Respuestas <span className="text-sm font-semibold text-neutral-800">{canal.respuestas ?? "—"}</span></p>
      <p className="text-xs text-neutral-500">Interesados <span className="text-sm font-semibold text-neutral-800">{canal.interesados ?? "—"}</span></p>
    </div>
  );
}

/**
 * El reporte real de una persona, en un modal. NO hay una segunda forma de pintar un reporte:
 * reutiliza el MISMO componente `DetalleReporte` del Historial, y pide los datos al endpoint que
 * ya existe (`usuario_id` + `fecha` son la clave real del reporte, no el nombre). No modifica
 * nada: es una consulta.
 */
function ModalReporte({ usuarioId, fecha, onClose }: { usuarioId: string; fecha: string; onClose: () => void }) {
  const [detalle, setDetalle] = useState<DetalleHistorialDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await api.podcastHistorialDetalle(usuarioId, fecha);
        if (vivo) setDetalle(d);
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    })();
    return () => { vivo = false; };
  }, [usuarioId, fecha]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[5vh] pb-8 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-neutral-50 rounded-xl shadow-2xl w-full max-w-2xl mx-4 border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sin encabezado propio: `DetalleReporte` ya pinta "Reporte de {persona}" y la fecha.
            Repetirlo acá sería una segunda versión del mismo dato, que puede divergir. */}
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
