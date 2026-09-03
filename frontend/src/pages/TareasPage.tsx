import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { TareaCard } from "../components/TareaCard";
import { TareaForm } from "../components/TareaForm";
import { KpiCard } from "../components/KpiCard";
import type { TareaOperativa, Usuario } from "../types";
import { GRUPOS, grupoDeEstado, ESTADOS_ACTIVOS } from "../lib/estados";

export function TareasPage() {
  const { usuario } = useAuth();
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtro, setFiltro] = useState<string>("activas");

  const cargar = useCallback(async () => {
    // Cada usuario ve automáticamente solo sus propias tareas asignadas.
    const [misTareas, listaUsuarios] = await Promise.all([
      api.misTareas(),
      api.listarUsuarios(),
    ]);
    setTareas(misTareas);
    setUsuarios(listaUsuarios);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const activas = tareas.filter((t) => ESTADOS_ACTIVOS.includes(grupoDeEstado(t.estado)));
  const pendientes = tareas.filter((t) => grupoDeEstado(t.estado) === "pendiente");
  const enRevision = tareas.filter((t) => grupoDeEstado(t.estado) === "en_revision");
  const enProceso = tareas.filter((t) => grupoDeEstado(t.estado) === "en_proceso");
  const atrasadas = activas.filter((t) => {
    if (!t.fechaLimite) return false;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(t.fechaLimite); fecha.setHours(0, 0, 0, 0);
    return fecha < hoy;
  });

  // Por defecto se muestran solo las activas; Realizado/Cancelado se ven al elegirlos en el filtro.
  const visibles = tareas.filter((t) => {
    const g = grupoDeEstado(t.estado);
    return filtro === "activas" ? ESTADOS_ACTIVOS.includes(g) : g === filtro;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">Mis tareas</h1>
        <button
          onClick={() => setMostrarForm(true)}
          className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600"
        >
          + Nueva tarea
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-6">Tus asignaciones activas, {usuario?.nombre.split(" ")[0]}</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard titulo="Activas" valor={activas.length} icono="📋" color="neutral" />
        <KpiCard titulo="Pendientes" valor={pendientes.length} icono="⏳" color="warning" />
        <KpiCard titulo="En revisión" valor={enRevision.length} icono="🔍" color="warning" />
        <KpiCard titulo="En proceso" valor={enProceso.length} icono="🔄" color="primary" />
        <KpiCard titulo="Atrasadas" valor={atrasadas.length} icono="⚠️" color="danger" />
      </div>

      {/* Filtro por estado (único filtro) */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Estado:</span>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-2 py-1.5"
          >
            <option value="activas">Activas (Pendiente, En revisión, En proceso)</option>
            {GRUPOS.map((g) => (
              <option key={g.valor} value={g.valor}>{g.etiqueta}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de tareas */}
      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">
          {filtro === "activas"
            ? "No tienes tareas activas. ¡Todo al día!"
            : "No hay tareas en este estado."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibles.map((t) => (
            <TareaCard key={t.id} tarea={t} onUpdate={cargar} usuarios={usuarios} agruparEstados />
          ))}
        </div>
      )}

      {mostrarForm && (
        <TareaForm
          onCreada={() => { setMostrarForm(false); cargar(); }}
          onCancel={() => setMostrarForm(false)}
          usuarios={usuarios}
        />
      )}
    </div>
  );
}
