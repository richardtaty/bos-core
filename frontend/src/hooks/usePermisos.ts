import { useEffect, useState } from "react";
import { useAuth } from "../api/AuthContext";

// ─── Modelo de permisos por unidad de negocio ─────────────────────

export interface PermisosDepartamento {
  nombreDepto: string | null;
  esSuperAdmin: boolean;
  cargando: boolean;
  menuSecciones: string[];
  rutasProtegidas: string[];
  puedeVerPipelines: boolean;
  puedeVerPipelineKanban: boolean;
  puedeVerCEO: boolean;
  puedeVerReportesGlobales: boolean;
}

const SUPER_ADMIN_PERMISOS: PermisosDepartamento = {
  nombreDepto: null,
  esSuperAdmin: true,
  cargando: false,
  menuSecciones: ["moc", "ventas", "bmf", "podcast", "ceo", "scrum-ventas", "scrum-operaciones"],
  rutasProtegidas: ["/moc", "/ventas", "/bmf", "/podcast", "/ceo", "/lider", "/dashboard", "/scrum"],
  puedeVerPipelines: true,
  puedeVerPipelineKanban: true,
  puedeVerCEO: true,
  puedeVerReportesGlobales: true,
};

// Los nombres de departamento son estables (no cambian entre deploy).
const PERMISOS_POR_NOMBRE: Record<string, Partial<PermisosDepartamento>> = {
  Marketing: {
    menuSecciones: ["moc"],
    rutasProtegidas: ["/moc", "/lider", "/dashboard"],
    puedeVerPipelines: false,
    puedeVerPipelineKanban: false,
    puedeVerCEO: false,
    puedeVerReportesGlobales: false,
  },
  "Sala de OFERTAS": {
    menuSecciones: ["ventas"],
    rutasProtegidas: ["/ventas"],
    puedeVerPipelines: true,
    puedeVerPipelineKanban: true,
    puedeVerCEO: false,
    puedeVerReportesGlobales: false,
  },
  "Business Market Finders": {
    menuSecciones: ["bmf"],
    rutasProtegidas: ["/bmf"],
    puedeVerPipelines: true,
    puedeVerPipelineKanban: true,
    puedeVerCEO: false,
    puedeVerReportesGlobales: false,
  },
  Podcast: {
    menuSecciones: ["podcast"],
    rutasProtegidas: ["/podcast"],
    puedeVerPipelines: true,
    puedeVerPipelineKanban: true,
    puedeVerCEO: false,
    puedeVerReportesGlobales: false,
  },
  // Áreas con tablero Scrum propio. Hoy no tienen usuarios asignados: solo el
  // Super Admin ve estos tableros. Al asignar gente a estas áreas, el acceso
  // ya queda resuelto sin tocar código.
  Ventas: {
    menuSecciones: ["scrum-ventas"],
    rutasProtegidas: ["/scrum/ventas"],
    puedeVerPipelines: false,
    puedeVerPipelineKanban: false,
    puedeVerCEO: false,
    puedeVerReportesGlobales: false,
  },
  Operaciones: {
    menuSecciones: ["scrum-operaciones"],
    rutasProtegidas: ["/scrum/operaciones"],
    puedeVerPipelines: false,
    puedeVerPipelineKanban: false,
    puedeVerCEO: false,
    puedeVerReportesGlobales: false,
  },
};

const PERMISO_MINIMO: PermisosDepartamento = {
  nombreDepto: null,
  esSuperAdmin: false,
  cargando: false,
  menuSecciones: [],
  rutasProtegidas: [],
  puedeVerPipelines: false,
  puedeVerPipelineKanban: false,
  puedeVerCEO: false,
  puedeVerReportesGlobales: false,
};

const PERMISO_CARGANDO: PermisosDepartamento = {
  nombreDepto: null,
  esSuperAdmin: false,
  cargando: true,
  menuSecciones: [],
  rutasProtegidas: [],
  puedeVerPipelines: false,
  puedeVerPipelineKanban: false,
  puedeVerCEO: false,
  puedeVerReportesGlobales: false,
};

// ─── Caché global de departamentos ───────────────────────────────
// Se comparte entre todos los componentes para no re-cargar.

let _deptosPromise: Promise<{ id: string; nombre: string }[]> | null = null;
let _deptosCache: { id: string; nombre: string }[] | null = null;

async function cargarDepartamentos(): Promise<{ id: string; nombre: string }[]> {
  if (_deptosCache) return _deptosCache;
  if (!_deptosPromise) {
    _deptosPromise = (async () => {
      try {
        const { api } = await import("../api/client");
        const deptos = await api.listarDepartamentos();
        _deptosCache = deptos.map((d: any) => ({ id: d.id, nombre: d.nombre }));
      } catch {
        _deptosCache = [];
      }
      return _deptosCache;
    })();
  }
  return _deptosPromise;
}

function resolverNombreDepto(
  departamentoId: string | null | undefined,
  deptos: { id: string; nombre: string }[],
): string | null {
  if (!departamentoId) return null;
  const d = deptos.find((x) => x.id === departamentoId);
  return d?.nombre ?? null;
}

/**
 * Hook de permisos. Resuelve asíncronamente el nombre del departamento
 * y devuelve los permisos correspondientes. Mientras carga, devuelve
 * permisos mínimos (sin menú de negocio). SUPER_ADMIN no espera.
 */
export function usePermisos(): PermisosDepartamento {
  const { usuario } = useAuth();
  const [deptos, setDeptos] = useState(_deptosCache);
  const [cargando, setCargando] = useState(!_deptosCache);

  useEffect(() => {
    if (!_deptosCache && cargando) {
      cargarDepartamentos().then((d) => {
        setDeptos(d);
        setCargando(false);
      });
    }
  }, [cargando]);

  // SUPER_ADMIN → acceso total inmediato, sin esperar.
  if (usuario?.rol === "SUPER_ADMIN") {
    return SUPER_ADMIN_PERMISOS;
  }

  // Si aún estamos cargando los departamentos, devolver estado de carga.
  if (cargando || !deptos) {
    return PERMISO_CARGANDO;
  }

  // Mergear permisos de todos los departamentos del usuario (multi-depto)
  const deptoIds = usuario?.departamentoIds ?? (usuario?.departamentoId ? [usuario.departamentoId] : []);
  const nombresDeptos = deptoIds
    .map((id) => resolverNombreDepto(id, deptos))
    .filter((n): n is string => n !== null);

  if (nombresDeptos.length === 0) return PERMISO_MINIMO;

  // Merge: unión de menúSecciones, rutasProtegidas, y OR de booleanos
  const mergedMenuSecciones = [...new Set(nombresDeptos.flatMap((n) => PERMISOS_POR_NOMBRE[n]?.menuSecciones ?? []))];
  const mergedRutas = [...new Set(nombresDeptos.flatMap((n) => PERMISOS_POR_NOMBRE[n]?.rutasProtegidas ?? []))];
  const puedeVerPipelines = nombresDeptos.some((n) => PERMISOS_POR_NOMBRE[n]?.puedeVerPipelines ?? false);
  const puedeVerPipelineKanban = nombresDeptos.some((n) => PERMISOS_POR_NOMBRE[n]?.puedeVerPipelineKanban ?? false);
  const puedeVerCEO = nombresDeptos.some((n) => PERMISOS_POR_NOMBRE[n]?.puedeVerCEO ?? false);
  const puedeVerReportesGlobales = nombresDeptos.some((n) => PERMISOS_POR_NOMBRE[n]?.puedeVerReportesGlobales ?? false);

  return {
    nombreDepto: nombresDeptos.join(", "),
    esSuperAdmin: false,
    cargando: false,
    menuSecciones: mergedMenuSecciones,
    rutasProtegidas: mergedRutas,
    puedeVerPipelines,
    puedeVerPipelineKanban,
    puedeVerCEO,
    puedeVerReportesGlobales,
  };
}
