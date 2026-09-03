import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { TareaPendiente, Cumpleanero } from "../types";

function diasDiferencia(fechaIso: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaIso);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", timeZone: "America/New_York" });
}

function calcularEdad(fechaNacimiento: string): number {
  const hoy = new Date();
  const [y, m, d] = fechaNacimiento.split("-").map(Number);
  let edad = hoy.getFullYear() - y;
  const mesActual = hoy.getMonth() + 1;
  if (mesActual < m || (mesActual === m && hoy.getDate() < d)) edad--;
  return edad;
}

export function MiDiaPage() {
  const { usuario } = useAuth();
  const [tareas, setTareas] = useState<TareaPendiente[]>([]);
  const [cumpleanosHoy, setCumpleanosHoy] = useState<Cumpleanero[]>([]);
  const [cumpleanosProximos, setCumpleanosProximos] = useState<Cumpleanero[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const [data, cumple] = await Promise.all([
      api.listarTareasPendientes(true),
      api.cumpleanos(),
    ]);
    setTareas(data.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()));
    setCumpleanosHoy(cumple.hoy);
    setCumpleanosProximos(cumple.proximos);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const atrasadas = tareas.filter((t) => diasDiferencia(t.fecha) < 0);
  const hoy = tareas.filter((t) => diasDiferencia(t.fecha) === 0);
  const proximas = tareas.filter((t) => diasDiferencia(t.fecha) > 0);

  const Grupo = ({ titulo, items, colorClase }: { titulo: string; items: TareaPendiente[]; colorClase: string }) => (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-neutral-700 mb-2">
        {titulo} <span className="text-neutral-500 font-normal">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500">Nada aquí.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((t) => (
            <Link
              key={t.id}
              to={`/personas/${t.personaId}`}
              className={`flex items-center justify-between p-3 rounded-lg border ${colorClase} hover:opacity-80`}
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">{t.personaNombre}</p>
                <p className="text-xs text-neutral-500">{t.nota}</p>
              </div>
              <span className="text-xs text-neutral-500">{fmtFecha(t.fecha)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Hola, {usuario?.nombre.split(" ")[0]}</h1>
      <p className="text-sm text-neutral-500 mb-6">Esto es lo que tienes pendiente hoy</p>

      {/* 🎂 Cumpleaños */}
      {(cumpleanosHoy.length > 0 || cumpleanosProximos.length > 0) && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">🎂 Cumpleaños</h2>

          {cumpleanosHoy.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-pink-600 mb-1.5">Hoy</p>
              <div className="flex flex-col gap-2">
                {cumpleanosHoy.map((c) => (
                  <Link
                    key={c.personaId}
                    to={`/personas/${c.personaId}`}
                    className="flex items-center justify-between p-3 rounded-lg border bg-pink-50 bg-pink-500/10 border-pink-200 border-pink-500/20 hover:opacity-80"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {c.personaNombre}{" "}
                        <span className="font-normal text-neutral-500">
                          ({calcularEdad(c.fechaNacimiento)} años)
                        </span>
                      </p>
                    </div>
                    <span className="text-xs text-pink-600 font-medium">🎉 Hoy</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {cumpleanosProximos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1.5">Próximos 14 días</p>
              <div className="flex flex-col gap-2">
                {cumpleanosProximos.map((c) => {
                  const [, m, d] = c.fechaNacimiento.split("-").map(Number);
                  const hoy2 = new Date();
                  const cumpleEsteAno = new Date(hoy2.getFullYear(), m - 1, d);
                  if (cumpleEsteAno <= hoy2) cumpleEsteAno.setFullYear(hoy2.getFullYear() + 1);
                  const diasRestantes = Math.round((cumpleEsteAno.getTime() - hoy2.getTime()) / 86400000);
                  return (
                    <Link
                      key={c.personaId}
                      to={`/personas/${c.personaId}`}
                      className="flex items-center justify-between p-3 rounded-lg border bg-neutral-50 border-neutral-200 hover:opacity-80"
                    >
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{c.personaNombre}</p>
                      </div>
                      <span className="text-xs text-neutral-500">
                        {diasRestantes === 1 ? "Mañana" : `En ${diasRestantes} días`} — {fmtFecha(cumpleEsteAno.toISOString())}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <Grupo titulo="Atrasadas" items={atrasadas} colorClase="bg-danger-50 bg-danger-500/10 border-danger-100 border-danger-500/20" />
      <Grupo titulo="Para hoy" items={hoy} colorClase="bg-warning-50 bg-warning-500/10 border-warning-100 border-warning-500/20" />
      <Grupo titulo="Próximas" items={proximas} colorClase="bg-neutral-50 border-neutral-200" />
    </div>
  );
}
