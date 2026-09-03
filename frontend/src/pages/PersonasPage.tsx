import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Persona } from "../types";
import { NuevaPersonaModal } from "../components/NuevaPersonaModal";
import { ClientMap } from "../components/ClientMap";

const LIMITE = 25;

const ABBR_A_NOMBRE: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington D.C.", FL: "Florida",
  GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

function normalizarEstado(valor: string): string {
  const t = valor?.trim() ?? "";
  if (!t) return "";
  const upper = t.toUpperCase();
  // Si es una abreviatura de 2 letras como "FL", devolver el nombre completo
  if (upper.length === 2 && ABBR_A_NOMBRE[upper]) return ABBR_A_NOMBRE[upper];
  // Si es un nombre completo como "Florida", devolverlo normalizado
  for (const name of Object.values(ABBR_A_NOMBRE)) {
    if (name.toUpperCase() === upper) return name;
  }
  return t;
}

export function PersonasPage() {
  const [todasLasPersonas, setTodasLasPersonas] = useState<Persona[]>([]);
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  // Cargar TODAS las personas (sin paginación server-side) y filtrar en cliente
  const cargarTodas = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.listarPersonas({ limite: 9999 });
      setTodasLasPersonas(res.items);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.payload) : "Error cargando personas");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarTodas(); }, [cargarTodas]);

  // Buscar solo cuando hay texto de búsqueda (server-side porque requiere LIKE)
  const [busquedaServer, setBusquedaServer] = useState<Persona[] | null>(null);
  useEffect(() => {
    if (!search.trim()) { setBusquedaServer(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.listarPersonas({ search, limite: 9999 });
        setBusquedaServer(res.items);
      } catch { setBusquedaServer([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // La fuente de datos: búsqueda server-side o datos completos
  const fuente = busquedaServer ?? todasLasPersonas;

  // Filtrar por estado (cliente-side, soporta abreviatura y nombre completo)
  const nombreEstadoFiltro = estadoFiltro ? normalizarEstado(ABBR_A_NOMBRE[estadoFiltro] ?? estadoFiltro) : "";

  const personasFiltradas = useMemo(() => {
    if (!nombreEstadoFiltro) return fuente;
    return fuente.filter(p => normalizarEstado(p.estado) === nombreEstadoFiltro);
  }, [fuente, nombreEstadoFiltro]);

  const total = personasFiltradas.length;
  const totalPaginas = Math.ceil(total / LIMITE);
  const paginaActual = Math.min(pagina, Math.max(1, totalPaginas));
  const personasPagina = personasFiltradas.slice((paginaActual - 1) * LIMITE, paginaActual * LIMITE);

  // Reset paginación al cambiar filtro
  useEffect(() => { setPagina(1); }, [estadoFiltro, search]);

  const onStateClick = (abbr: string) => {
    setEstadoFiltro(prev => prev === abbr ? "" : abbr);
  };

  const irPagina = (p: number) => {
    if (p < 1 || p > totalPaginas || p === paginaActual) return;
    setPagina(p);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Personas</h1>
          <p className="text-sm text-neutral-600">
            {nombreEstadoFiltro
              ? `Mostrando ${total} cliente${total !== 1 ? "s" : ""} en ${ABBR_A_NOMBRE[estadoFiltro] ?? estadoFiltro}`
              : `${total} clientes en total`}
          </p>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          className="bg-primary-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary-600"
        >
          + Nuevo contacto
        </button>
      </div>

      <div className="mb-6">
        <ClientMap onStateClick={onStateClick} selectedState={estadoFiltro} />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email..."
          className="flex-1 max-w-sm border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />

        <button
          onClick={() => setEstadoFiltro("")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!estadoFiltro ? "bg-primary-500 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-100"}`}
        >
          Todos
        </button>

        {estadoFiltro && (
          <span className="inline-flex items-center gap-1.5 bg-primary-500/15 text-primary-600 text-xs font-medium px-2.5 py-1.5 rounded-full">
            📍 {estadoFiltro}
            <button onClick={() => setEstadoFiltro("")} className="hover:text-primary-800 ml-1">&times;</button>
          </span>
        )}
      </div>

      {error && <p className="text-sm text-danger-600 mb-3">{error}</p>}

      <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-neutral-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Nombre</th>
              <th className="text-left px-4 py-2.5">Etiquetas</th>
              <th className="text-left px-4 py-2.5">Ubicación</th>
              <th className="text-left px-4 py-2.5">Fuente</th>
              <th className="text-left px-4 py-2.5">Responsable</th>
            </tr>
          </thead>
          <tbody>
            {!cargando && personasPagina.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-neutral-600 py-10 text-sm">
                  Sin contactos{nombreEstadoFiltro ? ` en ${ABBR_A_NOMBRE[estadoFiltro] ?? estadoFiltro}` : " todavía"}.
                </td>
              </tr>
            )}
            {personasPagina.map((p) => (
              <tr key={p.id} className="border-t border-neutral-200 hover:bg-neutral-100">
                <td className="px-4 py-2.5">
                  <Link to={`/personas/${p.id}`} className="font-medium text-neutral-800 hover:text-primary-600">
                    {p.nombre}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 flex-wrap">
                    {p.tags.map((t) => (
                      <span key={t} className="bg-warning-500/15 text-warning-600 text-[11px] px-2 py-0.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-neutral-500">{p.ciudad}, {p.estado}</td>
                <td className="px-4 py-2.5 text-neutral-500">{p.fuente}</td>
                <td className="px-4 py-2.5 text-neutral-500">{p.responsableNombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-neutral-600">
            {(paginaActual - 1) * LIMITE + 1}–{Math.min(paginaActual * LIMITE, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => irPagina(paginaActual - 1)}
              disabled={paginaActual <= 1}
              className="px-3 py-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ‹ Anterior
            </button>
            {Array.from({ length: Math.min(7, totalPaginas) }, (_, i) => {
              let p: number;
              if (totalPaginas <= 7) { p = i + 1; }
              else if (paginaActual <= 4) { p = i + 1; }
              else if (paginaActual >= totalPaginas - 3) { p = totalPaginas - 6 + i; }
              else { p = paginaActual - 3 + i; }
              return (
                <button
                  key={p}
                  onClick={() => irPagina(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium ${p === paginaActual ? "bg-primary-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => irPagina(paginaActual + 1)}
              disabled={paginaActual >= totalPaginas}
              className="px-3 py-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Siguiente ›
            </button>
          </div>
        </div>
      )}

      {modalAbierto && (
        <NuevaPersonaModal
          onClose={() => setModalAbierto(false)}
          onCreated={() => { setModalAbierto(false); cargarTodas(); }}
        />
      )}
    </div>
  );
}
