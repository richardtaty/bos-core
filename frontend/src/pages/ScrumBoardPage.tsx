import { useEffect, useState, useCallback, DragEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { KpiCard } from "../components/KpiCard";
import { TareaDetalleModal } from "../components/TareaDetalleModal";
import type { TareaOperativa, Usuario } from "../types";

// El contenido del tablero se determina automáticamente por el campo
// `departamento` de cada tarea — no depende de un filtro manual ni de la
// persona responsable. Cada ruta monta este componente con su propia área
// (ver AppRoutes.tsx); los valores válidos son los mismos que ofrecen
// TareaForm.tsx y TareaDetalleModal.tsx.
const SUBTITULO_POR_AREA: Record<string, string> = {
  Marketing: "Producción — Equipo de Marketing",
  Ventas: "Producción — Equipo de Ventas",
  Operaciones: "Producción — Equipo de Operaciones",
};

const COLUMNAS_KANBAN: { estado: string; titulo: string; color: string }[] = [
  { estado: "solicitud", titulo: "📥 Bandeja", color: "bg-neutral-100" },
  { estado: "backlog", titulo: "📚 Backlog", color: "bg-neutral-100" },
  { estado: "por_hacer", titulo: "✅ Por hacer", color: "bg-blue-50" },
  { estado: "en_proceso", titulo: "🔄 En proceso", color: "bg-primary-50" },
  { estado: "bloqueada", titulo: "🚫 Bloqueadas", color: "bg-danger-50" },
  { estado: "en_revision", titulo: "👁 En revisión", color: "bg-warning-50" },
  { estado: "requiere_ajustes", titulo: "🔧 Ajustes", color: "bg-orange-50" },
  { estado: "completada", titulo: "🎉 Completadas", color: "bg-success-50" },
];

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente: "bg-danger-500", alta: "bg-warning-500", media: "bg-neutral-400", baja: "bg-success-500",
};

const TIPO_LABEL: Record<string, string> = {
  diseno_grafico: "🎨 Diseño", video: "🎬 Video", pagina_web: "🌐 Web",
  email_marketing: "📧 Email", automatizacion: "⚡ Auto", redes_sociales: "📱 Social",
  publicidad: "📢 Ads", reporte_analisis: "📊 Análisis", revision: "🔍 Revisión", administracion: "⚙️ Admin",
};

export function ScrumBoardPage({ area = "Marketing" }: { area?: string }) {
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [columnaSobre, setColumnaSobre] = useState<string | null>(null);
  const [tareaDetalle, setTareaDetalle] = useState<TareaOperativa | null>(null);
  const [abriendoDetalle, setAbriendoDetalle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [t, u] = await Promise.all([
      api.listarTareas({ departamento: area }),
      api.listarUsuarios(),
    ]);
    // Solo se excluyen las canceladas. Las de estado `aprobado` y `publicado`
    // deben seguir viéndose: caen en la columna "Completadas" (ver
    // tareasPorColumna) y se cuentan en el KPI de completadas.
    setTareas(t.filter((x) => x.estado !== "cancelado"));
    setUsuarios(u);
    setCargando(false);
  }, [area]);

  // Al cambiar de tablero (otra área) se vuelve a cargar desde cero.
  useEffect(() => { setCargando(true); void cargar(); }, [cargar]);

  // ─── Edición de tarjeta ──────────────────────────────────────
  const abrirDetalle = async (t: TareaOperativa) => {
    setAbriendoDetalle(true);
    try {
      setTareaDetalle(await api.obtenerTarea(t.id));
    } catch {
      setTareaDetalle(t);
    } finally {
      setAbriendoDetalle(false);
    }
  };

  const actualizarDetalle = async () => {
    await cargar();
    if (!tareaDetalle) return;
    try {
      const actualizado = await api.obtenerTarea(tareaDetalle.id);
      // Si la tarea cambió de área, desaparece de este tablero.
      setTareaDetalle(actualizado.departamento === area ? actualizado : null);
    } catch {
      setTareaDetalle(null);
    }
  };

  // ─── Arrastrar y soltar entre columnas ───────────────────────
  const onDrop = async (e: DragEvent, estado: string) => {
    e.preventDefault();
    const id = arrastrando;
    setArrastrando(null);
    setColumnaSobre(null);
    if (!id) return;
    const tarea = tareas.find((t) => t.id === id);
    if (!tarea || tarea.estado === estado) return;
    try {
      await api.actualizarTarea(id, { estado });
      await cargar();
    } catch {
      setError("No se pudo mover la tarjeta. Inténtalo de nuevo.");
      window.setTimeout(() => setError(null), 4000);
    }
  };

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const tareasPorColumna = (estado: string) => {
    // Mapear estados legacy a scrum
    if (estado === "por_hacer") return tareas.filter((t) => t.estado === "por_hacer" || t.estado === "pendiente");
    if (estado === "completada") return tareas.filter((t) => t.estado === "completada" || t.estado === "aprobado" || t.estado === "publicado");
    return tareas.filter((t) => t.estado === estado);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">Tablero Scrum</h1>
        <Link to="/moc/tareas" className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600">
          + Nueva tarea
        </Link>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        {SUBTITULO_POR_AREA[area] ?? `Producción — ${area}`}
      </p>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard titulo="Total activas" valor={tareas.filter((t) => !["completada", "cancelado"].includes(t.estado)).length} icono="📋" color="neutral" />
        <KpiCard titulo="Bloqueadas" valor={tareas.filter((t) => t.estado === "bloqueada").length} icono="🚫" color="danger" />
        <KpiCard titulo="En revisión" valor={tareas.filter((t) => t.estado === "en_revision").length} icono="👁" color="warning" />
        <KpiCard titulo="Completadas" valor={tareas.filter((t) => t.estado === "completada" || t.estado === "aprobado" || t.estado === "publicado").length} icono="✅" color="success" />
        <KpiCard titulo="Atrasadas" valor={tareas.filter((t) => t.fechaLimite && new Date(t.fechaLimite) < new Date() && !["completada", "cancelado"].includes(t.estado)).length} icono="⚠️" color="warning" />
      </div>

      {/* Error al mover tarjeta */}
      {error && (
        <div className="mb-4 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Kanban horizontal — el scroll se aplica solo a este contenedor */}
      <div className="overflow-x-auto pb-4">
        <div className="flex flex-nowrap gap-3 min-w-max" style={{ minHeight: "60vh" }}>
          {COLUMNAS_KANBAN.map((col) => {
            const tareasCol = tareasPorColumna(col.estado);
            return (
              <div
                key={col.estado}
                onDragOver={(e) => { e.preventDefault(); if (columnaSobre !== col.estado) setColumnaSobre(col.estado); }}
                onDragLeave={() => setColumnaSobre((c) => (c === col.estado ? null : c))}
                onDrop={(e) => onDrop(e, col.estado)}
                className={`w-64 flex-none ${columnaSobre === col.estado ? "ring-2 ring-primary-400 rounded-xl" : ""}`}
              >
                <div className={`${col.color} rounded-t-xl px-3 py-2 border border-neutral-200 border-b-0`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-700">{col.titulo}</span>
                    <span className="text-[10px] bg-neutral-100 px-1.5 py-0.5 rounded-full text-neutral-600 font-medium">
                      {tareasCol.length}
                    </span>
                  </div>
                </div>
                <div className="bg-neutral-50 rounded-b-xl border border-neutral-200 border-t-0 p-2 flex flex-col gap-2 min-h-[200px]">
                  {tareasCol.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setArrastrando(t.id)}
                      onDragEnd={() => { setArrastrando(null); setColumnaSobre(null); }}
                      onClick={() => void abrirDetalle(t)}
                      className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary-300"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORIDAD_COLOR[t.prioridad] ?? "bg-neutral-300"}`} title={t.prioridad} />
                        <p className="text-xs font-medium text-neutral-900 truncate">{t.titulo}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {t.tipoTarea && (
                          <span className="bg-neutral-100 text-neutral-600 px-1 py-0.5 rounded">
                            {TIPO_LABEL[t.tipoTarea] ?? t.tipoTarea}
                          </span>
                        )}
                        {t.fechaLimite && (
                          <span className={`px-1 py-0.5 rounded ${new Date(t.fechaLimite) < new Date() ? "bg-danger-100 text-danger-600" : "text-neutral-500"}`}>
                            📅 {new Date(t.fechaLimite).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-500 mt-1">{t.responsableNombre}</p>
                      {t.estado === "bloqueada" && t.bloqueoMotivo && (
                        <p className="text-[10px] text-danger-600 mt-1 truncate">🚫 {t.bloqueoMotivo}</p>
                      )}
                    </div>
                  ))}
                  {tareasCol.length === 0 && (
                    <p className="text-xs text-neutral-600 text-center py-4">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detalle / edición de tarea */}
      {tareaDetalle && (
        <TareaDetalleModal
          tarea={tareaDetalle}
          onClose={() => setTareaDetalle(null)}
          onUpdate={() => { void actualizarDetalle(); }}
          usuarios={usuarios}
        />
      )}
      {abriendoDetalle && <p className="text-xs text-neutral-500 mt-2">Abriendo tarea...</p>}
    </div>
  );
}
