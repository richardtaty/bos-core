import { useEffect, useRef, useState } from "react";
import { api, ApiError, type BusquedaInvitadosDTO, type InvitadoMatchDTO } from "../api/client";

// Valor "resuelto" del campo invitado:
//  - existente: se eligió un contacto que ya está en el CRM (se guarda su ID).
//  - nuevo:     el usuario eligió «+ Agregar»; se crea la ficha al guardar.
export type ValorInvitado =
  | { tipo: "existente"; id: string; nombre: string }
  | { tipo: "nuevo"; nombre: string };

type Accion =
  | { tipo: "persona"; persona: InvitadoMatchDTO }
  | { tipo: "nuevo" };

const CLASE_INPUT =
  "w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm pr-9";

interface Props {
  valor: ValorInvitado | null;
  onChange: (v: ValorInvitado | null) => void;
  disabled?: boolean;
}

export function InvitadoCombobox({ valor, onChange, disabled }: Props) {
  // El texto del input refleja el valor comprometido (o lo que va escribiendo).
  const [texto, setTexto] = useState<string>(() => (valor ? valor.nombre : ""));
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [resultado, setResultado] = useState<BusquedaInvitadosDTO | null>(null);
  const [indice, setIndice] = useState<number>(0);
  const secuencia = useRef(0); // ignora respuestas fuera de orden
  const inputRef = useRef<HTMLInputElement>(null);

  const trimTexto = texto.trim();
  const esNuevoComprometido = valor?.tipo === "nuevo";

  useEffect(() => {
    if (disabled) return;
    if (!abierto) return;
    if (trimTexto.length === 0) {
      setResultado(null);
      setCargando(false);
      setErrorBusqueda(null);
      return;
    }
    // Los que tienen menos de 2 letras no se buscan todavía.
    if (trimTexto.length < 2) {
      setResultado(null);
      setCargando(false);
      return;
    }
    const miSecuencia = ++secuencia.current;
    setCargando(true);
    setErrorBusqueda(null);
    const timer = setTimeout(() => {
      api
        .podcastBuscarInvitados(trimTexto)
        .then((r) => {
          if (secuencia.current !== miSecuencia) return;
          setResultado(r);
        })
        .catch((err) => {
          if (secuencia.current !== miSecuencia) return;
          setErrorBusqueda(err instanceof ApiError ? err.message : "No se pudo buscar");
        })
        .finally(() => {
          if (secuencia.current === miSecuencia) setCargando(false);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [trimTexto, abierto, disabled]);

  // Si alguien reabre el campo con un valor distinto, se refleja al escribir.
  useEffect(() => {
    if (valor) setTexto(valor.nombre);
  }, [valor]);

  function comprometer(v: ValorInvitado) {
    setTexto(v.nombre);
    setAbierto(false);
    setIndice(0);
    setResultado(null);
    setErrorBusqueda(null);
    onChange(v);
  }

  // ── Lista de acciones navegables ─────────────────────────────
  const hayExacto = resultado?.hayExacto ?? false;
  const puedeAgregarNuevo = trimTexto.length >= 2 && resultado !== null && !cargando && !hayExacto;
  const mostrarParecidos = (resultado?.parecidos.length ?? 0) > 0 && !hayExacto;

  const acciones: Accion[] = [
    ...(resultado?.coincidencias ?? []).map((persona) => ({ tipo: "persona" as const, persona })),
    ...(mostrarParecidos ? (resultado?.parecidos ?? []).map((persona) => ({ tipo: "persona" as const, persona })) : []),
    ...(puedeAgregarNuevo ? [{ tipo: "nuevo" as const }] : []),
  ];

  const coincidencias = resultado?.coincidencias ?? [];
  const parecidos = mostrarParecidos ? resultado?.parecidos ?? [] : [];

  function mostrarLista() {
    if (!abierto || trimTexto.length === 0) return false;
    // Con menos de 2 letras no se busca todavía: solo se muestra la pista.
    if (trimTexto.length < 2) return true;
    return acciones.length > 0 || cargando || errorBusqueda || resultado !== null;
  }

  function ejecutar(accion: Accion) {
    if (accion.tipo === "persona") {
      comprometer({ tipo: "existente", id: accion.persona.id, nombre: accion.persona.nombre });
    } else {
      comprometer({ tipo: "nuevo", nombre: trimTexto });
    }
  }

  function manejarTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
        setIndice(0);
        return;
      }
      if (acciones.length) setIndice((i) => (i + 1) % acciones.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (acciones.length) setIndice((i) => (i - 1 + acciones.length) % acciones.length);
    } else if (e.key === "Enter") {
      if (!abierto) {
        // Si el texto ya es exactamente el invitado comprometido, Enter no hace
        // nada aquí y el formulario envía la cita con normalidad.
        if (valor && trimTexto === valor.nombre) return;
        e.preventDefault();
        // Si ya hay resultados cargados, Enter elige la opción resaltada
        // (la primera por defecto); si no, abre la lista para buscarlos.
        if (acciones.length > 0 && !cargando) ejecutar(acciones[Math.min(indice, acciones.length - 1)]);
        else if (trimTexto.length) {
          setAbierto(true);
          setIndice(0);
        }
        return;
      }
      e.preventDefault();
      const accion = acciones[indice];
      if (accion) ejecutar(accion);
    } else if (e.key === "Escape") {
      setAbierto(false);
      setIndice(0);
    }
  }

  function manejarCambio(textoNuevo: string) {
    setTexto(textoNuevo);
    setAbierto(true);
    setIndice(0);
    // Mientras se escribe algo distinto a lo ya comprometido, la selección
    // anterior deja de valer hasta que se vuelva a elegir una opción.
    const anterior = valor?.nombre ?? "";
    if (textoNuevo.trim() !== anterior) {
      onChange(null);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={texto}
        onChange={(e) => manejarCambio(e.target.value)}
        onFocus={() => {
          // Si el campo ya muestra un invitado comprometido, enfocarlo no abre
          // la lista; hay que escribir para buscar un cambio.
          if (valor && trimTexto === valor.nombre) return;
          setAbierto(true);
          if (!resultado && trimTexto.length >= 2) setIndice(0);
        }}
        onKeyDown={manejarTeclado}
        onBlur={() => {
          // Se cierra al salir, pero se deja que el clic en una opción
          // (que evita el blur con onMouseDown) se procese primero.
          setTimeout(() => {
            setAbierto(false);
            setIndice(0);
          }, 120);
        }}
        placeholder="Escribe para buscar o agregar…"
        disabled={disabled}
        autoComplete="off"
        aria-label="Invitado"
        className={CLASE_INPUT}
      />
      {/* Indicador de chevron / de contacto nuevo a la derecha */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        {esNuevoComprometido ? (
          <span className="text-[10px] font-semibold text-primary-600">+ nuevo</span>
        ) : (
          <svg className="w-3.5 h-3.5 text-neutral-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 7l5 5 5-5" />
          </svg>
        )}
      </span>

      {mostrarLista() && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {cargando && !resultado && !errorBusqueda && (
            <div className="px-3 py-2 text-xs text-neutral-500 flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-neutral-300 border-t-primary-500 rounded-full animate-spin" />
              Buscando…
            </div>
          )}

          {errorBusqueda && <div className="px-3 py-2 text-xs text-danger-600">{errorBusqueda}</div>}

          {coincidencias.map((persona) => {
            const activo = acciones[indice]?.tipo === "persona" && acciones[indice].persona.id === persona.id;
            return (
              <button
                key={persona.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ejecutar({ tipo: "persona", persona })}
                className={`block w-full text-left px-3 py-2 text-sm ${activo ? "bg-primary-50 text-primary-900" : "text-neutral-700 hover:bg-neutral-50"}`}
              >
                {persona.nombre}
              </button>
            );
          })}

          {coincidencias.length === 0 && !cargando && !errorBusqueda && trimTexto.length >= 2 && resultado && (
            <div className="px-3 pt-2 text-xs text-neutral-500">No hay un contacto con ese nombre.</div>
          )}

          {mostrarParecidos && (
            <>
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">¿Buscabas a…?</div>
              {parecidos.map((persona) => {
                const activo = acciones[indice]?.tipo === "persona" && acciones[indice].persona.id === persona.id;
                return (
                  <button
                    key={persona.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => ejecutar({ tipo: "persona", persona })}
                    className={`block w-full text-left px-3 py-2 text-sm ${activo ? "bg-primary-50 text-primary-900" : "text-neutral-700 hover:bg-neutral-50"}`}
                  >
                    {persona.nombre}
                  </button>
                );
              })}
            </>
          )}

          {puedeAgregarNuevo && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => ejecutar({ tipo: "nuevo" })}
              className={`block w-full text-left px-3 py-2 text-sm ${
                acciones[indice]?.tipo === "nuevo" ? "bg-primary-50 text-primary-900" : "text-primary-600 hover:bg-neutral-50"
              }`}
            >
              <span className="font-medium">+ Agregar “{trimTexto}”</span>
            </button>
          )}

          {trimTexto.length < 2 && abierto && (
            <div className="px-3 py-2 text-xs text-neutral-500">Escribe al menos 2 letras para buscar.</div>
          )}
        </div>
      )}

      {/* Ayuda: cuando se eligió un contacto nuevo, se crea su ficha al guardar */}
      {esNuevoComprometido && (
        <p className="text-[11px] text-primary-700 mt-1">
          Se creará “{valor?.nombre}” como nuevo contacto de Podcast al guardar.
        </p>
      )}
    </div>
  );
}
