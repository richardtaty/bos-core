import { useEffect, useState } from "react";
import { api, type VentaResumen } from "../api/client";
import type { Pago } from "../types";

// Formato de montos y fechas: idéntico al de Resumen de Ventas, para que la fila de la tabla
// y este detalle muestren el mismo número escrito exactamente igual.
function fmtMonto(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/New_York" });
}

// Lo que la tarjeta del Pipeline sabe del deal y el Resumen de Ventas no muestra: la etapa
// ACTUAL (puede haber cambiado desde el cierre) y el plan de cobro vigente. Sale del mismo
// tablero real del Pipeline — no se recalcula nada aquí.
interface DetallePipeline {
  etapaNombre: string | null;
  proximoPago: number | null;
  fechaProximoPago: string | null;
  metodoPago: string | null;
  montoVencido: number;
}

interface Props {
  venta: VentaResumen;
  onClose: () => void;
}

/**
 * Detalle de SOLO CONSULTA de una venta ganada, abierto desde Resumen de Ventas.
 *
 * Es el MISMO registro del Pipeline, leído por su id real (`venta.id` = registros.id) — nunca
 * se busca por nombre de cliente, producto ni monto, porque un cliente puede tener varias
 * ventas. Todo lo que se muestra sale de datos que ya existen: la fila que abrió el modal, el
 * tablero real del Pipeline (`tableroKanban`, que ya trae pagado/saldo/vencido calculados por
 * la lógica financiera existente) y los pagos reales (`listarPagos`).
 *
 * No crea ni modifica NADA: solo hace GET. No registra pagos, no mueve etapas, no cambia el
 * monto ni el estado. Si la operación ya no está en el Pipeline, se avisa y se sigue mostrando
 * la información que sí se tiene — la página nunca se rompe.
 */
export function VentaDetalleModal({ venta, onClose }: Props) {
  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [errorPagos, setErrorPagos] = useState(false);
  const [detallePipeline, setDetallePipeline] = useState<DetallePipeline | null>(null);
  const [noEncontrada, setNoEncontrada] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const idReal = venta.id;

    // Cada consulta va por separado: si una falla, la otra se sigue mostrando igual.
    void (async () => {
      try {
        const tablero = await api.tableroKanban(venta.pipelineId);
        for (const etapa of tablero.etapas) {
          const registro = etapa.registros.find((r) => r.id === idReal);
          if (!registro) continue;
          if (cancelado) return;
          setDetallePipeline({
            etapaNombre: etapa.nombre ?? null,
            proximoPago: registro.proximoPago ?? null,
            fechaProximoPago: registro.fechaProximoPago ?? null,
            metodoPago: registro.metodoPago ?? null,
            montoVencido: registro.montoVencido ?? 0,
          });
          return;
        }
        if (!cancelado) setNoEncontrada(true);
      } catch {
        if (!cancelado) setNoEncontrada(true);
      }
    })();

    void (async () => {
      try {
        const lista = await api.listarPagos(idReal);
        if (!cancelado) setPagos(lista);
      } catch {
        // No se confunde "no hay pagos" con "no se pudieron cargar": decirlo distinto importa
        // cuando lo que está en juego es dinero.
        if (!cancelado) setErrorPagos(true);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [venta.id, venta.pipelineId]);

  const etapa = detallePipeline?.etapaNombre ?? venta.etapaNombre;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[5vh] pb-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-neutral-50 rounded-xl shadow-2xl w-full max-w-lg mx-4 border border-neutral-200 animate-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Encabezado ──────────────────────────── */}
        <div className="flex items-start justify-between p-5 pb-3 border-b border-neutral-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-neutral-900">{venta.personaNombre ?? "Sin cliente"}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] bg-success-100 text-success-700 font-bold uppercase px-1.5 py-0.5 rounded">
                🏆 Ganada
              </span>
              {etapa && (
                <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">{etapa}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg leading-none ml-3">&times;</button>
        </div>

        {/* ─── Cuerpo ──────────────────────────────── */}
        <div className="p-5 space-y-5">
          {noEncontrada && (
            <div className="bg-warning-500/10 border border-warning-500/20 rounded-lg p-3">
              <p className="text-xs text-warning-700">
                Esta operación ya no aparece en el Pipeline (puede haber sido eliminada o su etapa
                cambió). Abajo se muestra la información que quedó registrada en Resumen de Ventas.
              </p>
            </div>
          )}

          {/* Lo que se vendió y quién lo cerró */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Cliente" value={venta.personaNombre ?? "—"} icon="👤" />
            <Info label="Qué se vendió" value={venta.pipelineNombre ?? "—"} icon="💼" />
            <Info label="Responsable" value={venta.responsableNombre ?? "—"} icon="🤝" />
            <Info label="Fecha de cierre" value={fmtFecha(venta.fechaVenta)} icon="📅" />
          </div>

          {/* Dinero: mismos números que la fila, derivados de los pagos reales */}
          <div>
            <p className="text-xs font-medium text-neutral-600 mb-2">Dinero</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Info label="Total" value={venta.valor != null ? fmtMonto(venta.valor) : "—"} icon="💰" />
              <Info label="Pagado" value={fmtMonto(venta.totalPagado)} icon="✅" />
              <Info
                label="Saldo"
                value={venta.pagadaCompleta ? "Pagada ✓" : venta.saldoPendiente != null ? fmtMonto(venta.saldoPendiente) : "—"}
                icon="⏳"
              />
            </div>
          </div>

          {/* Plan de cobro vigente (solo si el registro sigue en el Pipeline y tiene datos) */}
          {detallePipeline && (detallePipeline.fechaProximoPago || detallePipeline.metodoPago || detallePipeline.montoVencido > 0) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {detallePipeline.fechaProximoPago && (
                <Info
                  label="Próximo cobro"
                  value={`${fmtFecha(detallePipeline.fechaProximoPago)}${detallePipeline.proximoPago != null ? ` · ${fmtMonto(detallePipeline.proximoPago)}` : ""}`}
                  icon="📆"
                />
              )}
              {detallePipeline.metodoPago && <Info label="Método de pago" value={detallePipeline.metodoPago} icon="💳" />}
              {detallePipeline.montoVencido > 0 && (
                <Info label="Vencido" value={fmtMonto(detallePipeline.montoVencido)} icon="⚠️" />
              )}
            </div>
          )}

          {/* Pagos registrados: las filas reales de `pagos`, sin recalcular ni resumir */}
          <div className="border-t border-neutral-200 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-medium text-neutral-700">Pagos registrados</p>
              {pagos && pagos.length > 0 && (
                <span className="text-[10px] text-neutral-500">({pagos.length})</span>
              )}
            </div>

            {errorPagos ? (
              <p className="text-xs text-danger-600">No se pudieron cargar los pagos de esta operación.</p>
            ) : pagos === null ? (
              <p className="text-xs text-neutral-500">Cargando pagos...</p>
            ) : pagos.length === 0 ? (
              <p className="text-xs text-neutral-500">Sin pagos registrados todavía.</p>
            ) : (
              <div className="bg-neutral-100 rounded-lg divide-y divide-neutral-200">
                {pagos.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-3 p-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-neutral-700">{fmtFecha(p.fecha)}</p>
                      {p.nota && <p className="text-xs text-neutral-500 mt-0.5 whitespace-pre-wrap">{p.nota}</p>}
                    </div>
                    <p className="text-success-600 font-medium whitespace-nowrap">{fmtMonto(p.monto)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Footer ──────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 bg-neutral-100 rounded-b-xl">
          <span className="text-[10px] text-neutral-500">Solo consulta — no modifica la operación.</span>
          <button
            onClick={onClose}
            className="text-xs px-4 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-neutral-100 rounded-lg p-2.5">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-neutral-800 font-medium mt-0.5 break-words">{icon} {value}</p>
    </div>
  );
}
