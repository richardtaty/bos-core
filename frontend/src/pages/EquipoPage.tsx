import { FormEvent, useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { Usuario, Rol, Departamento } from "../types";

const ROLES: Rol[] = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "TEAM_LEADER", "USUARIO"];

const ROL_COLOR: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700 border-purple-200",
  ADMIN: "bg-blue-100 text-blue-700 border-blue-200",
  SUPERVISOR: "bg-teal-100 text-teal-700 border-teal-200",
  TEAM_LEADER: "bg-cyan-100 text-cyan-700 border-cyan-200",
  USUARIO: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

// Estos roles mandan sobre las tareas de un departamento, así que sin departamento
// no tendrían sobre qué mandar. El backend concede el permiso por departamento.
const ROLES_QUE_EXIGEN_DEPARTAMENTO: Rol[] = ["ADMIN", "SUPERVISOR", "TEAM_LEADER"];

const exigeDepartamento = (rol: Rol) => ROLES_QUE_EXIGEN_DEPARTAMENTO.includes(rol);

const DEPTO_COLOR: Record<string, string> = {
  Marketing: "bg-amber-100 text-amber-700 border-amber-200",
  "Sala de OFERTAS": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Business Market Finders": "bg-sky-100 text-sky-700 border-sky-200",
  Podcast: "bg-violet-100 text-violet-700 border-violet-200",
};

export function EquipoPage() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";
  const esAdmin = usuario?.rol === "ADMIN" || esSuperAdmin;
  const puedeCrear = esAdmin;
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [deptos, setDeptos] = useState<Departamento[]>([]);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Rol>("USUARIO");
  const [departamentoId, setDepartamentoId] = useState("");
  const [cargo, setCargo] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const [resetModal, setResetModal] = useState<Usuario | null>(null);
  const [passwordNueva, setPasswordNueva] = useState("");
  const [guardandoReset, setGuardandoReset] = useState(false);
  const [errorReset, setErrorReset] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState(false);

  // ── Formulario colapsable ──────────────────────────
  const [formAbierto, setFormAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const [u, d] = await Promise.all([api.listarUsuarios(), api.listarDepartamentos()]);
    setUsuarios(u);
    setDeptos(d);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (exigeDepartamento(rol) && !departamentoId) {
      setError(`Debes seleccionar un departamento para el rol ${rol}.`);
      return;
    }

    setCreando(true);
    try {
      await api.crearUsuario({
        nombre, email, password, rol,
        departamentoId: departamentoId || undefined,
        cargo: cargo || undefined,
        supervisorId: supervisorId || undefined,
      });
      setNombre(""); setEmail(""); setPassword(""); setRol("USUARIO");
      setDepartamentoId(""); setCargo(""); setSupervisorId("");
      setFormAbierto(false);
      void cargar();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.payload) : "Error al crear el usuario");
    } finally {
      setCreando(false);
    }
  };

  const onCambiarRol = async (id: string, nuevoRol: string) => {
    try { await api.cambiarRol(id, nuevoRol); void cargar(); }
    catch (err) { alert(err instanceof ApiError ? String(err.payload) : "No se pudo cambiar el rol"); void cargar(); }
  };

  const onCambiarDepartamento = async (id: string, deptoIds: string[]) => {
    try { await api.cambiarDepartamento(id, deptoIds); void cargar(); }
    catch (err) { alert(err instanceof ApiError ? String(err.payload) : "No se pudo cambiar el departamento"); void cargar(); }
  };

  const onCambiarEstado = async (id: string, nuevoEstado: boolean) => {
    if (!nuevoEstado && !confirm("¿Desactivar a este usuario? No podrá iniciar sesión, pero su historial se conserva.")) return;
    try { await api.cambiarEstadoUsuario(id, nuevoEstado); void cargar(); }
    catch (err) { alert(err instanceof ApiError ? String(err.payload) : "No se pudo cambiar el estado"); }
  };

  const abrirReset = (u: Usuario) => { setResetModal(u); setPasswordNueva(""); setErrorReset(null); setResetOk(false); };

  const confirmarReset = async () => {
    if (!resetModal) return;
    if (passwordNueva.length < 6) { setErrorReset("La contraseña debe tener al menos 6 caracteres."); return; }
    setGuardandoReset(true); setErrorReset(null);
    try { await api.restablecerPassword(resetModal.id, passwordNueva); setResetOk(true); }
    catch (err) { setErrorReset(err instanceof ApiError ? String(err.payload) : "No se pudo restablecer la contraseña"); }
    finally { setGuardandoReset(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">
            {esSuperAdmin ? "Equipo" : "Mi Equipo"}
          </h1>
          <p className="text-sm text-neutral-500">
            {esSuperAdmin
              ? "Administra los miembros y sus accesos a cada unidad de negocio"
              : "Miembros de tu departamento"}
          </p>
        </div>
        {puedeCrear && (
          <button
            onClick={() => setFormAbierto(!formAbierto)}
            className="text-sm bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            {formAbierto ? "✕ Cerrar" : "+ Agregar miembro"}
          </button>
        )}
      </div>

      {/* ── Formulario colapsable ──────────────────── */}
      {formAbierto && puedeCrear && (
        <form onSubmit={onSubmit} className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-6 max-w-2xl shadow-sm">
          <p className="text-sm font-semibold text-neutral-700 mb-4">
            {esSuperAdmin ? "Nuevo miembro del equipo" : "Agregar a mi equipo"}
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Nombre completo *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm" />
            </div>

            {esSuperAdmin ? (
              <div>
                <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Rol *</label>
                <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm">
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Rol</label>
                <input value="USUARIO" disabled className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600" />
              </div>
            )}

            <div>
              <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Email *</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Contraseña temporal *</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="Mínimo 6 caracteres" className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Cargo</label>
              <input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ej: Editor de Video" className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm" />
            </div>

            {esSuperAdmin && (
              <div>
                <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">
                  Departamento {exigeDepartamento(rol) ? "*" : ""}
                </label>
                <select
                  value={departamentoId}
                  onChange={(e) => setDepartamentoId(e.target.value)}
                  required={exigeDepartamento(rol)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${
                    exigeDepartamento(rol)
                      ? "border-primary-200 ring-1 ring-primary-200 border-primary-500/30 bg-neutral-50 text-neutral-800"
                      : "border-neutral-200 bg-neutral-50 text-neutral-800"
                  }`}
                >
                  <option value="">{exigeDepartamento(rol) ? "Seleccionar departamento *" : "Sin departamento"}</option>
                  {deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
            )}

            {esSuperAdmin && (
              <div className="col-span-2">
                <label className="text-[11px] text-neutral-500 uppercase tracking-wide block mb-1">Supervisor directo</label>
                <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin supervisor</option>
                  {usuarios.filter(u => u.activo !== false).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={creando} className="text-sm bg-primary-600 text-white px-4 py-2 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800">
              {creando ? "Creando..." : "Crear miembro"}
            </button>
            <button type="button" onClick={() => setFormAbierto(false)} className="text-sm border border-neutral-200 text-neutral-600 px-4 py-2 rounded-lg">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* ── Leyenda de departamentos ────────────────── */}
      {esSuperAdmin && deptos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-[11px] text-neutral-500 uppercase tracking-wide">Unidades de negocio:</span>
          {deptos.map((d) => (
            <span key={d.id} className={`text-[11px] px-2 py-0.5 rounded-full border ${DEPTO_COLOR[d.nombre] ?? "bg-neutral-100 text-neutral-500 border-neutral-200"}`}>
              {d.nombre}
            </span>
          ))}
        </div>
      )}

      {/* ── Lista de miembros ───────────────────────── */}
      <div className="space-y-3">
        {usuarios.map((u) => {
          const deptosUsuario = deptos.filter((d) => (u.departamentoIds ?? []).includes(d.id));
          const deptoIds = u.departamentoIds ?? [];

          return (
            <div
              key={u.id}
              className={`bg-neutral-50 border border-neutral-200 rounded-xl p-4 transition-opacity ${!u.activo ? "opacity-50" : ""}`}
            >
              {/* ── Fila superior: nombre + rol + estado ── */}
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/equipo/${u.id}`} className="text-sm font-semibold text-neutral-900 hover:text-primary-600 hover:underline truncate">
                      {u.nombre}
                    </Link>
                    {!u.activo && (
                      <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-medium">
                        Desactivado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {u.email}
                    {u.cargo && <span className="text-neutral-500"> · {u.cargo}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {esSuperAdmin ? (
                    <select
                      value={u.rol}
                      onChange={(e) => onCambiarRol(u.id, e.target.value)}
                      className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-2 py-1 font-medium"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                    </select>
                  ) : (
                    <span className={`text-[11px] px-2 py-1 rounded-lg border font-medium ${ROL_COLOR[u.rol] ?? ROL_COLOR.USUARIO}`}>
                      {u.rol.replace(/_/g, " ")}
                    </span>
                  )}

                  {esSuperAdmin && (
                    <>
                      <button onClick={() => abrirReset(u)} className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors">
                        🔑 Reset
                      </button>
                      <button
                        onClick={() => onCambiarEstado(u.id, !u.activo)}
                        className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                          u.activo
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-green-200 text-green-600 hover:bg-green-50"
                        }`}
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Fila inferior: departamentos ──────── */}
              {esSuperAdmin && (
                <div className="pt-2 border-t border-neutral-200">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Unidades de negocio</p>
                  <div className="flex flex-wrap gap-1.5">
                    {deptos.map((d) => {
                      const activo = deptoIds.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            const nuevos = activo ? deptoIds.filter(id => id !== d.id) : [...deptoIds, d.id];
                            onCambiarDepartamento(u.id, nuevos);
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium ${
                            activo
                              ? `${DEPTO_COLOR[d.nombre] ?? "bg-primary-100 text-primary-700 border-primary-300"} shadow-sm`
                              : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-neutral-300 hover:text-neutral-500"
                          }`}
                        >
                          {activo ? "✓ " : "+ "}{d.nombre}
                        </button>
                      );
                    })}
                    {deptoIds.length === 0 && (
                      <span className="text-[11px] text-neutral-500 italic">Sin departamento asignado</span>
                    )}
                  </div>
                </div>
              )}

              {/* ── Vista no-admin: solo muestra deptos ── */}
              {!esSuperAdmin && deptosUsuario.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {deptosUsuario.map((d) => (
                    <span key={d.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${DEPTO_COLOR[d.nombre] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"}`}>
                      {d.nombre}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {usuarios.length === 0 && (
        <p className="text-sm text-neutral-600 text-center py-8">No hay miembros en el equipo todavía.</p>
      )}

      {/* ── Modal reset ─────────────────────────────── */}
      {resetModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm shadow-xl border border-neutral-200">
            <p className="text-sm font-medium mb-1">Restablecer contraseña</p>
            <p className="text-xs text-neutral-500 mb-3">{resetModal.nombre} — {resetModal.email}</p>

            {resetOk ? (
              <>
                <p className="text-sm text-green-600 mb-4">Contraseña actualizada ✓ Avísale al usuario su nueva contraseña.</p>
                <div className="flex justify-end">
                  <button onClick={() => setResetModal(null)} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white font-medium">
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="text-xs text-neutral-600">Nueva contraseña (mínimo 6 caracteres)</label>
                <input
                  type="text"
                  value={passwordNueva}
                  onChange={(e) => setPasswordNueva(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm mb-3"
                  placeholder="Ej: Taty2026!"
                />
                {errorReset && <p className="text-xs text-red-600 mb-3">{errorReset}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setResetModal(null)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200">
                    Cancelar
                  </button>
                  <button onClick={confirmarReset} disabled={guardandoReset} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white font-medium disabled:bg-primary-100 disabled:text-primary-800">
                    {guardandoReset ? "Guardando..." : "Restablecer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
