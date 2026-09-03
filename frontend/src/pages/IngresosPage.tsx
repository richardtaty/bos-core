import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { ActividadIngreso, AdelantoPendiente, EgresoCategoria, Oferta, OfertaConProgreso, RentabilidadLinea, ResumenHoy, ResumenIngresos } from "../types";
import { EgresoModal } from "../components/EgresoModal";
import { VentaModal } from "../components/VentaModal";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${n}%`;

const CATEGORIA_COLOR: Record<string, string> = {
  Ancla: "#2563EB",
  Recurrente: "#16A34A",
  "Volumen medio": "#64748B",
  "Volumen alto": "#334155",
  Evento: "#D97706",
};

export function IngresosPage() {
  const [cargando, setCargando] = useState(true);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [resumen, setResumen] = useState<ResumenIngresos | null>(null);
  const [hoy, setHoy] = useState<ResumenHoy | null>(null);
  const [progreso, setProgreso] = useState<OfertaConProgreso[]>([]);
  const [adelantos, setAdelantos] = useState<AdelantoPendiente[]>([]);
  const [egrCats, setEgrCats] = useState<EgresoCategoria[]>([]);
  const [rentabilidad, setRentabilidad] = useState<RentabilidadLinea[]>([]);
  const [actividad, setActividad] = useState<ActividadIngreso[]>([]);

  const [mostrarVenta, setMostrarVenta] = useState(false);
  const [mostrarEgreso, setMostrarEgreso] = useState(false);
  const [ofertaPreseleccionada, setOfertaPreseleccionada] = useState<string | undefined>();

  const cargar = useCallback(async () => {
    const [o, r, h, p, a, e, rent, act] = await Promise.all([
      api.listarOfertas(),
      api.resumenIngresos(),
      api.resumenHoy(),
      api.ventasPorOferta(),
      api.adelantosPendientes(),
      api.egresosPorCategoria(),
      api.rentabilidadPorLinea(),
      api.actividadReciente(12),
    ]);
    setOfertas(o);
    setResumen(r);
    setHoy(h);
    setProgreso(p);
    setAdelantos(a);
    setEgrCats(e);
    setRentabilidad(rent);
    setActividad(act);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const onSaved = () => { setMostrarVenta(false); setMostrarEgreso(false); cargar(); };

  if (cargando) return <p className="text-sm text-neutral-600">Cargando...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-heading font-semibold text-neutral-900 mb-1">Motor de Ingresos</h1>

      {/* ═══ F2: HOY + F3: Resumen mensual ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`bg-neutral-50 border rounded-xl p-4 ${hoy?.cumplida ? "border-success-500/30" : "border-primary-500/30"}`}>
          <p className="text-xs text-neutral-600 mb-1">HOY — {hoy?.fecha}</p>
          <p className="text-2xl font-mono font-semibold text-neutral-900">{fmt(hoy?.facturado ?? 0)}</p>
          <div className="mt-2 bg-neutral-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${hoy?.cumplida ? "bg-success-500" : "bg-primary-500"}`}
              style={{ width: `${Math.min(hoy?.pct ?? 0, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-600 mt-1">
            {fmtPct(hoy?.pct ?? 0)} de {fmt(hoy?.metaDiaria ?? 10000)}
          </p>
        </div>

        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-600 mb-1">Meta del mes</p>
          <p className="text-2xl font-mono font-semibold text-neutral-900">{fmt(resumen?.metaMensual ?? 0)}</p>
        </div>

        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-600 mb-1">Facturado</p>
          <p className="text-2xl font-mono font-semibold text-success-600">{fmt(resumen?.facturado ?? 0)}</p>
          <p className="text-[11px] text-success-600 mt-1">{fmtPct(resumen?.pctMeta ?? 0)} de la meta</p>
        </div>

        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-600 mb-1">Ganancia neta</p>
          <p className={`text-2xl font-mono font-semibold ${(resumen?.gananciaNeta ?? 0) >= 0 ? "text-success-600" : "text-danger-600"}`}>
            {fmt(resumen?.gananciaNeta ?? 0)}
          </p>
          <p className="text-[11px] text-neutral-600 mt-1">Margen: {fmtPct(resumen?.margen ?? 0)}</p>
        </div>
      </div>

      {/* ═══ F4: Grid de tarjetas por oferta ═══ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-900">Líneas de negocio</h2>
          <div className="flex gap-2">
            <button onClick={() => { setOfertaPreseleccionada(undefined); setMostrarVenta(true); }} className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600">+ Venta</button>
            <button onClick={() => setMostrarEgreso(true)} className="px-3 py-1.5 text-xs font-medium bg-danger-500 text-white rounded-lg hover:bg-danger-600">+ Egreso</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {progreso.map((p) => (
            <div key={p.ofertaId} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{p.nombre}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${CATEGORIA_COLOR[p.categoria]}20`, color: CATEGORIA_COLOR[p.categoria] }}>
                    {p.categoria}
                  </span>
                </div>
                <button
                  onClick={() => { setOfertaPreseleccionada(p.ofertaId); setMostrarVenta(true); }}
                  className="w-7 h-7 rounded-lg bg-primary-500/15 text-primary-600 hover:bg-primary-500/30 flex items-center justify-center text-lg font-bold shrink-0"
                  title="Registrar venta"
                >+</button>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-lg font-mono font-semibold text-neutral-900">{fmt(p.actual)}</span>
                <span className="text-xs text-neutral-600">/ {fmt(p.target)}</span>
              </div>
              <div className="bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(p.pct, 100)}%`, background: CATEGORIA_COLOR[p.categoria] }}
                />
              </div>
              <p className="text-[11px] text-neutral-600 mt-1 text-right">{fmtPct(p.pct)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ F5: Gráfico de barras Meta vs Real ═══ */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Meta vs Real</h2>
        <div className="space-y-2">
          {progreso.map((p) => {
            const maxVal = Math.max(p.target, p.actual, 1);
            return (
              <div key={p.ofertaId} className="flex items-center gap-3">
                <span className="text-xs text-neutral-600 w-32 shrink-0 truncate">{p.nombre}</span>
                <div className="flex-1 flex items-center gap-0.5 h-5">
                  <div className="h-full rounded-sm bg-neutral-100" style={{ width: `${(p.target / maxVal) * 100}%`, minWidth: p.target > 0 ? "2px" : "0" }} title={`Meta: ${fmt(p.target)}`} />
                  <div className="h-3 rounded-sm" style={{ width: `${(p.actual / maxVal) * 100}%`, minWidth: p.actual > 0 ? "2px" : "0", background: CATEGORIA_COLOR[p.categoria], marginLeft: "-100%", marginTop: "4px" }} title={`Real: ${fmt(p.actual)}`} />
                </div>
                <span className="text-[10px] font-mono text-neutral-600 w-10 text-right">{fmtPct(p.pct)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-neutral-600">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-neutral-100" /> Meta</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-primary-500" /> Real</span>
        </div>
      </div>

      {/* ═══ F6: Anticipos pendientes ═══ */}
      {adelantos.length > 0 && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Anticipos pendientes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-600 border-b border-neutral-200">
                  <th className="text-left py-2 font-medium">Oferta</th>
                  <th className="text-right py-2 font-medium">Recibido</th>
                  <th className="text-right py-2 font-medium">Total deal</th>
                  <th className="text-right py-2 font-medium">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {adelantos.map((a) => (
                  <tr key={a.id} className="border-b border-neutral-200">
                    <td className="py-2 text-neutral-800">{a.ofertaNombre}</td>
                    <td className="py-2 text-right font-mono text-neutral-600">{fmt(a.monto)}</td>
                    <td className="py-2 text-right font-mono text-neutral-600">{fmt(a.totalDeal)}</td>
                    <td className="py-2 text-right font-mono text-warning-600">{fmt(a.saldoPendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ F7: Actividad reciente ═══ */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Actividad reciente</h2>
        {actividad.length === 0 ? (
          <p className="text-xs text-neutral-600">Sin actividad este mes.</p>
        ) : (
          <div className="space-y-1">
            {actividad.filter(a => a.tipo === "ingreso").slice(0, 12).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-neutral-200 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-500 shrink-0" />
                  <span className="text-neutral-800 truncate">{a.ofertaNombre}</span>
                  {a.nota && <span className="text-neutral-600 truncate hidden sm:inline">— {a.nota}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-success-600">{fmt(a.monto)}</span>
                  <span className="text-neutral-600">{a.fecha}</span>
                  <button
                    onClick={async () => { if (confirm("¿Eliminar esta venta?")) { await api.eliminarVenta(a.id); cargar(); } }}
                    className="text-danger-600 hover:text-danger-600 text-[10px]"
                  >Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ F8: Resumen de egresos ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-600 mb-1">Egresos del mes</p>
          <p className="text-xl font-mono font-semibold text-danger-600">{fmt(resumen?.gastos ?? 0)}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-600 mb-1">Ganancia neta</p>
          <p className={`text-xl font-mono font-semibold ${(resumen?.gananciaNeta ?? 0) >= 0 ? "text-success-600" : "text-danger-600"}`}>
            {fmt(resumen?.gananciaNeta ?? 0)}
          </p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 col-span-2">
          <p className="text-xs text-neutral-600 mb-1">Margen</p>
          <div className="bg-neutral-100 rounded-full h-3 overflow-hidden mt-1">
            <div className="h-full rounded-full bg-success-500 transition-all" style={{ width: `${Math.max(0, Math.min(resumen?.margen ?? 0, 100))}%` }} />
          </div>
          <p className="text-[11px] text-neutral-600 mt-1">{fmtPct(resumen?.margen ?? 0)}</p>
        </div>
      </div>

      {/* ═══ F9: Egresos por categoría ═══ */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Egresos por categoría</h2>
        {egrCats.length === 0 ? (
          <p className="text-xs text-neutral-600">Sin egresos este mes.</p>
        ) : (
          <div className="space-y-2">
            {egrCats.map((ec) => (
              <div key={ec.categoria}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-neutral-800">{ec.categoria}</span>
                  <span className="font-mono text-neutral-600">{fmt(ec.monto)} ({fmtPct(ec.pct)})</span>
                </div>
                <div className="bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-danger-500" style={{ width: `${ec.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ F10: Rentabilidad por línea ═══ */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Rentabilidad por línea</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-600 border-b border-neutral-200">
                <th className="text-left py-2 font-medium">Línea</th>
                <th className="text-right py-2 font-medium">Ingresos</th>
                <th className="text-right py-2 font-medium">Egresos</th>
                <th className="text-right py-2 font-medium">Neto</th>
              </tr>
            </thead>
            <tbody>
              {rentabilidad.map((r) => (
                <tr key={r.ofertaNombre} className="border-b border-neutral-200">
                  <td className="py-2 text-neutral-800">{r.ofertaNombre}</td>
                  <td className="py-2 text-right font-mono text-success-600">{fmt(r.ingresos)}</td>
                  <td className="py-2 text-right font-mono text-danger-600">{fmt(r.egresos)}</td>
                  <td className={`py-2 text-right font-mono font-semibold ${r.neto >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {fmt(r.neto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ F11: Log de egresos recientes ═══ */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Egresos recientes</h2>
        {actividad.filter(a => a.tipo === "egreso").length === 0 ? (
          <p className="text-xs text-neutral-600">Sin egresos este mes.</p>
        ) : (
          <div className="space-y-1">
            {actividad.filter(a => a.tipo === "egreso").slice(0, 12).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-neutral-200 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger-500 shrink-0" />
                  <span className="text-neutral-800">{a.categoria}</span>
                  {a.ofertaNombre && <span className="text-neutral-600 truncate hidden sm:inline">— {a.ofertaNombre}</span>}
                  {a.nota && <span className="text-neutral-600 truncate hidden sm:inline">— {a.nota}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-danger-600">{fmt(a.monto)}</span>
                  <span className="text-neutral-600">{a.fecha}</span>
                  <button
                    onClick={async () => { if (confirm("¿Eliminar este egreso?")) { await api.eliminarEgreso(a.id); cargar(); } }}
                    className="text-danger-600 hover:text-danger-600 text-[10px]"
                  >Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ F12: Modales ═══ */}
      {mostrarVenta && (
        <VentaModal
          onClose={() => setMostrarVenta(false)}
          onSaved={onSaved}
          ofertas={ofertas}
          ofertaId={ofertaPreseleccionada}
        />
      )}
      {mostrarEgreso && (
        <EgresoModal
          onClose={() => setMostrarEgreso(false)}
          onSaved={onSaved}
          ofertas={ofertas}
        />
      )}
    </div>
  );
}
