import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { usePermisos } from "../hooks/usePermisos";
import type { PersonalRRHH } from "../types";

// ─── RECURSOS HUMANOS → Personal ────────────────────────────────
// La plantilla laboral real. No es una segunda base de personas: cada tarjeta es una
// persona del CRM, identificada por su userId real, así que lo que se ve aquí es lo mismo
// que en "Mi Equipo", tareas y (a futuro) Asistencia y Control de Sueldo.
//
// Fase 1: solo consulta + datos laborales básicos. Todavía NO hay asistencia, jornadas,
// horas, sueldos ni check-ins — eso corresponde a módulos posteriores.

const DEPTO_COLOR: Record<string, string> = {
  Marketing: "bg-amber-100 text-amber-700 border-amber-200",
  "Sala de OFERTAS": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Business Market Finders": "bg-sky-100 text-sky-700 border-sky-200",
  Podcast: "bg-violet-100 text-violet-700 border-violet-200",
};

type Filtro = "ACTIVO" | "INACTIVO" | "TODOS";

function badgeDepto(nombre: string): string {
  return DEPTO_COLOR[nombre] ?? "bg-neutral-100 text-neutral-600 border-neutral-200";
}

export function PersonalPage() {
  const permisos = usePermisos();
  const [personal, setPersonal] = useState<PersonalRRHH[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // Por defecto prioriza a los activos; los inactivos siguen disponibles para consulta.
  const [filtro, setFiltro] = useState<Filtro>("ACTIVO");

  useEffect(() => {
    // Sin permiso no se pide nada: la persona se va en el render de abajo. Además, mientras
    // los permisos cargan no se dispara la petición (evita un 403 innecesario).
    if (permisos.cargando || !permisos.puedeVerRRHH) return;
    void (async () => {
      try {
        setPersonal(await api.listarPersonal());
      } catch (err) {
        setError(err instanceof ApiError ? String(err.payload) : "No se pudo cargar la plantilla.");
      } finally {
        setCargando(false);
      }
    })();
  }, [permisos.cargando, permisos.puedeVerRRHH]);

  // Búsqueda simple por nombre, departamento o cargo (en memoria: la plantilla es pequeña).
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return personal.filter((p) => {
      if (filtro !== "TODOS" && p.estadoLaboral !== filtro) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.cargo ?? "").toLowerCase().includes(q) ||
        p.departamentos.some((d) => d.nombre.toLowerCase().includes(q))
      );
    });
  }, [personal, busqueda, filtro]);

  const totalActivos = personal.filter((p) => p.estadoLaboral === "ACTIVO").length;

  // Protección de UI: si el usuario no tiene acceso, fuera. El backend además responde 403.
  if (!permisos.cargando && !permisos.puedeVerRRHH) return <Navigate to="/mi-dia" replace />;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">Personal</h1>
          <p className="text-sm text-neutral-500">
            Plantilla de la empresa · {totalActivos} activo{totalActivos !== 1 ? "s" : ""}
            {personal.length > totalActivos && ` · ${personal.length - totalActivos} inactivo${personal.length - totalActivos !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* ── Búsqueda y filtro ────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, departamento o cargo…"
          className="flex-1 min-w-[240px] border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex gap-1">
          {(["ACTIVO", "INACTIVO", "TODOS"] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`text-xs px-3 py-2 rounded-lg border font-medium transition-colors ${
                filtro === f
                  ? "bg-primary-500/15 text-primary-700 border-primary-500/30"
                  : "bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100"
              }`}
            >
              {f === "TODOS" ? "Todos" : f === "ACTIVO" ? "Activos" : "Inactivos"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {cargando && <p className="text-sm text-neutral-500 py-8 text-center">Cargando la plantilla…</p>}

      {/* ── Plantilla ────────────────────────────────── */}
      <div className="space-y-3">
        {!cargando &&
          visibles.map((p) => (
            <div
              key={p.userId}
              className={`bg-neutral-50 border border-neutral-200 rounded-xl p-4 transition-opacity ${
                p.estadoLaboral === "INACTIVO" ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/rrhh/personal/${p.userId}`}
                      className="text-sm font-semibold text-neutral-900 hover:text-primary-600 hover:underline truncate"
                    >
                      {p.nombre}
                    </Link>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        p.estadoLaboral === "ACTIVO"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-neutral-100 text-neutral-600 border-neutral-300"
                      }`}
                    >
                      {p.estadoLaboral}
                    </span>
                    {/* Aviso aparte: el acceso al CRM es otra cosa que el estado laboral. */}
                    {!p.accesoActivo && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        Sin acceso al CRM
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutral-500 mt-1">
                    {p.departamentos.length > 0 ? p.departamentos.map((d) => d.nombre).join(", ") : "Sin departamento"}
                    {p.cargo && <span className="text-neutral-600"> · {p.cargo}</span>}
                  </p>

                  {p.departamentos.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.departamentos.map((d) => (
                        <span key={d.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeDepto(d.nombre)}`}>
                          {d.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Link
                  to={`/rrhh/personal/${p.userId}`}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 transition-colors shrink-0"
                >
                  Ver ficha
                </Link>
              </div>
            </div>
          ))}
      </div>

      {!cargando && visibles.length === 0 && (
        <p className="text-sm text-neutral-600 text-center py-8">
          {busqueda.trim()
            ? "No se encontró a nadie con esa búsqueda."
            : filtro === "INACTIVO"
              ? "No hay personas inactivas."
              : "No hay personal registrado todavía."}
        </p>
      )}
    </div>
  );
}
