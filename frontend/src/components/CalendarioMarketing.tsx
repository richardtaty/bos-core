import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { CumpleanoDelMes, Proyecto, PublicacionMarketing } from "../types";

// ─── 📅 Calendario de Marketing ───────────────────────────────────────────────
// Cuadrícula mensual de correos/contenido programados por PROYECTO, junto a los
// cumpleaños del módulo 🎂. Cada elemento nuevo se crea con el botón "+ Agregar nuevo"
// (mismo formulario que "+ agregar" del día) eligiendo un proyecto EXISTENTE con el
// buscador autocomplete — nunca se crean proyectos desde aquí (viven en Marketing → Proyectos).
//
// Fuentes separadas (regla 16):
//   · correos/contenido → tabla marketing_calendario (relación proyecto_id + fecha)
//   · cumpleaños        → módulo 🎂 Próximos cumpleaños (solo lectura, api.cumpleanosPorMes)

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDia(ymdStr: string): string {
  const [y, m, d] = ymdStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

// Sin acentos, mayúsculas ni espacios dobles, para buscar "maur" → "Mauricio Sopo".
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

interface ChipDia {
  key: string;
  texto: string;
  tipo: "correo" | "cumple";
}

export function CalendarioMarketing() {
  const [hoy] = useState(() => new Date());
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [diaSel, setDiaSel] = useState(ymd(hoy));

  const [publicaciones, setPublicaciones] = useState<PublicacionMarketing[]>([]);
  const [cumpleanos, setCumpleanos] = useState<CumpleanoDelMes[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);

  // Modal crear (un solo formulario para "+ Agregar nuevo" y para "+ agregar" del día).
  const [mostrarModal, setMostrarModal] = useState(false);
  const [fecha, setFecha] = useState("");
  const [query, setQuery] = useState("");
  const [proyectoSel, setProyectoSel] = useState<{ id: string; nombre: string } | null>(null);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Proyectos reales existentes (el backend ya limita el acceso del usuario).
  useEffect(() => {
    api
      .listarProyectos()
      .then((p) => setProyectos(p.filter((x) => x.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))))
      .catch(() => setProyectos([]));
  }, []);

  const rangoMes = useMemo(() => {
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    return { desde: ymd(mes), hasta: ymd(ultimo) };
  }, [mes]);

  // Cada mes se carga: elementos del Calendario de Marketing + cumpleaños de ese mes.
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    void Promise.all([
      api.marketingCalendario(rangoMes.desde, rangoMes.hasta),
      // Si el usuario no tuviera acceso al módulo 🎂, el calendario sigue (sin cumpleaños).
      api.cumpleanosPorMes(mes.getMonth() + 1).catch(() => [] as CumpleanoDelMes[]),
    ])
      .then(([pubs, cums]) => {
        if (!vivo) return;
        setPublicaciones(pubs);
        setCumpleanos(cums);
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [rangoMes, mes]);

  const celdas = useMemo(() => {
    const first = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // semana empieza lunes
    const diasEnMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const c: (number | null)[] = [];
    for (let i = 0; i < offset; i++) c.push(null);
    for (let d = 1; d <= diasEnMes; d++) c.push(d);
    return c;
  }, [mes]);

  const pubsPorDia = useMemo(() => {
    const map = new Map<string, PublicacionMarketing[]>();
    for (const p of publicaciones) {
      const arr = map.get(p.fecha) ?? [];
      arr.push(p);
      map.set(p.fecha, arr);
    }
    return map;
  }, [publicaciones]);

  const cumplePorDia = useMemo(() => {
    const map = new Map<number, CumpleanoDelMes[]>();
    for (const c of cumpleanos) {
      const arr = map.get(c.dia) ?? [];
      arr.push(c);
      map.set(c.dia, arr);
    }
    return map;
  }, [cumpleanos]);

  const dia = Number(diaSel.slice(8, 10));
  const pubsDia = pubsPorDia.get(diaSel) ?? [];
  const cumpleDia = cumplePorDia.get(dia) ?? [];

  function cambiarMes(delta: number) {
    const siguiente = new Date(mes.getFullYear(), mes.getMonth() + delta, 1);
    const diaAnterior = Number(diaSel.slice(8, 10));
    const diasEnSiguiente = new Date(siguiente.getFullYear(), siguiente.getMonth() + 1, 0).getDate();
    setMes(siguiente);
    // Al cambiar de mes, el día seleccionado se mantiene (mismo número, recortado si el mes es corto).
    setDiaSel(ymd(new Date(siguiente.getFullYear(), siguiente.getMonth(), Math.min(diaAnterior, diasEnSiguiente))));
  }

  function irHoy() {
    setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDiaSel(ymd(hoy));
  }

  /** Abre el MISMO formulario. Si viene con fecha, esa se preselecciona (regla 11). */
  function abrirNuevo(fechaInicial?: string) {
    setProyectoSel(null);
    setQuery("");
    setListaAbierta(false);
    setFecha(fechaInicial ?? diaSel);
    setError("");
    setMostrarModal(true);
  }

  function cambiarQuery(v: string) {
    setQuery(v);
    // Si el texto dejó de ser el proyecto elegido, se deselecciona (regla 7: se guarda el ID real).
    if (proyectoSel && v !== proyectoSel.nombre) setProyectoSel(null);
    setListaAbierta(true);
  }

  const qn = normalizar(query);
  const coincidencias = qn ? proyectos.filter((p) => normalizar(p.nombre).includes(qn)).slice(0, 7) : [];
  const sinResultados = qn.length >= 2 && coincidencias.length === 0;

  function elegirProyecto(p: Proyecto) {
    setProyectoSel({ id: p.id, nombre: p.nombre });
    setQuery(p.nombre);
    setListaAbierta(false);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!proyectoSel) {
      setError("Busca y elige un proyecto existente (se crean en Marketing → Proyectos)");
      return;
    }
    if (!fecha) {
      setError("Elige la fecha del contenido");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await api.crearMarketingCalendario({ proyectoId: proyectoSel.id, fecha });
      setMostrarModal(false);
      const [pubs] = await Promise.all([api.marketingCalendario(rangoMes.desde, rangoMes.hasta)]);
      setPublicaciones(pubs);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo guardar el elemento");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(p: PublicacionMarketing) {
    if (!confirm(`¿Quitar "${p.proyectoNombre}" del ${fmtDia(p.fecha)}?`)) return;
    try {
      await api.eliminarMarketingCalendario(p.id);
      setPublicaciones(await api.marketingCalendario(rangoMes.desde, rangoMes.hasta));
    } catch (err: any) {
      alert(err?.message ?? "No se pudo quitar el elemento");
    }
  }

  const chipsDia = (d: number, fechaStr: string): ChipDia[] => {
    const pubs = pubsPorDia.get(fechaStr) ?? [];
    const cums = cumplePorDia.get(d) ?? [];
    const chips: ChipDia[] = [];
    pubs.forEach((p) => chips.push({ key: `e${p.id}`, texto: `✉️ ${p.proyectoNombre}`, tipo: "correo" }));
    cums.forEach((c) => chips.push({ key: `c${c.id}`, texto: `🎂 ${c.nombre}`, tipo: "cumple" }));
    return chips;
  };

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">Calendario de Marketing</h1>
        <button
          onClick={() => abrirNuevo()}
          className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600"
        >
          + Agregar nuevo
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-6">Correos y contenido programados por proyecto</p>

      {/* Navegación de mes */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => cambiarMes(-1)} className="w-8 h-8 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-600">‹</button>
        <h2 className="text-sm font-medium text-neutral-900 capitalize">{MESES[mes.getMonth()]} {mes.getFullYear()}</h2>
        <button onClick={() => cambiarMes(1)} className="w-8 h-8 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-600">›</button>
        <button onClick={irHoy} className="text-xs text-primary-600 hover:underline">Hoy</button>
      </div>

      {/* Cuadrícula del mes */}
      <div className="grid grid-cols-7 gap-1 mb-6">
        {DIAS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase text-neutral-500 py-1">{d}</div>
        ))}
        {celdas.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const fechaStr = ymd(new Date(mes.getFullYear(), mes.getMonth(), d));
          const esHoy = fechaStr === ymd(hoy);
          const esSel = fechaStr === diaSel;
          const chips = chipsDia(d, fechaStr);
          return (
            <button
              key={fechaStr}
              onClick={() => setDiaSel(fechaStr)}
              className={`min-h-[64px] rounded-lg border p-1 text-left transition-colors ${
                esSel ? "border-primary-500 bg-primary-50" : "border-neutral-200 bg-neutral-50 hover:border-primary-300"
              }`}
            >
              <span className={`text-xs ${esHoy ? "font-bold text-primary-600" : "text-neutral-600"}`}>{d}</span>
              <div className="flex flex-col gap-0.5 mt-1">
                {chips.slice(0, 3).map((c) => (
                  <span
                    key={c.key}
                    className={`text-[9px] px-1 py-0.5 rounded truncate ${
                      c.tipo === "correo" ? "bg-primary-500/10 text-primary-700" : "bg-pink-100 text-pink-700"
                    }`}
                  >
                    {c.texto}
                  </span>
                ))}
                {chips.length > 3 && <span className="text-[9px] text-neutral-500">+{chips.length - 3} más</span>}
              </div>
            </button>
          );
        })}
      </div>

      {cargando && <p className="text-sm text-neutral-500 mb-4">Cargando mes…</p>}

      {/* Lista del día seleccionado */}
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-neutral-700 capitalize">{fmtDia(diaSel)}</h3>
        <button onClick={() => abrirNuevo(diaSel)} className="text-xs text-primary-600 hover:underline">+ agregar</button>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold uppercase text-neutral-500 tracking-wider mb-1.5">
          Correos <span className="text-neutral-400">({pubsDia.length})</span>
        </p>
        {pubsDia.length === 0 ? (
          <p className="text-sm text-neutral-500">Sin correos o contenido programado este día.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {pubsDia.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-primary-500/20 bg-primary-500/5 rounded-lg px-3 py-2">
                <p className="text-sm font-medium text-neutral-900">✉️ {p.proyectoNombre}</p>
                <button onClick={() => eliminar(p)} className="text-xs text-neutral-400 hover:text-danger-600 hover:underline">
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {cumpleDia.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500 tracking-wider mb-1.5">
            Cumpleaños <span className="text-neutral-400">({cumpleDia.length})</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {cumpleDia.map((c) => (
              <div key={c.id} className="flex items-center justify-between border border-pink-500/20 bg-pink-500/5 rounded-lg px-3 py-2">
                <p className="text-sm font-medium text-neutral-900">🎂 {c.nombre}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal único: crear elemento del calendario */}
      {mostrarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setMostrarModal(false)}>
          <form onSubmit={guardar} className="bg-neutral-50 rounded-xl p-6 w-full max-w-md shadow-xl border border-neutral-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Nuevo elemento del calendario</h3>
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-xs text-neutral-500 block mb-1">Proyecto</span>
                <div className="relative">
                  <input
                    value={query}
                    onChange={(e) => cambiarQuery(e.target.value)}
                    onFocus={() => setListaAbierta(true)}
                    onBlur={() => setTimeout(() => setListaAbierta(false), 150)}
                    placeholder="Buscar proyecto…"
                    className="border border-neutral-200 bg-white text-neutral-800 rounded-lg px-3 py-2 text-sm w-full"
                    autoComplete="off"
                  />
                  {listaAbierta && coincidencias.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {coincidencias.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); elegirProyecto(p); }}
                          className="w-full text-left px-3 py-2 text-sm text-neutral-800 hover:bg-primary-500/10"
                        >
                          {p.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {sinResultados && !proyectoSel && (
                  <p className="text-xs text-neutral-500 mt-1">
                    No se encontró ese proyecto. Los proyectos se crean en Marketing → Proyectos.
                  </p>
                )}
                {proyectoSel && (
                  <p className="text-xs text-success-700 mt-1">✓ {proyectoSel.nombre}</p>
                )}
              </div>
              <div>
                <span className="text-xs text-neutral-500 block mb-1">Fecha</span>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="border border-neutral-200 bg-white text-neutral-800 rounded-lg px-3 py-2 text-sm w-full"
                  required
                />
              </div>
              {error && <p className="text-sm text-danger-600">{error}</p>}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setMostrarModal(false)} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
