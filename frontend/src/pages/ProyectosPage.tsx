import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Proyecto, Departamento, Usuario } from "../types";

function PrioridadBadge({ p }: { p: string }) {
  const c: Record<string, string> = { urgente: "bg-danger-100 text-danger-700", alta: "bg-warning-100 text-warning-700", media: "bg-neutral-100 text-neutral-600", baja: "bg-success-100 text-success-700" };
  return <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${c[p] ?? c.media}`}>{p}</span>;
}

// Etapa del ciclo de vida del proyecto (activo/en_proceso/completado/...). Se elige
// dentro del modal de edición; en la tarjeta NO se pinta — ahí el estado visible es
// el interruptor Activo/Inactivo (campo `activo`), uno solo a la vez.
const ESTADOS: { valor: Proyecto["estado"]; label: string; clase: string }[] = [
  { valor: "activo", label: "Activo", clase: "bg-success-100 text-success-700" },
  { valor: "en_proceso", label: "En proceso", clase: "bg-primary-100 text-primary-700" },
  { valor: "en_revision", label: "En revisión", clase: "bg-warning-100 text-warning-700" },
  { valor: "completado", label: "Completado", clase: "bg-neutral-200 text-neutral-600" },
  { valor: "en_pausa", label: "En pausa", clase: "bg-neutral-100 text-neutral-500" },
  { valor: "cancelado", label: "Cancelado", clase: "bg-danger-100 text-danger-700" },
];

function soloFecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

// Orden estable de la lista: los proyectos activos van primero y los inactivos al
// final. Dentro de cada grupo se conserva el orden que ya trae el listado (el
// backend lo entrega por más reciente primero), así el filtro por departamento
// mantiene esta misma regla.
function ordenarActivosPrimero(lista: Proyecto[]): Proyecto[] {
  const activos = lista.filter((p) => p.activo);
  const inactivos = lista.filter((p) => !p.activo);
  return [...activos, ...inactivos];
}

export function ProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [deptos, setDeptos] = useState<Departamento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtroDepto, setFiltroDepto] = useState("");

  // Form state (crear)
  const [nombre, setNombre] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [cliente, setCliente] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [prioridad, setPrioridad] = useState("media");

  // Edit state
  const [editando, setEditando] = useState<Proyecto | null>(null);
  const [eNombre, setENombre] = useState("");
  const [eObjetivo, setEObjetivo] = useState("");
  const [eCliente, setECliente] = useState("");
  const [eResponsableId, setEResponsableId] = useState("");
  const [eDepartamentoId, setEDepartamentoId] = useState("");
  const [eFechaEntrega, setEFechaEntrega] = useState("");
  const [ePrioridad, setEPrioridad] = useState("media");
  const [eEstado, setEEstado] = useState<Proyecto["estado"]>("activo");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cargar = async () => {
    const [p, d, u] = await Promise.all([
      api.listarProyectos(filtroDepto ? { departamentoId: filtroDepto } : {}),
      api.listarDepartamentos(),
      api.listarUsuarios(),
    ]);
    // Activos primero, inactivos al final (el filtro por departamento ya viene
    // aplicado por el backend en `p`; este orden se conserva en cada carga).
    setProyectos(ordenarActivosPrimero(p));
    setDeptos(d);
    setUsuarios(u);
    setCargando(false);
  };

  useEffect(() => { void cargar(); }, [filtroDepto]);

  async function toggleActivo(p: Proyecto) {
    const nuevo = !p.activo;
    const antes = proyectos; // para revertir si el backend falla

    // Reordena en el momento, sin recargar: al desactivar el proyecto baja al
    // final del listado; al reactivar vuelve justo antes de los inactivos.
    const reordenar = (lista: Proyecto[]): Proyecto[] => {
      const resto = lista.filter((x) => x.id !== p.id);
      const item: Proyecto = { ...p, activo: nuevo };
      if (!nuevo) return [...resto, item];
      const primerInactivo = resto.findIndex((x) => !x.activo);
      if (primerInactivo === -1) return [...resto, item];
      const conPosicion = [...resto];
      conPosicion.splice(primerInactivo, 0, item);
      return conPosicion;
    };

    setProyectos(reordenar);
    try {
      // Persiste de verdad en la base de datos.
      await api.cambiarActivoProyecto(p.id, nuevo);
    } catch {
      // Si falla el guardado, se restaura el estado y la posición anteriores.
      setProyectos(antes);
    }
  }

  async function crearProyecto(e: React.FormEvent) {
    e.preventDefault();
    await api.crearProyecto({
      nombre, objetivo: objetivo || undefined, cliente: cliente || undefined,
      responsableId, departamentoId,
      fechaEntrega: fechaEntrega || undefined, prioridad,
    });
    setMostrarForm(false);
    setNombre(""); setObjetivo(""); setCliente(""); setResponsableId(""); setDepartamentoId(""); setFechaEntrega("");
    void cargar();
  }

  function abrirEditar(p: Proyecto) {
    setEditando(p);
    setENombre(p.nombre);
    setEObjetivo(p.objetivo ?? "");
    setECliente(p.cliente ?? "");
    setEResponsableId(p.responsableId);
    setEDepartamentoId(p.departamentoId);
    setEFechaEntrega(soloFecha(p.fechaEntrega));
    setEPrioridad(p.prioridad);
    setEEstado(p.estado);
    setError("");
    setGuardando(false);
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setGuardando(true);
    setError("");
    try {
      const actualizado = await api.actualizarProyecto(editando.id, {
        nombre: eNombre,
        objetivo: eObjetivo,
        cliente: eCliente,
        responsableId: eResponsableId,
        departamentoId: eDepartamentoId,
        fechaEntrega: eFechaEntrega || null,
        prioridad: ePrioridad,
        estado: eEstado,
      });
      // Actualiza el estado local sin recargar la página.
      setProyectos((prev) => prev.map((x) => (x.id === editando.id ? { ...x, ...actualizado } : x)));
      setEditando(null);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo guardar el proyecto");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">Proyectos</h1>
        <button onClick={() => setMostrarForm(true)} className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600">
          + Nuevo proyecto
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-6">Gestión de proyectos por departamento</p>

      {/* Filtro */}
      <select value={filtroDepto} onChange={(e) => setFiltroDepto(e.target.value)} className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 mb-4">
        <option value="">Todos los departamentos</option>
        {deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
      </select>

      {proyectos.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">No hay proyectos. Crea el primero.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proyectos.map((p) => (
            <Link
              key={p.id}
              to={`/proyectos/${p.id}`}
              className={`bg-neutral-50 border rounded-xl p-4 transition-all ${
                p.activo
                  ? "border-neutral-200 hover:border-primary-300 hover:border-primary-500/30 hover:shadow-sm"
                  : "border-neutral-200 opacity-60 saturate-50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm text-neutral-900">{p.nombre}</h3>
                <div className="flex items-center gap-2">
                  <PrioridadBadge p={p.prioridad} />
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirEditar(p); }}
                    title="Editar proyecto"
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleActivo(p); }}
                    title={p.activo ? "Desactivar proyecto" : "Activar proyecto"}
                    aria-label={p.activo ? "Desactivar proyecto" : "Activar proyecto"}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${p.activo ? "bg-primary-500" : "bg-neutral-300"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${p.activo ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
              {p.objetivo && <p className="text-xs text-neutral-500 mb-2 line-clamp-2">{p.objetivo}</p>}
              <div className="text-xs text-neutral-500 space-y-0.5">
                <p>👤 {p.responsableNombre} · 📁 {p.departamentoNombre}</p>
                {p.cliente && <p>🏢 {p.cliente}</p>}
                {p.fechaEntrega && <p>📅 Entrega: {new Date(p.fechaEntrega).toLocaleDateString("es-ES")}</p>}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {p.activo ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success-100 text-success-700">Activo</span>
                ) : (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-danger-100 text-danger-700">Inactivo</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal crear */}
      {mostrarForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setMostrarForm(false)}>
          <form onSubmit={crearProyecto} className="bg-neutral-50 rounded-xl p-6 w-full max-w-lg shadow-xl border border-neutral-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Nuevo proyecto</h3>
            <div className="flex flex-col gap-3">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del proyecto *" className="border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm" required />
              <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Objetivo" className="border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm" />
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente (opcional)" className="border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm" required>
                  <option value="">Responsable *</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
                <select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm" required>
                  <option value="">Departamento *</option>
                  {deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className="border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm" />
                <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm">
                  <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">Crear proyecto</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal editar */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditando(null)}>
          <form onSubmit={guardarEdicion} className="bg-neutral-50 rounded-xl p-6 w-full max-w-lg shadow-xl border border-neutral-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Editar proyecto</h3>
            <div className="flex flex-col gap-3">
              <input value={eNombre} onChange={(e) => setENombre(e.target.value)} placeholder="Nombre del proyecto *" className="border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm" required />
              <input value={eObjetivo} onChange={(e) => setEObjetivo(e.target.value)} placeholder="Objetivo" className="border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm" />
              <input value={eCliente} onChange={(e) => setECliente(e.target.value)} placeholder="Cliente (opcional)" className="border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={eResponsableId} onChange={(e) => setEResponsableId(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm" required>
                  <option value="">Responsable *</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
                <select value={eDepartamentoId} onChange={(e) => setEDepartamentoId(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm" required>
                  <option value="">Departamento *</option>
                  {deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={eFechaEntrega} onChange={(e) => setEFechaEntrega(e.target.value)} className="border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm" />
                <select value={ePrioridad} onChange={(e) => setEPrioridad(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm">
                  <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <span className="text-xs text-neutral-500 block mb-1">Estado</span>
                <select value={eEstado} onChange={(e) => setEEstado(e.target.value as Proyecto["estado"])} className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm w-full">
                  {ESTADOS.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-danger-600">{error}</p>}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setEditando(null)} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800">
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
