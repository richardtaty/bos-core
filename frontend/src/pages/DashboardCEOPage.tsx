import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ActividadTimeline } from "../components/ActividadTimeline";
import { KpiCard } from "../components/KpiCard";
import type { DashboardCEO, DepartamentoCEO, TareaDetalleDashboard } from "../types";

function EstadoBadge({ estado }: { estado: string }) {
  const c: Record<string, string> = {
    saludable: "bg-success-100 text-success-700",
    advertencia: "bg-warning-100 text-warning-700",
    critico: "bg-danger-100 text-danger-700",
  };
  return <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${c[estado] ?? ""}`}>{estado}</span>;
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", timeZone: "America/New_York" });
}

function estadoHumano(estado: string): string {
  const m: Record<string, string> = {
    solicitud: "Solicitud", backlog: "Backlog", pendiente: "Pendiente", por_hacer: "Por hacer",
    en_proceso: "En proceso", bloqueada: "Bloqueada", en_revision: "En revisión",
    requiere_ajustes: "Requiere ajustes", completada: "Completada", cancelado: "Cancelado",
  };
  return m[estado] ?? estado;
}

/** Cifra del tablero que abre el detalle: contador y lista salen de la MISMA respuesta. */
function Cifra({ label, valor, color, alAbrir }: { label: string; valor: number; color: string; alAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={alAbrir}
      disabled={valor === 0}
      className={`group rounded-lg px-1 py-1.5 transition-colors text-center ${
        valor > 0 ? "hover:bg-black/5 cursor-pointer" : "cursor-default"
      }`}
      title={valor > 0 ? `Ver las ${valor} tareas` : "Sin tareas en esta vista"}
    >
      <p className="text-neutral-500">{label}</p>
      <p className={`font-semibold ${color}`}>
        {valor}
        {valor > 0 && <span className="text-[9px] align-top text-neutral-400 group-hover:text-primary-500 ml-0.5"> ▸</span>}
      </p>
    </button>
  );
}

type DetalleVista = { tipo: "Completadas" | "Atrasadas" | "Prod. hoy"; depto: DepartamentoCEO };

export function DashboardCEOPage() {
  const [data, setData] = useState<DashboardCEO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState<DetalleVista | null>(null);

  useEffect(() => {
    api.dashboardCEO().then((d) => {
      setData(d);
      setCargando(false);
    });
  }, []);

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const itemsDe = (v: DetalleVista): TareaDetalleDashboard[] =>
    v.tipo === "Completadas" ? v.depto.completadasDetalle
      : v.tipo === "Atrasadas" ? v.depto.atrasadasDetalle
        : v.depto.produccionHoyDetalle;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Dashboard CEO</h1>
      <p className="text-sm text-neutral-500 mb-6">Visión global de todos los departamentos — toca una cifra para ver las tareas</p>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard titulo="Tareas activas" valor={data.totalTareasActivas} icono="📋" color="neutral" />
        <KpiCard titulo="Producción hoy" valor={data.produccionTotalHoy} icono="📦" color="success" />
        <KpiCard titulo="Usuarios activos" valor={data.usuariosActivos.length} icono="🟢" color="primary" />
        <KpiCard titulo="Sin actividad 7d" valor={data.usuariosSinActividad.length} icono="🔴" color={data.usuariosSinActividad.length > 0 ? "danger" : "neutral"} />
      </div>

      {/* Alertas y Riesgos */}
      {(data.alertas.length > 0 || data.riesgos.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {data.alertas.length > 0 && (
            <div className="bg-danger-50 bg-danger-500/10 border border-danger-200 border-danger-500/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-danger-700 mb-2">🚨 Alertas</h3>
              {data.alertas.map((a, i) => <p key={i} className="text-xs text-danger-700 py-0.5">{a}</p>)}
            </div>
          )}
          {data.riesgos.length > 0 && (
            <div className="bg-warning-50 bg-warning-500/10 border border-warning-200 border-warning-500/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-warning-700 mb-2">⚠ Riesgos</h3>
              {data.riesgos.map((r, i) => <p key={i} className="text-xs text-warning-700 py-0.5">{r}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Departamentos */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-neutral-700 mb-3">Departamentos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.departamentos.map((d) => (
            <div key={d.id} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-neutral-900">{d.nombre}</h4>
                <EstadoBadge estado={d.estado} />
              </div>
              <div className="grid grid-cols-4 gap-1 text-center text-xs">
                <div>
                  <p className="text-neutral-500">Total</p>
                  <p className="font-semibold text-neutral-700">{d.total}</p>
                </div>
                <Cifra
                  label="Completadas"
                  valor={d.completadas}
                  color="text-success-600"
                  alAbrir={() => setDetalle({ tipo: "Completadas", depto: d })}
                />
                <Cifra
                  label="Atrasadas"
                  valor={d.atrasadas}
                  color={d.atrasadas > 0 ? "text-danger-600" : "text-neutral-600"}
                  alAbrir={() => setDetalle({ tipo: "Atrasadas", depto: d })}
                />
                <Cifra
                  label="Prod. hoy"
                  valor={d.produccionHoy}
                  color="text-primary-600"
                  alAbrir={() => setDetalle({ tipo: "Prod. hoy", depto: d })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actividad + Usuarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-neutral-700 mb-3">Actividad reciente</h3>
          <ActividadTimeline eventos={data.actividad.slice(0, 10)} />
        </div>
        <div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-medium text-neutral-700 mb-2">Usuarios activos hoy</h3>
            <div className="flex flex-wrap gap-2">
              {data.usuariosActivos.map((u) => (
                <span key={u} className="text-xs bg-success-50 bg-success-500/10 text-success-700 px-2 py-1 rounded-full">{u}</span>
              ))}
            </div>
          </div>
          {data.usuariosSinActividad.length > 0 && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-2 text-neutral-500">Sin actividad 7+ días</h3>
              <div className="flex flex-wrap gap-2">
                {data.usuariosSinActividad.map((u) => (
                  <span key={u} className="text-xs bg-neutral-100 text-neutral-500 px-2 py-1 rounded-full">{u}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle — lista EXACTAMENTE las tareas que forman la cifra tocada */}
      {detalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="bg-neutral-50 rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto border border-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-neutral-900">
                {detalle.depto.nombre} · {detalle.tipo}
              </h2>
              <button
                onClick={() => setDetalle(null)}
                className="text-neutral-400 hover:text-neutral-600 text-xl leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-neutral-500 mb-4">
              {itemsDe(detalle).length} {detalle.tipo === "Completadas" ? "tareas completadas" : detalle.tipo === "Atrasadas" ? "tareas atrasadas" : "tareas producidas hoy"}
            </p>

            {itemsDe(detalle).length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-6">Sin tareas en esta vista.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {itemsDe(detalle).map((t) => (
                  <div key={t.id} className="bg-white border border-neutral-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-neutral-900">{t.titulo}</p>
                      <span className="text-[10px] shrink-0 bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                        {estadoHumano(t.estado)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-neutral-500">
                      <span>👤 {t.responsableNombre}</span>
                      <span>Límite: {fechaCorta(t.fechaLimite)}</span>
                      {t.completadaEn && <span>Completada: {fechaCorta(t.completadaEn)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
