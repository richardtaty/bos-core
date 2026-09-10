import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { PrioridadTicket, Ticket, TicketAdjunto } from "../types";

// ─── Módulo DEV → Tickets: bandeja de recepción (solo SUPER_ADMIN) ──
// Los tickets llegan aquí desde el botón flotante "Crear ticket" (visible para todo
// usuario autenticado). Listar/consultar/descargar está restringido igual que DEV →
// Tareas: la ruta y la entrada de menú solo existen para SUPER_ADMIN, y el backend
// responde 403 a cualquier otro rol. Un ticket no es una tarea DEV ni se convierte en una.

const ZONA_NEGOCIO = "America/New_York"; // Florida/ET — la misma del resto del CRM

const PRIORIDAD_CHIP: Record<PrioridadTicket, string> = {
  Baja: "bg-neutral-100 text-neutral-600 border-neutral-200",
  Normal: "bg-primary-50 text-primary-700 border-primary-200",
  Alta: "bg-danger-50 text-danger-700 border-danger-200",
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

export function DevTicketsPage() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState<Ticket | null>(null);

  const cargar = useCallback(async () => {
    if (!esSuperAdmin) return;
    try {
      setTickets(await api.listarTicketsDev());
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

  if (!esSuperAdmin) return <Navigate to="/mi-dia" replace />;

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

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">💻 DEV</h1>
          <p className="text-sm text-neutral-500">
            Tickets — solicitudes de ajuste, error o mejora enviadas desde el CRM.
          </p>
        </div>
        <span className="text-xs text-neutral-400">
          {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div className="mt-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-neutral-500 py-10 text-center">Cargando...</p>
      ) : tickets.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-14 text-center">
          <p className="text-2xl mb-2">🎫</p>
          <p className="text-sm text-neutral-600 font-medium">Todavía no hay tickets.</p>
          <p className="text-xs text-neutral-500 mt-1">
            Cuando alguien use el botón «Crear ticket», la solicitud aparecerá aquí,
            de la más reciente a la más antigua.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5 max-w-3xl">
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void abrirDetalle(t)}
                className="w-full text-left rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-primary-300 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <ChipPrioridad prioridad={t.prioridad} />
                  <span className="text-sm font-medium text-neutral-800">{t.solicitanteNombre}</span>
                  <span className="text-xs text-neutral-400 ml-auto shrink-0">{formatoFechaHora(t.createdAt)}</span>
                </div>
                <p className="text-sm text-neutral-700 mt-1.5 line-clamp-2 whitespace-pre-line">{t.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-400">
                  {t.adjuntosCount > 0 && (
                    <span>📎 {t.adjuntosCount} adjunto{t.adjuntosCount === 1 ? "" : "s"}</span>
                  )}
                  <span className="ml-auto text-primary-600">Ver detalle →</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {activo && <DetalleTicketModal ticket={activo} onClose={() => setActivo(null)} />}
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

// ─── Detalle del ticket ─────────────────────────────────────────────
// Muestra solicitante, fecha completa, prioridad, descripción completa y adjuntos.
// Las imágenes se previsualizan en línea (blob); el resto se descarga. Como las
// descargas exigen el token de DEV, siempre van por fetch (no un <a> simple).

function DetalleTicketModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  // Blob URLs creadas (preview + descargas), revocadas al cerrar el modal.
  const blobsRef = useRef<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);

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
      </div>
    </div>
  );
}
