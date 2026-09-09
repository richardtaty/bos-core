import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "../api/client";
import type { TareaPendiente } from "../types";

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

/** Para ATRASADAS: cuánto lleva vencido el seguimiento (solo tiene sentido en fechas pasadas). */
function etiquetaVencimiento(iso: string): string {
  const dias = diasDiferencia(iso);
  if (dias === -1) return "Vencido ayer";
  if (dias < -1) return `Vencido hace ${Math.abs(dias)} días`;
  return "";
}

function soloFecha(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

function fmtYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// Quita emojis y caracteres fuera de Latin-1 que la fuente Helvetica del PDF no puede dibujar.
function pdfSafe(s: string): string {
  return s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

type ClaveGrupo = "atrasadas" | "hoy" | "proximas";

// Los tres bloques del resumen operativo. Cada uno define su color, pero los contadores
// y el contenido salen SIEMPRE de los registros reales (nunca hardcodeados).
const GRUPOS_DEF: {
  clave: ClaveGrupo;
  etiqueta: string;
  dot: string; // punto de color del encabezado
  pill: string; // contador del grupo
  tarjeta: string; // contenedor de cada registro al desplegar
  vacio: string;
  conVencimiento: boolean; // solo ATRASADAS muestra cuánto lleva vencido
}[] = [
  {
    clave: "atrasadas",
    etiqueta: "ATRASADAS",
    dot: "bg-danger-500",
    pill: "bg-danger-500 text-white",
    tarjeta: "bg-danger-50 border-danger-100",
    vacio: "Nada vencido. ¡Todo al día!",
    conVencimiento: true,
  },
  {
    clave: "hoy",
    etiqueta: "PARA HOY",
    dot: "bg-success-500",
    pill: "bg-success-500 text-white",
    tarjeta: "bg-success-50 border-success-100",
    vacio: "Sin seguimientos pendientes para hoy.",
    conVencimiento: false,
  },
  {
    clave: "proximas",
    etiqueta: "PRÓXIMAS",
    dot: "bg-warning-500",
    pill: "bg-warning-500 text-neutral-900",
    tarjeta: "bg-warning-50 border-warning-100",
    vacio: "Sin próximos seguimientos agendados.",
    conVencimiento: false,
  },
];

export function CalendarioPage() {
  const [tareas, setTareas] = useState<TareaPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  // Resumen colapsable: cada bloque abre/cierra por separado (no es un acordeón exclusivo).
  // Por defecto todo contraído: al entrar se ve el resumen con los contadores.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<ClaveGrupo, boolean>>({
    atrasadas: false,
    hoy: false,
    proximas: false,
  });

  const alternarGrupo = (clave: ClaveGrupo) =>
    setGruposAbiertos((prev) => ({ ...prev, [clave]: !prev[clave] }));

  const cargar = useCallback(async () => {
    const data = await api.listarTareasPendientes(false);
    setTareas(data.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()));
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const responsables = Array.from(new Set(tareas.map((t) => t.responsableNombre))).sort();

  // Filtro por rango de fechas + responsable
  const enRango = tareas.filter((t) => {
    const f = soloFecha(t.fecha);
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  });
  const filtradas = filtroResponsable ? enRango.filter((t) => t.responsableNombre === filtroResponsable) : enRango;

  // Clasificación mutuamente excluyente según fecha real y estado (solo llegan pendientes).
  // Como `filtradas` conserva el orden asc por fecha: ATRASADAS queda de la más vencida
  // a la menos vencida, y PRÓXIMAS de la más cercana hacia las posteriores.
  const atrasadas = filtradas.filter((t) => diasDiferencia(t.fecha) < 0);
  const hoy = filtradas.filter((t) => diasDiferencia(t.fecha) === 0);
  const proximas = filtradas.filter((t) => diasDiferencia(t.fecha) > 0);

  const itemsPorClave: Record<ClaveGrupo, TareaPendiente[]> = { atrasadas, hoy, proximas };

  const rangoLabel =
    desde || hasta
      ? `${desde ? fmtYMD(desde) : "inicio"} – ${hasta ? fmtYMD(hasta) : "hoy"}`
      : "Todo el histórico";

  function exportarPDF() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235); // azul primario
    doc.text("Calendario del equipo", 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    const subtitulo = `Período: ${rangoLabel}${filtroResponsable ? `  ·  Responsable: ${filtroResponsable}` : ""}`;
    doc.text(pdfSafe(subtitulo), 14, 25);
    doc.text(`Total de seguimientos: ${filtradas.length}`, 14, 31);

    const ordenadas = [...filtradas].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    const body = ordenadas.map((t) => [fmtFecha(t.fecha), pdfSafe(t.personaNombre), pdfSafe(t.nota ?? ""), pdfSafe(t.responsableNombre)]);

    autoTable(doc, {
      head: [["Fecha", "Contacto", "Seguimiento", "Responsable"]],
      body,
      startY: 37,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 248, 251] },
    });

    doc.save("calendario-seguimientos.pdf");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">Calendario del equipo</h1>
        <button
          onClick={exportarPDF}
          disabled={filtradas.length === 0}
          className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 disabled:cursor-not-allowed"
        >
          ⬇ Exportar PDF
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">Todos los seguimientos pendientes, de todo el equipo</p>

      {/* Filtros: rango de fechas + responsable */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <span className="text-xs text-neutral-500 block mb-1">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <span className="text-xs text-neutral-500 block mb-1">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <span className="text-xs text-neutral-500 block mb-1">Responsable</span>
          <select
            value={filtroResponsable}
            onChange={(e) => setFiltroResponsable(e.target.value)}
            className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">Todo el equipo</option>
            {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {(desde || hasta || filtroResponsable) && (
          <button
            onClick={() => { setDesde(""); setHasta(""); setFiltroResponsable(""); }}
            className="text-xs text-primary-600 hover:underline py-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <p className="text-xs text-neutral-500 mb-4">Mostrando {filtradas.length} seguimiento{filtradas.length !== 1 ? "s" : ""} · {rangoLabel}</p>

      {/* Resumen operativo: ATRASADAS · PARA HOY · PRÓXIMAS.
          Cada bloque abre y cierra por separado; al entrar todo queda contraído
          para ver de un vistazo los contadores sin llenar la pantalla de listas. */}
      <div className="flex flex-col gap-3">
        {GRUPOS_DEF.map((def) => {
          const items = itemsPorClave[def.clave];
          const abierto = gruposAbiertos[def.clave];
          return (
            <div key={def.clave}>
              <button
                type="button"
                onClick={() => alternarGrupo(def.clave)}
                aria-expanded={abierto}
                title={abierto ? "Contraer" : "Desplegar"}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-neutral-200 bg-white text-left transition-colors hover:bg-neutral-50"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span aria-hidden className={`w-2.5 h-2.5 rounded-full shrink-0 ${def.dot}`} />
                  <span className="text-sm font-semibold tracking-wide text-neutral-800">{def.etiqueta}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span
                    aria-label={`${items.length} ${items.length === 1 ? "registro" : "registros"}`}
                    className={`text-[11px] font-bold min-w-[22px] h-5 px-1.5 inline-flex items-center justify-center rounded-full ${def.pill}`}
                  >
                    {items.length}
                  </span>
                  <span aria-hidden className="text-[10px] text-neutral-400">{abierto ? "▼" : "▶"}</span>
                </span>
              </button>

              {abierto && (
                <div className="mt-2 flex flex-col gap-2">
                  {items.length === 0 ? (
                    <p className="text-xs text-neutral-500 px-2 py-1">{def.vacio}</p>
                  ) : (
                    items.map((t) => (
                      <Link
                        key={t.id}
                        to={`/personas/${t.personaId}`}
                        className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${def.tarjeta} hover:opacity-80`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{t.personaNombre}</p>
                          {t.nota ? <p className="text-xs text-neutral-500 truncate">{t.nota}</p> : null}
                        </div>
                        <div className="text-right shrink-0">
                          {def.conVencimiento && etiquetaVencimiento(t.fecha) && (
                            <span className="text-[10px] font-semibold text-danger-600 block">{etiquetaVencimiento(t.fecha)}</span>
                          )}
                          <span className="text-xs text-neutral-600 block">{fmtFecha(t.fecha)}</span>
                          <span className="text-[10px] text-neutral-500 block">{t.responsableNombre}</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
