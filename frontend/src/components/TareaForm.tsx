import { useState } from "react";
import { api } from "../api/client";
import type { Usuario } from "../types";

interface Props {
  onCreada: () => void;
  onCancel: () => void;
  usuarios: Usuario[];
  proyectoId?: string;
}

const DEPARTAMENTOS = ["Marketing", "Ventas", "Podcast", "Mentoría", "Código Financiero", "Kappitalia", "Contenido", "Operaciones"];
const PRIORIDADES = ["baja", "media", "alta", "urgente"] as const;
const CANALES = ["", "YouTube", "YouTube Shorts", "Instagram", "Reels", "TikTok", "Facebook", "LinkedIn", "X", "Podcast", "Landing Pages", "Email Marketing"];
const TIPOS_CONTENIDO = ["", "Post", "Reel", "Short", "Video", "Podcast", "Landing Page", "Email", "Diseño", "Edición", "Campaña", "Otro"];
const TIPOS_TAREA = [
  { valor: "", etiqueta: "Sin tipo" },
  { valor: "diseno_grafico", etiqueta: "🎨 Diseño gráfico" },
  { valor: "video", etiqueta: "🎬 Video" },
  { valor: "pagina_web", etiqueta: "🌐 Página web" },
  { valor: "email_marketing", etiqueta: "📧 Email marketing" },
  { valor: "automatizacion", etiqueta: "⚡ Automatización" },
  { valor: "redes_sociales", etiqueta: "📱 Redes sociales" },
  { valor: "publicidad", etiqueta: "📢 Publicidad" },
  { valor: "reporte_analisis", etiqueta: "📊 Reporte / Análisis" },
  { valor: "revision", etiqueta: "🔍 Revisión" },
  { valor: "administracion", etiqueta: "⚙️ Administración" },
];

export function TareaForm({ onCreada, onCancel, usuarios, proyectoId }: Props) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [departamento, setDepartamento] = useState("Marketing");
  const [prioridad, setPrioridad] = useState<typeof PRIORIDADES[number]>("media");
  const [fechaLimite, setFechaLimite] = useState("");
  const [canal, setCanal] = useState("");
  const [tipoContenido, setTipoContenido] = useState("");
  const [fechaPublicacion, setFechaPublicacion] = useState("");
  // ─── Marketing v2 ──────────────────────────
  const [tipoTarea, setTipoTarea] = useState("");
  const [tiempoEstimado, setTiempoEstimado] = useState("");
  const [solicitanteId, setSolicitanteId] = useState("");
  const [criteriosTerminado, setCriteriosTerminado] = useState("");
  const [sprint, setSprint] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !responsableId) return;
    setGuardando(true);
    try {
      await api.crearTarea({
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        responsableId,
        departamento,
        prioridad,
        fechaLimite: fechaLimite || undefined,
        proyectoId: proyectoId || undefined,
        canal: canal || undefined,
        tipoContenido: tipoContenido || undefined,
        fechaPublicacion: fechaPublicacion || undefined,
        tipoTarea: tipoTarea || undefined,
        tiempoEstimado: tiempoEstimado ? parseInt(tiempoEstimado) : undefined,
        solicitanteId: solicitanteId || undefined,
        criteriosTerminado: criteriosTerminado.trim() || undefined,
        sprint: sprint.trim() || undefined,
      });
      onCreada();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <form
        onSubmit={onSubmit}
        className="bg-neutral-50 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Nueva tarea</h3>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Título *</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm"
              placeholder="Ej: Crear Reel para Instagram"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="Detalles de la tarea..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Responsable *</label>
              <select
                value={responsableId}
                onChange={(e) => setResponsableId(e.target.value)}
                className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">Seleccionar...</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Departamento</label>
              <select
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
                className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm"
              >
                {DEPARTAMENTOS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Prioridad</label>
              <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as typeof PRIORIDADES[number])} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                {PRIORIDADES.map((p) => (<option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Fecha límite</label>
              <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Canal</label>
              <select value={canal} onChange={(e) => setCanal(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                {CANALES.map((c) => (<option key={c} value={c}>{c || "Sin canal"}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Tipo de contenido</label>
              <select value={tipoContenido} onChange={(e) => setTipoContenido(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                {TIPOS_CONTENIDO.map((tc) => (<option key={tc} value={tc}>{tc || "Sin tipo"}</option>))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Fecha de publicación</label>
            <input type="date" value={fechaPublicacion} onChange={(e) => setFechaPublicacion(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* ─── Marketing v2: campos nuevos ──────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Tipo de tarea</label>
              <select value={tipoTarea} onChange={(e) => setTipoTarea(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                {TIPOS_TAREA.map((tt) => (<option key={tt.valor} value={tt.valor}>{tt.etiqueta}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Tiempo estimado (min)</label>
              <input type="number" value={tiempoEstimado} onChange={(e) => setTiempoEstimado(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" placeholder="Ej: 120" min="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Solicitante</label>
              <select value={solicitanteId} onChange={(e) => setSolicitanteId(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                <option value="">Sin solicitante</option>
                {usuarios.map((u) => (<option key={u.id} value={u.id}>{u.nombre}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Sprint</label>
              <input type="text" value={sprint} onChange={(e) => setSprint(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Sprint 1 - Agosto" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Criterios de terminado</label>
            <textarea
              value={criteriosTerminado}
              onChange={(e) => setCriteriosTerminado(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="¿Qué condiciones deben cumplirse para considerar esta tarea terminada?"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || !titulo.trim() || !responsableId}
            className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800"
          >
            {guardando ? "Creando..." : "Crear tarea"}
          </button>
        </div>
      </form>
    </div>
  );
}
