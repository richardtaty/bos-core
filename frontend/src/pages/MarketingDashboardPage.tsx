import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { usePermisos } from "../hooks/usePermisos";
import { KpiCard } from "../components/KpiCard";
import type { Proyecto, TareaOperativa } from "../types";

export function MarketingDashboardPage() {
  const { usuario } = useAuth();
  const permisos = usePermisos();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      // El backend fuerza el departamento según el JWT del usuario.
      // Si no es SUPER_ADMIN, ignora el query param y usa el depto del token.
      const deptoFiltro = permisos.esSuperAdmin ? undefined : (permisos.nombreDepto ?? "Marketing");
      const [projs, tareasMkt] = await Promise.all([
        api.listarProyectos({}),
        api.listarTareas(deptoFiltro ? { departamento: deptoFiltro } : {}),
      ]);
      setProyectos(projs.filter((p) => p.estado === "activo"));
      setTareas(tareasMkt);
      setCargando(false);
    };
    void cargar();
  }, [permisos]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const activas = tareas.filter((t) => !["completada", "aprobado", "publicado", "cancelado"].includes(t.estado));
  const bloqueadas = tareas.filter((t) => t.estado === "bloqueada");
  const atrasadas = tareas.filter((t) => t.fechaLimite && new Date(t.fechaLimite) < new Date() && !["completada", "aprobado", "publicado", "cancelado"].includes(t.estado));
  const completadasHoy = tareas.filter((t) => ["completada", "aprobado", "publicado"].includes(t.estado)).length;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">Marketing</h1>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">Hola, {usuario?.nombre.split(" ")[0]} — Centro de Operaciones de Marketing</p>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Link to="/moc/reportes" className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 hover:border-primary-500/30 text-center">
          <p className="text-2xl mb-1">📝</p>
          <p className="text-sm font-medium text-neutral-700 text-neutral-300">Mi reporte diario</p>
        </Link>
        <Link to="/moc/scrum" className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 hover:border-primary-500/30 text-center">
          <p className="text-2xl mb-1">📋</p>
          <p className="text-sm font-medium text-neutral-700 text-neutral-300">Tablero Scrum</p>
        </Link>
        <Link to="/moc/proyectos" className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 hover:border-primary-500/30 text-center">
          <p className="text-2xl mb-1">📁</p>
          <p className="text-sm font-medium text-neutral-700 text-neutral-300">Proyectos</p>
        </Link>
        <Link to="/moc/recursos" className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 hover:border-primary-500/30 text-center">
          <p className="text-2xl mb-1">🔗</p>
          <p className="text-sm font-medium text-neutral-700 text-neutral-300">Recursos</p>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard titulo="Tareas activas" valor={activas.length} icono="📋" color="neutral" />
        <KpiCard titulo="Bloqueadas" valor={bloqueadas.length} icono="🚫" color={bloqueadas.length > 0 ? "danger" : "neutral"} />
        <KpiCard titulo="Atrasadas" valor={atrasadas.length} icono="⚠️" color={atrasadas.length > 0 ? "warning" : "neutral"} />
        <KpiCard titulo="Completadas" valor={completadasHoy} icono="✅" color="success" />
        <KpiCard titulo="Proyectos activos" valor={proyectos.length} icono="📁" color="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tareas bloqueadas */}
        {bloqueadas.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">🚫 Tareas bloqueadas</h3>
            <div className="flex flex-col gap-2">
              {bloqueadas.map((t) => (
                <div key={t.id} className="bg-danger-50 bg-danger-500/10 border border-danger-200 border-danger-500/20 rounded-lg p-3">
                  <p className="text-sm font-medium text-danger-700 text-danger-600">{t.titulo}</p>
                  <p className="text-xs text-danger-600 text-danger-600">{t.responsableNombre}{t.bloqueoMotivo ? ` — ${t.bloqueoMotivo}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Próximos vencimientos */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">⏰ Próximos vencimientos</h3>
          {activas.filter((t) => t.fechaLimite).sort((a, b) => (a.fechaLimite?.localeCompare(b.fechaLimite ?? "") ?? 0)).slice(0, 8).length === 0 ? (
            <p className="text-sm text-neutral-400 text-neutral-500">Sin vencimientos próximos.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {activas.filter((t) => t.fechaLimite).sort((a, b) => (a.fechaLimite?.localeCompare(b.fechaLimite ?? "") ?? 0)).slice(0, 8).map((t) => (
                <div key={t.id} className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 text-neutral-800">{t.titulo}</p>
                    <p className="text-xs text-neutral-500 text-neutral-400">{t.responsableNombre}</p>
                  </div>
                  <span className="text-xs text-neutral-500 text-neutral-400">
                    {t.fechaLimite ? new Date(t.fechaLimite).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
