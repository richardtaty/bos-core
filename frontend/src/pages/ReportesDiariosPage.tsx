import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { ReporteDiario, PanelLiderMarketing, Archivo } from "../types";

function fechaHoy() {
  return new Date().toISOString().split("T")[0];
}

export function ReportesDiariosPage() {
  const { usuario } = useAuth();
  const [reporte, setReporte] = useState<ReporteDiario | null>(null);
  const [panel, setPanel] = useState<PanelLiderMarketing | null>(null);
  const [cargando, setCargando] = useState(true);
  const esLider = usuario?.rol === "SUPER_ADMIN" || usuario?.rol === "ADMIN";

  // Campos del formulario
  const [tareasAsignadas, setTareasAsignadas] = useState("");
  const [tareasCompletadas, setTareasCompletadas] = useState("");
  const [tareasPendientes, setTareasPendientes] = useState("");
  const [tiempoUtilizado, setTiempoUtilizado] = useState("");
  const [enlaces, setEnlaces] = useState("");
  const [dificultades, setDificultades] = useState("");
  const [necesitaRevision, setNecesitaRevision] = useState("");
  const [apoyoRequerido, setApoyoRequerido] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);

  // ─── Archivos adjuntos ────────────────────────────
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [nuevoArchivoNombre, setNuevoArchivoNombre] = useState("");
  const [nuevoArchivoUrl, setNuevoArchivoUrl] = useState("");
  const [agregandoArchivo, setAgregandoArchivo] = useState(false);

  const cargarArchivos = useCallback(async (reporteId: string) => {
    const archs = await api.listarArchivos({ entidad: "reporte_diario", entidadId: reporteId });
    setArchivos(archs);
  }, []);

  const agregarArchivo = async () => {
    if (!nuevoArchivoNombre.trim() || !nuevoArchivoUrl.trim() || !reporte) return;
    setAgregandoArchivo(true);
    try {
      await api.crearArchivo({
        nombre: nuevoArchivoNombre.trim(),
        url: nuevoArchivoUrl.trim(),
        entidad: "reporte_diario",
        entidadId: reporte.id,
      });
      setNuevoArchivoNombre("");
      setNuevoArchivoUrl("");
      await cargarArchivos(reporte.id);
    } finally {
      setAgregandoArchivo(false);
    }
  };

  const eliminarArchivo = async (id: string) => {
    await api.eliminarArchivo(id);
    if (reporte) await cargarArchivos(reporte.id);
  };

  const cargar = useCallback(async () => {
    if (esLider) {
      const p = await api.panelLiderReportes(fechaHoy());
      setPanel(p);
    } else {
      const r = await api.miReporteHoy();
      setReporte(r);
      cargarArchivos(r.id);
      setTareasAsignadas(r.tareasAsignadas ?? "");
      setTareasCompletadas(r.tareasCompletadas ?? "");
      setTareasPendientes(r.tareasPendientes ?? "");
      setTiempoUtilizado(r.tiempoUtilizado ?? "");
      setEnlaces(r.enlaces ?? "");
      setDificultades(r.dificultades ?? "");
      setNecesitaRevision(r.necesitaRevision ?? "");
      setApoyoRequerido(r.apoyoRequerido ?? "");
      setObservaciones(r.observaciones ?? "");
    }
    setCargando(false);
  }, [esLider]);

  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async (enviar = false) => {
    if (!reporte) return;
    setGuardando(true);
    try {
      const data: Record<string, unknown> = {
        tareasAsignadas, tareasCompletadas, tareasPendientes,
        tiempoUtilizado, enlaces, dificultades, necesitaRevision,
        apoyoRequerido, observaciones,
        estado: "en_elaboracion",
      };
      await api.actualizarReporte(reporte.id, data);
      if (enviar) {
        await api.enviarReporte(reporte.id);
      }
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  // ─── Vista de líder ────────────────────────────────
  if (esLider && panel) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">Reportes diarios — Equipo</h1>
        <p className="text-sm text-neutral-500 mb-4">
          {panel.resumen.entregados}/{panel.resumen.total} entregados · {panel.resumen.pendientes} pendientes
        </p>
        <div className="flex flex-col gap-3">
          {panel.miembros.map((m) => {
            const r = panel.reportes.find((rep) => rep.usuarioId === m.usuarioId);
            const estadoColor: Record<string, string> = {
              no_iniciado: "bg-neutral-100 text-neutral-600",
              en_elaboracion: "bg-blue-100 text-blue-700",
              enviado: "bg-warning-100 text-warning-700",
              revisado: "bg-success-100 text-success-700",
              requiere_correccion: "bg-danger-100 text-danger-700",
              aprobado: "bg-success-200 text-success-800",
            };
            const estadoLabel: Record<string, string> = {
              no_iniciado: "No iniciado", en_elaboracion: "En elaboración",
              enviado: "Enviado", revisado: "Revisado",
              requiere_correccion: "Requiere corrección", aprobado: "Aprobado",
            };
            return (
              <div key={m.usuarioId} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{m.nombre}</p>
                    <p className="text-xs text-neutral-500">{m.cargo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${r ? estadoColor[r.estado] ?? "" : "bg-neutral-100 text-neutral-600"}`}>
                      {r ? estadoLabel[r.estado] ?? r.estado : "Sin reporte"}
                    </span>
                    {r && (r.estado === "enviado" || r.estado === "requiere_correccion") && (
                      <button
                        onClick={async () => { await api.revisarReporte(r.id, "aprobado"); cargar(); }}
                        className="text-[10px] bg-success-500 text-white px-2 py-1 rounded"
                      >
                        Aprobar
                      </button>
                    )}
                  </div>
                </div>
                {r?.dificultades && (
                  <p className="text-xs text-danger-600 mt-2">⚠ {r.dificultades}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Vista de integrante ────────────────────────────
  if (!reporte) return <p className="text-sm text-neutral-500">Reporte no disponible.</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Mi reporte diario</h1>
      <p className="text-sm text-neutral-500 mb-6">
        {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        {" · "}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          reporte.estado === "aprobado" ? "bg-success-100 text-success-700" :
          reporte.estado === "enviado" ? "bg-warning-100 text-warning-700" :
          "bg-neutral-100 text-neutral-600"
        }`}>
          {reporte.estado.replace("_", " ")}
        </span>
      </p>

      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 flex flex-col gap-4 max-w-2xl">
        <Campo label="Tareas asignadas para hoy" value={tareasAsignadas} onChange={setTareasAsignadas} />
        <Campo label="Tareas completadas" value={tareasCompletadas} onChange={setTareasCompletadas} />
        <Campo label="Tareas pendientes" value={tareasPendientes} onChange={setTareasPendientes} />
        <Campo label="Tiempo aproximado utilizado" value={tiempoUtilizado} onChange={setTiempoUtilizado} placeholder="Ej: 2h en diseño, 1h en revisión" />
        <Campo label="Enlaces o archivos de trabajos realizados" value={enlaces} onChange={setEnlaces} placeholder="URLs separadas por coma" />
        <Campo label="Dificultades encontradas" value={dificultades} onChange={setDificultades} />
        <Campo label="Tareas que necesitan revisión" value={necesitaRevision} onChange={setNecesitaRevision} />
        <Campo label="Apoyo que requieres del líder" value={apoyoRequerido} onChange={setApoyoRequerido} />
        <Campo label="Observaciones adicionales" value={observaciones} onChange={setObservaciones} />

        {/* ─── Archivos adjuntos ──────────────────── */}
        <div className="border-t border-neutral-200 pt-4">
          <p className="text-xs font-medium text-neutral-700 mb-2">
            📎 Archivos adjuntos ({archivos.length})
          </p>
          {archivos.length === 0 ? (
            <p className="text-xs text-neutral-500 mb-3">Sin archivos adjuntos. Agrega documentos, capturas o evidencias.</p>
          ) : (
            <div className="flex flex-col gap-1.5 mb-3">
              {archivos.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-neutral-100 rounded-lg px-3 py-2">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline truncate mr-2">
                    {a.nombre}
                  </a>
                  <button onClick={() => eliminarArchivo(a.id)} className="text-xs text-danger-500 hover:underline shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevoArchivoNombre}
              onChange={(e) => setNuevoArchivoNombre(e.target.value)}
              placeholder="Nombre del archivo"
              className="flex-1 text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-2 py-1.5"
            />
            <input
              type="url"
              value={nuevoArchivoUrl}
              onChange={(e) => setNuevoArchivoUrl(e.target.value)}
              placeholder="https://..."
              className="flex-[2] text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-2 py-1.5"
            />
            <button
              onClick={agregarArchivo}
              disabled={agregandoArchivo || !nuevoArchivoNombre.trim() || !nuevoArchivoUrl.trim()}
              className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 shrink-0"
            >
              {agregandoArchivo ? "..." : "Agregar"}
            </button>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-neutral-200">
          <button
            onClick={() => guardar(false)}
            disabled={guardando}
            className="px-4 py-2 text-sm bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar borrador"}
          </button>
          <button
            onClick={() => guardar(true)}
            disabled={guardando || reporte.estado === "aprobado"}
            className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800"
          >
            Enviar al líder
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-600 block mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}
