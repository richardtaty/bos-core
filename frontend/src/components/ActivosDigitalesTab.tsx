import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { ActivoDigital, TipoActivoDigital } from "../types";

/**
 * Pestaña "Activos digitales" de la ficha de un cliente (persona).
 *
 * Un cliente puede tener N activos (landings, funnels, thank you pages, formularios,
 * dominios, automatizaciones…). Es uno-a-muchos contra la persona: cada tarjeta es un
 * activo de la tabla `activos_digitales`, jamás campos sueltos como landing_url.
 *
 * Reutiliza el sistema visual de la ficha (tarjetas blancas bg-neutral-50, modales y
 * botones del CRM, feedback inline). No rediseña nada de la ficha.
 */

const TIPOS: TipoActivoDigital[] = [
  "Landing",
  "Funnel",
  "Thank You Page",
  "Formulario",
  "Dominio",
  "Automatización",
  "Otro",
];

// La plataforma es texto libre en la base para permitir "Otro → texto personalizado".
// El dropdown muestra la lista; al elegir "Otro" se pide el texto.
const PLATAFORMAS = ["Kajabi", "GoHighLevel", "Systeme.io", "WordPress", "ClickFunnels", "Webflow", "Otro"];

type Filtro = "todos" | "activos" | "inactivos";

function conProtocolo(url: string): string {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function esUrlValida(url: string): boolean {
  const candidata = url.includes("://") ? url : `https://${url}`;
  try {
    const parsed = new URL(candidata);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

function urlDe(a: ActivoDigital): string {
  return a.url ?? "";
}

function payloadDeActivoExistente(a: ActivoDigital, sobreescribe: { activo?: boolean } = {}) {
  return {
    nombre: a.nombre,
    url: urlDe(a),
    tipo: a.tipo,
    plataforma: a.plataforma ?? "",
    objetivo: a.objetivo ?? "",
    notas: a.notas ?? "",
    activo: sobreescribe.activo ?? a.activo,
  };
}

const inputCls =
  "w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm placeholder:text-neutral-400";
const labelCls = "text-xs font-medium text-neutral-600 block mb-1";

// ── Modal compacto de crear / editar ─────────────────────────────────────────
function ActivoDigitalModal({
  personaId,
  activo, // null → crear
  onClose,
  onGuardado,
}: {
  personaId: string;
  activo: ActivoDigital | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esEdicion = activo !== null;
  const [nombre, setNombre] = useState(activo?.nombre ?? "");
  const [url, setUrl] = useState(activo?.url ?? "");
  const [tipo, setTipo] = useState<TipoActivoDigital>(activo?.tipo ?? "Landing");
  const plataformaGuardada = activo?.plataforma ?? "";
  const plataformaEsDeLaLista = PLATAFORMAS.includes(plataformaGuardada) || !plataformaGuardada;
  const [plataforma, setPlataforma] = useState(plataformaEsDeLaLista ? plataformaGuardada : "Otro");
  const [plataformaOtro, setPlataformaOtro] = useState(plataformaEsDeLaLista ? "" : plataformaGuardada);
  const [objetivo, setObjetivo] = useState(activo?.objetivo ?? "");
  const [estado, setEstado] = useState(activo?.activo ?? true);
  const [notas, setNotas] = useState(activo?.notas ?? "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [guardando, setGuardando] = useState(false);

  const urlEsObligatoria = tipo !== "Otro";

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = "El nombre es obligatorio.";
    const u = url.trim();
    if (urlEsObligatoria && !u) e.url = "Agrega la URL del activo (ej. https://cliente.com/pagina).";
    else if (u && !esUrlValida(u)) e.url = "URL no válida. Escribe algo como https://cliente.com/pagina.";
    if (plataforma === "Otro" && !plataformaOtro.trim()) e.plataforma = "Escribe la plataforma o elige una de la lista.";
    return e;
  }

  function textoVacio(s: string): string | undefined {
    const t = s.trim();
    return t || undefined;
  }

  async function guardar() {
    const e = validar();
    if (Object.keys(e).length > 0) {
      setErrores(e);
      return;
    }
    setGuardando(true);
    setErrorGeneral("");
    try {
      const body = {
        nombre: nombre.trim(),
        url: textoVacio(url),
        tipo,
        plataforma: textoVacio(plataforma === "Otro" ? plataformaOtro : plataforma),
        objetivo: textoVacio(objetivo),
        activo: estado,
        notas: textoVacio(notas),
      };
      if (esEdicion) {
        await api.actualizarActivoDigital(personaId, activo.id, body);
      } else {
        await api.crearActivoDigital(personaId, body);
      }
      onGuardado();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && typeof err.payload === "object" && err.payload) {
        const fe = (err.payload as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
        const mapeados: Record<string, string> = {};
        for (const [k, v] of Object.entries(fe)) mapeados[k] = v[0];
        if (Object.keys(mapeados).length > 0) setErrores(mapeados);
        else setErrorGeneral(String(err.payload));
      } else {
        setErrorGeneral(err instanceof Error ? err.message : "No se pudo guardar el activo.");
      }
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!activo) return;
    if (!confirm("¿Eliminar este activo digital? Esta acción no se puede deshacer.")) return;
    setGuardando(true);
    setErrorGeneral("");
    try {
      await api.eliminarActivoDigital(personaId, activo.id);
      onGuardado();
      onClose();
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : "No se pudo eliminar el activo.");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-neutral-50 rounded-xl shadow-xl border border-neutral-200 p-6 max-h-[90vh] overflow-y-auto animate-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">
            {esEdicion ? "Editar activo digital" : "Añadir activo digital"}
          </h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nombre *</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Código Financiero"
                className={inputCls}
                autoFocus
              />
              {errores.nombre && <p className="text-[11px] text-danger-600 mt-1">{errores.nombre}</p>}
            </div>
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoActivoDigital)} className={inputCls}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>URL {urlEsObligatoria ? "*" : "(opcional)"}</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={tipo === "Dominio" ? "https://dominio.com" : "https://cliente.com/pagina"}
              className={inputCls}
            />
            {errores.url && <p className="text-[11px] text-danger-600 mt-1">{errores.url}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Plataforma</label>
              <select
                value={plataforma}
                onChange={(e) => {
                  setPlataforma(e.target.value);
                  if (e.target.value !== "Otro") setErrores((prev) => ({ ...prev, plataforma: "" }));
                }}
                className={inputCls}
              >
                <option value="">Sin plataforma</option>
                {PLATAFORMAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {errores.plataforma && <p className="text-[11px] text-danger-600 mt-1">{errores.plataforma}</p>}
            </div>
            <div>
              <label className={labelCls}>Objetivo</label>
              <input
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                placeholder="Ej: Captación de leads"
                className={inputCls}
              />
            </div>
          </div>

          {plataforma === "Otro" && (
            <div>
              <label className={labelCls}>¿Cuál plataforma?</label>
              <input
                value={plataformaOtro}
                onChange={(e) => setPlataformaOtro(e.target.value)}
                placeholder="Nombre de la plataforma"
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Estado</label>
            <button
              type="button"
              onClick={() => setEstado((v) => !v)}
              aria-pressed={estado}
              title={estado ? "Activo" : "Inactivo"}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                estado ? "bg-success-500" : "bg-neutral-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  estado ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className={`ml-2 text-xs font-medium ${estado ? "text-success-700" : "text-neutral-500"}`}>
              {estado ? "Activo" : "Inactivo"}
            </span>
          </div>

          <div>
            <label className={labelCls}>Notas (opcional)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Información adicional…" className={`${inputCls} resize-none`} />
          </div>

          {errorGeneral && <p className="text-xs text-danger-600 bg-danger-50 rounded-lg px-3 py-2">{errorGeneral}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 mt-5">
          {esEdicion ? (
            <button
              type="button"
              onClick={() => void eliminar()}
              disabled={guardando}
              className="text-xs text-danger-600 hover:underline disabled:opacity-50"
            >
              Eliminar activo
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              className="px-4 py-2 text-sm rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando}
              className="px-4 py-2 text-sm rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:opacity-50"
            >
              {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Añadir activo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta de un activo ─────────────────────────────────────────────────────
function ActivoCard({
  a,
  puedeEditar,
  copiado,
  onAlternar,
  onCopiar,
  onEditar,
}: {
  a: ActivoDigital;
  puedeEditar: boolean;
  copiado: boolean;
  onAlternar: (a: ActivoDigital) => void;
  onCopiar: (a: ActivoDigital) => void;
  onEditar: (a: ActivoDigital) => void;
}) {
  const url = urlDe(a);
  const urlParaAbrir = a.url ? conProtocolo(a.url) : null;

  return (
    <div className={`bg-neutral-50 border border-neutral-200 rounded-xl p-4 flex flex-col gap-2.5 ${a.activo ? "" : "opacity-80"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 truncate" title={a.nombre}>
            {a.nombre}
          </p>
          <p className="text-[11px] text-neutral-500">{a.tipo}</p>
        </div>
        {puedeEditar ? (
          <button
            type="button"
            onClick={() => onAlternar(a)}
            aria-pressed={a.activo}
            title={a.activo ? "Activo — clic para inactivar" : "Inactivo — clic para activar"}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              a.activo ? "bg-success-500" : "bg-neutral-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                a.activo ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        ) : (
          <span
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
              a.activo ? "bg-success-100 text-success-700" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {a.activo ? "Activa" : "Inactiva"}
          </span>
        )}
      </div>

      {urlParaAbrir ? (
        <a href={urlParaAbrir} target="_blank" rel="noopener noreferrer" title={urlParaAbrir} className="text-xs text-primary-600 hover:underline truncate">
          {urlParaAbrir}
        </a>
      ) : (
        <p className="text-xs text-neutral-400">Sin URL</p>
      )}

      {(a.plataforma || a.objetivo) && (
        <div className="flex flex-col gap-0.5 text-xs text-neutral-600">
          {a.plataforma && <p>Plataforma: {a.plataforma}</p>}
          {a.objetivo && <p>Objetivo: {a.objetivo}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-auto pt-2 border-t border-neutral-100">
        {url ? (
          <>
            <a href={urlParaAbrir ?? "#"} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-medium">
              Abrir página ↗
            </a>
            <button type="button" onClick={() => onCopiar(a)} className="text-neutral-600 hover:underline">
              Copiar enlace
            </button>
          </>
        ) : (
          <span className="text-neutral-400">Sin enlace para abrir</span>
        )}
        {puedeEditar && (
          <button type="button" onClick={() => onEditar(a)} className="text-neutral-600 hover:underline">
            Editar
          </button>
        )}
        {copiado && <span className="text-xs text-success-600 font-medium">Enlace copiado ✓</span>}
      </div>
    </div>
  );
}

// ── Pestaña principal ────────────────────────────────────────────────────────
export function ActivosDigitalesTab({ personaId, puedeEditar }: { personaId: string; puedeEditar: boolean }) {
  const [activos, setActivos] = useState<ActivoDigital[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [modal, setModal] = useState<{ crear: boolean; activo?: ActivoDigital } | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const cargar = async () => {
    setErrorCarga("");
    try {
      setActivos(await api.listarActivosDigitales(personaId));
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : "No se pudieron cargar los activos.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, [personaId]);

  async function copiarEnlace(a: ActivoDigital) {
    const url = conProtocolo(urlDe(a));
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback para contextos sin permiso de clipboard.
      const input = document.createElement("textarea");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopiadoId(a.id);
    window.setTimeout(() => setCopiadoId((prev) => (prev === a.id ? null : prev)), 2000);
  }

  async function alternarEstado(a: ActivoDigital) {
    // Optimista: pinta al instante y revierte si el backend rechaza.
    setActivos((prev) => prev.map((x) => (x.id === a.id ? { ...x, activo: !x.activo } : x)));
    try {
      await api.actualizarActivoDigital(personaId, a.id, payloadDeActivoExistente(a, { activo: !a.activo }));
    } catch (err) {
      setActivos((prev) => prev.map((x) => (x.id === a.id ? { ...x, activo: a.activo } : x)));
      setErrorCarga(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
    }
  }

  const visibles = activos.filter((a) => filtro === "todos" || (filtro === "activos") === a.activo);
  const activosGrupo = visibles.filter((a) => a.activo);
  const inactivosGrupo = visibles.filter((a) => !a.activo);

  const FILTROS: { k: Filtro; label: string }[] = [
    { k: "todos", label: "Todos" },
    { k: "activos", label: "Activos" },
    { k: "inactivos", label: "Inactivos" },
  ];

  const renderCard = (a: ActivoDigital) => (
    <ActivoCard
      key={a.id}
      a={a}
      puedeEditar={puedeEditar}
      copiado={copiadoId === a.id}
      onAlternar={(x) => void alternarEstado(x)}
      onCopiar={(x) => void copiarEnlace(x)}
      onEditar={(x) => setModal({ crear: false, activo: x })}
    />
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Activos digitales</h2>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => setModal({ crear: true })}
            className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600"
          >
            + Añadir activo
          </button>
        )}
      </div>

      {cargando ? (
        <p className="text-sm text-neutral-500">Cargando activos…</p>
      ) : errorCarga ? (
        <div className="text-center py-10">
          <p className="text-sm text-danger-600 mb-3">{errorCarga}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100"
          >
            Reintentar
          </button>
        </div>
      ) : activos.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-3">🌐</p>
          <p className="text-sm text-neutral-500 mb-4">No hay activos digitales registrados.</p>
          {puedeEditar && (
            <button
              type="button"
              onClick={() => setModal({ crear: true })}
              className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600"
            >
              + Añadir primer activo
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 mb-4">
            {FILTROS.map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setFiltro(f.k)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  filtro === f.k
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:bg-neutral-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-8">
              {filtro === "activos"
                ? "No hay activos activos."
                : filtro === "inactivos"
                  ? "No hay activos inactivos."
                  : "No hay activos digitales registrados."}
            </p>
          ) : filtro === "todos" ? (
            <div className="flex flex-col gap-5">
              {activosGrupo.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">
                    Activos ({activosGrupo.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{activosGrupo.map(renderCard)}</div>
                </div>
              )}
              {inactivosGrupo.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">
                    Inactivos ({inactivosGrupo.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{inactivosGrupo.map(renderCard)}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{visibles.map(renderCard)}</div>
          )}
        </>
      )}

      {modal && (
        <ActivoDigitalModal
          personaId={personaId}
          activo={modal.crear ? null : (modal.activo ?? null)}
          onClose={() => setModal(null)}
          onGuardado={() => void cargar()}
        />
      )}
    </div>
  );
}
