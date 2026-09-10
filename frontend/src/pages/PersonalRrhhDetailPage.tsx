import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { usePermisos } from "../hooks/usePermisos";
import type { EstadoLaboral, PersonalRRHH } from "../types";

// ─── RECURSOS HUMANOS → Personal → Ficha ────────────────────────
// Detalle laboral de una persona REAL del CRM. El `:id` de la URL es su ID de usuario: la
// misma persona para tareas, Mi Equipo y el futuro Control de Sueldo. No se crea ninguna
// ficha aparte ni se duplica nada.
//
// Aquí solo se editan datos LABORALES (cargo, estado laboral, notas de RRHH). Login,
// contraseña, rol, permisos y acceso al CRM se administran en "Mi Equipo" y esta pantalla
// no los toca — están separados a propósito.
//
// Fase 1: todavía NO hay asistencia, jornadas, horas, sueldos ni check-ins.

const DEPTO_COLOR: Record<string, string> = {
  Marketing: "bg-amber-100 text-amber-700 border-amber-200",
  "Sala de OFERTAS": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Business Market Finders": "bg-sky-100 text-sky-700 border-sky-200",
  Podcast: "bg-violet-100 text-violet-700 border-violet-200",
};

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-neutral-200 last:border-0">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">{etiqueta}</p>
      <div className="text-sm text-neutral-800">{children}</div>
    </div>
  );
}

export function PersonalRrhhDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const permisos = usePermisos();
  const [persona, setPersona] = useState<PersonalRRHH | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulario de datos laborales
  const [cargo, setCargo] = useState("");
  const [estadoLaboral, setEstadoLaboral] = useState<EstadoLaboral>("ACTIVO");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    // Igual que en la lista: sin permiso no se pide nada (la redirección va en el render).
    if (!userId || permisos.cargando || !permisos.puedeVerRRHH) return;
    void (async () => {
      try {
        const p = await api.obtenerPersonal(userId);
        setPersona(p);
        setCargo(p.cargo ?? "");
        setEstadoLaboral(p.estadoLaboral);
        setNotas(p.notas ?? "");
      } catch (err) {
        setError(err instanceof ApiError ? String(err.payload) : "No se pudo cargar la ficha.");
      } finally {
        setCargando(false);
      }
    })();
  }, [userId, permisos.cargando, permisos.puedeVerRRHH]);

  const guardar = async () => {
    if (!persona) return;
    setGuardando(true);
    setError(null);
    setOk(false);
    try {
      const actualizada = await api.actualizarPerfilLaboral(persona.userId, {
        cargo: cargo.trim() || null,
        estadoLaboral,
        notas: notas.trim() || null,
      });
      setPersona(actualizada);
      setCargo(actualizada.cargo ?? "");
      setNotas(actualizada.notas ?? "");
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.payload) : "No se pudieron guardar los datos laborales.");
    } finally {
      setGuardando(false);
    }
  };

  if (!permisos.cargando && !permisos.puedeVerRRHH) return <Navigate to="/mi-dia" replace />;
  if (cargando) return <p className="text-sm text-neutral-500 py-8 text-center">Cargando la ficha…</p>;
  if (!persona) return <p className="text-sm text-red-600 py-8 text-center">{error ?? "Persona no encontrada."}</p>;

  const hayCambios =
    cargo.trim() !== (persona.cargo ?? "") ||
    estadoLaboral !== persona.estadoLaboral ||
    notas.trim() !== (persona.notas ?? "");

  return (
    <div className="max-w-3xl">
      <Link to="/rrhh/personal" className="text-xs text-neutral-500 hover:underline">
        ← Volver a Personal
      </Link>

      <div className="flex items-center gap-3 mt-3 mb-6 flex-wrap">
        <h1 className="text-xl font-semibold text-neutral-900">{persona.nombre}</h1>
        <span
          className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
            persona.estadoLaboral === "ACTIVO"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-neutral-100 text-neutral-600 border-neutral-300"
          }`}
        >
          {persona.estadoLaboral}
        </span>
      </div>

      {/* ── Datos laborales ──────────────────────────── */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-5 shadow-sm">
        <p className="text-sm font-semibold text-neutral-700 mb-3">Datos laborales</p>

        <Fila etiqueta="Nombre">
          {persona.nombre}
        </Fila>

        <Fila etiqueta="Departamento">
          {persona.departamentos.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {persona.departamentos.map((d) => (
                <span
                  key={d.id}
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    DEPTO_COLOR[d.nombre] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"
                  }`}
                >
                  {d.nombre}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-neutral-500">Sin departamento asignado</span>
          )}
        </Fila>

        <Fila etiqueta="Cargo">
          {persona.cargo ? persona.cargo : <span className="text-neutral-500">Sin cargo registrado</span>}
        </Fila>

        <Fila etiqueta="Supervisor directo">
          {persona.supervisorNombre ?? <span className="text-neutral-500">Sin supervisor asignado</span>}
        </Fila>

        <Fila etiqueta="Estado laboral">
          {persona.estadoLaboral === "ACTIVO" ? "Activo" : "Inactivo"}
        </Fila>
      </div>

      {/* ── Información de contacto existente ────────── */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-5 shadow-sm">
        <p className="text-sm font-semibold text-neutral-700 mb-3">Contacto</p>
        <Fila etiqueta="Email">{persona.email}</Fila>
      </div>

      {/* ── Editar datos laborales ───────────────────── */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-5 shadow-sm">
        <p className="text-sm font-semibold text-neutral-700 mb-1">Editar información laboral</p>
        <p className="text-[11px] text-neutral-500 mb-4">
          Estos datos son laborales. No cambian el acceso al CRM de la persona (rol, contraseña ni permisos).
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Cargo</label>
            <input
              value={cargo}
              onChange={(e) => { setCargo(e.target.value); setOk(false); }}
              placeholder="Ej: Editor de Video"
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Estado laboral</label>
            <select
              value={estadoLaboral}
              onChange={(e) => { setEstadoLaboral(e.target.value as EstadoLaboral); setOk(false); }}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">
              Notas internas de Recursos Humanos
            </label>
            <textarea
              value={notas}
              onChange={(e) => { setNotas(e.target.value); setOk(false); }}
              rows={3}
              placeholder="Información laboral que no forma parte del perfil del CRM"
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        {ok && <p className="text-xs text-green-600 mb-3">Datos laborales guardados ✓</p>}

        <button
          type="button"
          onClick={guardar}
          disabled={guardando || !hayCambios}
          className="text-sm bg-primary-600 text-white px-4 py-2 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800"
        >
          {guardando ? "Guardando…" : "Guardar datos laborales"}
        </button>
      </div>

      {/* ── Acceso al CRM (otro módulo, otro concepto) ── */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 shadow-sm">
        <p className="text-sm font-semibold text-neutral-700 mb-1">Acceso al CRM</p>
        <p className="text-[11px] text-neutral-500 mb-2">
          El estado laboral no cambia el acceso al CRM ni al revés: son dos cosas distintas y se
          administran por separado. El acceso (rol, contraseña, permisos, activar/desactivar la
          cuenta) se maneja en Mi Equipo.
        </p>
        <p className="text-sm text-neutral-800 mb-3">
          {persona.accesoActivo ? "Cuenta habilitada" : "Cuenta desactivada — no puede iniciar sesión"}
        </p>
        <Link to="/equipo" className="text-xs text-primary-600 hover:underline">
          Ir a Mi Equipo →
        </Link>
      </div>
    </div>
  );
}
