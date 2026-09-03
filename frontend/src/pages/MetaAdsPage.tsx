import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { usePermisos } from "../hooks/usePermisos";
import { KpiCard } from "../components/KpiCard";
import { MetaAdsForm } from "../components/MetaAdsForm";
import type { MetaAdsReporte, MetaAdsReporteResumen } from "../types";

const SECCIONES = ["Campañas RT", "Métricas de mentoría"];

const ESTADO_BADGE: Record<string, string> = {
  Activa: "bg-success-100 text-success-700",
  Inactiva: "bg-danger-100 text-danger-700",
};

function fmtYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDinero(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "$" + n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFechaActualizacion(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function MetaAdsPage() {
  const { usuario } = useAuth();
  const permisos = usePermisos();
  const esAdmin = usuario?.rol === "SUPER_ADMIN" || usuario?.rol === "ADMIN";
  const enMarketing = permisos.menuSecciones.includes("moc");
  const puedeGestionar = esAdmin || enMarketing;

  const [reportes, setReportes] = useState<MetaAdsReporteResumen[]>([]);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<MetaAdsReporte | null>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [modoForma, setModoForma] = useState<"crear" | "editar" | null>(null);
  const [reporteEdicion, setReporteEdicion] = useState<MetaAdsReporte | null>(null);
  const [aviso, setAviso] = useState<string | undefined>(undefined);

  const cargarLista = useCallback(async (): Promise<MetaAdsReporteResumen[]> => {
    const lista = await api.listarMetaAds();
    setReportes(lista);
    setCargandoLista(false);
    return lista;
  }, []);

  const cargarDetalle = useCallback(async (id: string) => {
    setCargandoDetalle(true);
    try {
      setDetalle(await api.obtenerMetaAds(id));
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const lista = await cargarLista();
      if (lista.length > 0) {
        setSeleccionadoId(lista[0].id);
        await cargarDetalle(lista[0].id);
      }
    })();
  }, [cargarLista, cargarDetalle]);

  function seleccionar(id: string) {
    setSeleccionadoId(id);
    void cargarDetalle(id);
  }

  async function recargar() {
    setModoForma(null);
    setReporteEdicion(null);
    setAviso(undefined);
    const lista = await cargarLista();
    if (lista.length > 0) {
      const id = seleccionadoId && lista.some((r) => r.id === seleccionadoId) ? seleccionadoId : lista[0].id;
      setSeleccionadoId(id);
      await cargarDetalle(id);
    } else {
      setSeleccionadoId(null);
      setDetalle(null);
    }
  }

  async function eliminar() {
    if (!detalle) return;
    if (!confirm("¿Eliminar este reporte de Meta Ads? Se borrarán todos sus grupos y campañas.")) return;
    await api.eliminarMetaAds(detalle.id);
    await recargar();
  }

  async function abrirDuplicado(id: string) {
    const r = await api.obtenerMetaAds(id);
    setAviso("Ya existe un reporte para ese período. Lo abrimos para que lo edites.");
    setReporteEdicion(r);
    setModoForma("editar");
  }

  if (cargandoLista) return <p className="text-sm text-neutral-500">Cargando...</p>;

  // ─── Estado vacío: sin reportes ──────────────────────────────
  if (reportes.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <p className="text-3xl mb-3">📊</p>
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">Métricas Meta Ads</h1>
        <p className="text-sm text-neutral-500 mb-2">No hay métricas de Meta Ads registradas.</p>
        <p className="text-sm text-neutral-400 mb-6">Registra el primer reporte semanal para comenzar.</p>
        {puedeGestionar && (
          <button
            onClick={() => { setReporteEdicion(null); setAviso(undefined); setModoForma("crear"); }}
            className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600"
          >
            + Registrar métricas
          </button>
        )}
        {modoForma && (
          <MetaAdsForm
            reporte={modoForma === "editar" ? reporteEdicion : null}
            aviso={aviso}
            onDuplicado={abrirDuplicado}
            onGuardado={recargar}
            onCancel={() => setModoForma(null)}
          />
        )}
      </div>
    );
  }

  const resumen = detalle?.resumen ?? seleccionadoId ? reportes.find((r) => r.id === seleccionadoId)?.resumen : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Métricas Meta Ads</h1>
          <p className="text-sm text-neutral-500">
            {detalle
              ? `Período: ${fmtYMD(detalle.fechaInicio)} – ${fmtYMD(detalle.fechaFin)}`
              : "Selecciona un período"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {puedeGestionar && (
            <>
              <button
                onClick={() => { setReporteEdicion(null); setAviso(undefined); setModoForma("crear"); }}
                className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600"
              >
                + Registrar métricas
              </button>
              {detalle && (
                <>
                  <button
                    onClick={() => { setReporteEdicion(detalle); setAviso(undefined); setModoForma("editar"); }}
                    className="text-sm border border-neutral-200 text-neutral-700 px-4 py-2 rounded-lg hover:bg-neutral-100"
                  >
                    ✏ Editar reporte
                  </button>
                  <button
                    onClick={eliminar}
                    className="text-sm border border-danger-200 text-danger-600 px-3 py-2 rounded-lg hover:bg-danger-50"
                  >
                    ✕
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Selector de período */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs text-neutral-500">Período:</span>
        <select
          value={seleccionadoId ?? ""}
          onChange={(e) => seleccionar(e.target.value)}
          className="text-sm border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 max-w-full"
        >
          {reportes.map((r) => (
            <option key={r.id} value={r.id}>
              {fmtYMD(r.fechaInicio)} – {fmtYMD(r.fechaFin)}{r.titulo ? ` · ${r.titulo}` : ""}
            </option>
          ))}
        </select>
        {detalle && (
          <p className="text-xs text-neutral-400">
            Actualizado {fmtFechaActualizacion(detalle.updatedAt)}{detalle.actualizadoPorNombre ? ` por ${detalle.actualizadoPorNombre}` : ""}
          </p>
        )}
      </div>

      {cargandoDetalle ? (
        <p className="text-sm text-neutral-500">Cargando reporte...</p>
      ) : detalle ? (
        <>
          {/* KPIs del período */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard titulo="Campañas" valor={resumen?.totalCampanas ?? 0} icono="🎯" color="neutral" />
            <KpiCard titulo="Activas" valor={resumen?.activas ?? 0} icono="🟢" color="success" />
            <KpiCard titulo="Inactivas" valor={resumen?.inactivas ?? 0} icono="🔴" color="danger" />
            <KpiCard titulo="Leads" valor={resumen?.totalLeads ?? 0} icono="👥" color="primary" />
          </div>

          {/* Cabecera del reporte */}
          {(detalle.titulo || detalle.observacionGeneral || detalle.presupuestoTotalActual != null) && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 mb-6">
              {detalle.titulo && <h2 className="font-semibold text-neutral-900 mb-1">{detalle.titulo}</h2>}
              {detalle.presupuestoTotalActual != null && (
                <p className="text-sm text-neutral-700 mb-1">Presupuesto total: <span className="font-semibold">{fmtDinero(detalle.presupuestoTotalActual)}</span></p>
              )}
              {detalle.observacionGeneral && <p className="text-sm text-neutral-500">{detalle.observacionGeneral}</p>}
            </div>
          )}

          {/* Secciones y grupos */}
          {SECCIONES.map((seccion) => {
            const grupos = detalle.grupos.filter((g) => g.seccionPrincipal === seccion);
            if (grupos.length === 0) return null;
            return (
              <div key={seccion} className="mb-8">
                <h2 className="text-base font-semibold text-neutral-900 mb-3">{seccion}</h2>
                <div className="flex flex-col gap-5">
                  {grupos.map((g) => <GrupoCard key={g.id} grupo={g} />)}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <p className="text-sm text-neutral-400 text-center py-10">Selecciona un período para ver sus métricas.</p>
      )}

      {modoForma && (
        <MetaAdsForm
          reporte={modoForma === "editar" ? reporteEdicion : null}
          aviso={aviso}
          onDuplicado={abrirDuplicado}
          onGuardado={recargar}
          onCancel={() => setModoForma(null)}
        />
      )}
    </div>
  );
}

// ─── Tarjeta de un grupo ──────────────────────────────────────────

function GrupoCard({ grupo }: { grupo: MetaAdsReporte["grupos"][number] }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      <div className="mb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-semibold text-neutral-900">{grupo.nombre}</h3>
            {grupo.subtitulo && <p className="text-xs text-neutral-500">{grupo.subtitulo}</p>}
          </div>
          {grupo.presupuestoTotalActual != null && (
            <span className="text-xs font-medium text-neutral-700">Presupuesto: {fmtDinero(grupo.presupuestoTotalActual)}</span>
          )}
        </div>
        {grupo.observacion && <p className="text-xs text-neutral-500 mt-1">{grupo.observacion}</p>}
        {grupo.sinCampanasActivas && (
          <p className="text-xs text-neutral-500 italic mt-1">Sin campañas activas actualmente</p>
        )}
      </div>

      {grupo.campanas.length === 0 ? (
        !grupo.sinCampanasActivas && <p className="text-xs text-neutral-400 py-3">Sin campañas registradas.</p>
      ) : (
        <>
          {/* Tabla — escritorio */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-400 border-b border-neutral-200">
                  <th className="py-2 pr-3 font-medium">Campaña</th>
                  <th className="py-2 pr-3 font-medium">Público</th>
                  <th className="py-2 pr-3 font-medium">Presupuesto</th>
                  <th className="py-2 pr-3 font-medium">Leads</th>
                  <th className="py-2 pr-3 font-medium">Costo por lead</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {grupo.campanas.map((c) => <CampanaFila key={c.id} c={c} />)}
              </tbody>
            </table>
          </div>

          {/* Tarjetas — móvil */}
          <div className="md:hidden flex flex-col gap-3">
            {grupo.campanas.map((c) => <CampanaCard key={c.id} c={c} />)}
          </div>
        </>
      )}
    </div>
  );
}

function CampanaFila({ c }: { c: MetaAdsReporte["grupos"][number]["campanas"][number] }) {
  return (
    <>
      <tr className="border-b border-neutral-100 align-top">
        <td className="py-2.5 pr-3 font-medium text-neutral-900">{c.nombre}</td>
        <td className="py-2.5 pr-3 text-neutral-600">{c.ubicacionPublico ?? "—"}</td>
        <td className="py-2.5 pr-3 text-neutral-700">
          {fmtDinero(c.presupuesto)}
          {c.detallePresupuesto && <span className="block text-[10px] text-neutral-400">{c.detallePresupuesto}</span>}
        </td>
        <td className="py-2.5 pr-3 text-neutral-700">{c.leads ?? "—"}</td>
        <td className="py-2.5 pr-3 text-neutral-700">{fmtDinero(c.costoPorLead)}</td>
        <td className="py-2.5 pr-3">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${ESTADO_BADGE[c.estado] ?? "bg-neutral-100 text-neutral-700"}`}>
            {c.estado}
          </span>
        </td>
        <td className="py-2.5 text-neutral-600">
          {c.observaciones && <p>{c.observaciones}</p>}
          {c.recomendaciones && <p className="text-[11px] text-neutral-400 mt-0.5">💡 {c.recomendaciones}</p>}
        </td>
      </tr>
      {c.segmentaciones.map((s) => (
        <tr key={s.id} className="border-b border-neutral-100 bg-neutral-100/40 align-top">
          <td className="py-2 pl-5 pr-3 text-neutral-600">↳ {s.nombre}</td>
          <td className="py-2 pr-3 text-neutral-500">{s.ubicacionPublico ?? "—"}</td>
          <td className="py-2 pr-3 text-neutral-600">{fmtDinero(s.presupuesto)}</td>
          <td className="py-2 pr-3 text-neutral-600">{s.leads ?? "—"}</td>
          <td className="py-2 pr-3 text-neutral-600">{fmtDinero(s.costoPorLead)}</td>
          <td className="py-2 pr-3 text-neutral-400 text-[11px]">segmentación</td>
          <td className="py-2 text-neutral-500">{s.observacion ?? ""}</td>
        </tr>
      ))}
    </>
  );
}

function CampanaCard({ c }: { c: MetaAdsReporte["grupos"][number]["campanas"][number] }) {
  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-neutral-900">{c.nombre}</p>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded shrink-0 ${ESTADO_BADGE[c.estado] ?? "bg-neutral-100 text-neutral-700"}`}>
          {c.estado}
        </span>
      </div>
      {c.ubicacionPublico && <p className="text-xs text-neutral-500 mt-0.5">📍 {c.ubicacionPublico}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-neutral-600">
        <span>Presupuesto: <b>{fmtDinero(c.presupuesto)}</b>{c.detallePresupuesto ? ` (${c.detallePresupuesto})` : ""}</span>
        <span>Leads: <b>{c.leads ?? "—"}</b></span>
        <span>Costo por lead: <b>{fmtDinero(c.costoPorLead)}</b></span>
      </div>
      {c.observaciones && <p className="text-xs text-neutral-500 mt-1.5">{c.observaciones}</p>}
      {c.recomendaciones && <p className="text-[11px] text-neutral-400 mt-1">💡 {c.recomendaciones}</p>}

      {c.segmentaciones.length > 0 && (
        <div className="mt-2 pl-3 border-l-2 border-neutral-100 flex flex-col gap-1.5">
          {c.segmentaciones.map((s) => (
            <div key={s.id} className="text-xs">
              <p className="text-neutral-700 font-medium">↳ {s.nombre}{s.ubicacionPublico ? ` · ${s.ubicacionPublico}` : ""}</p>
              <p className="text-neutral-500">
                {fmtDinero(s.presupuesto)} · {s.leads ?? 0} leads · CPL {fmtDinero(s.costoPorLead)}
                {s.observacion ? ` · ${s.observacion}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
