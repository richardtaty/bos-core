import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { TareaCard } from "../components/TareaCard";
import { KpiCard } from "../components/KpiCard";
import type { TareaOperativa, KpiUsuario, EventoActividad, Usuario } from "../types";
import { ActividadTimeline } from "../components/ActividadTimeline";

function diasDiferencia(fechaIso: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaIso);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
}

export function TableroOperativoPage() {
  const { usuario } = useAuth();
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [kpi, setKpi] = useState<KpiUsuario | null>(null);
  const [actividad, setActividad] = useState<EventoActividad[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | "hoy" | "atrasadas" | "prioridad">("todas");

  const cargar = useCallback(async () => {
    const [misTareas, misKpi, miActividad, listaUsuarios] = await Promise.all([
      api.misTareas(),
      api.kpiUsuario(),
      api.miActividad(),
      api.listarUsuarios(),
    ]);
    setTareas(misTareas.sort((a, b) => {
      if (!a.fechaLimite) return 1;
      if (!b.fechaLimite) return -1;
      return new Date(a.fechaLimite).getTime() - new Date(b.fechaLimite).getTime();
    }));
    setKpi(misKpi);
    setActividad(miActividad.slice(0, 20));
    setUsuarios(listaUsuarios);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando || !kpi) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const hoy = new Date().toISOString().split("T")[0];
  const tareasHoy = tareas.filter((t) => t.fechaLimite?.startsWith(hoy));
  const tareasAtrasadas = tareas.filter(
    (t) => t.fechaLimite && diasDiferencia(t.fechaLimite) < 0 && !["aprobado", "publicado", "cancelado"].includes(t.estado)
  );

  let tareasFiltradas = tareas;
  if (filtro === "hoy") tareasFiltradas = tareasHoy;
  else if (filtro === "atrasadas") tareasFiltradas = tareasAtrasadas;
  else if (filtro === "prioridad") tareasFiltradas = tareas.filter((t) => ["urgente", "alta"].includes(t.prioridad));

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Mi Tablero Operativo</h1>
      <p className="text-sm text-neutral-500 mb-6">Hola, {usuario?.nombre.split(" ")[0]} — esto es todo lo que tienes hoy</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard titulo="Mis tareas" valor={kpi.total} icono="📋" color="neutral" />
        <KpiCard titulo="Completadas" valor={kpi.completadas} icono="✅" color="success" />
        <KpiCard titulo="En progreso" valor={kpi.enProgreso} icono="🔄" color="primary" />
        <KpiCard titulo="En revisión" valor={kpi.enRevision} icono="👁" color="warning" />
        <KpiCard titulo="Atrasadas" valor={kpi.atrasadas} icono="⚠️" color={kpi.atrasadas > 0 ? "danger" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal: Mis tareas */}
        <div className="lg:col-span-2">
          {/* Filtros */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium text-neutral-700">Mis tareas</span>
            <div className="flex gap-1 ml-auto">
              {(["todas", "hoy", "atrasadas", "prioridad"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`text-xs px-2.5 py-1 rounded-lg ${
                    filtro === f ? "bg-primary-500 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {f === "todas" ? "Todas" : f === "hoy" ? "Hoy" : f === "atrasadas" ? "Atrasadas" : "Prioridad"}
                </button>
              ))}
            </div>
          </div>

          {tareasFiltradas.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">No tienes tareas en esta vista. ¡Buen trabajo! 🎉</p>
          ) : (
            <div className="flex flex-col gap-3">
              {tareasFiltradas.map((t) => (
                <TareaCard key={t.id} tarea={t} onUpdate={cargar} usuarios={usuarios} />
              ))}
            </div>
          )}
        </div>

        {/* Columna lateral: Mi actividad reciente */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-3">Mi actividad reciente</h3>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <ActividadTimeline eventos={actividad} />
          </div>
        </div>
      </div>
    </div>
  );
}
