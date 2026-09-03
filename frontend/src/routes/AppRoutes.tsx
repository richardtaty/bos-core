import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../api/AuthContext";
import { usePermisos } from "../hooks/usePermisos";
import { LoginPage } from "../pages/LoginPage";
import { AppLayout } from "../pages/AppLayout";
import { PersonasPage } from "../pages/PersonasPage";
import { PersonaDetailPage } from "../pages/PersonaDetailPage";
import { PipelinesPage } from "../pages/PipelinesPage";
import { EquipoPage } from "../pages/EquipoPage";
import { MiDiaPage } from "../pages/MiDiaPage";
import { CalendarioPage } from "../pages/CalendarioPage";
import { PodcastPage } from "../pages/PodcastPage";
import { PodcastReporteDiarioPage } from "../pages/PodcastReporteDiarioPage";
import { PodcastMiDesempenoPage } from "../pages/PodcastMiDesempenoPage";
import { PodcastEquipoPage } from "../pages/PodcastEquipoPage";
import { PodcastInteligenciaPage } from "../pages/PodcastInteligenciaPage";
import { PodcastCalendarioPage } from "../pages/PodcastCalendarioPage";
import { ReporteVentasPage } from "../pages/ReporteVentasPage";
import { MarketingDashboardPage } from "../pages/MarketingDashboardPage";
import { CentroActividadPage } from "../pages/CentroActividadPage";
import { TareasPage } from "../pages/TareasPage";
import { CalendarioEditorialPage } from "../pages/CalendarioEditorialPage";
import { CentroControlPage } from "../pages/CentroControlPage";
import { ArchivosPage } from "../pages/ArchivosPage";
import { ReportesDiariosPage } from "../pages/ReportesDiariosPage";
import { ScrumBoardPage } from "../pages/ScrumBoardPage";
import { RecursosPage } from "../pages/RecursosPage";
import { DashboardLiderPage } from "../pages/DashboardLiderPage";
import { DashboardCEOPage } from "../pages/DashboardCEOPage";
import { CommandCenterPage } from "../pages/CommandCenterPage";
import { CeoModePage } from "../pages/CeoModePage";
import { ProyectosPage } from "../pages/ProyectosPage";
import { ProyectoDetailPage } from "../pages/ProyectoDetailPage";
import { OrganigramaPage } from "../pages/OrganigramaPage";
import { VerificarPinPage } from "../pages/VerificarPinPage";
import { SeguridadPage } from "../pages/SeguridadPage";
import { VentasDashboardPage } from "../pages/VentasDashboardPage";
import { BmfDashboardPage } from "../pages/BmfDashboardPage";
import { BmfAdminDashboardPage } from "../pages/BmfAdminDashboardPage";
import { BmfLendersPage } from "../pages/BmfLendersPage";
import { BmfFundingsPage } from "../pages/BmfFundingsPage";
import { BmfFundingDetailPage } from "../pages/BmfFundingDetailPage";
import { BmfSolicitudesPage } from "../pages/BmfSolicitudesPage";
import { BmfSolicitudDetailPage } from "../pages/BmfSolicitudDetailPage";
import { BmfLlamadasPage } from "../pages/BmfLlamadasPage";
import { BmfComisionesPage } from "../pages/BmfComisionesPage";
import { BmfReportesPage } from "../pages/BmfReportesPage";
import { BmfAgentesPage } from "../pages/BmfAgentesPage";
import { IngresosPage } from "../pages/IngresosPage";
import { MetaAdsPage } from "../pages/MetaAdsPage";
import { BmfFundingLandingPage } from "../pages/BmfFundingLandingPage";

function RutaProtegida({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Protege rutas de unidad de negocio: solo usuarios del departamento correcto acceden. */
function RutaPorDepartamento({ children, secciones }: { children: React.ReactNode; secciones: string[] }) {
  const permisos = usePermisos();
  // Mientras carga, mostrar la página (el backend igual la protege).
  if (permisos.cargando) return <>{children}</>;
  if (permisos.esSuperAdmin) return <>{children}</>;
  if (!secciones.some((s) => permisos.menuSecciones.includes(s)))
    return <Navigate to="/mi-dia" replace />;
  return <>{children}</>;
}

/** Protege rutas por rol mínimo (ej. vistas de líder). Misma jerarquía que el backend. */
const JERARQUIA_FRONT = ["USUARIO", "TEAM_LEADER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"];
function RutaPorRol({ children, rol }: { children: React.ReactNode; rol: string }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/mi-dia" replace />;
  if (JERARQUIA_FRONT.indexOf(usuario.rol) < JERARQUIA_FRONT.indexOf(rol))
    return <Navigate to="/mi-dia" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verificar-pin" element={<VerificarPinPage />} />
      {/* BMF Funding — landing pública (sin login) */}
      <Route path="/bmf-funding" element={<BmfFundingLandingPage />} />
      <Route
        element={
          <RutaProtegida>
            <AppLayout />
          </RutaProtegida>
        }
      >
        {/* MOC — Marketing Operations Center */}
        <Route path="/moc" element={<RutaPorDepartamento secciones={["moc"]}><MarketingDashboardPage /></RutaPorDepartamento>} />
        <Route path="/moc/reportes" element={<RutaPorDepartamento secciones={["moc"]}><ReportesDiariosPage /></RutaPorDepartamento>} />
        <Route path="/moc/scrum" element={<RutaPorDepartamento secciones={["moc"]}><ScrumBoardPage area="Marketing" /></RutaPorDepartamento>} />
        <Route path="/moc/recursos" element={<RutaPorDepartamento secciones={["moc"]}><RecursosPage /></RutaPorDepartamento>} />
        <Route path="/moc/meta-ads" element={<RutaPorDepartamento secciones={["moc"]}><MetaAdsPage /></RutaPorDepartamento>} />
        <Route path="/moc/tablero" element={<Navigate to="/mi-dia" replace />} />
        <Route path="/moc/tareas" element={<RutaPorDepartamento secciones={["moc"]}><TareasPage /></RutaPorDepartamento>} />
        <Route path="/moc/calendario" element={<RutaPorDepartamento secciones={["moc"]}><CalendarioEditorialPage /></RutaPorDepartamento>} />
        <Route path="/moc/archivos" element={<RutaPorDepartamento secciones={["moc"]}><ArchivosPage /></RutaPorDepartamento>} />
        <Route path="/moc/proyectos" element={<RutaPorDepartamento secciones={["moc"]}><ProyectosPage /></RutaPorDepartamento>} />
        <Route path="/proyectos/:id" element={<ProyectoDetailPage />} />

        {/* Tableros Scrum de otras áreas — mismo componente, distinta área.
            El de Marketing sigue en /moc/scrum para no romper enlaces. */}
        <Route path="/scrum/ventas" element={<RutaPorDepartamento secciones={["scrum-ventas"]}><ScrumBoardPage area="Ventas" /></RutaPorDepartamento>} />
        <Route path="/scrum/operaciones" element={<RutaPorDepartamento secciones={["scrum-operaciones"]}><ScrumBoardPage area="Operaciones" /></RutaPorDepartamento>} />

        {/* Sala de OFERTAS — Ventas */}
        <Route path="/ventas" element={<RutaPorDepartamento secciones={["ventas"]}><VentasDashboardPage /></RutaPorDepartamento>} />

        {/* BMF — Business Market Finders */}
        <Route path="/bmf" element={<RutaPorDepartamento secciones={["bmf"]}><BmfDashboardPage /></RutaPorDepartamento>} />
        <Route path="/bmf/admin" element={<RutaPorDepartamento secciones={["bmf"]}><BmfAdminDashboardPage /></RutaPorDepartamento>} />
        <Route path="/bmf/lenders" element={<RutaPorDepartamento secciones={["bmf"]}><BmfLendersPage /></RutaPorDepartamento>} />
        <Route path="/bmf/fundings" element={<RutaPorDepartamento secciones={["bmf"]}><BmfFundingsPage /></RutaPorDepartamento>} />
        <Route path="/bmf/fundings/:id" element={<RutaPorDepartamento secciones={["bmf"]}><BmfFundingDetailPage /></RutaPorDepartamento>} />
        <Route path="/bmf/solicitudes" element={<RutaPorDepartamento secciones={["bmf"]}><BmfSolicitudesPage /></RutaPorDepartamento>} />
        <Route path="/bmf/solicitudes/:id" element={<RutaPorDepartamento secciones={["bmf"]}><BmfSolicitudDetailPage /></RutaPorDepartamento>} />
        <Route path="/bmf/llamadas" element={<RutaPorDepartamento secciones={["bmf"]}><BmfLlamadasPage /></RutaPorDepartamento>} />
        <Route path="/bmf/comisiones" element={<RutaPorDepartamento secciones={["bmf"]}><BmfComisionesPage /></RutaPorDepartamento>} />
        <Route path="/bmf/reportes" element={<RutaPorDepartamento secciones={["bmf"]}><BmfReportesPage /></RutaPorDepartamento>} />
        <Route path="/bmf/agentes" element={<RutaPorDepartamento secciones={["bmf"]}><BmfAgentesPage /></RutaPorDepartamento>} />

        {/* CEO */}
        <Route path="/ceo" element={<RutaPorDepartamento secciones={["ceo"]}><DashboardCEOPage /></RutaPorDepartamento>} />
        <Route path="/command-center" element={<RutaPorDepartamento secciones={["ceo"]}><CommandCenterPage /></RutaPorDepartamento>} />
        <Route path="/ceo-mode" element={<RutaPorDepartamento secciones={["ceo"]}><CeoModePage /></RutaPorDepartamento>} />
        <Route path="/lider" element={<RutaPorDepartamento secciones={["moc"]}><DashboardLiderPage /></RutaPorDepartamento>} />
        <Route path="/dashboard" element={<RutaPorDepartamento secciones={["moc"]}><DashboardLiderPage /></RutaPorDepartamento>} />

        {/* Podcast */}
        <Route path="/podcast" element={<RutaPorDepartamento secciones={["podcast"]}><PodcastPage /></RutaPorDepartamento>} />
        <Route path="/podcast/calendario" element={<RutaPorDepartamento secciones={["podcast"]}><PodcastCalendarioPage /></RutaPorDepartamento>} />
        <Route path="/podcast/reporte-diario" element={<RutaPorDepartamento secciones={["podcast"]}><PodcastReporteDiarioPage /></RutaPorDepartamento>} />
        <Route path="/podcast/desempeno" element={<RutaPorDepartamento secciones={["podcast"]}><PodcastMiDesempenoPage /></RutaPorDepartamento>} />
        <Route path="/podcast/equipo" element={<RutaPorDepartamento secciones={["podcast"]}><RutaPorRol rol="ADMIN"><PodcastEquipoPage /></RutaPorRol></RutaPorDepartamento>} />
        <Route path="/podcast/inteligencia" element={<RutaPorDepartamento secciones={["podcast"]}><RutaPorRol rol="ADMIN"><PodcastInteligenciaPage /></RutaPorRol></RutaPorDepartamento>} />

        {/* Seguridad (solo SUPER_ADMIN) */}
        <Route path="/seguridad" element={<RutaPorDepartamento secciones={["ceo"]}><SeguridadPage /></RutaPorDepartamento>} />

        {/* Motor de Ingresos (solo SUPER_ADMIN) */}
        <Route path="/ingresos" element={<RutaPorDepartamento secciones={["ceo"]}><IngresosPage /></RutaPorDepartamento>} />

        {/* General — compartido entre todos los departamentos */}
        <Route path="/mi-dia" element={<MiDiaPage />} />
        <Route path="/centro-actividad" element={<CentroActividadPage />} />
        <Route path="/tareas" element={<TareasPage />} />
        <Route path="/organigrama" element={<OrganigramaPage />} />

        {/* Legado */}
        <Route path="/calendario" element={<CalendarioPage />} />
        <Route path="/reporte-ventas" element={<ReporteVentasPage />} />
        <Route path="/personas" element={<PersonasPage />} />
        <Route path="/personas/:id" element={<PersonaDetailPage />} />
        <Route path="/pipelines" element={<PipelinesPage />} />
        <Route path="/equipo" element={<EquipoPage />} />
        <Route path="/equipo/:id" element={<CentroControlPage />} />
        <Route path="/" element={<Navigate to="/mi-dia" replace />} />
      </Route>
    </Routes>
  );
}
