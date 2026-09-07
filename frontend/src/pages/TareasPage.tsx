import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { TareaCard } from "../components/TareaCard";
import { TareaForm } from "../components/TareaForm";
import { ExportarReporteModal } from "../components/ExportarReporteModal";
import { KpiCard } from "../components/KpiCard";
import type { TareaOperativa, Usuario, Departamento } from "../types";
import { GRUPOS, grupoDeEstado, ESTADOS_ACTIVOS } from "../lib/estados";

/** Roles que pueden supervisar el trabajo de otros dentro de su ámbito. */
const ROLES_CON_MANDO: string[] = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"];

/** ¿Comparte al menos un departamento con el usuario actual? */
function compartenDepartamento(u: Usuario, idsDepto: string[]): boolean {
  const deU = u.departamentoIds ?? (u.departamentoId ? [u.departamentoId] : []);
  return idsDepto.some((id) => deU.includes(id));
}

export function TareasPage() {
  const { usuario } = useAuth();
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarReporte, setMostrarReporte] = useState(false);
  const [filtro, setFiltro] = useState<string>("activas");

  // ── Visibilidad por rol (módulo Tareas) ──────────────────────────
  // SUPER_ADMIN → global. ADMIN/SUPERVISOR → su departamento/área.
  // USUARIO → solo las suyas (sin controles; el backend igual lo garantiza).
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";
  const esMando = !!usuario && ROLES_CON_MANDO.includes(usuario.rol);
  const idsDeptoUsuario = usuario?.departamentoIds ??
    (usuario?.departamentoId ? [usuario.departamentoId] : []);

  // "Todas" = todo el ámbito de supervisión; "Mías" = solo las propias.
  const [vista, setVista] = useState<"todas" | "mias">("todas");
  const [filtroResponsable, setFiltroResponsable] = useState<string>("");
  const [filtroDepto, setFiltroDepto] = useState<string>("");

  const mostrarFiltroDepto = esMando && (esSuperAdmin || idsDeptoUsuario.length > 1);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    try {
      // El alcance lo decide el servidor según el rol; estos parámetros solo lo acotan.
      const params: { responsableId?: string; departamento?: string } = {};
      if (vista === "mias") params.responsableId = usuario.id;
      else if (filtroResponsable) params.responsableId = filtroResponsable;
      if (filtroDepto) params.departamento = filtroDepto;

      const listaTareas = api.listarTareasVisibles(params);
      const listaUsuarios = api.listarUsuarios();

      // Los departamentos se cargan para todo rol con mando: hacen falta también
      // para el modal "Exportar reporte" (nombre del departamento + responsables).
      if (esMando) {
        const [tareasOk, usuariosOk, deptosOk] = await Promise.all([
          listaTareas,
          listaUsuarios,
          api.listarDepartamentos(),
        ]);
        setTareas(tareasOk);
        setUsuarios(usuariosOk);
        setDepartamentos(deptosOk);
      } else {
        const [tareasOk, usuariosOk] = await Promise.all([listaTareas, listaUsuarios]);
        setTareas(tareasOk);
        setUsuarios(usuariosOk);
      }
    } finally {
      setCargando(false);
    }
  }, [usuario, vista, filtroResponsable, filtroDepto, mostrarFiltroDepto]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const activas = tareas.filter((t) => ESTADOS_ACTIVOS.includes(grupoDeEstado(t.estado)));
  const pendientes = tareas.filter((t) => grupoDeEstado(t.estado) === "pendiente");
  const enRevision = tareas.filter((t) => grupoDeEstado(t.estado) === "en_revision");
  const enProceso = tareas.filter((t) => grupoDeEstado(t.estado) === "en_proceso");
  const atrasadas = activas.filter((t) => {
    if (!t.fechaLimite) return false;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(t.fechaLimite); fecha.setHours(0, 0, 0, 0);
    return fecha < hoy;
  });

  // Por defecto se muestran solo las activas; Realizado/Cancelado se ven al elegirlos en el filtro.
  const visibles = tareas.filter((t) => {
    const g = grupoDeEstado(t.estado);
    return filtro === "activas" ? ESTADOS_ACTIVOS.includes(g) : g === filtro;
  });

  // Opciones dinámicas de los filtros, según el alcance del usuario (sin nombres hardcodeados).
  const responsablesFiltro = esMando
    ? usuarios.filter((u) =>
        u.activo === false
          ? false
          : esSuperAdmin || u.id === usuario!.id || compartenDepartamento(u, idsDeptoUsuario),
      )
    : [];
  const deptosFiltro = mostrarFiltroDepto
    ? departamentos
        .filter((d) => esSuperAdmin || idsDeptoUsuario.includes(d.id))
        .map((d) => d.nombre)
    : [];

  const sinResultados =
    filtro === "activas" ? "No hay tareas activas." : "No hay tareas en este estado.";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">
          {esMando ? "Tareas" : "Mis tareas"}
        </h1>
        <div className="flex items-center gap-2">
          {esSuperAdmin && (
            <button
              onClick={() => setMostrarReporte(true)}
              className="text-sm border border-neutral-200 text-neutral-700 px-4 py-2 rounded-lg hover:bg-neutral-100"
              title="Descargar reporte de tareas (PDF, Excel o Word) — solo Super Admin"
            >
              ⬇ Exportar reporte
            </button>
          )}
          <button
            onClick={() => setMostrarForm(true)}
            className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600"
          >
            + Nueva tarea
          </button>
        </div>
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        {!esMando
          ? `Tus asignaciones activas, ${usuario?.nombre.split(" ")[0]}`
          : vista === "mias"
            ? "Solo las tareas asignadas directamente a ti."
            : esSuperAdmin
              ? "Todas las tareas del sistema."
              : "Todas las tareas de tu departamento o área."}
      </p>

      {/* KPIs — responden al ámbito de la vista actual */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard titulo="Activas" valor={activas.length} icono="📋" color="neutral" />
        <KpiCard titulo="Pendientes" valor={pendientes.length} icono="⏳" color="warning" />
        <KpiCard titulo="En revisión" valor={enRevision.length} icono="🔍" color="warning" />
        <KpiCard titulo="En proceso" valor={enProceso.length} icono="🔄" color="primary" />
        <KpiCard titulo="Atrasadas" valor={atrasadas.length} icono="⚠️" color="danger" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {esMando && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Vista:</span>
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
              <button
                onClick={() => setVista("todas")}
                className={`text-xs px-3 py-1.5 transition-colors ${
                  vista === "todas"
                    ? "bg-primary-500 text-white font-medium"
                    : "bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setVista("mias")}
                className={`text-xs px-3 py-1.5 transition-colors ${
                  vista === "mias"
                    ? "bg-primary-500 text-white font-medium"
                    : "bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Mías
              </button>
            </div>
          </div>
        )}

        {esMando && vista === "todas" && responsablesFiltro.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Responsable:</span>
            <select
              value={filtroResponsable}
              onChange={(e) => setFiltroResponsable(e.target.value)}
              className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-2 py-1.5"
            >
              <option value="">Todos</option>
              {responsablesFiltro.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {mostrarFiltroDepto && deptosFiltro.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Departamento:</span>
            <select
              value={filtroDepto}
              onChange={(e) => setFiltroDepto(e.target.value)}
              className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-2 py-1.5"
            >
              <option value="">Todos</option>
              {deptosFiltro.map((nombre) => (
                <option key={nombre} value={nombre}>{nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Estado:</span>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="text-xs border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-2 py-1.5"
          >
            <option value="activas">Activas (Pendiente, En revisión, En proceso)</option>
            {GRUPOS.map((g) => (
              <option key={g.valor} value={g.valor}>{g.etiqueta}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de tareas */}
      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">{sinResultados}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibles.map((t) => (
            <TareaCard key={t.id} tarea={t} onUpdate={cargar} usuarios={usuarios} agruparEstados />
          ))}
        </div>
      )}

      {mostrarForm && (
        <TareaForm
          onCreada={() => { setMostrarForm(false); cargar(); }}
          onCancel={() => setMostrarForm(false)}
          usuarios={usuarios}
        />
      )}

      {/* El botón "Exportar reporte" solo existe para SUPER_ADMIN; ADMIN, SUPERVISOR y
          USUARIO no lo ven. El backend además lo garantiza (requireRole SUPER_ADMIN). */}
      {mostrarReporte && esSuperAdmin && usuario && (
        <ExportarReporteModal
          usuario={usuario}
          usuarios={usuarios}
          departamentos={departamentos}
          onClose={() => setMostrarReporte(false)}
        />
      )}
    </div>
  );
}
