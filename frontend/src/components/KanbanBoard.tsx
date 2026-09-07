import { useEffect, useLayoutEffect, useRef, useState, useCallback, DragEvent } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { TableroPipeline, Registro } from "../types";

function nuevaClavePago(): string {
  // Clave única por intento de pago: si el usuario reintenta (o un doble clic dispara dos
  // requests), el backend descarta el duplicado gracias a esta clave. Se genera al abrir el
  // modal y se reutiliza en reintentos — no se regenera tras un error.
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function KanbanBoard({ pipelineId }: { pipelineId: string }) {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";

  const [tablero, setTablero] = useState<TableroPipeline | null>(null);
  const [metricas, setMetricas] = useState<{ tasaConversion: number; valorAbierto: number; abiertos: number } | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [pendienteMotivo, setPendienteMotivo] = useState<{ registroId: string; etapaId: string } | null>(null);
  const [motivo, setMotivo] = useState("");

  // Modal de pago unificado: "Registrar pago" (primero) define el monto total del negocio;
  // "Abonar pago" (siguientes) lo muestra como referencia fija. El monto total nunca se
  // mezcla con los abonos posteriores — corregirlo una vez con pagos es de SUPER ADMIN.
  const [pagoModal, setPagoModal] = useState<Registro | null>(null);
  const [montoTotalInput, setMontoTotalInput] = useState("");
  const [montoPago, setMontoPago] = useState("");
  const [notaPago, setNotaPago] = useState("");
  const [fechaPago, setFechaPago] = useState("");
  const [fechaProximoCobro, setFechaProximoCobro] = useState("");
  const [proximoPago, setProximoPago] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [clavePago, setClavePago] = useState("");

  // Ajustar el monto total de un trato fuera del modal de pago. Sin pagos puede hacerlo
  // cualquier miembro; con pagos ya registrados solo el SUPER ADMIN (el backend lo exige).
  const [ajustandoValorId, setAjustandoValorId] = useState<string | null>(null);
  const [ajusteValorInput, setAjusteValorInput] = useState("");
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);
  const [errorAjuste, setErrorAjuste] = useState<string | null>(null);

  // Referencia al contenedor de columnas y altura visible disponible:
  // permite que cada columna tenga su propio scroll vertical sin agrandar la página.
  const tableroRef = useRef<HTMLDivElement>(null);
  const [altoColumna, setAltoColumna] = useState(560);

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

  // Mide la altura real que queda visible bajo el tablero (encabezados de la página,
  // métricas, etc.) para acotar la altura de cada columna. Así el tablero aprovecha
  // la pantalla pero no crece más allá de ella: cada columna desplaza sus propias
  // tarjetas por dentro. Se re-mide al redimensionar o hacer scroll de la página.
  useLayoutEffect(() => {
    const contenedor = tableroRef.current;
    if (!contenedor) return;

    const medir = () => {
      const tope = contenedor.getBoundingClientRect().top;
      setAltoColumna(Math.max(180, Math.floor(window.innerHeight - Math.max(0, tope) - 24)));
    };

    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const ro = new ResizeObserver(medir);
    ro.observe(contenedor);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      ro.disconnect();
    };
  }, [tablero]);

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

  // ── Registrar / Abonar pago ─────────────────────────────────
  const abrirPago = (r: Registro) => {
    setPagoModal(r);
    // El total se define/corrige libremente hasta el primer pago; con pagos es fijo.
    setMontoTotalInput(r.valor != null ? String(r.valor) : "");
    setMontoPago("");
    setNotaPago("");
    setFechaPago(hoyStr());
    setFechaProximoCobro("");
    setProximoPago("");
    setMetodoPago("");
    setErrorPago(null);
    setClavePago(nuevaClavePago());
  };

  const cerrarModalPago = () => setPagoModal(null);

  const pagadoActual = pagoModal?.totalPagado ?? 0;
  const valorActual = pagoModal?.valor ?? null;
  const esPrimerPago = pagadoActual === 0;
  // Solo si el trato no tiene total aún (valor == null) se pide el monto total en el modal.
  const necesitaDefinirTotal = valorActual == null;
  const montoNum = Number(montoPago) || 0;
  const totalInputNum = Number(montoTotalInput) || 0;
  const totalRef = necesitaDefinirTotal ? totalInputNum : (valorActual ?? 0);
  const saldoActual = Math.max(0, (valorActual ?? totalRef) - pagadoActual);
  const saldoDespues = Math.max(0, totalRef - (pagadoActual + montoNum));
  const requiereFecha = totalRef > 0 && saldoDespues > 0;

  const confirmarPago = async () => {
    if (!pagoModal) return;
    if (necesitaDefinirTotal && !(totalInputNum > 0)) {
      setErrorPago("Indica el monto total del negocio.");
      return;
    }
    if (!montoNum || montoNum <= 0) {
      setErrorPago("Ingresa un monto de abono válido.");
      return;
    }
    if (totalRef > 0 && montoNum > saldoActual + 0.001) {
      setErrorPago(`El abono supera el saldo pendiente de $${saldoActual.toLocaleString()}.`);
      return;
    }
    if (requiereFecha && !fechaProximoCobro) {
      setErrorPago("Queda saldo pendiente — indica la fecha del próximo cobro.");
      return;
    }
    setGuardandoPago(true);
    setErrorPago(null);
    try {
      await api.registrarPago(pagoModal.id, {
        monto: montoNum,
        montoTotal: necesitaDefinirTotal ? totalInputNum : undefined,
        nota: notaPago || undefined,
        fecha: fechaPago ? `${fechaPago}T16:00:00.000Z` : undefined,
        proximaFechaCobro: fechaProximoCobro ? new Date(fechaProximoCobro).toISOString() : undefined,
        proximoPago: proximoPago ? Number(proximoPago) : undefined,
        metodoPago: metodoPago || undefined,
        idempotencyKey: clavePago,
      });
      setPagoModal(null);
      void cargar();
    } catch (err) {
      setErrorPago(err instanceof ApiError ? String(err.payload) : "Error al registrar el pago");
    } finally {
      setGuardandoPago(false);
    }
  };

  // ── Ajustar el monto total del trato (fuera del modal de pago) ──
  const abrirAjusteValor = (r: Registro) => {
    setAjustandoValorId(r.id);
    setAjusteValorInput(r.valor != null ? String(r.valor) : "");
    setErrorAjuste(null);
  };

  const guardarAjusteValor = async (registroId: string) => {
    const valorNum = Number(ajusteValorInput);
    if (!valorNum || valorNum <= 0) {
      setErrorAjuste("Ingresa un monto total válido.");
      return;
    }
    setGuardandoAjuste(true);
    setErrorAjuste(null);
    try {
      await api.actualizarValorRegistro(registroId, valorNum);
      setAjustandoValorId(null);
      void cargar();
    } catch (err) {
      setErrorAjuste(err instanceof ApiError ? String(err.payload) : "Error al actualizar el monto total");
    } finally {
      setGuardandoAjuste(false);
    }
  };

  if (!tablero) return <p className="text-sm text-neutral-500">Cargando tablero...</p>;

  return (
    <div>
      {metricas && (
        <div className="grid grid-cols-3 gap-3 mb-5 max-w-lg">
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <p className="text-xs text-neutral-500">Tasa de conversión</p>
            <p className="text-lg font-semibold text-neutral-800">{metricas.tasaConversion}%</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <p className="text-xs text-neutral-500">Valor abierto</p>
            <p className="text-lg font-semibold text-neutral-800">${metricas.valorAbierto.toLocaleString()}</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <p className="text-xs text-neutral-500">Registros abiertos</p>
            <p className="text-lg font-semibold text-neutral-800">{metricas.abiertos}</p>
          </div>
        </div>
      )}

      <div ref={tableroRef} className="flex gap-3 overflow-x-auto pb-4">
        {tablero.etapas.map((etapa) => (
          <div
            key={etapa.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, etapa.id, etapa.esPerdida)}
            className="bg-neutral-100 rounded-xl p-2.5 w-64 shrink-0 flex flex-col"
            style={{ maxHeight: altoColumna }}
          >
            <div className="flex items-center justify-between px-1 mb-2 shrink-0">
              <p className="text-xs font-semibold text-neutral-600">{etapa.nombre}</p>
              <span className="text-[11px] bg-neutral-100 rounded-full px-1.5 py-0.5 text-neutral-500">{etapa.registros.length}</span>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto min-h-0 pipeline-cards-scroll">
              {etapa.registros.map((r) => {
                const pagado = r.totalPagado ?? 0;
                const tieneTotal = r.valor != null;
                const saldo = r.saldoPendiente ?? 0;
                const saldado = tieneTotal && saldo <= 0;
                const puedeAjustarTotal = tieneTotal && (pagado === 0 || esSuperAdmin);

                return (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={() => setArrastrando(r.id)}
                    className="bg-neutral-50 rounded-lg border border-neutral-200 p-2.5 text-sm cursor-move shadow-sm "
                  >
                    <p className="font-medium text-neutral-800">{r.personaNombre ?? "Sin persona asignada"}</p>

                    {tieneTotal && (
                      <>
                        <p className="text-xs text-neutral-500">
                          Total ${r.valor!.toLocaleString()} · Pagado ${pagado.toLocaleString()}
                        </p>
                        {saldado ? (
                          <p className="text-[11px] text-success-600 font-medium">Pagado ✓ · Saldo $0</p>
                        ) : (
                          <p className="text-[11px] text-warning-600 font-medium">Saldo: ${saldo.toLocaleString()}</p>
                        )}
                        {(r.proximoPago ?? 0) > 0 && (
                          <p className="text-[11px] text-neutral-500">
                            Próximo pago: ${r.proximoPago!.toLocaleString()}
                            {r.metodoPago ? ` · ${r.metodoPago}` : ""}
                          </p>
                        )}
                        {(r.montoVencido ?? 0) > 0 && (
                          <p className="text-[11px] text-danger-600 font-medium">Vencido: ${r.montoVencido!.toLocaleString()}</p>
                        )}
                        {puedeAjustarTotal && ajustandoValorId !== r.id && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); abrirAjusteValor(r); }}
                            className="text-[10px] text-neutral-400 hover:text-primary-600 hover:underline"
                          >
                            ajustar total
                          </button>
                        )}
                        {puedeAjustarTotal && ajustandoValorId === r.id && (
                          <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              value={ajusteValorInput}
                              onChange={(e) => setAjusteValorInput(e.target.value)}
                              className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded px-1.5 py-1 text-xs mb-1"
                              placeholder="Monto total (USD)"
                            />
                            {errorAjuste && <p className="text-[10px] text-danger-600 mb-1">{errorAjuste}</p>}
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => void guardarAjusteValor(r.id)}
                                disabled={guardandoAjuste}
                                className="text-[10px] bg-primary-500 text-white px-2 py-0.5 rounded font-medium disabled:bg-primary-100"
                              >
                                {guardandoAjuste ? "..." : "Guardar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setAjustandoValorId(null)}
                                className="text-[10px] px-1.5 text-neutral-500"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {!tieneTotal && pagado > 0 && (
                      <p className="text-xs text-neutral-500">Pagado ${pagado.toLocaleString()}</p>
                    )}

                    {!saldado && (
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirPago(r); }}
                        className="text-[11px] text-primary-600 font-medium hover:underline mt-1"
                      >
                        {pagado === 0 ? "+ Registrar pago" : "+ Abonar pago"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {pendienteMotivo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm border border-neutral-200">
            <p className="text-sm font-medium mb-2 text-neutral-800">Motivo de pérdida requerido</p>
            <p className="text-xs text-neutral-500 mb-3">No se puede mover un registro a esta etapa sin indicar por qué se perdió.</p>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Precio, timing, sin respuesta..."
              className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPendienteMotivo(null); setMotivo(""); }} className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await mover(pendienteMotivo.registroId, pendienteMotivo.etapaId, motivo);
                  setPendienteMotivo(null);
                  setMotivo("");
                }}
                disabled={!motivo}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white font-medium disabled:bg-primary-100 disabled:text-primary-800"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {pagoModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm border border-neutral-200">
            <p className="text-sm font-medium mb-1 text-neutral-800">
              {esPrimerPago ? "Registrar pago" : "Abonar pago"} — {pagoModal.personaNombre}
            </p>

            {necesitaDefinirTotal ? (
              <>
                <p className="text-xs text-neutral-500 mb-2">
                  Este trato aún no tiene monto total. Defínelo ahora junto con este primer pago; quedará fijo.
                </p>
                <label className="text-xs text-neutral-600">Monto total del negocio (USD)</label>
                <input
                  type="number"
                  value={montoTotalInput}
                  onChange={(e) => setMontoTotalInput(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3"
                  placeholder="0"
                />
              </>
            ) : (
              <p className="text-xs text-neutral-500 mb-3">
                Total ${pagoModal.valor?.toLocaleString()} · Pagado ${pagadoActual.toLocaleString()} · Saldo restante ${saldoActual.toLocaleString()}
              </p>
            )}

            <label className="text-xs text-neutral-600">
              {esPrimerPago ? "Abono / pago recibido ahora (USD)" : "Nuevo abono (USD)"}
            </label>
            <input
              type="number"
              value={montoPago}
              onChange={(e) => setMontoPago(e.target.value)}
              className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3"
              placeholder="0"
            />

            <label className="text-xs text-neutral-600">Nota (opcional)</label>
            <input
              value={notaPago}
              onChange={(e) => setNotaPago(e.target.value)}
              className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3"
              placeholder="Ej: Pago inicial, transferencia..."
            />

            <label className="text-xs text-neutral-600">Fecha en que se hizo el pago</label>
            <input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3"
            />
            <p className="text-[11px] text-neutral-500 -mt-2 mb-3">Cambia esto si estás registrando una venta de un día anterior.</p>

            {montoNum > 0 && (
              <p className={`text-xs mb-3 ${saldoDespues > 0 ? "text-warning-600" : "text-success-600"}`}>
                {saldoDespues > 0 ? `Quedará un saldo de $${saldoDespues.toLocaleString()}` : "Este pago salda por completo"}
              </p>
            )}

            {requiereFecha && (
              <>
                <label className="text-xs text-neutral-600">Próxima fecha de cobro *</label>
                <input
                  type="date"
                  value={fechaProximoCobro}
                  onChange={(e) => setFechaProximoCobro(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3"
                />

                <label className="text-xs text-neutral-600">Próximo pago (USD) — cuánto se cobra en esa fecha</label>
                <input
                  type="number"
                  value={proximoPago}
                  onChange={(e) => setProximoPago(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder={saldoDespues > 0 ? String(saldoDespues) : ""}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3 font-mono"
                />

                <label className="text-xs text-neutral-600">Método de pago</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3"
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
              <button onClick={cerrarModalPago} className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600">
                Cancelar
              </button>
              <button
                onClick={confirmarPago}
                disabled={guardandoPago}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white font-medium disabled:bg-primary-100 disabled:text-primary-800"
              >
                {guardandoPago ? "Guardando..." : esPrimerPago ? "Registrar pago" : "Registrar abono"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
