import { NavLink, Outlet } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../api/AuthContext";
import { CambiarPasswordModal } from "../components/CambiarPasswordModal";
import { RevenueTicker } from "../components/RevenueTicker";
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
  if (p.menuSecciones.includes("ventas")) {
    items.push(
      { to: "/ventas", label: "💰 Sala de OFERTAS", seccion: "ventas" },
      { to: "/calendario", label: "📅 Calendario", seccion: "ventas" },
    );
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

  // ── Compartidos (todos los usuarios) ─────────────────
  items.push(
    { to: "/mi-dia", label: "📍 Mi día", badge: "propias" },
    { to: "/centro-actividad", label: "🕐 Actividad" },
    { to: "/tareas", label: "📋 Tareas" },
    { to: "/equipo", label: "⚙️ Mi Equipo" },
    { to: "/personas", label: "👤 Clientes" },
  );

  // Pipelines (solo deptos que venden)
  if (p.puedeVerPipelineKanban) {
    items.push(
      { to: "/pipelines", label: "🔄 Pipelines", seccion: p.menuSecciones.includes("ventas") ? "ventas" : undefined },
    );
  }

  // Reporte de ventas (Sala de OFERTAS, BMF y Podcast — los que venden)
  if (p.puedeVerReportesGlobales || p.menuSecciones.includes("ventas") || p.menuSecciones.includes("bmf") || p.menuSecciones.includes("podcast")) {
    items.push(
      { to: "/reporte-ventas", label: "💰 Reporte Ventas" },
    );
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
  const [conteoPropias, setConteoPropias] = useState(0);
  const [conteoEquipo, setConteoEquipo] = useState(0);
  const [notificado, setNotificado] = useState(false);
  const [notificadoCumple, setNotificadoCumple] = useState(false);

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
    <div className="flex min-h-screen">
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

        <nav className="flex flex-col gap-1 overflow-y-auto">
          {(() => {
            const items = buildNav(permisos, usuario?.rol);
            return items.map((item, i) => {
              const prevSeccion = i > 0 ? items[i - 1].seccion : undefined;
              const mostrarHeader = item.seccion && item.seccion !== prevSeccion;
              const headerLabels: Record<string, string> = {
                moc: "Marketing Ops",
                scrum: "Tableros Scrum",
                ventas: "Sala de OFERTAS",
                bmf: "Business Market Finders",
                podcast: "Podcast",
                ceo: "CEO",
              };
              const badgeCount = item.badge === "propias" ? conteoPropias : item.badge === "equipo" ? conteoEquipo : 0;
              return (
                <div key={item.to}>
                  {mostrarHeader && (
                    <p className="text-[10px] font-semibold uppercase text-neutral-500 tracking-wider mt-3 mb-1 px-1">
                      {headerLabels[item.seccion!] ?? item.seccion}
                    </p>
                  )}
                  <NavLink
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
    </div>
  );
}
