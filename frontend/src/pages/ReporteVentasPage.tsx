import { useEffect, useMemo, useState, useCallback } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../api/AuthContext";

interface Abono {
  id: string;
  registroId: string;
  monto: number;
  nota: string | null;
  fecha: string;
  autorNombre: string;
  personaNombre: string | null;
  pipelineNombre: string;
}

interface VentasPorDia {
  dias: { fecha: string; total: number; porUsuario: { usuarioId: string; nombre: string; total: number }[] }[];
  totalGeneral: number;
  cantidadAbonos: number;
}

function hace7Dias(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hoyStr(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}

// ─── Rango por defecto: mes calendario actual ──────────────────────────────
// El backend registra y agrupa cada pago en hora de Florida (America/New_York, ver
// reportes.service.ts) y su "limitesDeRangoET" interpreta cada fecha del input como un
// día en esa zona. Por eso "hoy" y "mes actual" se calculan en esa MISMA zona, no en la
// del navegador — así el mes por defecto coincide con el mes que el reporte agrupa.
const ZONA_NEGOCIO = "America/New_York";
const formatoFechaET = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit" });

// YYYY-MM-DD del día de HOY en Florida.
function hoyEnZonaNegocio(): string {
  return formatoFechaET.format(new Date());
}

// startOfMonth/endOfMonth del mes actual, calculado en vivo (nunca guardado).
// El "día 0 del mes siguiente" es el último día de este mes: maneja 28/29/30/31 y los
// años bisiestos sin hardcodear cantidades de días.
function rangoMesActual(): { desde: string; hasta: string } {
  const [y, m] = hoyEnZonaNegocio().split("-").map(Number);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { desde, hasta };
}

// Valor numérico real de un "YYYY-MM-DD" para ordenar por fecha — nunca por texto.
function valorFecha(ymd: string): number {
  return Date.parse(`${ymd}T12:00:00Z`);
}

function fmtFechaCorta(fechaISO: string): string {
  return new Date(fechaISO + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" });
}

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
}

export function ReporteVentasPage() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";
  // Rango predeterminado según rol (sin cambiar permisos):
  //  · SUPER_ADMIN → mes calendario actual completo, recalculado en vivo cada vez.
  //  · Rol restringido → conserva su alcance de hoy: el backend le fuerza "últimos 7 días"
  //    pase lo que pida el frontend; aquí solo se inicializan los mismos valores de antes.
  const rangoInicial = esSuperAdmin ? rangoMesActual() : { desde: hace7Dias(), hasta: hoyStr() };
  const [desde, setDesde] = useState(rangoInicial.desde);
  const [hasta, setHasta] = useState(rangoInicial.hasta);
  // Apenas el usuario toca Desde/Hasta, el rango deja de ser el predeterminado.
  const [rangoManual, setRangoManual] = useState(false);
  // Orden de los días: "desc" (más reciente primero) por defecto.
  const [ordenDias, setOrdenDias] = useState<"desc" | "asc">("desc");
  const [resumen, setResumen] = useState<VentasPorDia | null>(null);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  // Borrado de un registro financiero duplicado o incorrecto — SOLO SUPER_ADMIN.
  // Se elimina únicamente esa fila de pago; el pipeline y el reporte se recalculan solos.
  const [borrandoPago, setBorrandoPago] = useState<Abono | null>(null);
  const [eliminandoPago, setEliminandoPago] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const confirmarEliminar = async () => {
    if (!borrandoPago) return;
    setEliminandoPago(true);
    setErrorEliminar(null);
    try {
      await api.eliminarPago(borrandoPago.registroId, borrandoPago.id);
      setBorrandoPago(null);
      void cargar();
    } catch (err) {
      setErrorEliminar(err instanceof ApiError ? String(err.payload) : "No se pudo eliminar el registro");
    } finally {
      setEliminandoPago(false);
    }
  };

  const cargar = useCallback(async () => {
    // Rango incoherente (Desde después de Hasta): no se ejecuta ninguna consulta.
    if (desde && hasta && desde > hasta) return;
    setCargando(true);
    const [r, a] = await Promise.all([
      api.ventasPorDia({ desde, hasta }),
      api.listarPagosDetallado({ desde, hasta }),
    ]);
    setResumen(r);
    setAbonos(a);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cambio de mes automático: mientras el usuario no haya fijado un rango manual y siga en
  // el predeterminado, al comenzar un mes nuevo el módulo se recorre solo (p. ej. dejarlo
  // abierto del 31 de agosto al 1 de septiembre). El rango se recalcula SIEMPRE con la fecha
  // actual — nunca se conserva el del mes anterior como default permanente.
  useEffect(() => {
    if (!esSuperAdmin || rangoManual) return;

    const aplicarMesActual = () => {
      const { desde: d, hasta: h } = rangoMesActual();
      setDesde((actual) => (actual === d ? actual : d));
      setHasta((actual) => (actual === h ? actual : h));
    };
    aplicarMesActual(); // normaliza al mes actual de una vez (primer render)

    // Al volver a la pestaña (cubre cruzar la medianoche del mes con la página en segundo plano)
    // y como red de seguridad un chequeo periódico mientras está abierta.
    window.addEventListener("focus", aplicarMesActual);
    const reloj = window.setInterval(aplicarMesActual, 60_000);
    return () => {
      window.removeEventListener("focus", aplicarMesActual);
      window.clearInterval(reloj);
    };
  }, [esSuperAdmin, rangoManual]);

  const abonosDelDia = (fecha: string) =>
    abonos.filter((a) => {
      // El día que marca el backend es el día calendario en Florida (fechaET). Se extrae la
      // fecha del abono en esa MISMA zona — así un pago cerca de la medianoche ET no cae en
      // un día distinto solo porque el navegador esté en otra zona horaria.
      const f = formatoFechaET.format(new Date(a.fecha));
      return f === fecha;
    });

  // Validación: rango con "Desde" posterior a "Hasta" (no se consulta nada, ver cargar).
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  // Orden visual de los días por valor real de fecha (desc = más reciente primero, el
  // predeterminado). Solo invierte la presentación — jamás toca totales ni montos.
  const diasOrdenados = useMemo(() => {
    if (!resumen) return [];
    const copia = [...resumen.dias];
    copia.sort((a, b) =>
      ordenDias === "desc" ? valorFecha(b.fecha) - valorFecha(a.fecha) : valorFecha(a.fecha) - valorFecha(b.fecha)
    );
    return copia;
  }, [resumen, ordenDias]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Reporte de ventas</h1>
      <p className="text-sm text-neutral-500 mb-4">
        {esSuperAdmin ? "Por día y por agente, con cada abono individual" : "Tus ventas por día, con cada abono individual"}
      </p>

      {esSuperAdmin && (
        <div className="flex items-end gap-3 mb-6 flex-wrap">
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setRangoManual(true); }}
              className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setRangoManual(true); }}
              className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setOrdenDias((o) => (o === "desc" ? "asc" : "desc"))}
            title={ordenDias === "desc" ? "Invertir: ordenar del más antiguo al más reciente" : "Invertir: ordenar del más reciente al más antiguo"}
            aria-pressed={ordenDias === "asc"}
            className="border border-neutral-200 bg-white text-neutral-700 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 whitespace-nowrap"
          >
            {ordenDias === "desc" ? "↓ Más reciente primero" : "↑ Más antiguo primero"}
          </button>
        </div>
      )}
      {!esSuperAdmin && (
        <p className="text-xs text-neutral-500 mb-4">Últimos 7 días</p>
      )}

      {rangoInvalido ? (
        <p className="text-sm text-danger-600">Rango inválido: la fecha “Desde” debe ser anterior o igual a “Hasta”.</p>
      ) : cargando || !resumen ? (
        <p className="text-sm text-neutral-500">Cargando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
            <div className="bg-success-50 bg-success-500/10 rounded-xl p-4">
              <p className="text-xs text-success-700 mb-1">Total del período</p>
              <p className="text-2xl font-semibold text-success-700">${resumen.totalGeneral.toLocaleString()}</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <p className="text-xs text-neutral-500 mb-1">Cantidad de abonos</p>
              <p className="text-2xl font-semibold text-neutral-900">{resumen.cantidadAbonos}</p>
            </div>
          </div>

          {resumen.dias.length === 0 && <p className="text-sm text-neutral-500">Sin ventas en este rango de fechas.</p>}

          <div className="flex flex-col gap-2">
            {diasOrdenados.map((dia) => (
              <div key={dia.fecha} className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setDiaAbierto(diaAbierto === dia.fecha ? null : dia.fecha)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-100"
                >
                  <span className="text-sm font-medium text-neutral-900 capitalize">{fmtFechaCorta(dia.fecha)}</span>
                  <span className="text-sm font-semibold text-success-700">${dia.total.toLocaleString()}</span>
                </button>

                {diaAbierto === dia.fecha && (
                  <div className="border-t border-neutral-200 px-4 py-3">
                    {esSuperAdmin && (
                      <div className="mb-3">
                        <p className="text-xs text-neutral-500 mb-1.5">Por agente</p>
                        <div className="flex flex-col gap-1">
                          {dia.porUsuario.map((u) => (
                            <div key={u.usuarioId} className="flex justify-between text-sm">
                              <span className="text-neutral-700">{u.nombre}</span>
                              <span className="font-medium text-neutral-900">${u.total.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-neutral-500 mb-1.5">Abonos de este día</p>
                    <div className="flex flex-col gap-1.5">
                      {abonosDelDia(dia.fecha).map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-xs bg-neutral-100 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-neutral-800 font-medium">{a.personaNombre ?? "Sin contacto"} · {a.pipelineNombre}</p>
                            <p className="text-neutral-500">{a.nota || "sin nota"} · {fmtFechaHora(a.fecha)}{esSuperAdmin ? ` · ${a.autorNombre}` : ""}</p>
                          </div>
                          <span className="flex items-center shrink-0 ml-3">
                            {esSuperAdmin && (
                              <button
                                onClick={() => { setBorrandoPago(a); setErrorEliminar(null); }}
                                title="Eliminar este registro financiero"
                                className="text-neutral-300 hover:text-danger-600 text-sm leading-none mr-2"
                              >
                                ✕
                              </button>
                            )}
                            <span className="font-semibold text-success-700">${a.monto.toLocaleString()}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {borrandoPago && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm border border-neutral-200">
            <p className="text-sm font-medium mb-3 text-neutral-800">¿Eliminar este registro financiero?</p>

            <div className="text-xs text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-2 mb-3 space-y-1">
              <p><span className="text-neutral-500">Cliente:</span> {borrandoPago.personaNombre ?? "Sin contacto"}</p>
              <p><span className="text-neutral-500">Monto:</span> <span className="font-semibold text-neutral-900">${borrandoPago.monto.toLocaleString()}</span></p>
              <p><span className="text-neutral-500">Fecha:</span> {fmtFechaHora(borrandoPago.fecha)}</p>
              <p><span className="text-neutral-500">Responsable:</span> {borrandoPago.autorNombre}</p>
            </div>

            <p className="text-xs text-danger-600 mb-4">
              Solo se elimina este abono — no se toca al cliente ni al trato. El total del período,
              el saldo del pipeline y los totales por agente se recalculan automáticamente.
            </p>

            {errorEliminar && <p className="text-xs text-danger-600 mb-3">{errorEliminar}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBorrandoPago(null)}
                disabled={eliminandoPago}
                className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmarEliminar()}
                disabled={eliminandoPago}
                className="text-sm px-3 py-1.5 rounded-lg bg-danger-600 text-white font-medium disabled:bg-danger-300"
              >
                {eliminandoPago ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
