import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { TareaCard } from "../components/TareaCard";
import { TareaForm } from "../components/TareaForm";
import { KpiCard } from "../components/KpiCard";
import type { Proyecto, Usuario } from "../types";

export function ProyectoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarTareaForm, setMostrarTareaForm] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState("");

  const cargar = useCallback(async () => {
    if (!id) return;
    const [p, u] = await Promise.all([api.obtenerProyecto(id), api.listarUsuarios()]);
    setProyecto(p);
    setUsuarios(u);
    setCargando(false);
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando || !proyecto) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const tareas = proyecto.tareas ?? [];
  const pendientes = tareas.filter((t) => ["pendiente", "en_proceso"].includes(t.estado));
  const completadas = tareas.filter((t) => ["aprobado", "publicado"].includes(t.estado));

  async function agregarComentario() {
    if (!nuevoComentario.trim()) return;
    await api.agregarComentarioProyecto(proyecto!.id, nuevoComentario.trim());
    setNuevoComentario("");
    void cargar();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">{proyecto.nombre}</h1>
        <button onClick={() => setMostrarTareaForm(true)} className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600">
          + Nueva tarea
        </button>
      </div>
      {proyecto.objetivo && <p className="text-sm text-neutral-500 mb-2">{proyecto.objetivo}</p>}
      <div className="flex flex-wrap gap-3 text-xs text-neutral-500 mb-6">
        <span>👤 {proyecto.responsableNombre}</span>
        <span>📁 {proyecto.departamentoNombre}</span>
        {proyecto.cliente && <span>🏢 {proyecto.cliente}</span>}
        {proyecto.fechaEntrega && <span>📅 Entrega: {new Date(proyecto.fechaEntrega).toLocaleDateString("es-ES")}</span>}
        <span>Estado: {proyecto.estado}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard titulo="Total tareas" valor={tareas.length} icono="📋" color="neutral" />
        <KpiCard titulo="Pendientes" valor={pendientes.length} icono="⏳" color="warning" />
        <KpiCard titulo="Completadas" valor={completadas.length} icono="✅" color="success" />
        <KpiCard titulo="Avance" valor={`${Math.round(tareas.reduce((s, t) => s + (t.porcentajeAvance ?? 0), 0) / Math.max(1, tareas.length))}%`} icono="📊" color="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tareas */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-medium text-neutral-700 mb-3">Tareas del proyecto</h3>
          {tareas.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin tareas. Agrega la primera.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {tareas.map((t) => <TareaCard key={t.id} tarea={t} onUpdate={cargar} usuarios={usuarios} />)}
            </div>
          )}
        </div>

        {/* Comentarios */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-3">Comentarios</h3>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            {(proyecto.comentarios ?? []).length === 0 && <p className="text-xs text-neutral-500 mb-3">Sin comentarios.</p>}
            {(proyecto.comentarios ?? []).map((c) => (
              <div key={c.id} className="bg-neutral-100 rounded-lg p-2 text-xs mb-2">
                <p className="text-neutral-700">{c.texto}</p>
                <p className="text-neutral-500 mt-1">{c.autorNombre} · {new Date(c.fecha).toLocaleString("es-ES")}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={nuevoComentario} onChange={(e) => setNuevoComentario(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agregarComentario()}
                placeholder="Comentario..." className="flex-1 text-xs border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-2 py-1.5" />
              <button onClick={agregarComentario} className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg">Enviar</button>
            </div>
          </div>
        </div>
      </div>

      {mostrarTareaForm && (
        <TareaForm
          onCreada={() => { setMostrarTareaForm(false); cargar(); }}
          onCancel={() => setMostrarTareaForm(false)}
          usuarios={usuarios}
          proyectoId={proyecto.id}
        />
      )}
    </div>
  );
}
