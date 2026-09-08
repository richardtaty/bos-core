import { useEffect, useState, useCallback, useMemo, type FormEvent } from "react";
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
  // Tarea cuyo cambio de estado se está enviando (bloquea el doble envío).
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

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

  /**
   * Avanza el estado de una tarea DEV directamente desde la tarjeta (sin abrir el
   * detalle). Actualiza el mismo registro en el backend y recarga el tablero para
   * que la tarjeta se mueva de columna y los contadores se recalculen.
   */
  const avanzarDesdeTarjeta = async (tarea: TareaOperativa, siguiente: string) => {
    if (cambiandoId) return; // evita enviar dos cambios a la vez
    setCambiandoId(tarea.id);
    setError(null);
    try {
      await api.actualizarTareaDev(tarea.id, { estado: siguiente });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
      window.setTimeout(() => setError(null), 4000);
    } finally {
      setCambiandoId(null);
    }
  };

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
          {COLUMNAS.map((col) => (
            <ColumnaDev
              key={col.estado}
              config={col}
              tareas={tareasPorEstado(col.estado)}
              cambiandoId={cambiandoId}
              onAbrir={(t) => setTareaActiva(t)}
              onAvanzar={(t, siguiente) => void avanzarDesdeTarjeta(t, siguiente)}
            />
          ))}
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

// ─── Columna DEV: agrupación por día + días colapsables + filtro ──
//
// Organiza cada columna en grupos por día. La fecha de cada grupo depende del estado:
//  PENDIENTE  → created_at      (siempre se muestran todas)
//  EN PROCESO → started_at      (siempre se muestran todas)
//  FINALIZADA → completed_at    (filtro temporal Hoy / 7 días / 30 días / Rango; 7 días por defecto)
// Es presentación pura: no cambia estados, ni timestamps, ni borra nada. Cada grupo
// puede abrirse/cerrarse; por defecto HOY queda abierto y los días anteriores cerrados.

type ConfigColumna = (typeof COLUMNAS)[number];
type FiltroFinalizada = "hoy" | "7" | "30" | "rango";

const OPCIONES_FILTRO: { valor: FiltroFinalizada; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "7", etiqueta: "7 días" },
  { valor: "30", etiqueta: "30 días" },
  { valor: "rango", etiqueta: "Rango" },
];

const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
] as const;

/** Medianoche local de una fecha (referencia para agrupar por día del CRM). */
function inicioDeDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Suma/resta días sobre una fecha, manteniéndola a medianoche local. */
function sumarDias(d: Date, n: number): Date {
  const r = inicioDeDia(d);
  r.setDate(r.getDate() + n);
  return r;
}

function mismaDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Días enteros que separan a de b (positivo si a es posterior). Compara medianoches locales. */
function diasEntre(a: Date, b: Date): number {
  return Math.round((inicioDeDia(a).getTime() - inicioDeDia(b).getTime()) / 86400000);
}

function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Fecha con la que se agrupa una tarea según su columna:
 * PENDIENTE → created_at · EN PROCESO → started_at · FINALIZADA → completed_at.
 * Si el timestamp de esa etapa falta (tarea DEV previa al registro de tiempos), se usa
 * created_at como respaldo para que ninguna tarea desaparezca. Solo cambia la consulta.
 */
function fechaGrupoDeTarea(t: TareaOperativa, estado: TareaOperativa["estado"]): Date {
  let iso: string | null = t.createdAt;
  if (estado === "en_proceso") iso = t.startedAt ?? t.createdAt;
  else if (estado === "completada") iso = t.completedAt ?? t.createdAt;
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? inicioDeDia(new Date()) : inicioDeDia(d);
}

/** Texto del encabezado: "HOY · 8 SEPTIEMBRE", "AYER · 7 SEPTIEMBRE" o "6 SEPTIEMBRE". */
function etiquetaDia(d: Date, hoy: Date): string {
  const base = `${d.getDate()} ${MESES_ES[d.getMonth()]}`;
  const conAnio = d.getFullYear() !== hoy.getFullYear() ? `${base} ${d.getFullYear()}` : base;
  if (mismaDia(d, hoy)) return `HOY · ${conAnio}`;
  if (diasEntre(hoy, d) === 1) return `AYER · ${conAnio}`;
  return conAnio;
}

interface GrupoDia {
  clave: string;
  inicio: number; // medianoche local en ms → el orden siempre usa timestamps reales
  etiqueta: string;
  esHoy: boolean;
  items: TareaOperativa[];
}

/** Agrupa una lista por día (más reciente primero). Dentro del día respeta el orden del tablero. */
function agruparPorDia(lista: TareaOperativa[], estado: TareaOperativa["estado"], hoy: Date): GrupoDia[] {
  const mapa = new Map<string, GrupoDia>();
  for (const t of lista) {
    const dia = fechaGrupoDeTarea(t, estado);
    const clave = claveDia(dia);
    let grupo = mapa.get(clave);
    if (!grupo) {
      grupo = { clave, inicio: dia.getTime(), etiqueta: etiquetaDia(dia, hoy), esHoy: mismaDia(dia, hoy), items: [] };
      mapa.set(clave, grupo);
    }
    grupo.items.push(t);
  }
  return [...mapa.values()].sort((a, b) => b.inicio - a.inicio);
}

/** ¿El día del grupo cae dentro del filtro temporal elegido? (solo FINALIZADA, solo visual). */
function diaCaeEnFiltro(grupo: GrupoDia, hoy: Date, filtro: FiltroFinalizada, desde: string, hasta: string): boolean {
  const inicio = grupo.inicio;
  switch (filtro) {
    case "hoy": return grupo.esHoy;
    case "7": return inicio >= sumarDias(hoy, -6).getTime(); // HOY inclusive = 7 días corridos
    case "30": return inicio >= sumarDias(hoy, -29).getTime();
    case "rango": {
      if (!desde && !hasta) return true;
      let dentro = true;
      if (desde) dentro = dentro && inicio >= new Date(`${desde}T00:00:00`).getTime();
      if (hasta) dentro = dentro && inicio <= new Date(`${hasta}T00:00:00`).getTime();
      return dentro;
    }
    default: return false;
  }
}

function ColumnaDev({
  config,
  tareas,
  cambiandoId,
  onAbrir,
  onAvanzar,
}: {
  config: ConfigColumna;
  tareas: TareaOperativa[];
  cambiandoId: string | null;
  onAbrir: (t: TareaOperativa) => void;
  onAvanzar: (t: TareaOperativa, siguiente: string) => void;
}) {
  const esFinalizada = config.estado === "completada";
  // El filtro vive SOLO en la columna FINALIZADA. Valor inicial: 7 días.
  const [filtro, setFiltro] = useState<FiltroFinalizada>("7");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  // Días que el usuario plegó (true = cerrado). La clave incluye la columna para que
  // cada columna recuerde los suyos sin mezclarse. Los días nuevos toman el valor por defecto.
  const [cerrados, setCerrados] = useState<Record<string, boolean>>({});

  const hoy = useMemo(() => inicioDeDia(new Date()), []);

  const grupos = useMemo(() => agruparPorDia(tareas, config.estado, hoy), [tareas, config.estado, hoy]);

  // PENDIENTE y EN PROCESO: se muestran todos los días (sin límite temporal).
  // FINALIZADA: solo los días que caen en el periodo elegido.
  const gruposVisibles = useMemo(
    () => (esFinalizada ? grupos.filter((g) => diaCaeEnFiltro(g, hoy, filtro, desde, hasta)) : grupos),
    [esFinalizada, grupos, hoy, filtro, desde, hasta],
  );

  const hayHoyVisible = gruposVisibles.some((g) => g.esHoy);

  /** Valor inicial de cada grupo: en FINALIZADA HOY abierto y el resto cerrado (si no hay
   *  HOY en el periodo, se abre el día más reciente). En las columnas activas todo abierto,
   *  para que una tarea pendiente/en proceso antigua nunca quede oculta. */
  function cerradoPorDefecto(g: GrupoDia, indice: number): boolean {
    if (!esFinalizada) return false;
    if (hayHoyVisible) return !g.esHoy;
    return indice !== 0;
  }

  function estaCerrado(g: GrupoDia, indice: number): boolean {
    return cerrados[`${config.estado}:${g.clave}`] ?? cerradoPorDefecto(g, indice);
  }

  function alternar(g: GrupoDia, indice: number) {
    const k = `${config.estado}:${g.clave}`;
    setCerrados((prev) => ({ ...prev, [k]: !estaCerrado(g, indice) }));
  }

  return (
    <div className="flex flex-col">
      {/* Encabezado de la columna: el contador es el total REAL (aunque el filtro
          muestre solo un periodo). */}
      <div className={`flex items-center justify-between rounded-t-xl px-3 py-2 border ${config.header}`}>
        <span className="text-xs font-semibold tracking-wide">{config.titulo}</span>
        <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full text-neutral-600 font-medium">
          {tareas.length}
        </span>
      </div>

      <div className="flex-1 bg-neutral-50 border border-neutral-200 border-t-0 rounded-b-xl p-2 flex flex-col gap-2 min-h-[120px]">
        {/* Filtro temporal, solo en FINALIZADA. Puramente visual. */}
        {esFinalizada && (
          <div className="flex flex-col gap-1">
            <div className="flex gap-1 flex-wrap">
              {OPCIONES_FILTRO.map((op) => {
                const activo = filtro === op.valor;
                return (
                  <button
                    key={op.valor}
                    type="button"
                    onClick={() => setFiltro(op.valor)}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      activo
                        ? "bg-neutral-800 text-white"
                        : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    {op.etiqueta}
                  </button>
                );
              })}
            </div>
            {filtro === "rango" && (
              <div className="flex flex-wrap items-center gap-1 text-[10px] text-neutral-600">
                <label className="font-medium">Desde</label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="border border-neutral-200 bg-white rounded-md px-1.5 py-1 text-[10px] text-neutral-700"
                />
                <label className="font-medium">Hasta</label>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="border border-neutral-200 bg-white rounded-md px-1.5 py-1 text-[10px] text-neutral-700"
                />
              </div>
            )}
          </div>
        )}

        {tareas.length === 0 ? (
          <p className="text-xs text-neutral-400 text-center py-6">Sin tareas</p>
        ) : gruposVisibles.length === 0 ? (
          <p className="text-xs text-neutral-400 text-center py-6">Sin tareas en este periodo</p>
        ) : (
          gruposVisibles.map((g, i) => {
            const cerrado = estaCerrado(g, i);
            return (
              <div key={g.clave} className="flex flex-col gap-1.5">
                {/* Encabezado del día: fecha + cantidad + abierto/cerrado. Clic lo pliega o despliega. */}
                <button
                  type="button"
                  onClick={() => alternar(g, i)}
                  title={cerrado ? "Mostrar este día" : "Ocultar este día"}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[10px] font-semibold border transition-colors ${
                    g.esHoy
                      ? "bg-neutral-800 text-white border-neutral-800 hover:bg-neutral-700"
                      : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <span className="truncate">{g.etiqueta}</span>
                  <span className={`flex items-center gap-1.5 shrink-0 ${g.esHoy ? "text-white/70" : "text-neutral-400"}`}>
                    <span>{g.items.length} {g.items.length === 1 ? "tarea" : "tareas"}</span>
                    <span aria-hidden>{cerrado ? "▶" : "▼"}</span>
                  </span>
                </button>
                {!cerrado && (
                  <div className="flex flex-col gap-2">
                    {g.items.map((t) => (
                      <TarjetaDev key={t.id} tarea={t} cambiandoId={cambiandoId} onAbrir={onAbrir} onAvanzar={onAvanzar} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Tarjeta de una tarea DEV (extraída del tablero para reutilizarla en los grupos de día). */
function TarjetaDev({
  tarea,
  cambiandoId,
  onAbrir,
  onAvanzar,
}: {
  tarea: TareaOperativa;
  cambiandoId: string | null;
  onAbrir: (t: TareaOperativa) => void;
  onAvanzar: (t: TareaOperativa, siguiente: string) => void;
}) {
  const avance = ACCION_AVANCE(tarea.estado);
  const ocupada = cambiandoId === tarea.id;
  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-sm hover:border-primary-300 hover:shadow">
      {/* Zona de información: clic abre el detalle (como siempre) */}
      <button
        type="button"
        onClick={() => onAbrir(tarea)}
        className="w-full text-left p-2.5 cursor-pointer"
        title="Abrir detalle"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORIDAD_DOT[tarea.prioridad] ?? "bg-neutral-300"}`} title={tarea.prioridad} />
          <p className="text-xs font-medium text-neutral-900 truncate">{tarea.titulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
          {tarea.fechaLimite && <span>📅 {new Date(tarea.fechaLimite).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>}
          <span>👤 {tarea.responsableNombre}</span>
        </div>
      </button>
      {/* Acción rápida: avanza al siguiente estado sin abrir el detalle.
          La tarea FINALIZADA no tiene acción de avance. */}
      {avance && (
        <button
          type="button"
          disabled={cambiandoId !== null}
          onClick={() => onAvanzar(tarea, avance.estado)}
          className={`w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-b-lg border-t border-neutral-100 transition-colors ${
            ocupada ? "text-neutral-400 cursor-wait" : avance.clases
          }`}
        >
          {ocupada ? "Guardando..." : avance.etiqueta}
        </button>
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

              {/* Historial de tiempos: muestra SOLO los estados que ya ocurrieron.
                  Creada siempre existe; En proceso/Finalizada solo si hay timestamp
                  registrado (las tareas previas a esta función no tienen y no se inventan). */}
              <div className="border-t border-neutral-200 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-2">⏱️ Tiempos</p>
                <div className="flex flex-col gap-1.5 text-xs">
                  <TiempoFila etiqueta="Creada" fecha={tarea.createdAt} dot="bg-neutral-400" />
                  {tarea.startedAt && <TiempoFila etiqueta="En proceso" fecha={tarea.startedAt} dot="bg-primary-500" />}
                  {tarea.completedAt && <TiempoFila etiqueta="Finalizada" fecha={tarea.completedAt} dot="bg-success-500" />}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 bg-neutral-100 rounded-b-xl">
          <span className="text-[10px] text-neutral-500">
            Creada el {formatoFechaHora(tarea.createdAt)}
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

/**
 * Acción de avance que muestra cada tarjeta DEV según su estado actual.
 * El flujo es siempre PENDIENTE → EN PROCESO → FINALIZADA; una tarea ya
 * FINALIZADA no ofrece acción de avance (devuelve null).
 */
function ACCION_AVANCE(estado: string): { estado: string; etiqueta: string; clases: string } | null {
  switch (estado) {
    case "pendiente":
      return { estado: "en_proceso", etiqueta: "→ En proceso", clases: "text-primary-600 hover:bg-primary-50" };
    case "en_proceso":
      return { estado: "completada", etiqueta: "✓ Finalizar", clases: "text-success-700 hover:bg-success-50" };
    default:
      return null; // FINALIZADA (y cualquier estado inesperado): sin botón de avance
  }
}

/**
 * Formatea una fecha para mostrarla en la zona horaria del CRM (la de la máquina del
 * usuario): día/mes/año sin ceros + hora en formato 12 h. Ej: "7/9/2026 · 10:42 AM".
 */
function formatoFechaHora(fecha: string | Date | null | undefined): string {
  if (!fecha) return "—";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (Number.isNaN(d.getTime())) return "—";
  const dia = d.getDate();
  const mes = d.getMonth() + 1;
  const anio = d.getFullYear();
  const hora = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dia}/${mes}/${anio} · ${hora}`;
}

/** Una fila del historial de tiempos del detalle DEV: etiqueta + fecha y hora. */
function TiempoFila({ etiqueta, fecha, dot }: { etiqueta: string; fecha: string; dot: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex items-center gap-1.5 text-neutral-600">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        {etiqueta}
      </span>
      <span className="font-medium text-neutral-800">{formatoFechaHora(fecha)}</span>
    </div>
  );
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
