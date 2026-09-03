import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { KpiCard } from "../components/KpiCard";
import { ActividadTimeline } from "../components/ActividadTimeline";
import { TareaCard } from "../components/TareaCard";
import type { Usuario, KpiUsuario, TareaOperativa, EventoActividad } from "../types";

export function CentroControlPage() {
  const { id } = useParams<{ id: string }>();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [kpi, setKpi] = useState<KpiUsuario | null>(null);
  const [actividad, setActividad] = useState<EventoActividad[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!id) return;
    const cargar = async () => {
      const [usuarios, tareasUsuario, kpiUsuario, actUsuario] = await Promise.all([
        api.listarUsuarios(),
        api.listarTareas({ responsableId: id }),
        api.kpiUsuario(id),
        api.actividadUsuario(id),
      ]);
      setUsuario(usuarios.find((u: Usuario) => u.id === id) ?? null);
      setUsuarios(usuarios);
      setTareas(tareasUsuario);
      setKpi(kpiUsuario);
      setActividad(actUsuario);
      setCargando(false);
    };
    void cargar();
  }, [id]);

  if (cargando || !usuario || !kpi) return <p className="text-sm text-neutral-500 text-neutral-400">Cargando...</p>;

  const hoy = new Date().toISOString().split("T")[0];
  const tareasHoy = tareas.filter((t) => t.fechaLimite?.startsWith(hoy));
  const tareasAtrasadas = tareas.filter(
    (t) => t.fechaLimite && new Date(t.fechaLimite) < new Date() && !["aprobado", "publicado", "cancelado"].includes(t.estado)
  );
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-secondary-700 flex items-center justify-center text-white text-sm font-bold">
          {usuario.nombre.charAt(0)}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800">{usuario.nombre}</h1>
          <p className="text-sm text-neutral-500 text-neutral-400">{usuario.rol} {usuario.activo === false ? "(Inactivo)" : ""}</p>
        </div>
      </div>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">Centro de Control — rendimiento y actividad</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard titulo="Total tareas" valor={kpi.total} icono="📋" color="neutral" />
        <KpiCard titulo="Completadas" valor={kpi.completadas} icono="✅" color="success" />
        <KpiCard titulo="En progreso" valor={kpi.enProgreso} icono="🔄" color="primary" />
        <KpiCard titulo="En revisión" valor={kpi.enRevision} icono="👁" color="warning" />
        <KpiCard titulo="Atrasadas" valor={kpi.atrasadas} icono="⚠️" color={kpi.atrasadas > 0 ? "danger" : "neutral"} />
        <KpiCard titulo="Tiempo total" valor={`${Math.round(kpi.tiempoTotal / 60)}h`} icono="⏱" color="neutral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hoy */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">Entregas de hoy ({tareasHoy.length})</h3>
          {tareasHoy.length === 0 ? (
            <p className="text-xs text-neutral-400 text-neutral-500">Sin entregas para hoy.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tareasHoy.map((t) => (
                <TareaCard key={t.id} tarea={t} onUpdate={() => {}} usuarios={usuarios} />
              ))}
            </div>
          )}
        </div>

        {/* Atrasadas */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">Atrasadas ({tareasAtrasadas.length})</h3>
          {tareasAtrasadas.length === 0 ? (
            <p className="text-xs text-neutral-400 text-neutral-500">Sin tareas atrasadas. ✅</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tareasAtrasadas.map((t) => (
                <TareaCard key={t.id} tarea={t} onUpdate={() => {}} usuarios={usuarios} />
              ))}
            </div>
          )}
        </div>

        {/* Actividad */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">Actividad reciente</h3>
          <ActividadTimeline eventos={actividad.slice(0, 15)} />
        </div>
      </div>
    </div>
  );
}
