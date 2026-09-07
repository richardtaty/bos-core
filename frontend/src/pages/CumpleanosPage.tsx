import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { usePermisos } from "../hooks/usePermisos";
import { CumpleanoModal } from "../components/CumpleanoModal";
import type { Cumpleano } from "../types";
import {
  INCREMENTO_MESES,
  MAX_MESES,
  VENTANA_MESES_INICIAL,
  diaDeMes,
  etiquetaDias,
} from "../lib/cumpleanos";

// ─── 🎂 Módulo "Próximos cumpleaños" ───────────────────────────────────────────
// Lista cronológica de cumpleaños (un registro por persona), ordenada por el próximo
// cumpleaños. La ventana empieza en 3 meses y se amplía de a 3 hasta 12 con "Mostrar
// más". Si escribes en el buscador se ignora la ventana y se buscan coincidencias por
// nombre (también encuentra registros desactivados, para poder reactivarlos).

export function CumpleanosPage() {
  const permisos = usePermisos();

  const [items, setItems] = useState<Cumpleano[]>([]);
  const [meses, setMeses] = useState(VENTANA_MESES_INICIAL);
  const [total, setTotal] = useState(0);
  const [totalActivos, setTotalActivos] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [modal, setModal] = useState<{ abierto: boolean; cumpleano?: Cumpleano }>({ abierto: false });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.listarCumpleanos({ meses, q: q.trim() || undefined });
      setItems(res.items);
      setTotal(res.total);
      setTotalActivos(res.totalActivos);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar la lista.");
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, [meses, q]);

  // Busca con pequeña espera mientras se escribe (sin pegarle al servidor en cada letra).
  useEffect(() => {
    const t = setTimeout(() => void cargar(), 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const buscar = q.trim();
  const hayMasParaMostrar = !buscar && meses < MAX_MESES;

  if (!permisos.cargando && !permisos.puedeVerCumpleanos) {
    return <Navigate to="/mi-dia" replace />;
  }

  async function alternarActivo(c: Cumpleano) {
    const accion = c.activo ? "desactivar" : "reactivar";
    const ok = window.confirm(
      c.activo
        ? `¿Desactivar el cumpleaños de ${c.nombre}? Dejará de aparecer en la lista y no generará recordatorio. No se borra nada.`
        : `¿Reactivar el cumpleaños de ${c.nombre}?`,
    );
    if (!ok) return;
    try {
      if (accion === "desactivar") await api.desactivarCumpleano(c.id);
      else await api.activarCumpleano(c.id);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    }
  }

  const mostrandoEtiqueta = buscar
    ? `${total} resultado${total !== 1 ? "s" : ""}`
    : `Próximos ${meses} ${meses === 1 ? "mes" : "meses"} · ${total} cumpleaños`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">🎂 Próximos cumpleaños</h1>
          <p className="text-sm text-neutral-600">
            {buscar ? (
              <>Resultados para <span className="font-medium text-neutral-800">“{buscar}”</span> · {mostrandoEtiqueta}</>
            ) : (
              <>
                {mostrandoEtiqueta} en total · se recuerda con aviso una semana antes a Marketing y Podcast
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setModal({ abierto: true })}
          className="bg-primary-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary-600"
        >
          + Agregar cumpleaños
        </button>
      </div>

      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar persona…"
          className="w-full max-w-sm border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      </div>

      {error && <p className="text-sm text-danger-600 mb-3">{error}</p>}

      {cargando ? (
        <p className="text-sm text-neutral-500 py-6">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-neutral-600">
            {buscar
              ? `No hay cumpleaños que coincidan con “${buscar}”.`
              : "No hay cumpleaños próximos en este período."}
          </p>
          {!buscar && totalActivos > 0 && (
            <button
              onClick={() => setMeses((m) => Math.min(MAX_MESES, m + INCREMENTO_MESES))}
              className="mt-4 text-sm border border-neutral-200 text-neutral-700 px-4 py-2 rounded-lg hover:bg-neutral-100"
            >
              Mostrar más cumpleaños
            </button>
          )}
          {!buscar && totalActivos === 0 && (
            <p className="text-xs text-neutral-400 mt-1">
              Agrega el primer cumpleaños con el botón de arriba.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((c) => (
            <div
              key={c.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                c.activo
                  ? "bg-neutral-50 border-neutral-200"
                  : "bg-neutral-100/60 border-neutral-200 opacity-75"
              }`}
            >
              <div className="text-lg leading-none">{c.activo ? "🎂" : "💤"}</div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium text-sm ${c.activo ? "text-neutral-900" : "text-neutral-500"}`}>
                    {c.nombre}
                  </span>
                  <EtiquetaDias daysUntil={c.daysUntil} activo={c.activo} />
                  {!c.activo && (
                    <span className="text-[11px] text-neutral-400 font-medium uppercase tracking-wide">
                      Desactivado
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {diaDeMes(c.mes, c.dia)}
                  {c.edad != null && c.activo ? ` · cumple ${c.edad}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {c.personaId && (
                  <Link
                    to={`/personas/${c.personaId}`}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium px-2 py-1.5 rounded-lg hover:bg-primary-500/10"
                  >
                    Ver contacto
                  </Link>
                )}
                <button
                  onClick={() => setModal({ abierto: true, cumpleano: c })}
                  className="text-xs text-neutral-600 hover:text-neutral-800 font-medium px-2 py-1.5 rounded-lg hover:bg-neutral-100"
                >
                  Editar
                </button>
                <button
                  onClick={() => void alternarActivo(c)}
                  className={`text-xs font-medium px-2 py-1.5 rounded-lg ${
                    c.activo
                      ? "text-danger-600 hover:bg-danger-500/10"
                      : "text-success-700 hover:bg-success-500/10"
                  }`}
                  title={c.activo ? "Ocultar (no borra nada)" : "Volver a activar"}
                >
                  {c.activo ? "Desactivar" : "Reactivar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!cargando && items.length > 0 && hayMasParaMostrar && (
        <div className="text-center mt-6">
          <button
            onClick={() => setMeses((m) => Math.min(MAX_MESES, m + INCREMENTO_MESES))}
            className="text-sm border border-neutral-200 text-neutral-700 px-4 py-2 rounded-lg hover:bg-neutral-100"
          >
            Mostrar más cumpleaños
          </button>
        </div>
      )}

      {modal.abierto && (
        <CumpleanoModal
          cumpleano={modal.cumpleano ?? null}
          onClose={() => setModal({ abierto: false })}
          onGuardado={() => {
            setModal({ abierto: false });
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function EtiquetaDias({ daysUntil, activo }: { daysUntil: number; activo: boolean }) {
  if (!activo) return null;
  const etiqueta = etiquetaDias(daysUntil);
  if (daysUntil === 0) {
    return <span className="bg-primary-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">Hoy</span>;
  }
  if (daysUntil === 1) {
    return (
      <span className="bg-warning-500/15 text-warning-700 text-[11px] font-medium px-2 py-0.5 rounded-full">
        Mañana
      </span>
    );
  }
  return (
    <span className="bg-neutral-100 text-neutral-600 text-[11px] px-2 py-0.5 rounded-full">{etiqueta}</span>
  );
}
