import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type {
  EstadoResolucionTicket,
  EstadoTicket,
  PrioridadTicket,
  Ticket,
  TicketAdjunto,
  TicketEstadisticas,
} from "../types";

// ─── Módulo DEV → Tickets: bandeja de recepción (solo SUPER_ADMIN) ──
// Los tickets llegan aquí desde el botón "Crear ticket" (visible para todo usuario
// autenticado). Listar/consultar/descargar está restringido igual que DEV → Tareas:
// la ruta y la entrada de menú solo existen para SUPER_ADMIN, y el backend responde
// 403 a cualquier otro rol. Un ticket no es una tarea DEV ni se convierte en una.

const ZONA_NEGOCIO = "America/New_York"; // Florida/ET — la misma del resto del CRM

const PRIORIDAD_CHIP: Record<PrioridadTicket, string> = {
  Baja: "bg-neutral-100 text-neutral-600 border-neutral-200",
  Normal: "bg-primary-50 text-primary-700 border-primary-200",
  Alta: "bg-danger-50 text-danger-700 border-danger-200",
};

const ESTADO_CHIP: Record<EstadoTicket, { etiqueta: string; clase: string }> = {
  PENDIENTE: { etiqueta: "Pendiente", clase: "bg-warning-50 text-warning-700 border-warning-200" },
  COMPLETADO: { etiqueta: "Completado", clase: "bg-success-50 text-success-700 border-success-200" },
  CANCELADO: { etiqueta: "Cancelado", clase: "bg-neutral-100 text-neutral-500 border-neutral-200" },
};

// Fecha completa en hora del negocio: "9 de septiembre de 2026 · 4:42 PM" (nunca UTC crudo).
function formatoFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fecha = d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  });
  const hora = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: ZONA_NEGOCIO,
  });
  return `${fecha} · ${hora}`;
}

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const esImagen = (a: TicketAdjunto) => a.contentType.startsWith("image/");

// ─── Agrupación por día ─────────────────────────────────────────────────────
// El día sale SIEMPRE del created_at (cuándo se RECIBIÓ el ticket), nunca de la fecha
// en que se completó o canceló: cambiar el estado NO mueve el ticket de grupo.
// La clave se calcula en hora del negocio para que el corte de día sea el real de ET.

/** "2026-09-09" en hora ET — sirve como clave de agrupación (y de orden). */
function claveDiaET(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

const MES_ET = (clave: string): { dia: number; mes: string; anio: number } => {
  const [anio, mes, dia] = clave.split("-").map(Number);
  // Fecha "neutra" en UTC solo para obtener el nombre del mes en español.
  const nombre = new Date(Date.UTC(anio, mes - 1, dia)).toLocaleDateString("es-ES", {
    month: "long",
    timeZone: "UTC",
  });
  return { dia, mes: nombre.toUpperCase(), anio };
};

/** "HOY · 9 DE SEPTIEMBRE" / "AYER · 8 DE SEPTIEMBRE" / "7 DE SEPTIEMBRE DE 2025". */
function etiquetaDia(clave: string, claveHoy: string, claveAyer: string, anioActual: number): string {
  const { dia, mes, anio } = MES_ET(clave);
  const base = anio === anioActual ? `${dia} DE ${mes}` : `${dia} DE ${mes} DE ${anio}`;
  if (clave === claveHoy) return `HOY · ${base}`;
  if (clave === claveAyer) return `AYER · ${base}`;
  return base;
}

interface GrupoDia {
  clave: string;
  etiqueta: string;
  tickets: Ticket[];
}

export function DevTicketsPage() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketEstadisticas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState<Ticket | null>(null);
  // Días cerrados explícitamente. Por defecto HOY está abierto y los días anteriores
  // cerrados; se pueden abrir varios a la vez (no es un acordeón exclusivo).
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const aplicoInicial = useRef(false);

  const cargar = useCallback(async () => {
    if (!esSuperAdmin) return;
    try {
      const [lista, contadores] = await Promise.all([
        api.listarTicketsDev(),
        api.listarEstadisticasTicketsDev(),
      ]);
      setTickets(lista);
      setStats(contadores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la bandeja de tickets.");
      window.setTimeout(() => setError(null), 5000);
    } finally {
      setCargando(false);
    }
  }, [esSuperAdmin]);

  useEffect(() => {
    if (esSuperAdmin) {
      setCargando(true);
      void cargar();
    }
  }, [cargar, esSuperAdmin]);

  // Fechas de referencia para HOY / AYER, en hora del negocio.
  const { claveHoy, claveAyer, anioActual } = useMemo(() => {
    const ahora = new Date();
    const ayer = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    return {
      claveHoy: claveDiaET(ahora),
      claveAyer: claveDiaET(ayer),
      anioActual: Number(claveDiaET(ahora).slice(0, 4)),
    };
  }, []);

  // La lista ya viene del backend de la más reciente a la más antigua; solo se agrupa
  // por día conservando ese orden (días nuevos arriba, tickets nuevos primero).
  const grupos: GrupoDia[] = useMemo(() => {
    const mapa = new Map<string, Ticket[]>();
    for (const t of tickets) {
      const clave = claveDiaET(new Date(t.createdAt));
      const lista = mapa.get(clave);
      if (lista) lista.push(t);
      else mapa.set(clave, [t]);
    }
    return [...mapa.entries()].map(([clave, lista]) => ({
      clave,
      etiqueta: etiquetaDia(clave, claveHoy, claveAyer, anioActual),
      tickets: lista,
    }));
  }, [tickets, claveHoy, claveAyer, anioActual]);

  // Primera carga: HOY abierto, los días anteriores cerrados. Después de eso se respeta
  // lo que el usuario abra o cierre (un día nuevo que aparezca no se toca).
  useEffect(() => {
    if (cargando || aplicoInicial.current || grupos.length === 0) return;
    aplicoInicial.current = true;
    setCerrados(new Set(grupos.filter((g) => g.clave !== claveHoy).map((g) => g.clave)));
  }, [cargando, grupos, claveHoy]);

  if (!esSuperAdmin) return <Navigate to="/mi-dia" replace />;

  function alternarDia(clave: string) {
    setCerrados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  // Abre el detalle mostrando el resumen al instante y, en segundo plano, trae el
  // ticket completo (adjuntos). Mantiene la bandeja al día con el conteo de adjuntos.
  const abrirDetalle = async (t: Ticket) => {
    setActivo(t);
    try {
      const completo = await api.obtenerTicketDev(t.id);
      setActivo(completo);
      void cargar();
    } catch {
      // Si el refresco falla se queda con el resumen ya visible; cerrar reintenta.
    }
  };

  // Cambiar el estado actualiza el MISMO ticket y refresca contadores y bandeja.
  const cambiarEstado = async (ticketId: string, status: EstadoResolucionTicket) => {
    const actualizado = await api.actualizarEstadoTicketDev(ticketId, status);
    setActivo(actualizado);
    await cargar();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">💻 DEV</h1>
          <p className="text-sm text-neutral-500">
            Tickets — solicitudes de ajuste, error o mejora enviadas desde el CRM.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(240px,26%)] items-start">
        {/* ── Columna izquierda: tickets agrupados por día ── */}
        <div>
          {cargando ? (
            <p className="text-sm text-neutral-500 py-10 text-center">Cargando...</p>
          ) : tickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-14 text-center">
              <p className="text-2xl mb-2">🎫</p>
              <p className="text-sm text-neutral-600 font-medium">Todavía no hay tickets.</p>
              <p className="text-xs text-neutral-500 mt-1">
                Cuando alguien use el botón «Crear ticket», la solicitud aparecerá aquí,
                de la más reciente a la más antigua.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grupos.map((g) => {
                const abierto = !cerrados.has(g.clave);
                return (
                  <section key={g.clave}>
                    <button
                      type="button"
                      onClick={() => alternarDia(g.clave)}
                      aria-expanded={abierto}
                      className="w-full flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-left hover:border-primary-300 hover:bg-neutral-50"
                    >
                      <span className="text-neutral-400 text-xs w-3 shrink-0">{abierto ? "▾" : "▸"}</span>
                      <span className="text-xs font-semibold tracking-wide text-neutral-700">
                        {g.etiqueta}
                      </span>
                      <span className="text-xs text-neutral-500">
                        · {g.tickets.length} ticket{g.tickets.length === 1 ? "" : "s"}
                      </span>
                    </button>

                    {abierto && (
                      <ul className="mt-2 space-y-2.5">
                        {g.tickets.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => void abrirDetalle(t)}
                              className="w-full text-left rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-primary-300 hover:shadow-sm transition-shadow"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <ChipPrioridad prioridad={t.prioridad} />
                                <ChipEstado status={t.status} />
                                <span className="text-sm font-medium text-neutral-800">
                                  {t.solicitanteNombre}
                                </span>
                                <span className="text-xs text-neutral-400 ml-auto shrink-0">
                                  {formatoFechaHora(t.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-neutral-700 mt-1.5 line-clamp-2 whitespace-pre-line">
                                {t.description}
                              </p>
                              <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-400">
                                {t.adjuntosCount > 0 && (
                                  <span>
                                    📎 {t.adjuntosCount} adjunto{t.adjuntosCount === 1 ? "" : "s"}
                                  </span>
                                )}
                                <span className="ml-auto text-primary-600">Ver detalle →</span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Columna derecha: contadores reales (no se mueven de su columna) ── */}
        <aside className="lg:sticky lg:top-4 space-y-3">
          <h2 className="text-xs font-semibold tracking-wide text-neutral-600">RESUMEN</h2>
          <TarjetaEstadistica
            etiqueta="TICKETS RECIBIDOS"
            valor={stats?.recibidos}
            clase="border-primary-200 bg-primary-50 text-primary-700"
          />
          <TarjetaEstadistica
            etiqueta="COMPLETADOS"
            valor={stats?.completados}
            clase="border-success-200 bg-success-50 text-success-700"
          />
          <TarjetaEstadistica
            etiqueta="CANCELADOS"
            valor={stats?.cancelados}
            clase="border-neutral-200 bg-neutral-50 text-neutral-600"
          />
        </aside>
      </div>

      {activo && (
        <DetalleTicketModal
          ticket={activo}
          onClose={() => setActivo(null)}
          onCambiarEstado={cambiarEstado}
        />
      )}
    </div>
  );
}

function ChipPrioridad({ prioridad }: { prioridad: PrioridadTicket }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${PRIORIDAD_CHIP[prioridad]}`}
    >
      {prioridad}
    </span>
  );
}

function ChipEstado({ status }: { status: EstadoTicket }) {
  const { etiqueta, clase } = ESTADO_CHIP[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${clase}`}>
      {etiqueta}
    </span>
  );
}

function TarjetaEstadistica({
  etiqueta,
  valor,
  clase,
}: {
  etiqueta: string;
  valor: number | undefined;
  clase: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${clase}`}>
      <p className="text-2xl font-semibold leading-none">
        {valor === undefined ? "—" : valor}
      </p>
      <p className="text-[11px] font-medium tracking-wide mt-1.5 opacity-80">{etiqueta}</p>
    </div>
  );
}

// ─── Detalle del ticket ─────────────────────────────────────────────
// Muestra solicitante, fecha completa, prioridad, estado, descripción y adjuntos.
// Desde aquí se resuelve el ticket (Completado / Cancelado) actualizando el mismo
// registro. Las imágenes se previsualizan en línea (blob); el resto se descarga.
// Como las descargas exigen el token de DEV, siempre van por fetch (no un <a> simple).

function DetalleTicketModal({
  ticket,
  onClose,
  onCambiarEstado,
}: {
  ticket: Ticket;
  onClose: () => void;
  onCambiarEstado: (ticketId: string, status: EstadoResolucionTicket) => Promise<void>;
}) {
  // Blob URLs creadas (preview + descargas), revocadas al cerrar el modal.
  const blobsRef = useRef<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState<EstadoResolucionTicket | null>(null);
  const [confirmar, setConfirmar] = useState<EstadoResolucionTicket | null>(null);

  const adjuntos = ticket.adjuntos ?? [];

  function crearBlobUrl(adjId: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    blobsRef.current[adjId] = url;
    return url;
  }

  useEffect(() => {
    let vivos = true;
    const imagenes = adjuntos.filter(esImagen);
    if (imagenes.length === 0) return;
    setError(null);
    imagenes.forEach((adj) => {
      api
        .obtenerAdjuntoTicketDev(ticket.id, adj.id)
        .then((r) => {
          if (!vivos) return;
          setPreviews((prev) => ({ ...prev, [adj.id]: crearBlobUrl(adj.id, r.blob) }));
        })
        .catch(() => {
          if (vivos) setError("No se pudieron cargar las imágenes adjuntas.");
        });
    });
    return () => {
      vivos = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  // Al desmontar se liberan todos los blob URLs creados por este modal.
  useEffect(
    () => () => {
      Object.values(blobsRef.current).forEach((u) => URL.revokeObjectURL(u));
      blobsRef.current = {};
    },
    [],
  );

  const descargar = async (adj: TicketAdjunto) => {
    setDescargandoId(adj.id);
    setError(null);
    try {
      const r = await api.obtenerAdjuntoTicketDev(ticket.id, adj.id);
      const url = crearBlobUrl(adj.id, r.blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = adj.nombreOriginal;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar el archivo.");
    } finally {
      setDescargandoId(null);
    }
  };

  const resolver = async (status: EstadoResolucionTicket) => {
    setResolviendo(status);
    setError(null);
    try {
      await onCambiarEstado(ticket.id, status);
      setConfirmar(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el estado del ticket.");
    } finally {
      setResolviendo(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-10 sm:pt-16 z-50 overflow-y-auto">
      <div className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-xl p-6 border border-neutral-200 mb-10">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-800">🎫 Ticket de soporte</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-600 text-lg leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <ChipPrioridad prioridad={ticket.prioridad} />
          <ChipEstado status={ticket.status} />
          <span className="text-xs text-neutral-500">{formatoFechaHora(ticket.createdAt)}</span>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 mb-4 text-sm">
          <p className="text-xs text-neutral-400 mb-0.5">Solicitado por</p>
          <p className="text-neutral-800 font-medium">{ticket.solicitanteNombre}</p>
          {(ticket.solicitudEmail || ticket.solicitudCargo) && (
            <p className="text-xs text-neutral-500 mt-0.5">
              {[ticket.solicitudCargo, ticket.solicitudEmail].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <label className="text-xs text-neutral-600 mb-1 block">Descripción</label>
        <div className="rounded-lg border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-800 whitespace-pre-line mb-4 min-h-[70px]">
          {ticket.description}
        </div>

        {adjuntos.length > 0 && (
          <div>
            <label className="text-xs text-neutral-600 mb-1.5 block">
              Adjuntos ({adjuntos.length})
            </label>
            <ul className="space-y-2">
              {adjuntos.map((adj) => {
                const img = esImagen(adj);
                const previewUrl = previews[adj.id];
                return (
                  <li key={adj.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                    {img && previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={adj.nombreOriginal}
                        className="max-h-44 rounded-md border border-neutral-200 object-contain mb-2"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm text-neutral-400">📄</span>
                        <span className="text-sm text-neutral-700 truncate flex-1">{adj.nombreOriginal}</span>
                        <span className="text-xs text-neutral-400 shrink-0">{tamanoLegible(adj.tamanoBytes)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      {img ? (
                        <span className="text-xs text-neutral-500 truncate">{adj.nombreOriginal}</span>
                      ) : (
                        <span className="text-xs text-neutral-400">{tamanoLegible(adj.tamanoBytes)}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => void descargar(adj)}
                        disabled={descargandoId === adj.id}
                        className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {descargandoId === adj.id ? "Descargando…" : "⬇ Descargar"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && <p className="text-xs text-danger-600 mt-3">{error}</p>}

        {/* Solo un ticket PENDIENTE se puede resolver; ya resuelto queda como historial. */}
        {ticket.status === "PENDIENTE" ? (
          <div className="mt-5 pt-4 border-t border-neutral-200">
            {confirmar ? (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-neutral-600 flex-1">
                  {confirmar === "COMPLETADO"
                    ? "¿Marcar este ticket como completado?"
                    : "¿Cancelar este ticket? El ticket queda en el historial como cancelado."}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmar(null)}
                  disabled={resolviendo !== null}
                  className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => void resolver(confirmar)}
                  disabled={resolviendo !== null}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:opacity-50"
                >
                  {resolviendo ? "Guardando…" : "Sí, confirmar"}
                </button>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmar("CANCELADO")}
                  className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                >
                  Cancelar ticket
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmar("COMPLETADO")}
                  className="text-xs px-3 py-1.5 rounded-lg bg-success-500 text-white font-medium hover:bg-success-600"
                >
                  ✔ Marcar completado
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-5 pt-4 border-t border-neutral-200 text-xs text-neutral-500">
            {ticket.status === "COMPLETADO" ? "Completado" : "Cancelado"} el{" "}
            {formatoFechaHora(ticket.completedAt ?? ticket.cancelledAt ?? ticket.createdAt)}.
          </p>
        )}
      </div>
    </div>
  );
}
