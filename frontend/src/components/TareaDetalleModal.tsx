import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { TareaOperativa, ChecklistItem, ComentarioTarea, Usuario } from "../types";

const DEPARTAMENTOS = ["Marketing", "Ventas", "Podcast", "Mentoría", "Código Financiero", "Kappitalia", "Contenido", "Operaciones"];
const PRIORIDADES = ["baja", "media", "alta", "urgente"] as const;
const CANALES = ["", "YouTube", "YouTube Shorts", "Instagram", "Reels", "TikTok", "Facebook", "LinkedIn", "X", "Podcast", "Landing Pages", "Email Marketing"];
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

const ESTADO_LABEL: Record<string, string> = {
  solicitud: "Solicitud", backlog: "Backlog", pendiente: "Pendiente", por_hacer: "Por hacer",
  en_proceso: "En proceso", bloqueada: "Bloqueada", en_revision: "En revisión",
  requiere_ajustes: "Requiere ajustes", completada: "Completada", aprobado: "Aprobado",
  publicado: "Publicado", cancelado: "Cancelado",
};

const ESTADO_COLOR: Record<string, string> = {
  solicitud: "bg-neutral-100 text-neutral-600",
  backlog: "bg-neutral-100 text-neutral-600",
  pendiente: "bg-neutral-100 text-neutral-600",
  por_hacer: "bg-blue-100 text-blue-700",
  en_proceso: "bg-primary-100 text-primary-700",
  bloqueada: "bg-danger-100 text-danger-700",
  en_revision: "bg-warning-100 text-warning-700",
  requiere_ajustes: "bg-orange-100 text-orange-700",
  completada: "bg-success-200 text-success-800",
  aprobado: "bg-success-100 text-success-700",
  publicado: "bg-success-200 text-success-800",
  cancelado: "bg-danger-100 text-danger-700",
};

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente: "bg-danger-100 text-danger-700",
  alta: "bg-warning-100 text-warning-700",
  media: "bg-neutral-100 text-neutral-700",
  baja: "bg-success-100 text-success-700",
};

const FLUJO_ESTADOS: Record<string, string[]> = {
  solicitud: ["backlog", "pendiente", "cancelado"],
  backlog: ["pendiente", "por_hacer", "cancelado"],
  pendiente: ["por_hacer", "cancelado"],
  por_hacer: ["en_proceso", "cancelado"],
  en_proceso: ["en_revision", "bloqueada", "completada"],
  bloqueada: ["en_proceso", "cancelado"],
  en_revision: ["requiere_ajustes", "completada", "aprobado"],
  requiere_ajustes: ["en_proceso", "completada"],
  completada: ["aprobado", "publicado", "en_revision"],
  aprobado: ["publicado"],
  publicado: [],
  cancelado: ["pendiente", "por_hacer"],
};

interface Props {
  tarea: TareaOperativa;
  onClose: () => void;
  onUpdate: () => void;
  usuarios: Usuario[];
}

export function TareaDetalleModal({ tarea, onClose, onUpdate, usuarios }: Props) {
  const { usuario } = useAuth();

  // Espejo de puedeGestionarTarea (backend/src/services/tareas.service.ts). Antes esto era
  // solo `rol === ADMIN || SUPER_ADMIN`, así que quien delegaba una tarea sin ser admin no
  // veía el botón de editar — el síntoma que se reportó como "pierdo el control al asignar".
  //
  // El departamento no se evalúa aquí: el usuario guarda ids de departamento y la tarea
  // guarda el nombre. Si el backend concede el permiso por esa vía, el guardado funciona
  // igual; este botón solo decide si se muestra el atajo, no si el cambio se permite.
  const esRolDeMando =
    usuario?.rol === "SUPER_ADMIN" || usuario?.rol === "ADMIN" ||
    usuario?.rol === "SUPERVISOR" || usuario?.rol === "TEAM_LEADER";
  const participaEnLaTarea =
    !!usuario &&
    (tarea.responsableId === usuario.id ||
      tarea.asignadoPorId === usuario.id ||
      tarea.solicitanteId === usuario.id ||
      tarea.aprobadorId === usuario.id);
  const puedeEditar = esRolDeMando || participaEnLaTarea;

  const [editando, setEditando] = useState(false);

  // ─── Checklist ──────────────────────────────────────
  const [nuevoItem, setNuevoItem] = useState("");
  const checklist = tarea.checklist ?? [];
  const completados = checklist.filter((c) => c.completado).length;

  async function toggleItem(item: ChecklistItem) {
    await api.toggleChecklistItem(item.id, !item.completado);
    onUpdate();
  }
  async function agregarItem() {
    if (!nuevoItem.trim()) return;
    await api.agregarChecklistItem(tarea.id, nuevoItem.trim());
    setNuevoItem("");
    onUpdate();
  }
  async function eliminarItem(itemId: string) {
    await api.eliminarChecklistItem(itemId);
    onUpdate();
  }

  // ─── Comentarios ────────────────────────────────────
  const [nuevoComentario, setNuevoComentario] = useState("");
  async function agregarComentario() {
    if (!nuevoComentario.trim()) return;
    await api.agregarComentarioTarea(tarea.id, nuevoComentario.trim());
    setNuevoComentario("");
    onUpdate();
  }

  // ─── Cambio de estado ───────────────────────────────
  async function cambiarEstado(estado: string) {
    await api.actualizarTarea(tarea.id, { estado });
    onUpdate();
  }

  // ─── Completar ──────────────────────────────────────
  async function completar() {
    await api.actualizarTarea(tarea.id, { estado: "completada", porcentajeAvance: 100 });
    onUpdate();
  }

  // ─── Edición ────────────────────────────────────────
  const [editTitulo, setEditTitulo] = useState(tarea.titulo);
  const [editDescripcion, setEditDescripcion] = useState(tarea.descripcion ?? "");
  const [editResponsableId, setEditResponsableId] = useState(tarea.responsableId);
  const [editDepartamento, setEditDepartamento] = useState(tarea.departamento);
  const [editPrioridad, setEditPrioridad] = useState(tarea.prioridad);
  const [editFechaLimite, setEditFechaLimite] = useState(tarea.fechaLimite ? new Date(tarea.fechaLimite).toISOString().split("T")[0] : "");
  const [editCanal, setEditCanal] = useState(tarea.canal ?? "");
  const [editTipoContenido, setEditTipoContenido] = useState(tarea.tipoContenido ?? "");
  const [editFechaPublicacion, setEditFechaPublicacion] = useState(tarea.fechaPublicacion ? new Date(tarea.fechaPublicacion).toISOString().split("T")[0] : "");
  const [editTipoTarea, setEditTipoTarea] = useState(tarea.tipoTarea ?? "");
  const [editTiempoEstimado, setEditTiempoEstimado] = useState(String(tarea.tiempoEstimado ?? ""));
  const [editCriteriosTerminado, setEditCriteriosTerminado] = useState(tarea.criteriosTerminado ?? "");
  const [editSprint, setEditSprint] = useState(tarea.sprint ?? "");
  const [editPorcentaje, setEditPorcentaje] = useState(String(tarea.porcentajeAvance));
  const [guardando, setGuardando] = useState(false);

  async function guardarEdicion() {
    setGuardando(true);
    try {
      await api.actualizarTarea(tarea.id, {
        titulo: editTitulo.trim(),
        descripcion: editDescripcion.trim() || null,
        responsableId: editResponsableId,
        departamento: editDepartamento,
        prioridad: editPrioridad,
        fechaLimite: editFechaLimite || null,
        canal: editCanal || null,
        tipoContenido: editTipoContenido || null,
        fechaPublicacion: editFechaPublicacion || null,
        tipoTarea: editTipoTarea || null,
        tiempoEstimado: parseInt(editTiempoEstimado) || 0,
        criteriosTerminado: editCriteriosTerminado.trim() || null,
        sprint: editSprint.trim() || null,
        porcentajeAvance: parseInt(editPorcentaje) || 0,
      });
      setEditando(false);
      onUpdate();
    } finally {
      setGuardando(false);
    }
  }

  const estadosSiguientes = FLUJO_ESTADOS[tarea.estado] ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[5vh] pb-8 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-neutral-50 rounded-xl shadow-2xl w-full max-w-2xl mx-4 border border-neutral-200 animate-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Encabezado ──────────────────────────── */}
        <div className="flex items-start justify-between p-5 pb-3 border-b border-neutral-200">
          <div className="flex-1 min-w-0">
            {editando ? (
              <input
                type="text"
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                className="w-full text-lg font-semibold text-neutral-900 border border-neutral-200 bg-neutral-50 placeholder:text-neutral-400 rounded-lg px-3 py-2 mb-2"
              />
            ) : (
              <h2 className="text-lg font-semibold text-neutral-900">{tarea.titulo}</h2>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${ESTADO_COLOR[tarea.estado] ?? ""}`}>
                {ESTADO_LABEL[tarea.estado] ?? tarea.estado}
              </span>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIORIDAD_COLOR[tarea.prioridad] ?? ""}`}>
                {tarea.prioridad}
              </span>
              {tarea.tipoTarea && (
                <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                  {TIPOS_TAREA.find((tt) => tt.valor === tarea.tipoTarea)?.etiqueta ?? tarea.tipoTarea}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg leading-none ml-3">&times;</button>
        </div>

        {/* ─── Cuerpo ──────────────────────────────── */}
        <div className="p-5 space-y-5">
          {editando ? (
            /* ═══════════════════════════════════════════
               MODO EDICIÓN (solo admin)
               ═══════════════════════════════════════════ */
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-1">Descripción</label>
                <textarea value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} rows={3}
                  className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Responsable</label>
                  <select value={editResponsableId} onChange={(e) => setEditResponsableId(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                    {usuarios.map((u) => (<option key={u.id} value={u.id}>{u.nombre}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Departamento</label>
                  <select value={editDepartamento} onChange={(e) => setEditDepartamento(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                    {DEPARTAMENTOS.map((d) => (<option key={d} value={d}>{d}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Prioridad</label>
                  <select value={editPrioridad} onChange={(e) => setEditPrioridad(e.target.value as typeof PRIORIDADES[number])}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                    {PRIORIDADES.map((p) => (<option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Fecha límite</label>
                  <input type="date" value={editFechaLimite} onChange={(e) => setEditFechaLimite(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Canal</label>
                  <select value={editCanal} onChange={(e) => setEditCanal(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                    {CANALES.map((c) => (<option key={c} value={c}>{c || "Sin canal"}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Tipo contenido</label>
                  <input type="text" value={editTipoContenido} onChange={(e) => setEditTipoContenido(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Tipo de tarea</label>
                  <select value={editTipoTarea} onChange={(e) => setEditTipoTarea(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                    {TIPOS_TAREA.map((tt) => (<option key={tt.valor} value={tt.valor}>{tt.etiqueta}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Tiempo est. (min)</label>
                  <input type="number" value={editTiempoEstimado} onChange={(e) => setEditTiempoEstimado(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" min="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Sprint</label>
                  <input type="text" value={editSprint} onChange={(e) => setEditSprint(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">% Avance</label>
                  <input type="number" value={editPorcentaje} onChange={(e) => setEditPorcentaje(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" min="0" max="100" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-1">Criterios de terminado</label>
                <textarea value={editCriteriosTerminado} onChange={(e) => setEditCriteriosTerminado(e.target.value)} rows={2}
                  className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-1">Fecha publicación</label>
                <input type="date" value={editFechaPublicacion} onChange={(e) => setEditFechaPublicacion(e.target.value)}
                  className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 justify-end pt-2 border-t border-neutral-200">
                <button onClick={() => setEditando(false)} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">
                  Cancelar
                </button>
                <button onClick={guardarEdicion} disabled={guardando || !editTitulo.trim()}
                  className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800">
                  {guardando ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          ) : (
            /* ═══════════════════════════════════════════
               MODO VISUALIZACIÓN
               ═══════════════════════════════════════════ */
            <>
              {/* Info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Info label="Responsable" value={tarea.responsableNombre} icon="👤" />
                <Info label="Departamento" value={tarea.departamento} icon="📁" />
                <Info label="Prioridad" value={tarea.prioridad} icon="🚩" />
                {tarea.fechaLimite && (
                  <Info label="Fecha límite" value={new Date(tarea.fechaLimite).toLocaleDateString("es-ES", { timeZone: "America/New_York" })} icon="📅" />
                )}
                {tarea.fechaPublicacion && (
                  <Info label="Fecha publicación" value={new Date(tarea.fechaPublicacion).toLocaleDateString("es-ES", { timeZone: "America/New_York" })} icon="📢" />
                )}
                {tarea.canal && <Info label="Canal" value={tarea.canal} icon="📺" />}
                {tarea.tipoContenido && <Info label="Tipo contenido" value={tarea.tipoContenido} icon="📝" />}
                {tarea.sprint && <Info label="Sprint" value={tarea.sprint} icon="🏃" />}
                <Info label="% Avance" value={`${tarea.porcentajeAvance}%`} icon="📊" />
                {(tarea.tiempoInvertido > 0 || tarea.tiempoEstimado > 0) && (
                  <Info label="Tiempo" value={`${Math.round((tarea.tiempoInvertido ?? 0) / 60)}h / ${Math.round((tarea.tiempoEstimado ?? 0) / 60)}h est.`} icon="⏱" />
                )}
              </div>

              {/* Descripción */}
              {tarea.descripcion && (
                <div>
                  <p className="text-xs font-medium text-neutral-600 mb-1">Descripción</p>
                  <p className="text-sm text-neutral-700 whitespace-pre-wrap">{tarea.descripcion}</p>
                </div>
              )}

              {/* Criterios de terminado */}
              {tarea.criteriosTerminado && (
                <div>
                  <p className="text-xs font-medium text-neutral-600 mb-1">Criterios de terminado</p>
                  <p className="text-sm text-neutral-700 whitespace-pre-wrap">{tarea.criteriosTerminado}</p>
                </div>
              )}

              {/* Bloqueo */}
              {tarea.estado === "bloqueada" && tarea.bloqueoMotivo && (
                <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg p-3">
                  <p className="text-sm font-medium text-danger-700">🚫 Bloqueada</p>
                  <p className="text-xs text-danger-600 mt-1">{tarea.bloqueoMotivo}</p>
                  {tarea.bloqueoDependeDe && <p className="text-xs text-danger-500 mt-0.5">Depende de: {tarea.bloqueoDependeDe}</p>}
                </div>
              )}

              {/* Acciones de estado */}
              <div>
                <p className="text-xs font-medium text-neutral-600 mb-2">Cambiar estado</p>
                <div className="flex gap-1.5 flex-wrap">
                  {!["completada", "aprobado", "publicado", "cancelado"].includes(tarea.estado) && (
                    <button onClick={completar}
                      className="text-xs px-3 py-1.5 rounded-lg bg-success-500 text-white hover:bg-success-600 font-medium">
                      ✓ Completar
                    </button>
                  )}
                  {estadosSiguientes.map((estado) => (
                    <button key={estado} onClick={() => cambiarEstado(estado)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-600">
                      → {ESTADO_LABEL[estado] ?? estado.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Checklist */}
              <div className="border-t border-neutral-200 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-medium text-neutral-700">Checklist</p>
                  {checklist.length > 0 && (
                    <span className="text-[10px] text-neutral-500">({completados}/{checklist.length})</span>
                  )}
                </div>
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 mb-1.5 text-sm">
                    <input type="checkbox" checked={!!item.completado}
                      onChange={() => toggleItem(item)} className="rounded" />
                    <span className={`flex-1 ${item.completado ? "line-through text-neutral-500" : "text-neutral-700"}`}>
                      {item.texto}
                    </span>
                    <button onClick={() => eliminarItem(item.id)}
                      className="text-xs text-danger-500 hover:underline">✕</button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input type="text" value={nuevoItem}
                    onChange={(e) => setNuevoItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && agregarItem()}
                    placeholder="Agregar item..."
                    className="flex-1 text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-2 py-1.5" />
                  <button onClick={agregarItem}
                    className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg">+</button>
                </div>
              </div>

              {/* Comentarios */}
              <div className="border-t border-neutral-200 pt-4">
                <p className="text-xs font-medium text-neutral-700 mb-2">Comentarios</p>
                {(tarea.comentarios ?? []).length === 0 ? (
                  <p className="text-xs text-neutral-600 mb-2">Sin comentarios.</p>
                ) : (
                  <div className="flex flex-col gap-2 mb-3">
                    {(tarea.comentarios ?? []).map((c: ComentarioTarea) => (
                      <div key={c.id} className="bg-neutral-100 rounded-lg p-2 text-xs">
                        <p className="text-neutral-700">{c.texto}</p>
                        <p className="text-neutral-500 mt-1">{c.autorNombre} · {new Date(c.fecha).toLocaleString("es-ES")}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" value={nuevoComentario}
                    onChange={(e) => setNuevoComentario(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && agregarComentario()}
                    placeholder="Escribe un comentario..."
                    className="flex-1 text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-2 py-1.5" />
                  <button onClick={agregarComentario}
                    className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg">Enviar</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ─── Footer con botón editar ─────────────── */}
        {!editando && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 bg-neutral-100 rounded-b-xl">
            <span className="text-[10px] text-neutral-500">
              Creado {new Date(tarea.createdAt).toLocaleDateString("es-ES")}
            </span>
            <div className="flex gap-2">
              {puedeEditar && (
                <button onClick={() => setEditando(true)}
                  className="text-xs px-4 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 font-medium">
                  ✏️ Editar tarea
                </button>
              )}
              <button onClick={onClose}
                className="text-xs px-4 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100">
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-neutral-100 rounded-lg p-2.5">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-neutral-800 font-medium mt-0.5">{icon} {value}</p>
    </div>
  );
}
