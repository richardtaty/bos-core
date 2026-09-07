import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { RecordatorioCumpleanoActivo } from "../types";

// ─── 🎂 Grupo "Cumpleaños" de Tareas ───────────────────────────────────────────
// Recordatorios COMPARTIDOS que entran en la ventana de aviso (7 días). No es una
// tarea por persona ni por usuario: es UN recordatorio global (cualquiera con
// acceso puede marcarlo "Realizado" y desaparece para todos). Este componente NO
// toca la consulta de tareas normales, ni sus estados ni sus permisos: es un panel
// independiente que el padre muestra solo a quienes tienen acceso al módulo.

export function RecordatoriosCumpleanos() {
  const [items, setItems] = useState<RecordatorioCumpleanoActivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const lista = await api.listarRecordatoriosCumpleanos();
      setItems(lista);
    } catch {
      // Si el módulo no responde, el grupo no debe romper la vista de Tareas.
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function marcarRealizado(r: RecordatorioCumpleanoActivo) {
    setMarcando(r.id);
    try {
      await api.marcarRecordatorioRealizado(r.id);
      await cargar();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "No se pudo marcar como realizado.");
    } finally {
      setMarcando(null);
    }
  }

  // Si no hay nada en la ventana de aviso, el grupo no se pinta.
  if (!cargando && items.length === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-primary-200 bg-primary-500/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-primary-800 flex items-center gap-1.5">
          🎂 Cumpleaños
          <span className="text-[11px] font-normal text-primary-600">
            {items.length === 1 ? "· 1 por felicitar" : `· ${items.length} por felicitar`}
          </span>
        </h2>
        <Link to="/cumpleanos" className="text-[11px] text-primary-600 hover:text-primary-700 font-medium">
          Ver todos →
        </Link>
      </div>

      {cargando ? (
        <p className="text-xs text-neutral-500">Cargando recordatorios…</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-lg bg-white border border-neutral-200 px-3 py-2"
            >
              <span className="text-base leading-none">🎂</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-800 truncate">
                  Felicitar a {r.nombre} — {r.etiqueta}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {r.daysUntil === 0 ? "Hoy" : `Faltan ${r.daysUntil} días`}
                </p>
              </div>
              {r.personaId && (
                <Link
                  to={`/personas/${r.personaId}`}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap"
                >
                  Ver contacto
                </Link>
              )}
              <button
                onClick={() => void marcarRealizado(r)}
                disabled={marcando === r.id}
                className="text-xs bg-success-500 text-white font-medium px-2.5 py-1.5 rounded-lg hover:bg-success-600 disabled:opacity-50 whitespace-nowrap"
              >
                {marcando === r.id ? "…" : "✓ Realizado"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
