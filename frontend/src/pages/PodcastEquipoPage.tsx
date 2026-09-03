import { useEffect, useState } from "react";
import { api, type DesempenoEquipoDTO, type MetasPodcastDTO } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { EstadoIABadge, TendenciaBadge } from "../components/PodcastBadges";

// Tabla "Podcast Team Today" — vista de líder (ADMIN) o Super Admin.

function ColorScore(total: number): string {
  return total >= 80 ? "text-success-600" : total >= 50 ? "text-amber-600" : "text-danger-600";
}

// Editor de metas — solo Super Admin. Muestra las metas y las deja editables.
function MetasEditor() {
  const [metas, setMetas] = useState<MetasPodcastDTO | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.podcastMetas().then(setMetas);
  }, []);

  if (!metas) return null;

  const setValor = (clave: string, valor: number) => {
    setMetas((m) => m && ({ ...m, items: m.items.map((it) => (it.clave === clave ? { ...it, valor } : it)) }));
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const nueva = await api.guardarPodcastMetas(metas.items);
      setMetas(nueva);
      setMensaje("Metas actualizadas.");
    } catch (e) {
      setMensaje((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-6">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">Metas del equipo (Super Admin)</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metas.items.map((it) => (
          <label key={it.clave} className="block">
            <span className="text-xs text-neutral-500">{it.nombre}</span>
            <input
              type="number"
              min={0}
              value={it.valor}
              onChange={(e) => setValor(it.clave, Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={guardar}
          disabled={guardando}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-100 disabled:text-primary-800"
        >
          Guardar metas
        </button>
        {mensaje && <span className="text-sm text-primary-600">{mensaje}</span>}
      </div>
    </div>
  );
}

export function PodcastEquipoPage() {
  const { usuario } = useAuth();
  const [d, setD] = useState<DesempenoEquipoDTO | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.podcastDesempenoEquipo().then((x) => {
      setD(x);
      setCargando(false);
    });
  }, []);

  if (cargando || !d) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800 mb-1">Podcast Team Today</h1>
      <p className="text-sm text-neutral-500 mb-4">
        {d.fecha} · Meta: {d.metas.prospectosContactados} contactos, {d.metas.podcastsAgendados} podcasts agendados/día
      </p>

      {usuario?.rol === "SUPER_ADMIN" && <MetasEditor />}

      {d.equipo.length === 0 ? (
        <p className="text-sm text-neutral-500">Aún no hay usuarios asignados al departamento Podcast.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-600 border-b border-neutral-200">
                <th className="py-2 pr-3">Empleado</th>
                <th className="py-2 px-3 text-right">Score</th>
                <th className="py-2 px-3 text-right">Contactados</th>
                <th className="py-2 px-3 text-right">Follow-ups</th>
                <th className="py-2 px-3 text-right">Agendados</th>
                <th className="py-2 px-3 text-right">Realizados</th>
                <th className="py-2 px-3 text-right">% Meta</th>
                <th className="py-2 px-3">Tendencia</th>
                <th className="py-2 pl-3">IA</th>
              </tr>
            </thead>
            <tbody>
              {d.equipo.map((f) => (
                <tr key={f.usuarioId} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 font-medium text-neutral-800">{f.nombre}</td>
                  <td className={`py-2 px-3 text-right font-bold ${ColorScore(f.score.total)}`}>{f.score.total}</td>
                  <td className="py-2 px-3 text-right text-neutral-700">{f.contactados}</td>
                  <td className="py-2 px-3 text-right text-neutral-700">{f.followupsRealizados}</td>
                  <td className="py-2 px-3 text-right text-neutral-700">{f.agendados}</td>
                  <td className="py-2 px-3 text-right text-neutral-700">{f.realizados}</td>
                  <td className={`py-2 px-3 text-right font-medium ${f.pctMeta >= 100 ? "text-success-600" : "text-neutral-700"}`}>{f.pctMeta}%</td>
                  <td className="py-2 px-3"><TendenciaBadge tendencia={f.tendencia} /></td>
                  <td className="py-2 pl-3"><EstadoIABadge nivel={f.estadoIA} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
