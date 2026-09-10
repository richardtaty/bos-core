import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { usePermisos } from "../hooks/usePermisos";
import type { ControlSueldo, FilaSueldo, PersonalRRHH, Salario } from "../types";
import { centavosATexto, formatearMoneda, textoACentavos } from "../lib/moneda";
import { etiquetaMes, fmtDuracion, mesActualET } from "../lib/jornada-formato";

// ─── RECURSOS HUMANOS → Control de Sueldo ───────────────────────
// Control INTERNO: cuánto se estima pagarle a cada persona en un mes, según su sueldo mensual,
// las horas que tenía programadas y las que realmente registró en Asistencia.
//
// Lo que esta pantalla NO es (a propósito, todavía): nómina fiscal. No hay impuestos,
// retenciones, deducciones, beneficios, bonos, comisiones, overtime automático, pagos ni
// estado "pagado". Tampoco descuentos por tardanza, ausencia o check-ins.
//
// Las horas NO se escriben aquí ni se copian a mano: salen de Asistencia, que es la fuente de
// verdad. El sueldo tampoco sale de Mi día ni del perfil: solo se administra desde aquí, por
// personas autorizadas, y cada cambio queda como una vigencia nueva en el historial.

/** Estados que explican por qué un estimado todavía no se puede calcular. */
const MOTIVO_SIN_CALCULO: Record<FilaSueldo["estado"], string> = {
  OK: "",
  SIN_SUELDO: "Sin sueldo configurado",
  SIN_JORNADA_ESPERADA: "Sin jornada esperada",
};

const CLASE_ESTADO: Record<FilaSueldo["estado"], string> = {
  OK: "bg-success-50 text-success-700 border-success-200",
  SIN_SUELDO: "bg-warning-50 text-warning-700 border-warning-200",
  SIN_JORNADA_ESPERADA: "bg-neutral-100 text-neutral-600 border-neutral-300",
};

function primerDiaDe(mes: string): string {
  return `${mes}-01`;
}

// ─── Modal: configurar sueldo mensual ───────────────────────────

interface ModalSueldoProps {
  fila: FilaSueldo;
  mes: string;
  onClose: () => void;
  /** Se llama SOLO cuando el monto quedó guardado en el servidor. */
  onGuardado: (mensaje: string) => void;
}

function ModalSueldo({ fila, mes, onClose, onGuardado }: ModalSueldoProps) {
  const [monto, setMonto] = useState(() => centavosATexto(fila.montoCentavos) || "0.00");
  // Por defecto el cambio aplica desde el primer día del mes que se está consultando.
  const [vigenteDesde, setVigenteDesde] = useState(() => fila.vigenteDesde ?? primerDiaDe(mes));
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const centavos = textoACentavos(monto);
  const valido = centavos !== null && vigenteDesde.length === 10;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valido || centavos === null) {
      setError("Escribe un monto válido, por ejemplo 2000.00");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await api.guardarSueldo(fila.userId, {
        montoCentavos: centavos,
        vigenteDesde,
        notas: notas.trim() || null,
      });
      onGuardado(
        r.reemplazo
          ? "El monto de esa fecha se actualizó. Las demás vigencias quedaron intactas."
          : "Monto guardado como una vigencia nueva. El anterior se conserva en el historial.",
      );
    } catch (err) {
      const detalle = err instanceof ApiError ? err.message : "No se pudo guardar el sueldo.";
      setError(detalle);
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-10 sm:pt-16 z-40 overflow-y-auto">
      <form
        onSubmit={onSubmit}
        className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-md p-6 border border-neutral-200 mb-10"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-800">Sueldo mensual</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-600 text-lg leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">{fila.nombre}</p>

        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 mb-4">
          <p className="text-xs text-neutral-600">
            Sueldo vigente en {etiquetaMes(mes)}:{" "}
            <span className="font-semibold text-neutral-800">{formatearMoneda(fila.montoCentavos)}</span>
          </p>
          {fila.vigenteDesde && (
            <p className="text-[11px] text-neutral-500 mt-0.5">Aplica desde el {fila.vigenteDesde}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-neutral-600 mb-1 block">Nuevo monto (USD) *</label>
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              placeholder="2000.00"
              required
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600 mb-1 block">Aplica desde *</label>
            <input
              type="date"
              value={vigenteDesde}
              onChange={(e) => setVigenteDesde(e.target.value)}
              required
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-neutral-600 mb-1 block">Nota (opcional)</label>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej.: aumento acordado"
            className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <p className="text-[11px] text-neutral-500 mb-4">
          El monto anterior no se borra: queda en el historial y sigue siendo el que aplica a los
          meses anteriores a esa fecha. Los meses ya consultados no se recalculan.
        </p>

        {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          >
            Cancelar
          </button>
          <button
            disabled={guardando || !valido}
            className="text-sm px-4 py-2 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 disabled:cursor-not-allowed"
          >
            {guardando ? "Guardando…" : "Guardar sueldo"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Modal: detalle del período + historial ─────────────────────

interface ModalDetalleProps {
  userId: string;
  mes: string;
  onClose: () => void;
  onConfigurar: (fila: FilaSueldo) => void;
}

function ModalDetalle({ userId, mes, onClose, onConfigurar }: ModalDetalleProps) {
  const [fila, setFila] = useState<FilaSueldo | null>(null);
  const [historial, setHistorial] = useState<Salario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const d = await api.detalleSueldo(userId, mes);
        setFila(d.fila);
        setHistorial(d.historial);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo cargar el detalle.");
      } finally {
        setCargando(false);
      }
    })();
  }, [userId, mes]);

  const Dato = ({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) => (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <p className="text-[11px] text-neutral-500 uppercase tracking-wide">{etiqueta}</p>
      <p className="text-sm font-semibold text-neutral-800">{valor}</p>
      {nota && <p className="text-[11px] text-neutral-500">{nota}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-10 sm:pt-16 z-40 overflow-y-auto">
      <div className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-lg p-6 border border-neutral-200 mb-10">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-800">Detalle del período</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-600 text-lg leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {cargando && <p className="text-sm text-neutral-500 py-4">Cargando…</p>}
        {error && <p className="text-sm text-danger-600 py-4">{error}</p>}

        {fila && (
          <>
            <p className="text-xs text-neutral-500 mb-4">
              {fila.nombre} · {etiquetaMes(mes)}
              {fila.departamentos.length > 0 ? ` · ${fila.departamentos.map((d) => d.nombre).join(", ")}` : ""}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <Dato
                etiqueta="Sueldo mensual aplicable"
                valor={formatearMoneda(fila.montoCentavos)}
                nota={fila.vigenteDesde ? `Desde el ${fila.vigenteDesde}` : "Sin configurar"}
              />
              <Dato etiqueta="Sueldo estimado a pagar" valor={formatearMoneda(fila.estimadoCentavos)} />
              <Dato
                etiqueta="Horas programadas"
                valor={fmtDuracion(fila.minutosProgramados * 60)}
                nota={fila.horarioConfigurado ? undefined : "Jornada esperada sin configurar"}
              />
              <Dato
                etiqueta="Horas registradas"
                valor={fmtDuracion(fila.segundosRegistrados)}
                nota={`${fila.sesionesFinalizadas} jornada${fila.sesionesFinalizadas !== 1 ? "s" : ""} finalizada${fila.sesionesFinalizadas !== 1 ? "s" : ""}`}
              />
              <Dato etiqueta="Diferencia de horas" valor={fmtDuracion(Math.abs(fila.diferenciaMinutos) * 60)} nota={fila.diferenciaMinutos < 0 ? "Trabajó más de lo programado" : "Programadas − registradas"} />
              <Dato
                etiqueta="Jornadas abiertas"
                valor={String(fila.sesionesAbiertas)}
                nota="No suman tiempo trabajado"
              />
            </div>

            {fila.estado !== "OK" && (
              <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2 mb-3">
                {fila.estado === "SIN_SUELDO"
                  ? "Esta persona todavía no tiene sueldo mensual configurado, así que no se calcula un estimado."
                  : "Su jornada esperada no tiene horas programadas en este período, así que no hay contra qué comparar. No se asume sueldo completo ni cero."}
              </p>
            )}

            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={() => onConfigurar(fila)}
                className="text-xs px-3 py-1.5 rounded-lg border border-primary-300 bg-white text-primary-700 hover:bg-primary-50 font-medium"
              >
                Configurar sueldo
              </button>
            </div>

            <h3 className="text-sm font-semibold text-neutral-700 mb-2">Historial de sueldo</h3>
            {historial.length === 0 ? (
              <p className="text-xs text-neutral-500">Sin montos registrados todavía.</p>
            ) : (
              <div className="space-y-1.5">
                {historial.map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                      s.vigenteDesde === fila.vigenteDesde
                        ? "border-primary-200 bg-primary-500/10"
                        : "border-neutral-200 bg-white"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-800">{formatearMoneda(s.montoCentavos)}</p>
                      <p className="text-[11px] text-neutral-500">
                        Aplica desde el {s.vigenteDesde}
                        {s.notas ? ` · ${s.notas}` : ""}
                      </p>
                    </div>
                    {s.vigenteDesde === fila.vigenteDesde && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-primary-200 bg-primary-500/15 text-primary-700 font-medium">
                        Aplica al período
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────

export function ControlSueldoPage() {
  const permisos = usePermisos();

  const [personal, setPersonal] = useState<PersonalRRHH[]>([]);
  const [mes, setMes] = useState(() => mesActualET());
  const [persona, setPersona] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");

  const [data, setData] = useState<ControlSueldo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [editando, setEditando] = useState<FilaSueldo | null>(null);
  const [detalleDe, setDetalleDe] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setData(
        await api.listarSueldos({
          mes: mes || undefined,
          userId: persona || undefined,
          departamentoId: departamentoId || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el control de sueldo.");
    } finally {
      setCargando(false);
    }
  }, [mes, persona, departamentoId]);

  useEffect(() => {
    if (permisos.cargando || !permisos.puedeVerRRHH) return;
    void consultar();
  }, [permisos.cargando, permisos.puedeVerRRHH, consultar]);

  // Personas y departamentos salen de Personal: misma plantilla, misma relación por ID real.
  useEffect(() => {
    if (permisos.cargando || !permisos.puedeVerRRHH) return;
    void (async () => {
      try {
        setPersonal(await api.listarPersonal());
      } catch {
        /* los filtros son opcionales: si fallan, el listado completo sigue sirviendo */
      }
    })();
  }, [permisos.cargando, permisos.puedeVerRRHH]);

  const departamentos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of personal) for (const d of p.departamentos) mapa.set(d.id, d.nombre);
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [personal]);

  function trasGuardar(mensaje: string) {
    setEditando(null);
    setAviso(mensaje);
    void consultar();
  }

  if (!permisos.cargando && !permisos.puedeVerRRHH) return <Navigate to="/mi-dia" replace />;

  const resumen = data?.resumen;
  const sinCalcular = data?.filas.filter((f) => f.estimadoCentavos === null).length ?? 0;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">Control de Sueldo</h1>
          <p className="text-sm text-neutral-500">
            Sueldo estimado a pagar de {data ? etiquetaMes(data.mes) : etiquetaMes(mes)} · control interno
          </p>
        </div>
      </div>

      {/* ── Filtros ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas las personas</option>
          {personal.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          value={departamentoId}
          onChange={(e) => setDepartamentoId(e.target.value)}
          className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los departamentos</option>
          {departamentos.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      {aviso && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-success-200 bg-success-50 px-3 py-2">
          <p className="text-xs text-success-700">{aviso}</p>
          <button type="button" onClick={() => setAviso(null)} className="text-xs text-success-700 hover:underline">
            Cerrar
          </button>
        </div>
      )}
      {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

      {/* ── Resumen del período ──────────────────────── */}
      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Empleados incluidos</p>
            <p className="text-lg font-semibold text-neutral-800">{resumen.empleados}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Total sueldos base</p>
            <p className="text-lg font-semibold text-neutral-800">{formatearMoneda(resumen.totalBaseCentavos)}</p>
            <p className="text-[11px] text-neutral-500">Montos vigentes en el período</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Total estimado a pagar</p>
            <p className="text-lg font-semibold text-neutral-800">{formatearMoneda(resumen.totalEstimadoCentavos)}</p>
            {sinCalcular > 0 && (
              <p className="text-[11px] text-warning-700">
                {sinCalcular} sin calcular: revisa su sueldo o su jornada esperada
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Listado ──────────────────────────────────── */}
      {cargando && <p className="text-sm text-neutral-500 py-8 text-center">Cargando el control de sueldo…</p>}

      {!cargando && data && data.filas.length === 0 && (
        <p className="text-sm text-neutral-600 text-center py-8">No hay personas en este filtro.</p>
      )}

      <div className="space-y-3">
        {!cargando &&
          data?.filas.map((f) => (
            <div
              key={f.userId}
              className={`bg-neutral-50 border border-neutral-200 rounded-xl p-4 ${f.estadoLaboral === "INACTIVO" ? "opacity-70" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-neutral-900">{f.nombre}</p>
                    {f.estadoLaboral === "INACTIVO" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-neutral-100 text-neutral-600 border-neutral-300">
                        INACTIVO
                      </span>
                    )}
                    {f.estado !== "OK" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${CLASE_ESTADO[f.estado]}`}>
                        {MOTIVO_SIN_CALCULO[f.estado]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    {f.departamentos.length > 0 ? f.departamentos.map((d) => d.nombre).join(", ") : "Sin departamento"}
                    {f.cargo && <span className="text-neutral-600"> · {f.cargo}</span>}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditando(f)}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                  >
                    {f.montoCentavos === null ? "Configurar sueldo" : "Cambiar sueldo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetalleDe(f.userId)}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                  >
                    Ver detalle
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-neutral-200">
                <div>
                  <p className="text-[11px] text-neutral-500">Sueldo mensual</p>
                  <p className="text-sm font-medium text-neutral-800">{formatearMoneda(f.montoCentavos)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-500">Horas programadas</p>
                  <p className="text-sm font-medium text-neutral-800">{fmtDuracion(f.minutosProgramados * 60)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-500">Horas registradas</p>
                  <p className="text-sm font-medium text-neutral-800">{fmtDuracion(f.segundosRegistrados)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-500">Diferencia</p>
                  <p className={`text-sm font-medium ${f.diferenciaMinutos < 0 ? "text-warning-700" : "text-neutral-800"}`}>
                    {fmtDuracion(Math.abs(f.diferenciaMinutos) * 60)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-500">Sueldo estimado a pagar</p>
                  <p className="text-sm font-semibold text-neutral-900">{formatearMoneda(f.estimadoCentavos)}</p>
                </div>
              </div>
            </div>
          ))}
      </div>

      <p className="text-[11px] text-neutral-500 mt-6">
        El sueldo estimado es proporcional a las horas registradas sobre las programadas; nunca
        supera el sueldo mensual configurado. Las horas salen de Asistencia y solo se consideran
        las jornadas terminadas. No incluye impuestos, deducciones ni pagos: es una estimación
        interna.
      </p>

      {editando && (
        <ModalSueldo
          fila={editando}
          mes={mes || mesActualET()}
          onClose={() => setEditando(null)}
          onGuardado={trasGuardar}
        />
      )}

      {detalleDe && (
        <ModalDetalle
          userId={detalleDe}
          mes={mes || mesActualET()}
          onClose={() => setDetalleDe(null)}
          onConfigurar={(f) => {
            setDetalleDe(null);
            setEditando(f);
          }}
        />
      )}
    </div>
  );
}
