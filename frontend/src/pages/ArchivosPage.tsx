import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Archivo as ArchivoType } from "../types";

const ICONOS_TIPO: Record<string, string> = {
  imagen: "🖼",
  video: "🎬",
  documento: "📄",
  otro: "📎",
};

export function ArchivosPage() {
  const [archivos, setArchivos] = useState<ArchivoType[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaUrl, setNuevaUrl] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);

  const cargar = async () => {
    const data = await api.listarArchivos();
    setArchivos(data);
    setCargando(false);
  };

  useEffect(() => { void cargar(); }, []);

  async function subirArchivo() {
    if (!nuevoNombre.trim() || !nuevaUrl.trim()) return;
    await api.crearArchivo({
      nombre: nuevoNombre.trim(),
      url: nuevaUrl.trim(),
      tipo: "documento",
      entidad: "Marketing",
      entidadId: "general",
    });
    setNuevoNombre("");
    setNuevaUrl("");
    setMostrarForm(false);
    void cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este archivo?")) return;
    await api.eliminarArchivo(id);
    void cargar();
  }

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800">Archivos</h1>
        <button
          onClick={() => setMostrarForm(true)}
          className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600"
        >
          + Subir archivo
        </button>
      </div>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">Biblioteca de archivos del departamento</p>

      {archivos.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-sm text-neutral-500 text-neutral-400 mb-4">No hay archivos todavía. Sube el primero.</p>
          <button
            onClick={() => setMostrarForm(true)}
            className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600"
          >
            Subir archivo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {archivos.map((a) => (
            <div key={a.id} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-2xl">{ICONOS_TIPO[a.tipo] ?? "📎"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 text-neutral-800 truncate">{a.nombre}</p>
                <p className="text-xs text-neutral-500 text-neutral-400">
                  {a.autorNombre} · {new Date(a.fecha).toLocaleDateString("es-ES")}
                </p>
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline mt-1 inline-block"
                  >
                    Ver archivo →
                  </a>
                )}
              </div>
              <button
                onClick={() => eliminar(a.id)}
                className="text-xs text-danger-500 hover:underline shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal para subir archivo */}
      {mostrarForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setMostrarForm(false)}>
          <div
            className="bg-neutral-50 rounded-xl p-6 w-full max-w-md shadow-xl border border-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 text-neutral-800 mb-4">Subir archivo</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-neutral-600 text-neutral-400 block mb-1">Nombre *</label>
                <input
                  type="text"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Ej: Guion Podcast #45"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 text-neutral-400 block mb-1">URL *</label>
                <input
                  type="text"
                  value={nuevaUrl}
                  onChange={(e) => setNuevaUrl(e.target.value)}
                  className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="https://drive.google.com/..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-neutral-600 text-neutral-400 hover:bg-neutral-100 hover:bg-neutral-100 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={subirArchivo}
                disabled={!nuevoNombre.trim() || !nuevaUrl.trim()}
                className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                Subir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
