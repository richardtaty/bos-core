import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export function OrganigramaPage() {
  const [organigrama, setOrganigrama] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.organigrama().then((data) => {
      setOrganigrama(data);
      setCargando(false);
    });
  }, []);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Organigrama</h1>
      <p className="text-sm text-neutral-500 mb-6">Estructura organizacional de Taty's Enterprises</p>

      {organigrama.map((depto) => (
        <div key={depto.id} className="mb-8">
          <div className="bg-gradient-to-r from-primary-500 to-secondary-700 text-white rounded-xl p-4 mb-4">
            <h2 className="text-lg font-semibold">{depto.nombre}</h2>
            {depto.descripcion && <p className="text-sm opacity-80 mt-1">{depto.descripcion}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {depto.equipos?.map((equipo: any) => (
              <div key={equipo.id} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm text-neutral-900">{equipo.nombre}</h3>
                  {equipo.supervisor && (
                    <Link to={`/equipo/${equipo.supervisor.id}`} className="text-xs text-primary-600 hover:underline">
                      👑 {equipo.supervisor.nombre}
                    </Link>
                  )}
                </div>
                <div className="divide-y divide-neutral-200">
                  {equipo.miembros?.map((m: any) => (
                    <Link key={m.usuarioId} to={`/equipo/${m.usuarioId}`} className="flex items-center justify-between py-2 hover:bg-neutral-100 -mx-2 px-2 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-secondary-600 flex items-center justify-center text-white text-[10px] font-bold">
                          {m.nombre.charAt(0)}
                        </div>
                        <span className="text-sm text-neutral-700">{m.nombre}</span>
                      </div>
                      <span className="text-xs text-neutral-500">{m.cargo}</span>
                    </Link>
                  ))}
                  {(!equipo.miembros || equipo.miembros.length === 0) && (
                    <p className="text-xs text-neutral-500 py-2">Sin miembros todavía.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
