import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ActividadTimeline } from "../components/ActividadTimeline";
import type { EventoActividad } from "../types";

export function CentroActividadPage() {
  const [eventos, setEventos] = useState<EventoActividad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("todas");

  useEffect(() => {
    api.timelineGlobal(200).then((data) => {
      setEventos(data);
      setCargando(false);
    });
  }, []);

  const categorias = [...new Set(eventos.map((e) => e.categoria))].sort();
  const eventosFiltrados = filtro === "todas" ? eventos : eventos.filter((e) => e.categoria === filtro);

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">Centro de Actividad</h1>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">Todo lo que ocurre en la empresa, en tiempo real</p>

      {/* Filtros por categoría */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFiltro("todas")}
          className={`text-xs px-3 py-1.5 rounded-lg ${
            filtro === "todas" ? "bg-primary-500 text-white" : "bg-neutral-100 bg-neutral-100 text-neutral-600 text-neutral-400 hover:bg-neutral-200 hover:bg-neutral-200"
          }`}
        >
          Todas
        </button>
        {categorias.map((cat) => (
          <button
            key={cat}
            onClick={() => setFiltro(cat)}
            className={`text-xs px-3 py-1.5 rounded-lg ${
              filtro === cat ? "bg-primary-500 text-white" : "bg-neutral-100 bg-neutral-100 text-neutral-600 text-neutral-400 hover:bg-neutral-200 hover:bg-neutral-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-sm text-neutral-500">Cargando actividad...</p>
      ) : (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 max-w-3xl">
          <ActividadTimeline eventos={eventosFiltrados} />
        </div>
      )}
    </div>
  );
}
