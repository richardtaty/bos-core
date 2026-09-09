import { useEffect, useState } from "react";
import { api } from "../api/client";
import { usePermisos } from "../hooks/usePermisos";
import { CalendarioMarketing } from "../components/CalendarioMarketing";
import type { TareaOperativa, Usuario } from "../types";

function formatearFecha(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short", weekday: "short" });
}

/**
 * 📅 Calendario de Marketing.
 * En la parte superior vive el nuevo calendario mensual de correos/contenido por proyecto
 * (cuadrícula + "+ Agregar nuevo" + detalle del día, con los 🎂 cumpleaños del mes).
 * Debajo se CONSERVA la lista anterior de contenido planificado (regla "Conservarla abajo").
 */
export function CalendarioEditorialPage() {
  const permisos = usePermisos();
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
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
      {/* Nuevo calendario mensual de correos/contenido por proyecto (+ cumpleaños). */}
      <CalendarioMarketing />

      {/* La lista anterior del Calendario Editorial se conserva debajo del nuevo calendario. */}
      <div className="my-8 border-t border-neutral-200" />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Calendario Editorial</h2>
            <p className="text-sm text-neutral-500">Planificación de contenido de Marketing</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filtroResponsable}
              onChange={(e) => setFiltroResponsable(e.target.value)}
              className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-2 py-1.5"
            >
              <option value="">Todos los responsables</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>

            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-2 py-1.5"
            >
              <option value="">Todos los estados</option>
              {["pendiente", "en_proceso", "en_revision", "completada", "cancelado"].map((e) => (
                <option key={e} value={e}>{e.replace("_", " ")}</option>
              ))}
            </select>
          </div>
        </div>

        {cargando ? (
          <p className="text-sm text-neutral-500">Cargando...</p>
        ) : fechas.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-8">
            No hay contenido planificado con los filtros actuales.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {fechas.map((fecha) => (
              <div key={fecha} className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
                <div className="bg-neutral-100 px-4 py-2 border-b border-neutral-200">
                  <p className="text-sm font-medium text-neutral-700">{formatearFecha(fecha)}</p>
                  <p className="text-xs text-neutral-500">{porFecha[fecha].length} contenido(s)</p>
                </div>
                <div className="divide-y divide-neutral-200">
                  {porFecha[fecha].map((t) => (
                    <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{t.titulo}</p>
                        <p className="text-xs text-neutral-500">{t.responsableNombre} · {t.estado.replace("_", " ")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          t.prioridad === "urgente" ? "bg-danger-100 text-danger-700" :
                          t.prioridad === "alta" ? "bg-warning-100 text-warning-700" :
                          "bg-neutral-100 text-neutral-600"
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

        {!cargando && (
          <p className="text-xs text-neutral-500 mt-4">Total: {tareasFiltradas.length} publicaciones planificadas</p>
        )}
      </section>
    </div>
  );
}
