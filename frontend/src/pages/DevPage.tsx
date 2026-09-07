import { useEffect, useState, useCallback, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { TareaOperativa, Usuario } from "../types";

// ─── Módulo DEV: tareas de desarrollo (solo SUPER_ADMIN) ────────────
// Tablero de tres columnas: PENDIENTE / EN PROCESO / FINALIZADA. Cada estado visible
// mapea a un estado real del sistema (pendiente / en_proceso / completada); la tarea
// nunca se borra al finalizar. Reutiliza la infraestructura actual de tareas del backend.

const COLUMNAS: {
  estado: TareaOperativa["estado"];
  titulo: string;
  header: string;
  dot: string;
}[] = [
  { estado: "pendiente", titulo: "PENDIENTE", header: "bg-neutral-100 text-neutral-700 border-neutral-200", dot: "bg-neutral-400" },
  { estado: "en_proceso", titulo: "EN PROCESO", header: "bg-primary-50 text-primary-700 border-primary-200", dot: "bg-primary-500" },
  { estado: "completada", titulo: "FINALIZADA", header: "bg-success-50 text-success-700 border-success-200", dot: "bg-success-500" },
];

const ESTADO_DEV_OPCIONES = COLUMNAS; // mismas tres opciones para el selector de estado

const PRIORIDADES = [
  { valor: "baja", etiqueta: "Baja" },
  { valor: "media", etiqueta: "Media" },
  { valor: "alta", etiqueta: "Alta" },
  { valor: "urgente", etiqueta: "Urgente" },
] as const;

const PRIORIDAD_DOT: Record<string, string> = {
  baja: "bg-success-500",
  media: "bg-neutral-400",
  alta: "bg-warning-500",
  urgente: "bg-danger-500",
};

const ACTIVOS = (usuario: Usuario) => usuario.activo !== false;

export function DevPage() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";

  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [tareaActiva, setTareaActiva] = useState<TareaOperativa | null>(null);

  const cargar = useCallback(async () => {
    if (!esSuperAdmin) return;
    try {
      const [t, u] = await Promise.all([api.listarTareasDev(), api.listarUsuarios()]);
      setTareas(t);
      setUsuarios(u);
    } catch {
      setError("No se pudo cargar el tablero DEV. Inténtalo de nuevo.");
      window.setTimeout(() => setError(null), 4000);
    } finally {
      setCargando(false);
    }
  }, [esSuperAdmin]);

  useEffect(() => {
    if (esSuperAdmin) {
      setCargando(true);
      void cargar();
    }
  }, [cargar, esSuperAdmin]);

  if (!esSuperAdmin) return <Navigate to="/mi-dia" replace />;

  /** Refresca el tablero tras un cambio y, si viene la tarea actualizada, la mantiene abierta. */
  const aplicarCambio = useCallback(async (actualizada?: TareaOperativa) => {
    await cargar();
    if (actualizada) setTareaActiva(actualizada);
  }, [cargar]);

  const tareasPorEstado = (estado: string) => tareas.filter((t) => t.estado === estado);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">💻 DEV</h1>
          <p className="text-sm text-neutral-500">Tareas de desarrollo — gestión exclusiva del Super Admin.</p>
        </div>
        <button
          onClick={() => setMostrarNueva(true)}
          className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600"
        >
          + Nueva tarea
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-neutral-500 py-10 text-center">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
          {COLUMNAS.map((col) => {
            const lista = tareasPorEstado(col.estado);
            return (
              <div key={col.estado} className="flex flex-col">
                <div className={`flex items-center justify-between rounded-t-xl px-3 py-2 border ${col.header}`}>
                  <span className="text-xs font-semibold tracking-wide">{col.titulo}</span>
                  <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full text-neutral-600 font-medium">
                    {lista.length}
                  </span>
                </div>
                <div className="flex-1 bg-neutral-50 border border-neutral-200 border-t-0 rounded-b-xl p-2 flex flex-col gap-2 min-h-[120px]">
                  {lista.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-6">Sin tareas</p>
                  ) : (
                    lista.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTareaActiva(t)}
                        className="text-left bg-white border border-neutral-200 rounded-lg p-2.5 shadow-sm cursor-pointer hover:border-primary-300 hover:shadow"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORIDAD_DOT[t.prioridad] ?? "bg-neutral-300"}`} title={t.prioridad} />
                          <p className="text-xs font-medium text-neutral-900 truncate">{t.titulo}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
                          {t.fechaLimite && <span>📅 {new Date(t.fechaLimite).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>}
                          <span>👤 {t.responsableNombre}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mostrarNueva && (
        <NuevaTareaDevModal
          usuarios={usuarios}
          onCreada={() => { setMostrarNueva(false); void cargar(); }}
          onCancel={() => setMostrarNueva(false)}
        />
      )}

      {tareaActiva && (
        <TareaDevModal
          tarea={tareaActiva}
          usuarios={usuarios}
          onClose={() => setTareaActiva(null)}
          onCambio={aplicarCambio}
        />
      )}
    </div>
  );
}

// ─── Modal: nueva tarea DEV (formulario depurado) ──────────────

function NuevaTareaDevModal({
  usuarios,
  onCreada,
  onCancel,
}: {
  usuarios: Usuario[];
  onCreada: () => void;
  onCancel: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [fechaLimite, setFechaLimite] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disponibles = usuarios.filter(ACTIVOS);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !responsableId) return;
    setGuardando(true);
    setError(null);
    try {
      await api.crearTareaDev({
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        responsableId,
        prioridad,
        fechaLimite: fechaLimite || undefined,
      });
      onCreada();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la tarea.");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <form
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-50 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-neutral-200"
      >
        <h3 className="text-lg font-semibold text-neutral-900 mb-1">+ Nueva tarea DEV</h3>
        <p className="text-xs text-neutral-500 mb-4">Se crea como PENDIENTE. La etiqueta DEV queda fija.</p>

        <div className="flex flex-col gap-3">
          <Campo etiqueta="Título *">
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm"
              placeholder="Ej: Revisar seguridad del login"
              required
            />
          </Campo>

          <Campo etiqueta="Descripción">
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm"
              placeholder="Detalles de la tarea..."
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Responsable *">
              <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" required>
                <option value="">Seleccionar...</option>
                {disponibles.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Prioridad">
              <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                {PRIORIDADES.map((p) => (
                  <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo etiqueta="Fecha límite">
            <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
          </Campo>

          {error && <p className="text-xs text-danger-600">{error}</p>}
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

// ─── Modal: detalle + edición de una tarea DEV ─────────────────

function TareaDevModal({
  tarea,
  usuarios,
  onClose,
  onCambio,
}: {
  tarea: TareaOperativa;
  usuarios: Usuario[];
  onClose: () => void;
  onCambio: (actualizada?: TareaOperativa) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editTitulo, setEditTitulo] = useState(tarea.titulo);
  const [editDescripcion, setEditDescripcion] = useState(tarea.descripcion ?? "");
  const [editResponsableId, setEditResponsableId] = useState(tarea.responsableId);
  const [editPrioridad, setEditPrioridad] = useState(tarea.prioridad);
  const [editFechaLimite, setEditFechaLimite] = useState(
    tarea.fechaLimite ? new Date(tarea.fechaLimite).toISOString().split("T")[0] : "",
  );

  const disponibles = usuarios.filter(ACTIVOS);

  async function cambiarEstado(estado: string) {
    if (estado === tarea.estado) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await api.actualizarTareaDev(tarea.id, { estado });
      await onCambio(actualizada);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardar() {
    if (!editTitulo.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await api.actualizarTareaDev(tarea.id, {
        titulo: editTitulo.trim(),
        descripcion: editDescripcion.trim() || null,
        responsableId: editResponsableId,
        prioridad: editPrioridad,
        fechaLimite: editFechaLimite || null,
      });
      setEditando(false);
      await onCambio(actualizada);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[6vh] pb-8 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-neutral-50 rounded-xl shadow-2xl w-full max-w-xl mx-4 border border-neutral-200 animate-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-3 border-b border-neutral-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700">DEV</span>
              {!editando && (
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${ESTADO_COLOR(tarea.estado)}`}>
                  {ETIQUETA_ESTADO(tarea.estado)}
                </span>
              )}
            </div>
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
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg leading-none ml-3">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {error && <p className="text-xs text-danger-600">{error}</p>}

          {/* Cambio de estado entre los tres estados DEV */}
          {!editando && (
            <div>
              <p className="text-xs font-medium text-neutral-600 mb-2">Estado</p>
              <div className="flex gap-1.5 flex-wrap">
                {ESTADO_DEV_OPCIONES.map((op) => {
                  const activo = tarea.estado === op.estado;
                  return (
                    <button
                      key={op.estado}
                      onClick={() => cambiarEstado(op.estado)}
                      disabled={guardando || activo}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        activo
                          ? "bg-neutral-800 text-white cursor-default"
                          : "border border-neutral-200 hover:bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {op.titulo}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {editando ? (
            <div className="flex flex-col gap-3">
              <Campo etiqueta="Descripción">
                <textarea value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} rows={3} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Responsable">
                  <select value={editResponsableId} onChange={(e) => setEditResponsableId(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                    {disponibles.map((u) => (
                      <option key={u.id} value={u.id}>{u.nombre}</option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Prioridad">
                  <select value={editPrioridad} onChange={(e) => setEditPrioridad(e.target.value as TareaOperativa["prioridad"])} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                    {PRIORIDADES.map((p) => (
                      <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
                    ))}
                  </select>
                </Campo>
              </div>
              <Campo etiqueta="Fecha límite">
                <input type="date" value={editFechaLimite} onChange={(e) => setEditFechaLimite(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
              </Campo>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Info etiqueta="Responsable" valor={tarea.responsableNombre} icono="👤" />
                <Info etiqueta="Prioridad" valor={tarea.prioridad} icono="🚩" />
                {tarea.fechaLimite && (
                  <Info etiqueta="Fecha límite" valor={new Date(tarea.fechaLimite).toLocaleDateString("es-ES")} icono="📅" />
                )}
              </div>
              {tarea.descripcion && (
                <div>
                  <p className="text-xs font-medium text-neutral-600 mb-1">Descripción</p>
                  <p className="text-sm text-neutral-700 whitespace-pre-wrap">{tarea.descripcion}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 bg-neutral-100 rounded-b-xl">
          <span className="text-[10px] text-neutral-500">
            Creada el {new Date(tarea.createdAt).toLocaleDateString("es-ES")}
          </span>
          <div className="flex gap-2">
            {editando ? (
              <>
                <button onClick={() => { setEditando(false); setError(null); }}
                  className="text-xs px-4 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100">
                  Cancelar
                </button>
                <button onClick={guardar} disabled={guardando || !editTitulo.trim()}
                  className="text-xs px-4 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800">
                  {guardando ? "Guardando..." : "Guardar cambios"}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditando(true)}
                  className="text-xs px-4 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 font-medium">
                  ✏️ Editar tarea
                </button>
                <button onClick={onClose}
                  className="text-xs px-4 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100">
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers de UI ─────────────────────────────────────────────

function ETIQUETA_ESTADO(estado: string): string {
  return ESTADO_DEV_OPCIONES.find((o) => o.estado === estado)?.titulo ?? estado;
}

function ESTADO_COLOR(estado: string): string {
  switch (estado) {
    case "en_proceso": return "bg-primary-100 text-primary-700";
    case "completada": return "bg-success-200 text-success-800";
    default: return "bg-neutral-100 text-neutral-700";
  }
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-600 block mb-1">{etiqueta}</label>
      {children}
    </div>
  );
}

function Info({ etiqueta, valor, icono }: { etiqueta: string; valor: string; icono: string }) {
  return (
    <div className="bg-neutral-100 rounded-lg p-2.5">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide">{etiqueta}</p>
      <p className="text-sm text-neutral-800 font-medium mt-0.5">{icono} {valor}</p>
    </div>
  );
}
