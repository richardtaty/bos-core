import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CitaPodcastDTO } from "../api/client";
import { InvitadoCombobox, type ValorInvitado } from "../components/InvitadoCombobox";

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
    setInvitado({ tipo: "existente", id: c.personaId, nombre: c.invitado });
    setEstado(c.estado);
    setNota(c.nota ?? "");
    setError("");
    setMostrarModal(true);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");

    // Resolver el invitado: si el usuario eligió "+ Agregar" un nombre que no
    // existe, primero se crea su ficha mínima (o se reutiliza una existente
    // con el mismo nombre) y la cita apunta a esa persona — igual que siempre.
    let personaId: string | null =
      invitado?.tipo === "existente" ? invitado.id : null;
    if (invitado?.tipo === "nuevo") {
      try {
        const creado = await api.podcastCrearInvitado({ nombre: invitado.nombre });
        personaId = creado.persona.id;
      } catch (err: any) {
        setError(err?.message ?? "No se pudo crear el invitado");
        setGuardando(false);
        return;
      }
    }

    if (!personaId) {
      setError("Elige un contacto existente o agrega el nombre del invitado nuevo");
      setGuardando(false);
      return;
    }

    try {
      if (editando) {
        await api.actualizarPodcastCita(editando.id, { personaId, fecha, hora, estado, nota });
      } else {
        await api.crearPodcastCita({ personaId, fecha, hora, estado, nota });
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
      {citasDia.length === 0 ? (
        <p className="text-sm text-neutral-500">Sin podcasts este día.</p>
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
                <InvitadoCombobox valor={invitado} onChange={setInvitado} disabled={guardando} />
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
    </div>
  );
}
