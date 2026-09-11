import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { usePermisos } from "../hooks/usePermisos";
import { TareaCard } from "../components/TareaCard";
import { TareaForm } from "../components/TareaForm";
import { ExportarReporteModal } from "../components/ExportarReporteModal";
import { RecordatoriosCumpleanos } from "../components/RecordatoriosCumpleanos";
import { KpiCard } from "../components/KpiCard";
import type { ContextoTareas, TareaOperativa, OpcionUsuario, Usuario, Departamento } from "../types";
import { GRUPOS, grupoDeEstado, ESTADOS_ACTIVOS, esAtrasada } from "../lib/estados";

/** Roles que pueden supervisar el trabajo de otros dentro de su ámbito. */
const ROLES_CON_MANDO: string[] = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"];

/** ¿Comparte al menos un departamento con el usuario actual? */
function compartenDepartamento(u: Usuario, idsDepto: string[]): boolean {
  const deU = u.departamentoIds ?? (u.departamentoId ? [u.departamentoId] : []);
  return idsDepto.some((id) => deU.includes(id));
}

/**
 * Una sección del CRM que tiene su propia vista de Tareas. El `area` es el slug con el que
 * el backend resuelve el departamento ("marketing", "sala-de-ofertas", "podcast") y `nombre`
 * es lo que se muestra en pantalla.
 */
export interface AreaTareas {
  area: string;
  nombre: string;
}

/**
 * Módulo central de Tareas.
 *
 * `areaFija` lo convierte en la vista de UNA sección del CRM (PODCAST → Tareas, Marketing →
 * Tareas, Sala de OFERTAS → Tareas) sin duplicar nada: mismas tarjetas, mismos filtros, misma
 * tabla `tareas_operativas`. Lo que cambia es que el departamento deja de ser elegible — el
 * servidor lo fija en su endpoint — y que los responsables ofrecidos son los miembros reales
 * de esa área.
 *
 * Sin la prop, la pantalla es exactamente la de siempre (la vista General).
 */
export function TareasPage({ areaFija }: { areaFija?: AreaTareas } = {}) {
  const { usuario } = useAuth();
  const permisos = usePermisos();
  const [tareas, setTareas] = useState<TareaOperativa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  // En una vista acotada los selectores no ofrecen todo el CRM, sino los miembros reales
  // de ese departamento (más los Super Admin activos). Lista aparte para no mezclarla con
  // el directorio completo que necesita, por ejemplo, el modal de exportar.
  const [miembros, setMiembros] = useState<OpcionUsuario[]>([]);
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

  // ── Vista acotada a una sección del CRM ─────────────────────────
  // El objeto concentra las dos cosas que cambian: de dónde se leen/crean las tareas y de
  // dónde salen los responsables. Todo lo demás de la pantalla es el módulo de siempre.
  const contexto: ContextoTareas | undefined = areaFija
    ? {
        departamento: areaFija.nombre,
        crear: (data) => api.crearTareaDeArea(areaFija.area, data),
        actualizar: (id, data) => api.actualizarTareaDeArea(areaFija.area, id, data),
      }
    : undefined;
  const enContexto = !!contexto;

  // "Todas" = todo el ámbito de supervisión; "Mías" = solo las propias.
  const [vista, setVista] = useState<"todas" | "mias">("todas");
  const [filtroResponsable, setFiltroResponsable] = useState<string>("");
  const [filtroDepto, setFiltroDepto] = useState<string>("");

  // En una vista acotada el departamento no es un filtro: es el contexto entero.
  const mostrarFiltroDepto = !enContexto && esMando && (esSuperAdmin || idsDeptoUsuario.length > 1);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    try {
      // El alcance lo decide el servidor según el rol; estos parámetros solo lo acotan.
      const params: { responsableId?: string; departamento?: string } = {};
      if (vista === "mias") params.responsableId = usuario.id;
      else if (filtroResponsable) params.responsableId = filtroResponsable;
      // El departamento solo se manda donde es un filtro elegible. En la vista acotada lo
      // fija el servidor y el endpoint ni siquiera lee ese parámetro.
      if (filtroDepto && !enContexto) params.departamento = filtroDepto;

      const listaTareas = areaFija
        ? api.listarTareasDeArea(areaFija.area, params)
        : api.listarTareasVisibles(params);

      // Vista acotada: los responsables salen de la relación real del departamento, no del
      // directorio completo. Nada más que cargar — ni el directorio ni los departamentos.
      if (areaFija) {
        const [tareasOk, miembrosOk] = await Promise.all([listaTareas, api.miembrosTareasDeArea(areaFija.area)]);
        setTareas(tareasOk);
        setMiembros(miembrosOk);
        return;
      }

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
  }, [usuario, vista, filtroResponsable, filtroDepto, mostrarFiltroDepto, areaFija?.area]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const activas = tareas.filter((t) => ESTADOS_ACTIVOS.includes(grupoDeEstado(t.estado)));
  const pendientes = tareas.filter((t) => grupoDeEstado(t.estado) === "pendiente");
  const enRevision = tareas.filter((t) => grupoDeEstado(t.estado) === "en_revision");
  const enProceso = tareas.filter((t) => grupoDeEstado(t.estado) === "en_proceso");
  // Clasificación canónica (lib/estados.ts): una tarea TERMINADA o cancelada nunca es
  // atrasada, aunque se haya terminado después de su fecha límite; el día se compara en
  // Florida (ET), no en UTC ni en la hora local del navegador.
  const atrasadas = tareas.filter((t) => esAtrasada(t));

  // Por defecto se muestran solo las activas; Realizado/Cancelado se ven al elegirlos en el filtro.
  const visibles = tareas.filter((t) => {
    const g = grupoDeEstado(t.estado);
    return filtro === "activas" ? ESTADOS_ACTIVOS.includes(g) : g === filtro;
  });

  // A quién se puede asignar desde esta pantalla: el directorio del CRM, o los miembros
  // reales del departamento cuando la vista está acotada.
  const usuariosDisponibles: OpcionUsuario[] = enContexto ? miembros : usuarios;

  // Opciones dinámicas de los filtros, según el alcance del usuario (sin nombres hardcodeados).
  // En una vista acotada la lista ya viene del servidor (miembros reales de esa área), así
  // que no se vuelve a filtrar por departamento compartido: se mostraría vacía.
  const responsablesFiltro = !esMando
    ? []
    : enContexto
      ? usuariosDisponibles
      : usuarios.filter((u) =>
          u.activo === false
            ? false
            : esSuperAdmin || u.id === usuario!.id || compartenDepartamento(u, idsDeptoUsuario),
        );
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
          {contexto && <span className="text-neutral-500 font-normal"> · {contexto.departamento}</span>}
        </h1>
        <div className="flex items-center gap-2">
          {/* El reporte exportable deja elegir cualquier departamento del alcance, así que
              no tiene sentido dentro de una vista acotada: solo existe en la general. */}
          {esSuperAdmin && !enContexto && (
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
            ? `Solo las tareas de ${contexto?.departamento ?? "tu área"} asignadas directamente a ti.`
            : contexto
              ? `Todas las tareas de ${contexto.departamento} que puedes consultar.`
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

      {/* 🎂 Recordatorios de cumpleaños en su ventana de aviso — grupo propio arriba de
          las tareas. Solo para quien tiene acceso al módulo (Marketing/Podcast/ADMIN);
          no altera la consulta, los estados ni los permisos de las tareas normales. */}
      {!permisos.cargando && permisos.puedeVerCumpleanos && <RecordatoriosCumpleanos />}

      {/* Lista de tareas */}
      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">{sinResultados}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibles.map((t) => (
            <TareaCard key={t.id} tarea={t} onUpdate={cargar} usuarios={usuariosDisponibles} agruparEstados contexto={contexto} />
          ))}
        </div>
      )}

      {mostrarForm && (
        <TareaForm
          onCreada={() => { setMostrarForm(false); cargar(); }}
          onCancel={() => setMostrarForm(false)}
          usuarios={usuariosDisponibles}
          contexto={contexto}
        />
      )}

      {/* El botón "Exportar reporte" solo existe para SUPER_ADMIN; ADMIN, SUPERVISOR y
          USUARIO no lo ven. El backend además lo garantiza (requireRole SUPER_ADMIN). */}
      {mostrarReporte && esSuperAdmin && usuario && !enContexto && (
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
