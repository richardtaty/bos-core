import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../api/AuthContext";
import { CambiarPasswordModal } from "../components/CambiarPasswordModal";
import { RevenueTicker } from "../components/RevenueTicker";
import { NuevoTicketModal } from "../components/NuevoTicketModal";
import { api } from "../api/client";
import { usePermisos } from "../hooks/usePermisos";
import type { PermisosDepartamento } from "../hooks/usePermisos";

interface NavItem {
  to: string;
  label: string;
  seccion?: string;
  badge?: "propias" | "equipo";
}

function buildNav(p: PermisosDepartamento, rol?: string): NavItem[] {
  const items: NavItem[] = [];

  // ── DEV: tareas de desarrollo + tickets. Sección propia, solo Super Admin. ──
  // Va PRIMERO y contiene solo sus accesos; la sección que le sigue abre con su
  // propio encabezado, así ningún otro módulo queda agrupado bajo DEV.
  if (p.esSuperAdmin) {
    items.push(
      { to: "/dev", label: "Tareas", seccion: "dev" },
      { to: "/dev/tickets", label: "🎫 Tickets", seccion: "dev" },
    );
  }

  // ── Marketing Operations Center ──────────────────────
  if (p.menuSecciones.includes("moc")) {
    items.push(
      { to: "/moc", label: "📊 Marketing", seccion: "moc" },
      { to: "/moc/reportes", label: "📝 Reportes diarios", seccion: "moc" },
      { to: "/moc/scrum", label: "📋 Scrum Board", seccion: "moc" },
      { to: "/moc/proyectos", label: "📁 Proyectos", seccion: "moc" },
      { to: "/moc/tareas", label: "📋 Tareas", seccion: "moc" },
      { to: "/moc/calendario", label: "📅 Calendario", seccion: "moc" },
      { to: "/moc/recursos", label: "🔗 Recursos", seccion: "moc" },
      { to: "/moc/meta-ads", label: "📊 Métricas Meta Ads", seccion: "moc" },
    );
  }

  // ── Tableros Scrum de otras áreas ────────────────────
  // `seccion` aquí solo agrupa visualmente bajo un mismo encabezado; el
  // permiso real se decide arriba con menuSecciones.
  if (p.menuSecciones.includes("scrum-ventas")) {
    items.push({ to: "/scrum/ventas", label: "📋 Ventas", seccion: "scrum" });
  }
  if (p.menuSecciones.includes("scrum-operaciones")) {
    items.push({ to: "/scrum/operaciones", label: "📋 Operaciones", seccion: "scrum" });
  }

  // ── Sala de OFERTAS ──────────────────────────────────
  // Centro de la operación comercial: agrupa los accesos a Sala de Ofertas,
  // Reportes diarios, Tareas, Calendario, Pipelines y Reporte de Ventas.
  // Solo se muestra a quien ve esta sección (permiso real decidido arriba).
  if (p.menuSecciones.includes("ventas")) {
    items.push(
      { to: "/ventas", label: "💰 Resumen de Ventas", seccion: "ventas" },
      { to: "/reportes-diarios", label: "📝 Reportes diarios", seccion: "ventas" },
      { to: "/tareas", label: "📋 Tareas", seccion: "ventas" },
      { to: "/calendario", label: "📅 Calendario", seccion: "ventas" },
    );
    if (p.puedeVerPipelineKanban) {
      items.push({ to: "/pipelines", label: "🔄 Pipelines", seccion: "ventas" });
    }
    items.push({ to: "/reporte-ventas", label: "💰 Reporte de Ventas", seccion: "ventas" });
  }

  // ── BMF ──────────────────────────────────────────────
  if (p.menuSecciones.includes("bmf")) {
    items.push(
      { to: "/bmf", label: "🏦 BMF Dashboard", seccion: "bmf" },
      { to: "/bmf/lenders", label: "🏛 Lenders", seccion: "bmf" },
      { to: "/bmf/fundings", label: "💵 Fundings", seccion: "bmf" },
      { to: "/bmf/solicitudes", label: "📋 Solicitudes", seccion: "bmf" },
      { to: "/bmf/llamadas", label: "📞 Llamadas", seccion: "bmf" },
      { to: "/bmf/comisiones", label: "💸 Comisiones", seccion: "bmf" },
      { to: "/bmf/reportes", label: "📊 Reportes", seccion: "bmf" },
      { to: "/bmf/agentes", label: "👥 Agentes", seccion: "bmf" },
      { to: "/bmf/admin", label: "⚙️ Admin BMF", seccion: "bmf" },
      { to: "/calendario", label: "📅 Calendario", seccion: "bmf" },
    );
  }

  // ── Podcast ──────────────────────────────────────────
  if (p.menuSecciones.includes("podcast")) {
    items.push(
      { to: "/podcast", label: "🎙 Podcast", seccion: "podcast" },
      { to: "/podcast/calendario", label: "📅 Calendario", seccion: "podcast" },
      { to: "/podcast/reporte-diario", label: "📝 Cierre diario", seccion: "podcast" },
      { to: "/podcast/desempeno", label: "📈 Mi desempeño", seccion: "podcast" },
    );
    if (p.esSuperAdmin || rol === "ADMIN") {
      items.push(
        { to: "/podcast/equipo", label: "👥 Equipo", seccion: "podcast" },
        { to: "/podcast/inteligencia", label: "🧠 Inteligencia", seccion: "podcast" },
      );
    }
  }

  // ── CEO ──────────────────────────────────────────────
  if (p.puedeVerCEO) {
    items.push(
      { to: "/ceo", label: "🏢 CEO Dashboard", seccion: "ceo" },
      { to: "/ceo-mode", label: "🏁 CEO Mode", seccion: "ceo" },
      { to: "/command-center", label: "💵 Command Center", seccion: "ceo" },
      { to: "/ingresos", label: "💵 Motor de Ingresos", seccion: "ceo" },
      { to: "/seguridad", label: "🔐 Seguridad", seccion: "ceo" },
    );
  }

  // ── Compartidos (todos los usuarios) → sección General ──────
  const generales: NavItem[] = [
    { to: "/mi-dia", label: "📍 Mi día", badge: "propias", seccion: "general" },
    { to: "/centro-actividad", label: "🕐 Actividad", seccion: "general" },
  ];
  // Tareas: quien ve SALA DE OFERTAS la usa desde esa sección (centro de la
  // operación comercial); los demás departamentos la conservan aquí. Nunca duplicada.
  if (!p.menuSecciones.includes("ventas")) {
    generales.push({ to: "/tareas", label: "📋 Tareas", seccion: "general" });
  }
  generales.push(
    { to: "/equipo", label: "⚙️ Mi Equipo", seccion: "general" },
    { to: "/personas", label: "👤 Clientes", seccion: "general" },
  );
  items.push(...generales);

  // 🎂 Próximos cumpleaños — solo para quien puede verlo (Marketing/Podcast/ADMIN).
  if (p.puedeVerCumpleanos) {
    items.push({ to: "/cumpleanos", label: "🎂 Próximos cumpleaños", seccion: "general" });
  }

  return items;
}

function diasDiferencia(fechaIso: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaIso);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
}

export function AppLayout() {
  const { usuario, logout } = useAuth();
  const permisos = usePermisos();
  const [modalPassword, setModalPassword] = useState(false);
  // Botón flotante global "Crear ticket": cualquier usuario autenticado puede abrirlo
  // desde cualquier página (AppLayout solo existe bajo RutaProtegida). No aparece en /login.
  const [mostrarTicket, setMostrarTicket] = useState(false);
  const [conteoPropias, setConteoPropias] = useState(0);
  const [conteoEquipo, setConteoEquipo] = useState(0);
  const [notificado, setNotificado] = useState(false);
  const [notificadoCumple, setNotificadoCumple] = useState(false);
  // Sección del sidebar expandida (acordeón). Máximo una a la vez; empieza todo comprimido.
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>(null);

  const { pathname } = useLocation();

  // Ítems del menú (permisos ya resueltos arriba) y sección del módulo activo:
  // al navegar, la sección que contiene la página actual se mantiene abierta.
  const items = buildNav(permisos, usuario?.rol);
  const seccionActiva =
    items.find((i) => pathname === i.to || pathname.startsWith(i.to + "/"))?.seccion ?? null;

  useEffect(() => {
    if (seccionActiva) setSeccionAbierta(seccionActiva);
  }, [seccionActiva]);

  const actualizarConteos = useCallback(async () => {
    const [propias, equipo] = await Promise.all([
      api.listarTareasPendientes(true),
      api.listarTareasPendientes(false),
    ]);
    const vencidasPropias = propias.filter((t) => diasDiferencia(t.fecha) <= 0).length;
    const vencidasEquipo = equipo.filter((t) => diasDiferencia(t.fecha) <= 0).length;
    setConteoPropias(vencidasPropias);
    setConteoEquipo(vencidasEquipo);

    // Recordatorio del navegador — una sola vez por sesión, no cada vez que se actualiza.
    if (vencidasPropias > 0 && !notificado) {
      setNotificado(true);
      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("Taty's Enterprises BOS", {
            body: `Tienes ${vencidasPropias} seguimiento${vencidasPropias > 1 ? "s" : ""} pendiente${vencidasPropias > 1 ? "s" : ""} de hoy o atrasado${vencidasPropias > 1 ? "s" : ""}.`,
          });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission();
        }
      }
    }

    // Notificación de cumpleaños — una sola vez por sesión
    try {
      const cumple = await api.cumpleanos();
      if (cumple.hoy.length > 0 && !notificadoCumple) {
        setNotificadoCumple(true);
        if ("Notification" in window && Notification.permission === "granted") {
          const nombres = cumple.hoy.map((c) => c.personaNombre).join(", ");
          new Notification("🎂 Taty's Enterprises BOS", {
            body: `¡Hoy cumple años: ${nombres}!`,
          });
        }
      }
    } catch {
      // Si falla la carga de cumpleaños, no interrumpir la experiencia
    }
  }, [notificado, notificadoCumple]);

  useEffect(() => {
    void actualizarConteos();
    const intervalo = setInterval(() => void actualizarConteos(), 60000);
    return () => clearInterval(intervalo);
  }, [actualizarConteos]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 bg-neutral-50 border-r border-neutral-200 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-6 px-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-secondary-700 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-primary-500/20">
            TE
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight text-neutral-900">Taty's Enterprises</p>
            <p className="text-[11px] text-neutral-500">BOS</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto">
          {(() => {
            const headerLabels: Record<string, string> = {
              moc: "Marketing Ops",
              scrum: "Tableros Scrum",
              ventas: "Sala de OFERTAS",
              bmf: "Business Market Finders",
              podcast: "Podcast",
              ceo: "CEO",
              dev: "DEV",
              general: "General",
            };

            const badgeDe = (item: NavItem) =>
              item.badge === "propias" ? conteoPropias : item.badge === "equipo" ? conteoEquipo : 0;

            // Todo módulo pertenece a una sección (buildNav ya lo marca). Se agrupa UNA
            // sola vez por sección, en el orden en que aparece por primera vez, así no hay
            // encabezados duplicados ni módulos sueltos. Si algo quedara sin seccion, cae
            // en "general" como red de seguridad.
            type GrupoNav = { id: string; etiqueta: string; items: NavItem[] };
            const grupos: GrupoNav[] = [];
            const indiceGrupo: Record<string, number> = {};
            for (const item of items) {
              const sec = item.seccion ?? "general";
              if (sec in indiceGrupo) {
                grupos[indiceGrupo[sec]].items.push(item);
              } else {
                indiceGrupo[sec] = grupos.length;
                grupos.push({ id: sec, etiqueta: headerLabels[sec] ?? sec, items: [item] });
              }
            }

            const renderNavLink = (item: NavItem, key: string) => {
              const badgeCount = badgeDe(item);
              return (
                <NavLink
                  key={key}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between transition-all ${
                      isActive
                        ? "bg-primary-500/15 text-primary-700"
                        : "text-neutral-600 hover:bg-neutral-100"
                    }`
                  }
                >
                  <span>{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="bg-danger-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm shadow-danger-500/30">
                      {badgeCount}
                    </span>
                  )}
                </NavLink>
              );
            };

            return grupos.map((grupo) => {
              const abierta = seccionAbierta === grupo.id;
              return (
                <div key={grupo.id}>
                  <button
                    type="button"
                    onClick={() => setSeccionAbierta(abierta ? null : grupo.id)}
                    aria-expanded={abierta}
                    className="w-full flex items-center justify-between text-left text-[10px] font-semibold uppercase text-neutral-500 tracking-wider mt-3 mb-1 px-1 cursor-pointer hover:text-neutral-800 transition-colors"
                  >
                    <span>{grupo.etiqueta}</span>
                    <span
                      aria-hidden="true"
                      className={`text-[9px] text-neutral-400 transition-transform duration-200 ${abierta ? "rotate-90" : ""}`}
                    >
                      ›
                    </span>
                  </button>
                  {abierta && (
                    <div className="flex flex-col gap-1 pl-2">
                      {grupo.items.map((item, idx) => renderNavLink(item, `${grupo.id}:${idx}`))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </nav>

        <div className="mt-auto pt-4 border-t border-neutral-200">
          <p className="text-xs text-neutral-500 mb-1">Sesión</p>
          <p className="text-sm font-medium text-neutral-900">{usuario?.nombre}</p>
          <p className="text-[11px] text-neutral-500 mb-3">{usuario?.rol}</p>
          <button onClick={() => setModalPassword(true)} className="text-xs text-neutral-500 hover:underline block mb-1.5">
            Cambiar contraseña
          </button>
          <button onClick={logout} className="text-xs text-danger-600 hover:underline">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <RevenueTicker />
        <main className="flex-1 p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {modalPassword && <CambiarPasswordModal onClose={() => setModalPassword(false)} />}

      {/* Botón flotante global para crear tickets (esquina inferior izquierda; el chat
          de BMF ya ocupa la derecha). No altera el layout de ninguna página: es un
          overlay fixed. Al enviar el ticket se cierra el modal sin redirigir a DEV. */}
      {!mostrarTicket && (
        <button
          type="button"
          onClick={() => setMostrarTicket(true)}
          title="Enviar una solicitud de ajuste, error o mejora a DEV"
          className="shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-shadow"
          style={{ position: "fixed", bottom: 24, left: 24, zIndex: 9990 }}
        >
          <span className="flex items-center gap-2 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2.5">
            🎫 Crear ticket
          </span>
        </button>
      )}

      {mostrarTicket && <NuevoTicketModal onClose={() => setMostrarTicket(false)} />}
    </div>
  );
}
