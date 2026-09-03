import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { Recurso } from "../types";

export function RecursosPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "SUPER_ADMIN" || usuario?.rol === "ADMIN";
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState("");

  // Form
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cliente, setCliente] = useState("");
  const [categoria, setCategoria] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await api.listarRecursos(filtroCliente ? { cliente: filtroCliente } : {});
    setRecursos(r);
    setCargando(false);
  }, [filtroCliente]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function crear() {
    if (!nombre.trim() || !url.trim()) return;
    setGuardando(true);
    try {
      await api.crearRecurso({ nombre: nombre.trim(), url: url.trim(), descripcion: descripcion.trim() || undefined, cliente: cliente || undefined, categoria: categoria || undefined });
      setMostrarForm(false);
      setNombre(""); setUrl(""); setDescripcion(""); setCliente(""); setCategoria("");
      cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este recurso?")) return;
    await api.eliminarRecurso(id);
    cargar();
  }

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const clientesUnicos = [...new Set(recursos.map((r) => r.cliente).filter(Boolean))];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">Recursos y accesos</h1>
        <button onClick={() => setMostrarForm(true)} className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600">
            + Agregar recurso
          </button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">Enlaces y herramientas del equipo · Las contraseñas se guardan en el gestor seguro</p>

      {/* Filtro por cliente */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-neutral-500">Cliente:</span>
        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-2 py-1.5">
          <option value="">Todos</option>
          {clientesUnicos.map((c) => (<option key={c} value={c ?? ""}>{c}</option>))}
        </select>
      </div>

      {/* Lista agrupada por cliente */}
      {recursos.length === 0 ? (
        <p className="text-sm text-neutral-600 text-center py-8">No hay recursos registrados todavía.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(
            recursos.reduce((acc, r) => {
              const key = r.cliente ?? "General";
              if (!acc[key]) acc[key] = [];
              acc[key].push(r);
              return acc;
            }, {} as Record<string, Recurso[]>)
          ).map(([clienteKey, items]) => (
            <div key={clienteKey}>
              <h3 className="text-sm font-medium text-neutral-700 mb-2">{clienteKey}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((r) => (
                  <div key={r.id} className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 flex items-start justify-between">
                    <div>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary-600 hover:underline">
                        {r.nombre}
                      </a>
                      {r.descripcion && <p className="text-xs text-neutral-500 mt-0.5">{r.descripcion}</p>}
                      <p className="text-[10px] text-neutral-500 mt-1">Agregado por {r.autorNombre}</p>
                    </div>
                    {esAdmin && (
                      <button onClick={() => eliminar(r.id)} className="text-xs text-danger-500 hover:underline shrink-0">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear */}
      {mostrarForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setMostrarForm(false)}>
          <div className="bg-neutral-50 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Nuevo recurso</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-1">Nombre *</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Google Drive" />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-1">URL *</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-1">Descripción</label>
                <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Cliente</label>
                  <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Yerling" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Categoría</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm">
                    <option value="">General</option>
                    <option value="diseno">Diseño</option>
                    <option value="redes">Redes sociales</option>
                    <option value="web">Web</option>
                    <option value="email">Email</option>
                    <option value="analitica">Analítica</option>
                    <option value="herramienta">Herramienta</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancelar</button>
              <button onClick={crear} disabled={guardando || !nombre.trim() || !url.trim()} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800">
                {guardando ? "Creando..." : "Crear recurso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
