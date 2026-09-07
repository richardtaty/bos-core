import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CitaPodcastDTO } from "../api/client";
import { InvitadoCombobox, type ValorInvitado } from "../components/InvitadoCombobox";
import { NuevaPersonaModal } from "../components/NuevaPersonaModal";
import type { CumpleanoDelMes } from "../types";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const colorEstado: Record<CitaPodcastDTO["estado"], string> = {
  agendado: "bg-primary-500/10 text-primary-700",
  realizado: "bg-success-100 text-success-700",
  cancelado: "bg-neutral-200 text-neutral-600 line-through",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDia(ymdStr: string): string {
  const [y, m, d] = ymdStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

export function PodcastCalendarioPage() {
  const [hoy] = useState(() => new Date());
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [diaSel, setDiaSel] = useState(ymd(hoy));
  const [citas, setCitas] = useState<CitaPodcastDTO[]>([]);
  // 🎂 Cumpleaños activos del mes visible (solo lectura desde "Próximos cumpleaños").
  const [cumpleanos, setCumpleanos] = useState<CumpleanoDelMes[]>([]);
  const [cargando, setCargando] = useState(true);

  // Modal (crear / editar)
  const [mostrarModal, setMostrarModal] = useState(false);
  const [editando, setEditando] = useState<CitaPodcastDTO | null>(null);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  // Invitado resuelto del combobox: contacto existente o nombre nuevo por agregar.
  const [invitado, setInvitado] = useState<ValorInvitado | null>(null);
  const [estado, setEstado] = useState<CitaPodcastDTO["estado"]>("agendado");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Cuándo el usuario elige «+ Agregar» un invitado que no existe: guarda el
  // nombre escrito para abrir encima el formulario completo de "Nuevo contacto".
  const [contactoNuevo, setContactoNuevo] = useState<string | null>(null);

  const rangoMes = useMemo(() => {
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    return { desde: ymd(mes), hasta: ymd(ultimo) };
  }, [mes]);

  useEffect(() => {
    void api.podcastCitas(rangoMes.desde, rangoMes.hasta).then((c) => {
      setCitas(c);
      setCargando(false);
    });
  }, [rangoMes]);

  // 🎂 Cumpleaños del MES visible: se consulta el módulo "Próximos cumpleaños" por mes
  // (regla 8), sin la ventana de 3 meses que aplica a la lista de ese módulo (regla 9).
  // Solo lectura: no se crean ni copian registros. Si el usuario no tiene acceso al
  // módulo 🎂, el calendario sigue funcionando (sin cumpleaños).
  useEffect(() => {
    let vivo = true;
    api
      .cumpleanosPorMes(mes.getMonth() + 1)
      .then((c) => {
        if (vivo) setCumpleanos(c);
      })
      .catch(() => {
        if (vivo) setCumpleanos([]);
      });
    return () => {
      vivo = false;
    };
  }, [mes]);

  const celdas = useMemo(() => {
    const first = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // semana empieza lunes
    const diasEnMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const c: (number | null)[] = [];
    for (let i = 0; i < offset; i++) c.push(null);
    for (let d = 1; d <= diasEnMes; d++) c.push(d);
    return c;
  }, [mes]);

  const citasPorDia = useMemo(() => {
    const map = new Map<string, CitaPodcastDTO[]>();
    for (const c of citas) {
      const arr = map.get(c.fecha) ?? [];
      arr.push(c);
      map.set(c.fecha, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.hora.localeCompare(b.hora));
    return map;
  }, [citas]);

  const citasDia = citasPorDia.get(diaSel) ?? [];

  // Cumpleaños por día (solo número de día: son anuales y coinciden con el mes visible).
  const cumplePorDia = useMemo(() => {
    const map = new Map<number, CumpleanoDelMes[]>();
    for (const c of cumpleanos) {
      const arr = map.get(c.dia) ?? [];
      arr.push(c);
      map.set(c.dia, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return map;
  }, [cumpleanos]);

  const cumpleDia = cumplePorDia.get(Number(diaSel.slice(8, 10))) ?? [];

  function cambiarMes(delta: number) {
    setMes((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  function irHoy() {
    setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDiaSel(ymd(hoy));
  }

  function abrirNuevo() {
    setEditando(null);
    setFecha(diaSel);
    setHora("");
    setInvitado(null);
    setEstado("agendado");
    setNota("");
    setError("");
    setMostrarModal(true);
  }

  function abrirEditar(c: CitaPodcastDTO) {
    setEditando(c);
    setFecha(c.fecha);
    setHora(c.hora);
    setInvitado({ id: c.personaId, nombre: c.invitado });
    setEstado(c.estado);
    setNota(c.nota ?? "");
    setError("");
    setMostrarModal(true);
  }

  function abrirAltaContacto(nombre: string) {
    // «+ Agregar»: se abre el formulario completo de "Nuevo contacto" con el
    // nombre ya escrito. No se crea nada aquí; el alta ocurre en ese formulario
    // y la cita sigue abierta debajo con sus datos intactos.
    setContactoNuevo(nombre);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();

    // El invitado debe ser un contacto REAL: elegido del buscador, o creado con
    // el formulario de "Nuevo contacto" (que devuelve su ID). Un nombre suelto
    // que no se eligió no se convierte en contacto al guardar.
    if (!invitado) {
      setError("Elige un contacto existente o pulsa + Agregar para crear el invitado");
      return;
    }
    setGuardando(true);
    setError("");

    try {
      if (editando) {
        await api.actualizarPodcastCita(editando.id, { personaId: invitado.id, fecha, hora, estado, nota });
      } else {
        await api.crearPodcastCita({ personaId: invitado.id, fecha, hora, estado, nota });
      }
      setMostrarModal(false);
      setCitas(await api.podcastCitas(rangoMes.desde, rangoMes.hasta));
    } catch (err: any) {
      setError(err?.message ?? "No se pudo guardar la cita");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(c: CitaPodcastDTO) {
    if (!confirm(`¿Eliminar la cita de ${c.invitado}?`)) return;
    await api.eliminarPodcastCita(c.id);
    setCitas(await api.podcastCitas(rangoMes.desde, rangoMes.hasta));
  }

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">Calendario de podcasts</h1>
        <button onClick={abrirNuevo} className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600">
          + Nueva cita
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-6">Día, hora e invitado de cada grabación</p>

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
          const delDia = citasPorDia.get(fechaStr) ?? [];
          const cumplesDia = cumplePorDia.get(d) ?? [];
          const esHoy = fechaStr === ymd(hoy);
          const esSel = fechaStr === diaSel;
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
                {delDia.slice(0, 2).map((c) => (
                  <span key={c.id} className={`text-[9px] px-1 py-0.5 rounded truncate ${colorEstado[c.estado]}`}>
                    {c.hora} {c.invitado}
                  </span>
                ))}
                {delDia.length > 2 && <span className="text-[9px] text-neutral-500">+{delDia.length - 2} más</span>}
                {cumplesDia.slice(0, 2).map((c) => (
                  <span key={`cumple${c.id}`} className="text-[9px] px-1 py-0.5 rounded truncate bg-pink-100 text-pink-700">
                    🎂 {c.nombre}
                  </span>
                ))}
                {cumplesDia.length > 2 && (
                  <span className="text-[9px] text-neutral-500">+{cumplesDia.length - 2} cumpleaños</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Lista del día seleccionado */}
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-neutral-700 capitalize">{fmtDia(diaSel)}</h3>
        <button onClick={abrirNuevo} className="text-xs text-primary-600 hover:underline">+ agregar</button>
      </div>
      {citasDia.length === 0 && cumpleDia.length === 0 ? (
        <p className="text-sm text-neutral-500">Sin podcasts este día.</p>
      ) : citasDia.length === 0 ? (
        // Solo hay cumpleaños: el día sigue siendo seleccionable y muestra únicamente
        // la sección "Cumpleaños" de abajo (regla 5) — no se exige una cita de Podcast.
        <div />
      ) : (
        <div className="flex flex-col gap-2">
          {citasDia.map((c) => (
            <div key={c.id} className="flex items-center justify-between border border-neutral-200 bg-neutral-50 rounded-xl p-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {c.hora} · {c.invitado}
                </p>
                {c.nota && <p className="text-xs text-neutral-500">{c.nota}</p>}
                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${colorEstado[c.estado]}`}>{c.estado}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/personas/${c.personaId}`} className="text-xs text-primary-600 hover:underline">Ficha</Link>
                <button onClick={() => abrirEditar(c)} className="text-xs text-neutral-500 hover:underline">Editar</button>
                <button onClick={() => eliminar(c)} className="text-xs text-danger-600 hover:underline">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 🎂 Cumpleaños del día (regla 4/5): solo lectura, se muestran cuando existen,
          aunque el día no tenga ninguna cita de Podcast. */}
      {cumpleDia.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-neutral-500 tracking-wider mb-1.5">
            Cumpleaños <span className="text-neutral-400">({cumpleDia.length})</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {cumpleDia.map((c) => (
              <div key={c.id} className="flex items-center justify-between border border-pink-500/20 bg-pink-500/5 rounded-lg px-3 py-2">
                <p className="text-sm font-medium text-neutral-900">🎂 {c.nombre}</p>
                {c.personaId ? (
                  <Link to={`/personas/${c.personaId}`} className="text-xs text-primary-600 hover:underline">
                    Ver contacto
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal crear / editar */}
      {mostrarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setMostrarModal(false)}>
          <form onSubmit={guardar} className="bg-neutral-50 rounded-xl p-6 w-full max-w-md shadow-xl border border-neutral-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">{editando ? "Editar cita" : "Nueva cita"}</h3>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">Fecha</span>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm w-full" required />
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">Hora</span>
                  <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm w-full" required />
                </div>
              </div>
              <div>
                <span className="text-xs text-neutral-500 block mb-1">Invitado</span>
                <InvitadoCombobox valor={invitado} onChange={setInvitado} onAgregarNuevo={abrirAltaContacto} disabled={guardando} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">Estado</span>
                  <select value={estado} onChange={(e) => setEstado(e.target.value as CitaPodcastDTO["estado"])} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm w-full">
                    <option value="agendado">Agendado</option>
                    <option value="realizado">Realizado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">Nota</span>
                  <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm w-full" />
                </div>
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

      {/* Alta completa de un invitado nuevo: el formulario OFICIAL de "Nuevo
          contacto", abierto encima del modal de la cita. Nombre/Fuente/etiqueta
          precargados desde el contexto Podcast; Ciudad/Estado en blanco como en
          Clientes. La cita de abajo conserva sus datos mientras tanto. */}
      {mostrarModal && contactoNuevo !== null && (
        <NuevaPersonaModal
          key={contactoNuevo}
          inicialNombre={contactoNuevo}
          inicialFuente="Podcast"
          inicialTags={["Podcast"]}
          guardarContacto={api.podcastCrearInvitadoCompleto}
          onClose={() => setContactoNuevo(null)}
          onCreated={(persona) => {
            setInvitado({ id: persona.id, nombre: persona.nombre });
            setContactoNuevo(null);
          }}
        />
      )}
    </div>
  );
}
