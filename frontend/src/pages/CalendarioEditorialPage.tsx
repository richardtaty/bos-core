import { useEffect, useState } from "react";
import { api } from "../api/client";
import { usePermisos } from "../hooks/usePermisos";
import type { TareaOperativa, Usuario } from "../types";

type Vista = "mes" | "semana" | "dia";

function formatearFecha(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short", weekday: "short" });
}

export function CalendarioEditorialPage() {
  const permisos = usePermisos();
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [vista, setVista] = useState<Vista>("mes");
  const [cargando, setCargando] = useState(true);
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  useEffect(() => {
    const cargar = async () => {
      const depto = permisos.esSuperAdmin ? undefined : (permisos.nombreDepto ?? "Marketing");
      const [todasTareas, listaUsuarios] = await Promise.all([
        api.listarTareas(depto ? { departamento: depto } : {}),
        api.listarUsuarios(),
      ]);
      setTareas(todasTareas.filter((t) => t.fechaLimite));
      setUsuarios(listaUsuarios);
      setCargando(false);
    };
    void cargar();
  }, []);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  let tareasFiltradas = tareas;
  if (filtroResponsable) tareasFiltradas = tareasFiltradas.filter((t) => t.responsableId === filtroResponsable);
  if (filtroEstado) tareasFiltradas = tareasFiltradas.filter((t) => t.estado === filtroEstado);

  // Agrupar por fecha
  const porFecha: Record<string, TareaOperativa[]> = {};
  tareasFiltradas.forEach((t) => {
    if (!t.fechaLimite) return;
    const fecha = t.fechaLimite.split("T")[0];
    if (!porFecha[fecha]) porFecha[fecha] = [];
    porFecha[fecha].push(t);
  });

  // Orden descendente por fecha (YYYY-MM-DD como texto): la más reciente arriba, luego las anteriores.
  const fechas = Object.keys(porFecha).sort().reverse();

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">Calendario Editorial</h1>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">Planificación de contenido de Marketing</p>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 bg-neutral-100 bg-neutral-100 rounded-lg p-1">
          {(["mes", "semana", "dia"] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`text-xs px-3 py-1.5 rounded-md transition ${
                vista === v ? "bg-neutral-200 shadow-sm text-neutral-900 text-neutral-800 font-medium" : "text-neutral-500 text-neutral-400"
              }`}
            >
              {v === "mes" ? "Mes" : v === "semana" ? "Semana" : "Día"}
            </button>
          ))}
        </div>

        <select
          value={filtroResponsable}
          onChange={(e) => setFiltroResponsable(e.target.value)}
          className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-200 rounded-lg px-2 py-1.5"
        >
          <option value="">Todos los responsables</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-200 rounded-lg px-2 py-1.5"
        >
          <option value="">Todos los estados</option>
          {["pendiente", "en_proceso", "en_revision", "aprobado", "publicado", "cancelado"].map((e) => (
            <option key={e} value={e}>{e.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      {/* Vista del calendario */}
      {fechas.length === 0 ? (
        <p className="text-sm text-neutral-400 text-neutral-500 text-center py-8">
          No hay contenido planificado con los filtros actuales.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {fechas.map((fecha) => (
            <div key={fecha} className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
              <div className="bg-neutral-50 bg-neutral-100 px-4 py-2 border-b border-neutral-100 border-neutral-200">
                <p className="text-sm font-medium text-neutral-700 text-neutral-300">{formatearFecha(fecha)}</p>
                <p className="text-xs text-neutral-400 text-neutral-500">{porFecha[fecha].length} contenido(s)</p>
              </div>
              <div className="divide-y divide-neutral-100 divide-neutral-200">
                {porFecha[fecha].map((t) => (
                  <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-neutral-900 text-neutral-800">{t.titulo}</p>
                      <p className="text-xs text-neutral-500 text-neutral-400">{t.responsableNombre} · {t.estado.replace("_", " ")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        t.prioridad === "urgente" ? "bg-danger-100 text-danger-700 bg-danger-500/15 text-danger-600" :
                        t.prioridad === "alta" ? "bg-warning-100 text-warning-700 bg-warning-500/15 text-warning-600" :
                        "bg-neutral-100 text-neutral-600 bg-neutral-100 text-neutral-400"
                      }`}>
                        {t.prioridad}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-neutral-400 text-neutral-500 mt-4">Total: {tareasFiltradas.length} publicaciones planificadas</p>
    </div>
  );
}
