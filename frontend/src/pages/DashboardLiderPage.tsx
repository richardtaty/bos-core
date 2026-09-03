import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { KpiCard } from "../components/KpiCard";
import type { DashboardLider } from "../types";

export function DashboardLiderPage() {
  const { usuario } = useAuth();
  const [data, setData] = useState<DashboardLider | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.dashboardLider().then((d) => {
      setData(d);
      setCargando(false);
    });
  }, []);

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  if ("error" in data) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">👥</p>
        <p className="text-lg font-medium text-neutral-700 mb-2">No tienes un equipo asignado</p>
        <p className="text-sm text-neutral-500">Solo los líderes de departamento ven este dashboard.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Dashboard de Líder</h1>
      <p className="text-sm text-neutral-500 mb-6">{data.departamento} — Hola, {usuario?.nombre.split(" ")[0]}</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard titulo="Producción hoy" valor={data.produccionHoy} icono="📦" color="success" />
        <KpiCard titulo="Prod. semanal" valor={data.produccionSemana} icono="📊" color="primary" />
        <KpiCard titulo="Tareas activas" valor={data.totalTareas} icono="📋" color="neutral" />
        <KpiCard titulo="Cuellos botella" valor={data.cuellosDeBotella} icono="🚧" color={data.cuellosDeBotella > 0 ? "danger" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equipo */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-3">Mi equipo</h3>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl divide-y divide-neutral-200">
            {data.kpisIndividuales.map((m) => (
              <Link
                key={m.usuarioId}
                to={`/equipo/${m.usuarioId}`}
                className="p-3 flex items-center justify-between hover:bg-neutral-100"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">{m.nombre}</p>
                  <p className="text-xs text-neutral-500">{m.cargo}</p>
                </div>
                <div className="flex gap-3 text-xs text-neutral-500">
                  <span className="text-success-600">✅ {m.completadas}</span>
                  <span className="text-primary-600">🔄 {m.enProgreso}</span>
                  {m.atrasadas > 0 && <span className="text-danger-600">⚠ {m.atrasadas}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Vencidas + Próximas */}
        <div className="flex flex-col gap-4">
          {data.vencidas > 0 && (
            <div className="bg-danger-50 bg-danger-500/10 border border-danger-200 border-danger-500/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-danger-700 mb-2">⚠ {data.vencidas} tareas vencidas</h3>
            </div>
          )}

          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <h3 className="text-sm font-medium text-neutral-700 mb-2">Próximas entregas</h3>
            {data.proximasEntregas.length === 0 ? (
              <p className="text-xs text-neutral-500">Sin entregas próximas.</p>
            ) : (
              data.proximasEntregas.slice(0, 5).map((t) => (
                <div key={t.id} className="flex justify-between items-center py-1.5 border-b border-neutral-200 text-xs">
                  <span className="text-neutral-700">{t.titulo}</span>
                  <span className="text-neutral-500">{t.fechaLimite ? new Date(t.fechaLimite).toLocaleDateString("es-ES") : "—"}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <h3 className="text-sm font-medium text-neutral-700 mb-2">Próximas publicaciones</h3>
            {data.proximasPublicaciones.length === 0 ? (
              <p className="text-xs text-neutral-500">Sin publicaciones agendadas.</p>
            ) : (
              data.proximasPublicaciones.slice(0, 5).map((t) => (
                <div key={t.id} className="flex justify-between items-center py-1.5 border-b border-neutral-200 text-xs">
                  <span className="text-neutral-700">{t.titulo}</span>
                  <span className="text-neutral-500">{t.canal}</span>
                </div>
              ))
            )}
          </div>

          {/* Cuellos */}
          {data.cuellos.length > 0 && (
            <div className="bg-warning-50 bg-warning-500/10 border border-warning-200 border-warning-500/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-warning-700 mb-2">🚧 Cuellos de botella</h3>
              {data.cuellos.slice(0, 3).map((t) => (
                <p key={t.id} className="text-xs text-warning-700 py-0.5">
                  {t.titulo} — {t.responsableNombre} ({t.estado.replace("_", " ")})
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
