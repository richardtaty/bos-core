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

export function CalendarioPage() {
  const [tareas, setTareas] = useState<TareaPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

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

  const atrasadas = filtradas.filter((t) => diasDiferencia(t.fecha) < 0);
  const hoy = filtradas.filter((t) => diasDiferencia(t.fecha) === 0);
  const proximas = filtradas.filter((t) => diasDiferencia(t.fecha) > 0);

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

  const Grupo = ({ titulo, items, colorClase }: { titulo: string; items: TareaPendiente[]; colorClase: string }) => (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-neutral-700 mb-2">
        {titulo} <span className="text-neutral-400 font-normal">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-400">Nada aquí.</p>
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
              <div className="text-right">
                <span className="text-xs text-neutral-500 block">{fmtFecha(t.fecha)}</span>
                <span className="text-[10px] text-neutral-400">{t.responsableNombre}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-900">Calendario del equipo</h1>
        <button
          onClick={exportarPDF}
          disabled={filtradas.length === 0}
          className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ⬇ Exportar PDF
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">Todos los seguimientos pendientes, de todo el equipo</p>

      {/* Filtros: rango de fechas + responsable */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
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

      <Grupo titulo="Atrasadas" items={atrasadas} colorClase="bg-danger-50 border-danger-100" />
      <Grupo titulo="Para hoy" items={hoy} colorClase="bg-warning-50 border-warning-100" />
      <Grupo titulo="Próximas" items={proximas} colorClase="bg-neutral-50 border-neutral-200" />
    </div>
  );
}
