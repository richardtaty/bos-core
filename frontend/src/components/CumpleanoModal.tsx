import { FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Cumpleano, Persona } from "../types";
import { NOMBRES_MESES } from "../lib/cumpleanos";

// ─── 🎂 Formulario de un cumpleaños (nuevo o edición) ──────────────────────────
// Un registro = UNA persona. Puede estar vinculado a un contacto del CRM (lo
// normal: el nombre y los datos de contacto se leen en vivo de su ficha) o ser un
// cumpleaños suelto (solo nombre + día/mes [+ año opcional]). Al elegir un
// contacto que ya tiene fecha de nacimiento, día/mes/año se autocompletan.

interface ContactoSeleccion {
  id: string;
  nombre: string;
  fechaNacimiento?: string | null;
}

interface Props {
  /** Si viene, es modo edición; si no, modo alta. */
  cumpleano?: Cumpleano | null;
  onClose: () => void;
  onGuardado: () => void;
}

const MES_MAX_DIAS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ANIO_MIN = 1800;
const ANIO_MAX = new Date().getFullYear();

const CLASE_CAMPO =
  "w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30";
const CLASE_ETIQUETA = "block text-xs text-neutral-600 mb-1";

function erroresDe(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as { fieldErrors?: Record<string, string[]> };
  const salida: Record<string, string> = {};
  if (p.fieldErrors) {
    for (const [campo, lista] of Object.entries(p.fieldErrors)) {
      if (lista?.[0]) salida[campo] = lista[0];
    }
  }
  return salida;
}

/** Buscador de contactos (autocomplete). Usa la API genérica de personas para que
 *  sirva igual a Marketing, Podcast y ADMINS (no depende del módulo de Podcast). */
function BuscadorContacto({
  valor,
  onChange,
}: {
  valor: ContactoSeleccion | null;
  onChange: (c: ContactoSeleccion | null) => void;
}) {
  const [texto, setTexto] = useState(valor?.nombre ?? "");
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState<Persona[]>([]);
  const secuencia = useRef(0);

  const trim = texto.trim();

  useEffect(() => {
    if (abierto && trim.length >= 2) {
      const miSecuencia = ++secuencia.current;
      setCargando(true);
      const timer = setTimeout(() => {
        api
          .listarPersonas({ search: trim, limite: 8 })
          .then((res) => {
            if (secuencia.current !== miSecuencia) return;
            setResultados(res.items);
          })
          .catch(() => {
            if (secuencia.current === miSecuencia) setResultados([]);
          })
          .finally(() => {
            if (secuencia.current === miSecuencia) setCargando(false);
          });
      }, 180);
      return () => clearTimeout(timer);
    }
    setResultados([]);
    setCargando(false);
  }, [trim, abierto]);

  // Si el padre cambia la selección (p. ej. se limpia el vínculo), el texto sigue el valor.
  useEffect(() => {
    setTexto(valor?.nombre ?? "");
  }, [valor]);

  function elegir(p: Persona) {
    onChange({ id: p.id, nombre: p.nombre, fechaNacimiento: p.fechaNacimiento });
    setTexto(p.nombre);
    setAbierto(false);
    setResultados([]);
  }

  function escribir(v: string) {
    setTexto(v);
    setAbierto(true);
    // Mientras el texto no es exactamente el contacto elegido, la selección queda libre.
    if (v.trim() !== (valor?.nombre ?? "")) onChange(null);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => { setAbierto(false); setResultados([]); }, 120)}
        placeholder="Busca un contacto para vincular…"
        autoComplete="off"
        className={CLASE_CAMPO}
      />
      {valor && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute inset-y-0 right-0 pr-3 text-[11px] text-danger-600 hover:text-danger-700"
          title="Quitar el vínculo a este contacto"
        >
          ✕ Quitar vínculo
        </button>
      )}

      {abierto && trim.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {cargando && (
            <div className="px-3 py-2 text-xs text-neutral-500 flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-neutral-300 border-t-primary-500 rounded-full animate-spin" />
              Buscando…
            </div>
          )}
          {!cargando && resultados.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-500">No hay un contacto con ese nombre.</div>
          )}
          {!cargando &&
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(p)}
                className="block w-full text-left px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {p.nombre}
                {p.fechaNacimiento && (
                  <span className="text-[11px] text-neutral-400 ml-2">con fecha de nacimiento</span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function CumpleanoModal({ cumpleano, onClose, onGuardado }: Props) {
  const esEdicion = !!cumpleano;
  const [nombre, setNombre] = useState(cumpleano?.nombre ?? "");
  const [contacto, setContacto] = useState<ContactoSeleccion | null>(() =>
    cumpleano?.personaId ? { id: cumpleano.personaId, nombre: cumpleano.nombre } : null,
  );
  const [mes, setMes] = useState(cumpleano?.mes ?? 0);
  const [dia, setDia] = useState(cumpleano?.dia ?? 0);
  const [anio, setAnio] = useState(cumpleano?.anio != null ? String(cumpleano.anio) : "");
  const [notas, setNotas] = useState(cumpleano?.notas ?? "");
  const [activo, setActivo] = useState(cumpleano?.activo ?? true);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorTop, setErrorTop] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Al elegir un contacto se adopta su nombre y, si tiene fecha en la ficha, su día/mes/año.
  function seleccionarContacto(c: ContactoSeleccion | null) {
    setContacto(c);
    if (!c) return;
    if (c.nombre) setNombre(c.nombre);
    const nac = c.fechaNacimiento;
    if (nac) {
      const [y, m, d] = nac.split("-").map(Number);
      if (m >= 1 && m <= 12) setMes(m);
      if (d >= 1 && d <= MES_MAX_DIAS[Math.max(1, Math.min(12, m || 1)) - 1]) setDia(d);
      if (Number.isFinite(y) && y >= ANIO_MIN && y <= ANIO_MAX) setAnio(String(y));
    }
  }

  function cambiarMes(m: number) {
    setMes(m);
    // Si el día elegido ya no cabe en el nuevo mes, se ajusta (30→febrero 28/29).
    setDia((prev) => Math.min(prev || 1, MES_MAX_DIAS[m - 1]));
  }

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!contacto && !nombre.trim()) e.nombre = "Escribe el nombre o vincula un contacto.";
    if (!mes) e.mes = "Indica el mes.";
    if (!dia) e.dia = "Indica el día.";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validar()) return;
    setEnviando(true);
    setErrores({});
    setErrorTop(null);
    try {
      const anioNum = anio.trim() ? Number(anio.trim()) : null;
      if (esEdicion) {
        await api.actualizarCumpleano(cumpleano!.id, {
          nombre: nombre.trim() || undefined,
          personaId: contacto ? contacto.id : null,
          mes,
          dia,
          anio: anioNum,
          notas: notas.trim() || null,
          activo,
        });
      } else {
        const cuerpo: Record<string, unknown> = {
          nombre: nombre.trim() || undefined,
          mes,
          dia,
          notas: notas.trim() || undefined,
        };
        if (contacto) cuerpo.personaId = contacto.id;
        // El año es opcional: no se manda vacío (el schema de alta no admite null).
        if (anioNum != null) cuerpo.anio = anioNum;
        await api.crearCumpleano(cuerpo);
      }
      onGuardado();
    } catch (err) {
      if (err instanceof ApiError && typeof err.payload === "object" && err.payload) {
        const fieldErrors = erroresDe(err.payload);
        if (Object.keys(fieldErrors).length > 0) setErrores(fieldErrors);
        else setErrorTop(String((err.payload as { error?: string }).error ?? err.message));
      } else {
        setErrorTop(err instanceof ApiError ? err.message : "No se pudo guardar.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-16 z-50 overflow-y-auto">
      <form onSubmit={onSubmit} className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-lg p-6 border border-neutral-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-800">
            {esEdicion ? "Editar cumpleaños" : "Agregar cumpleaños"}
          </h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-600">✕</button>
        </div>

        {errorTop && (
          <div className="mb-4 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{errorTop}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={CLASE_ETIQUETA}>Nombre *</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={!!contacto}
              placeholder={contacto ? "Se toma del contacto vinculado" : "Nombre de la persona"}
              className={`${CLASE_CAMPO} ${contacto ? "opacity-70 cursor-not-allowed" : ""}`}
            />
            {contacto && (
              <p className="text-[11px] text-neutral-500 mt-1">El nombre mostrado se lee de la ficha del contacto.</p>
            )}
            {errores.nombre && <p className="text-[11px] text-danger-600 mt-0.5">{errores.nombre}</p>}
          </div>

          <div className="col-span-2">
            <label className={CLASE_ETIQUETA}>Vincular a un contacto existente (opcional)</label>
            <BuscadorContacto valor={contacto} onChange={seleccionarContacto} />
            {!contacto && (
              <p className="text-[11px] text-neutral-500 mt-1">
                Si es un cliente del CRM, vincúlalo: así se lee su nombre y teléfono al momento de felicitar.
              </p>
            )}
          </div>

          <div>
            <label className={CLASE_ETIQUETA}>Día *</label>
            <select value={dia || ""} onChange={(e) => setDia(Number(e.target.value))} className={CLASE_CAMPO}>
              <option value="">Día</option>
              {Array.from({ length: mes ? MES_MAX_DIAS[mes - 1] : 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {errores.dia && <p className="text-[11px] text-danger-600 mt-0.5">{errores.dia}</p>}
          </div>

          <div>
            <label className={CLASE_ETIQUETA}>Mes *</label>
            <select value={mes || ""} onChange={(e) => cambiarMes(Number(e.target.value))} className={CLASE_CAMPO}>
              <option value="">Mes</option>
              {NOMBRES_MESES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            {errores.mes && <p className="text-[11px] text-danger-600 mt-0.5">{errores.mes}</p>}
          </div>

          <div className="col-span-2">
            <label className={CLASE_ETIQUETA}>Año de nacimiento (opcional)</label>
            <input
              type="number"
              min={ANIO_MIN}
              max={ANIO_MAX}
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              placeholder="Ej. 1990"
              className={CLASE_CAMPO}
            />
            {!anio.trim() && (
              <p className="text-[11px] text-neutral-500 mt-1">Sin año no se muestra la edad, solo la fecha.</p>
            )}
          </div>

          <div className="col-span-2">
            <label className={CLASE_ETIQUETA}>Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Regalo, preferencia, algo que recordar…"
              className={CLASE_CAMPO}
            />
          </div>

          {esEdicion && (
            <div className="col-span-2 flex items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                id="cumple-activo"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="accent-primary-500 w-4 h-4"
              />
              <label htmlFor="cumple-activo" className="text-neutral-700">Registro activo (aparece en la lista y genera recordatorio)</label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-neutral-200 text-neutral-600">
            Cancelar
          </button>
          <button
            disabled={enviando}
            className="text-sm px-4 py-2 rounded-lg bg-primary-500 text-white font-medium disabled:bg-primary-100 disabled:text-primary-800"
          >
            {enviando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Agregar cumpleaños"}
          </button>
        </div>
      </form>
    </div>
  );
}
