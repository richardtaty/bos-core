import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { ActividadTimeline } from "../components/ActividadTimeline";
import { KpiCard } from "../components/KpiCard";
import type { Persona, Pipeline, EventoActividad, ResumenEjecutivo } from "../types";

interface MetricaPipeline {
  nombre: string;
  total: number;
  ganados: number;
  perdidos: number;
  abiertos: number;
  valorAbierto: number;
  tasaConversion: number;
}

interface ActividadHoy {
  ingresosTotalHoy: number;
  ingresosTotalMes: number;
  contactosNuevosHoy: number;
  interaccionesHoy: number;
  dealsGanadosHoy: number;
  porUsuario: { usuarioId: string; nombre: string; ingresos: number; contactosNuevos: number; interacciones: number; dealsGanados: number }[];
}

export function DashboardPage() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [metricas, setMetricas] = useState<MetricaPipeline[]>([]);
  const [actividadHoy, setActividadHoy] = useState<ActividadHoy | null>(null);
  const [miFacturacion, setMiFacturacion] = useState<{ hoy: number; mes: number } | null>(null);
  const [ultimosDias, setUltimosDias] = useState<{ fecha: string; total: number; porUsuario: { nombre: string; total: number }[] }[]>([]);
  const [eventos, setEventos] = useState<EventoActividad[]>([]);
  const [resumen, setResumen] = useState<ResumenEjecutivo | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      const [personasRes, pipelines] = await Promise.all([api.listarPersonas({ limite: 100 }), api.listarPipelines()]);
      setPersonas(personasRes.items);

      // Datos ejecutivos en paralelo
      const promesas: Promise<any>[] = [
        api.timelineGlobal(15),
        api.resumenEjecutivo(),
      ];

      if (esSuperAdmin) {
        promesas.push(api.actividadDelDia());
        const hoy = new Date();
        const hace7 = new Date(hoy.getTime() - 6 * 86400000);
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        promesas.push(api.ventasPorDia({ desde: fmt(hace7), hasta: fmt(hoy) }));
      } else {
        promesas.push(api.miFacturacion());
      }

      const [eventosActividad, resumenEj, ...resto] = await Promise.all(promesas);
      setEventos(eventosActividad);
      setResumen(resumenEj);

      if (esSuperAdmin) {
        setActividadHoy(resto[0]);
        setUltimosDias(resto[1]?.dias ?? []);
      } else {
        setMiFacturacion(resto[0]);
      }

      const resultados: MetricaPipeline[] = await Promise.all(
        pipelines.map(async (p: Pipeline) => {
          const m = await api.metricasPipeline(p.id);
          return { nombre: p.nombre, ...m };
        })
      );
      setMetricas(resultados);
      setCargando(false);
    };
    void cargar();
  }, [esSuperAdmin]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const totalContactos = personas.length;
  const totalRegistros = metricas.reduce((s, m) => s + m.total, 0);
  const totalGanados = metricas.reduce((s, m) => s + m.ganados, 0);
  const tasaConversionGlobal = totalRegistros ? Math.round((totalGanados / totalRegistros) * 100) : 0;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">Dashboard Ejecutivo</h1>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">Centro de Control — toda la empresa en una sola pantalla</p>

      {/* ─── Fila 1: KPIs principales ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {esSuperAdmin && actividadHoy && (
          <>
            <KpiCard titulo="Ingresos hoy" valor={`$${Math.round(actividadHoy.ingresosTotalHoy).toLocaleString()}`} color="success" icono="💰" />
            <KpiCard titulo="Ingresos mes" valor={`$${Math.round(actividadHoy.ingresosTotalMes).toLocaleString()}`} color="success" icono="📊" />
            <KpiCard titulo="Contactos hoy" valor={actividadHoy.contactosNuevosHoy} color="primary" icono="👤" />
            <KpiCard titulo="Deals hoy" valor={actividadHoy.dealsGanadosHoy} color="primary" icono="🎯" />
          </>
        )}
        {!esSuperAdmin && miFacturacion && (
          <>
            <KpiCard titulo="Mi facturación hoy" valor={`$${miFacturacion.hoy.toLocaleString()}`} color="success" icono="💰" />
            <KpiCard titulo="Mi facturación mes" valor={`$${miFacturacion.mes.toLocaleString()}`} color="success" icono="📊" />
          </>
        )}
        <KpiCard titulo="Total contactos" valor={totalContactos} color="neutral" icono="👥" />
        <KpiCard titulo="Tasa conversión" valor={`${tasaConversionGlobal}%`} color="neutral" icono="📈" />
        {resumen && (
          <>
            <KpiCard titulo="Tareas pendientes" valor={resumen.tareasPendientes} color="warning" icono="📋" />
            <KpiCard titulo="Tareas vencidas" valor={resumen.tareasVencidas} color={resumen.tareasVencidas > 0 ? "danger" : "neutral"} icono="⚠️" />
          </>
        )}
      </div>

      {/* ─── Fila 2: Facturación (Super Admin) y Actividad ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {esSuperAdmin && actividadHoy && actividadHoy.porUsuario.length > 0 && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">Desglose por agente (hoy)</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500 text-neutral-400 uppercase">
                <tr>
                  <th className="text-left py-1.5">Usuario</th>
                  <th className="text-left py-1.5">Ingresos</th>
                  <th className="text-left py-1.5">Contactos</th>
                  <th className="text-left py-1.5">Deals</th>
                </tr>
              </thead>
              <tbody>
                {actividadHoy.porUsuario.map((u) => (
                  <tr key={u.usuarioId} className="border-t border-neutral-100 border-neutral-200">
                    <td className="py-1.5 font-medium text-neutral-900 text-neutral-800">
                      <Link to={`/equipo/${u.usuarioId}`} className="hover:text-primary-600 hover:text-primary-600 hover:underline">
                        {u.nombre}
                      </Link>
                    </td>
                    <td className="py-1.5 text-success-700 text-success-600">${u.ingresos.toLocaleString()}</td>
                    <td className="py-1.5 text-neutral-600 text-neutral-400">{u.contactosNuevos}</td>
                    <td className="py-1.5 text-neutral-600 text-neutral-400">{u.dealsGanados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Actividad reciente */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-700 text-neutral-300">Actividad reciente</h3>
            <Link to="/centro-actividad" className="text-xs text-primary-600 text-primary-600 hover:underline">Ver todo →</Link>
          </div>
          <ActividadTimeline eventos={eventos} />
        </div>
      </div>

      {/* ─── Fila 3: Últimos 7 días + Pipelines ─── */}
      {esSuperAdmin && ultimosDias.length > 0 && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-700 text-neutral-300">Últimos 7 días</h3>
            <Link to="/reporte-ventas" className="text-xs text-primary-600 text-primary-600 hover:underline">Ver reporte completo →</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 text-neutral-400 uppercase">
              <tr>
                <th className="text-left py-1.5">Día</th>
                <th className="text-left py-1.5">Total</th>
                <th className="text-left py-1.5">Quién vendió</th>
              </tr>
            </thead>
            <tbody>
              {ultimosDias.map((d) => (
                <tr key={d.fecha} className="border-t border-neutral-100 border-neutral-200">
                  <td className="py-1.5 font-medium text-neutral-900 text-neutral-800 capitalize">
                    {new Date(d.fecha + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" })}
                  </td>
                  <td className="py-1.5 text-success-700 text-success-600 font-medium">${d.total.toLocaleString()}</td>
                  <td className="py-1.5 text-neutral-500 text-neutral-400 text-xs">
                    {d.porUsuario.map((u) => `${u.nombre} $${u.total.toLocaleString()}`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Fila 4: Pipelines ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">Valor abierto por pipeline</h3>
          {metricas.every((m) => m.valorAbierto === 0) ? (
            <p className="text-xs text-neutral-400 text-neutral-500">Sin valor abierto todavía.</p>
          ) : (
            metricas
              .filter((m) => m.valorAbierto > 0)
              .sort((a, b) => b.valorAbierto - a.valorAbierto)
              .map((m) => {
                const maxValor = Math.max(1, ...metricas.map((x) => x.valorAbierto));
                return (
                  <div key={m.nombre} className="flex items-center gap-2 mb-2 text-xs">
                    <span className="w-28 truncate text-neutral-600 text-neutral-400">{m.nombre}</span>
                    <div className="flex-1 h-2 bg-neutral-100 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-success-500 rounded-full" style={{ width: `${(m.valorAbierto / maxValor) * 100}%` }} />
                    </div>
                    <span className="w-16 text-right text-neutral-700 text-neutral-300">${Math.round(m.valorAbierto).toLocaleString()}</span>
                  </div>
                );
              })
          )}
        </div>

        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">Pipeline</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 text-neutral-400 uppercase">
              <tr>
                <th className="text-left py-1.5">Nombre</th>
                <th className="text-left py-1.5">Total</th>
                <th className="text-left py-1.5">Ganados</th>
                <th className="text-left py-1.5">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {[...metricas].sort((a, b) => b.total - a.total).map((m) => (
                <tr key={m.nombre} className="border-t border-neutral-100 border-neutral-200">
                  <td className="py-1.5 font-medium text-neutral-900 text-neutral-800 text-xs">{m.nombre}</td>
                  <td className="py-1.5 text-neutral-600 text-neutral-400 text-xs">{m.total}</td>
                  <td className="py-1.5 text-success-600 text-success-600 text-xs">{m.ganados}</td>
                  <td className="py-1.5 text-neutral-600 text-neutral-400 text-xs">{m.tasaConversion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
