import { useEffect, useState, useCallback, DragEvent } from "react";
import { api, ApiError } from "../api/client";
import type { TableroPipeline, Registro } from "../types";

export function KanbanBoard({ pipelineId }: { pipelineId: string }) {
  const [tablero, setTablero] = useState<TableroPipeline | null>(null);
  const [metricas, setMetricas] = useState<{ tasaConversion: number; valorAbierto: number; abiertos: number } | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [pendienteMotivo, setPendienteMotivo] = useState<{ registroId: string; etapaId: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pagoModal, setPagoModal] = useState<Registro | null>(null);
  const [montoPago, setMontoPago] = useState("");
  const [notaPago, setNotaPago] = useState("");
  const [fechaPago, setFechaPago] = useState("");
  const [fechaProximoCobro, setFechaProximoCobro] = useState("");
  const [proximoPago, setProximoPago] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [editandoValor, setEditandoValor] = useState(false);
  const [nuevoValor, setNuevoValor] = useState("");
  const [guardandoValor, setGuardandoValor] = useState(false);

  const [cerrarModal, setCerrarModal] = useState<Registro | null>(null);
  const [cvMontoTotal, setCvMontoTotal] = useState("");
  const [cvMontoCobrado, setCvMontoCobrado] = useState("");
  const [cvFechaProximoCobro, setCvFechaProximoCobro] = useState("");
  const [cvMetodoPago, setCvMetodoPago] = useState("");
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvGuardando, setCvGuardando] = useState(false);

  function hoyStr(): string {
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  }

  const cargar = useCallback(async () => {
    const [t, m] = await Promise.all([api.tableroKanban(pipelineId), api.metricasPipeline(pipelineId)]);
    setTablero(t);
    setMetricas(m);
  }, [pipelineId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const mover = async (registroId: string, etapaId: string, motivoPerdida?: string) => {
    try {
      await api.moverEtapa(registroId, etapaId, motivoPerdida);
      void cargar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setPendienteMotivo({ registroId, etapaId });
      }
    }
  };

  const onDrop = (e: DragEvent, etapaId: string, esPerdida: boolean) => {
    e.preventDefault();
    if (!arrastrando) return;
    if (esPerdida) {
      setPendienteMotivo({ registroId: arrastrando, etapaId });
    } else {
      void mover(arrastrando, etapaId);
    }
    setArrastrando(null);
  };

  const abrirPago = (r: Registro) => {
    setPagoModal(r);
    setMontoPago("");
    setNotaPago("");
    setFechaPago(hoyStr());
    setFechaProximoCobro("");
    setProximoPago("");
    setMetodoPago("");
    setErrorPago(null);
    setEditandoValor(false);
    setNuevoValor(r.valor != null ? String(r.valor) : "");
  };

  const saldoActual = pagoModal ? pagoModal.saldoPendiente ?? 0 : 0;
  const montoNum = Number(montoPago) || 0;
  const saldoDespues = Math.max(0, saldoActual - montoNum);
  const requiereFecha = saldoDespues > 0;

  const guardarNuevoValor = async () => {
    if (!pagoModal) return;
    const valorNum = Number(nuevoValor);
    if (!valorNum || valorNum <= 0) { setErrorPago("Ingresa un precio válido."); return; }
    setGuardandoValor(true);
    setErrorPago(null);
    try {
      const resultado = await api.actualizarValorRegistro(pagoModal.id, valorNum);
      setPagoModal({ ...pagoModal, valor: resultado.valor, totalPagado: resultado.totalPagado, saldoPendiente: resultado.saldoPendiente });
      setEditandoValor(false);
      void cargar();
    } catch (err) {
      setErrorPago(err instanceof ApiError ? String(err.payload) : "Error al actualizar el precio");
    } finally {
      setGuardandoValor(false);
    }
  };

  const confirmarPago = async () => {
    if (!pagoModal) return;
    if (!montoNum || montoNum <= 0) { setErrorPago("Ingresa un monto válido."); return; }
    if (requiereFecha && !fechaProximoCobro) { setErrorPago("Queda saldo pendiente — indica la fecha del próximo cobro."); return; }
    setGuardandoPago(true);
    setErrorPago(null);
    try {
      await api.registrarPago(pagoModal.id, {
        monto: montoNum,
        nota: notaPago || undefined,
        fecha: fechaPago ? `${fechaPago}T16:00:00.000Z` : undefined,
        proximaFechaCobro: fechaProximoCobro ? new Date(fechaProximoCobro).toISOString() : undefined,
        proximoPago: proximoPago ? Number(proximoPago) : undefined,
        metodoPago: metodoPago || undefined,
      });
      setPagoModal(null);
      void cargar();
    } catch (err) {
      setErrorPago(err instanceof ApiError ? String(err.payload) : "Error al registrar el pago");
    } finally {
      setGuardandoPago(false);
    }
  };

  // ── Cerrar venta en un solo paso ─────────────────────────────
  const abrirCerrarVenta = (r: Registro) => {
    setCerrarModal(r);
    const total = r.valor != null ? String(r.valor) : "";
    setCvMontoTotal(total);
    setCvMontoCobrado(total); // por defecto cobra el total → queda saldado
    setCvFechaProximoCobro("");
    setCvMetodoPago("");
    setCvError(null);
  };

  const cvTotalNum = Number(cvMontoTotal) || 0;
  const cvCobradoNum = Number(cvMontoCobrado) || 0;
  const cvSaldo = Math.max(0, cvTotalNum - cvCobradoNum);
  const cvRequiereFecha = cvSaldo > 0;

  const cambiarCvTotal = (nuevo: string) => {
    setCvMontoTotal(nuevo);
    // Si el cobrado sigue en el valor por defecto (el total anterior), sincronízalo.
    if (cvMontoCobrado === "" || Number(cvMontoCobrado) === Number(cvMontoTotal)) {
      setCvMontoCobrado(nuevo);
    }
  };

  const confirmarCerrarVenta = async () => {
    if (!cerrarModal) return;
    if (!cvTotalNum || cvTotalNum <= 0) { setCvError("Ingresa el monto total de la venta."); return; }
    if (!cvCobradoNum || cvCobradoNum <= 0) { setCvError("Ingresa cuánto se cobró hoy."); return; }
    if (cvRequiereFecha && !cvFechaProximoCobro) { setCvError("Queda saldo pendiente — indica la fecha del próximo cobro."); return; }
    setCvGuardando(true);
    setCvError(null);
    try {
      await api.cerrarVenta(cerrarModal.id, {
        montoTotal: cvTotalNum,
        montoCobrado: cvCobradoNum,
        proximaFechaCobro: cvFechaProximoCobro ? new Date(cvFechaProximoCobro).toISOString() : undefined,
        metodoPago: cvMetodoPago || undefined,
      });
      setCerrarModal(null);
      void cargar();
    } catch (err) {
      setCvError(err instanceof ApiError ? String(err.payload) : "Error al cerrar la venta");
    } finally {
      setCvGuardando(false);
    }
  };

  if (!tablero) return <p className="text-sm text-neutral-500 text-neutral-400">Cargando tablero...</p>;

  return (
    <div>
      {metricas && (
        <div className="grid grid-cols-3 gap-3 mb-5 max-w-lg">
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <p className="text-xs text-neutral-500 text-neutral-400">Tasa de conversión</p>
            <p className="text-lg font-semibold text-neutral-800">{metricas.tasaConversion}%</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <p className="text-xs text-neutral-500 text-neutral-400">Valor abierto</p>
            <p className="text-lg font-semibold text-neutral-800">${metricas.valorAbierto.toLocaleString()}</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <p className="text-xs text-neutral-500 text-neutral-400">Registros abiertos</p>
            <p className="text-lg font-semibold text-neutral-800">{metricas.abiertos}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {tablero.etapas.map((etapa) => (
          <div
            key={etapa.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, etapa.id, etapa.esPerdida)}
            className="bg-neutral-100 bg-neutral-100 rounded-xl p-2.5 w-64 shrink-0"
          >
            <div className="flex items-center justify-between px-1 mb-2">
              <p className="text-xs font-semibold text-neutral-600 text-neutral-400">{etapa.nombre}</p>
              <span className="text-[11px] bg-neutral-100 rounded-full px-1.5 py-0.5 text-neutral-500 text-neutral-400">{etapa.registros.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {etapa.registros.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={() => setArrastrando(r.id)}
                  className="bg-neutral-50 rounded-lg border border-neutral-200 p-2.5 text-sm cursor-move shadow-sm "
                >
                  <p className="font-medium text-neutral-800 text-neutral-200">{r.personaNombre ?? "Sin persona asignada"}</p>
                  {r.valor != null && (
                    <>
                      <p className="text-xs text-neutral-500 text-neutral-400">
                        ${r.valor.toLocaleString()}
                        {(r.totalPagado ?? 0) > 0 && <span className="text-success-600"> · pagado ${r.totalPagado!.toLocaleString()}</span>}
                      </p>
                      {r.saldoPendiente != null && r.saldoPendiente > 0 && (
                        <p className="text-[11px] text-warning-600 font-medium">Saldo: ${r.saldoPendiente.toLocaleString()}</p>
                      )}
                      {r.saldoPendiente === 0 && <p className="text-[11px] text-success-600 font-medium">Saldado ✓</p>}
                      {(r.proximoPago ?? 0) > 0 && (
                        <p className="text-[11px] text-neutral-500 text-neutral-400">
                          Próximo pago: ${r.proximoPago!.toLocaleString()}
                          {r.metodoPago ? ` · ${r.metodoPago}` : ""}
                        </p>
                      )}
                      {(r.montoVencido ?? 0) > 0 && (
                        <p className="text-[11px] text-danger-600 font-medium">Vencido: ${r.montoVencido!.toLocaleString()}</p>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirPago(r); }}
                        className="text-[11px] text-primary-600 font-medium hover:underline mt-1"
                      >
                        + Registrar pago
                      </button>
                    </>
                  )}
                  {!etapa.esGanada && !etapa.esPerdida && (
                    <button
                      onClick={(e) => { e.stopPropagation(); abrirCerrarVenta(r); }}
                      className="w-full mt-1.5 text-[11px] bg-primary-500 text-white font-semibold py-1 px-2 rounded-md hover:bg-primary-600"
                    >
                      ✅ Cerrar venta
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {pendienteMotivo && (
        <div className="fixed inset-0 bg-neutral-900/40 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm border border-neutral-200">
            <p className="text-sm font-medium mb-2 text-neutral-800">Motivo de pérdida requerido</p>
            <p className="text-xs text-neutral-500 text-neutral-400 mb-3">No se puede mover un registro a esta etapa sin indicar por qué se perdió.</p>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Precio, timing, sin respuesta..."
              className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPendienteMotivo(null); setMotivo(""); }} className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-300">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await mover(pendienteMotivo.registroId, pendienteMotivo.etapaId, motivo);
                  setPendienteMotivo(null);
                  setMotivo("");
                }}
                disabled={!motivo}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white font-medium disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {pagoModal && (
        <div className="fixed inset-0 bg-neutral-900/40 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm border border-neutral-200">
            <p className="text-sm font-medium mb-1 text-neutral-800">Registrar pago — {pagoModal.personaNombre}</p>

            {!editandoValor ? (
              <p className="text-xs text-neutral-500 text-neutral-400 mb-1">
                Total ${pagoModal.valor?.toLocaleString()} · Pagado ${(pagoModal.totalPagado ?? 0).toLocaleString()} · Saldo actual ${saldoActual.toLocaleString()}
                {" · "}
                <button type="button" onClick={() => setEditandoValor(true)} className="text-primary-600 hover:underline">
                  editar precio
                </button>
              </p>
            ) : (
              <div className="bg-neutral-50 bg-neutral-100 border border-neutral-200 rounded-lg p-2.5 mb-2">
                <label className="text-xs text-neutral-600 text-neutral-400">Precio total correcto del trato (USD)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    value={nuevoValor}
                    onChange={(e) => setNuevoValor(e.target.value)}
                    className="flex-1 border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={guardarNuevoValor}
                    disabled={guardandoValor}
                    className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                  >
                    {guardandoValor ? "..." : "Guardar"}
                  </button>
                  <button type="button" onClick={() => setEditandoValor(false)} className="text-xs px-2 text-neutral-500">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="mb-3" />

            <label className="text-xs text-neutral-600 text-neutral-400">Monto del pago (USD)</label>
            <input
              type="number"
              value={montoPago}
              onChange={(e) => setMontoPago(e.target.value)}
              className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3"
              placeholder="0"
            />

            <label className="text-xs text-neutral-600 text-neutral-400">Nota (opcional)</label>
            <input
              value={notaPago}
              onChange={(e) => setNotaPago(e.target.value)}
              className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3"
              placeholder="Ej: Pago inicial, transferencia..."
            />

            <label className="text-xs text-neutral-600 text-neutral-400">Fecha en que se hizo el pago</label>
            <input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3"
            />
            <p className="text-[11px] text-neutral-400 text-neutral-500 -mt-2 mb-3">Cambia esto si estás registrando una venta de un día anterior.</p>

            {montoNum > 0 && (
              <p className={`text-xs mb-3 ${saldoDespues > 0 ? "text-warning-600" : "text-success-600"}`}>
                {saldoDespues > 0 ? `Quedará un saldo de $${saldoDespues.toLocaleString()}` : "Este pago salda por completo"}
              </p>
            )}

            {requiereFecha && (
              <>
                <label className="text-xs text-neutral-600 text-neutral-400">Próxima fecha de cobro *</label>
                <input
                  type="date"
                  value={fechaProximoCobro}
                  onChange={(e) => setFechaProximoCobro(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3"
                />

                <label className="text-xs text-neutral-600 text-neutral-400">Próximo pago (USD) — cuánto se cobra en esa fecha</label>
                <input
                  type="number"
                  value={proximoPago}
                  onChange={(e) => setProximoPago(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder={saldoDespues > 0 ? String(saldoDespues) : ""}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3 font-mono"
                />

                <label className="text-xs text-neutral-600 text-neutral-400">Método de pago</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3"
                >
                  <option value="">Selecciona...</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Otro">Otro</option>
                </select>
              </>
            )}

            {errorPago && <p className="text-xs text-danger-600 mb-3">{errorPago}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setPagoModal(null)} className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-300">
                Cancelar
              </button>
              <button
                onClick={confirmarPago}
                disabled={guardandoPago}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white font-medium disabled:opacity-50"
              >
                {guardandoPago ? "Guardando..." : "Confirmar pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cerrarModal && (
        <div className="fixed inset-0 bg-neutral-900/40 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm border border-neutral-200">
            <p className="text-sm font-medium mb-1 text-neutral-800">Cerrar venta — {cerrarModal.personaNombre}</p>
            <p className="text-xs text-neutral-500 text-neutral-400 mb-3">
              Fija el total, registra lo cobrado hoy y mueve la tarjeta a la etapa ganada en un solo paso.
            </p>

            <label className="text-xs text-neutral-600 text-neutral-400">Monto total de la venta (USD)</label>
            <input
              type="number"
              value={cvMontoTotal}
              onChange={(e) => cambiarCvTotal(e.target.value)}
              className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3"
              placeholder="0"
            />

            <label className="text-xs text-neutral-600 text-neutral-400">Cobrado hoy (USD)</label>
            <input
              type="number"
              value={cvMontoCobrado}
              onChange={(e) => setCvMontoCobrado(e.target.value)}
              className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-1"
              placeholder="0"
            />

            {cvTotalNum > 0 && cvCobradoNum > 0 && (
              <p className={`text-xs mb-3 ${cvSaldo > 0 ? "text-warning-600" : "text-success-600"}`}>
                {cvSaldo > 0 ? `Quedará un saldo de $${cvSaldo.toLocaleString()}` : "Queda saldado por completo ✓"}
              </p>
            )}

            {cvRequiereFecha && (
              <>
                <label className="text-xs text-neutral-600 text-neutral-400">Próxima fecha de cobro *</label>
                <input
                  type="date"
                  value={cvFechaProximoCobro}
                  onChange={(e) => setCvFechaProximoCobro(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3"
                />

                <label className="text-xs text-neutral-600 text-neutral-400">Método de pago</label>
                <select
                  value={cvMetodoPago}
                  onChange={(e) => setCvMetodoPago(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-1.5 text-sm mb-3"
                >
                  <option value="">Selecciona...</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Otro">Otro</option>
                </select>
              </>
            )}

            {cvError && <p className="text-xs text-danger-600 mb-3">{cvError}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setCerrarModal(null)} className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-300">
                Cancelar
              </button>
              <button
                onClick={confirmarCerrarVenta}
                disabled={cvGuardando}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white font-medium disabled:opacity-50"
              >
                {cvGuardando ? "Cerrando..." : "Cerrar venta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
