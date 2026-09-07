// Modal "Exportar reporte" de la página de Tareas. El permiso real lo impone el
// backend (reporte-tareas.service.ts + requireRole SUPER_ADMIN en la ruta GET /reporte);
// el botón de Tareas solo existe para SUPER_ADMIN y aquí se conserva el mismo guard:
//   SUPER_ADMIN → elige un departamento o "Todos" y descarga en PDF/Excel/Word.
//   Cualquier otro rol → no ve el botón y, aunque forzara este modal, no descarga nada.
//
// El período se elige con presets ("Semana actual", "Semana anterior", "Mes actual",
// "Mes anterior" o un rango personalizado). Los presets calculan `desde`/`hasta`
// (fecha de creación) y el reporte siempre se genera con ambas fechas.

import { useState } from "react";
import { api } from "../api/client";
import { GRUPOS } from "../lib/estados";
import type { Departamento, Usuario } from "../types";

const FORMATOS = [
  { valor: "pdf" as const, etiqueta: "PDF" },
  { valor: "excel" as const, etiqueta: "Excel" },
  { valor: "word" as const, etiqueta: "Word" },
];
const PERIODOS = [
  { valor: "semana_actual", etiqueta: "Semana actual" },
  { valor: "semana_anterior", etiqueta: "Semana anterior" },
  { valor: "mes_actual", etiqueta: "Mes actual" },
  { valor: "mes_anterior", etiqueta: "Mes anterior" },
  { valor: "personalizado", etiqueta: "Rango personalizado" },
] as const;
type TipoPeriodo = (typeof PERIODOS)[number]["valor"];

interface Props {
  usuario: Usuario;
  usuarios: Usuario[];
  departamentos: Departamento[];
  onClose: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const aYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sumarDias = (d: Date, dias: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
};

/** Lunes de la semana que contiene la fecha dada (lunes = inicio de semana). */
function lunesDe(fecha: Date): Date {
  const offset = (fecha.getDay() + 6) % 7; // domingo(0) → 6, lunes(1) → 0
  return sumarDias(fecha, -offset);
}

/** Calcula [desde, hasta] "YYYY-MM-DD" para un preset, tomando "hoy" como referencia. */
function rangoDePeriodo(tipo: TipoPeriodo): { desde: string; hasta: string } | null {
  const hoy = new Date();
  const lunesHoy = lunesDe(hoy);
  switch (tipo) {
    case "semana_actual":
      return { desde: aYmd(lunesHoy), hasta: aYmd(hoy) };
    case "semana_anterior": {
      const lunesAnterior = sumarDias(lunesHoy, -7);
      return { desde: aYmd(lunesAnterior), hasta: aYmd(sumarDias(lunesAnterior, 6)) };
    }
    case "mes_actual": {
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: aYmd(desde), hasta: aYmd(hoy) };
    }
    case "mes_anterior": {
      const ultimoMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0); // día 0 = último del mes previo
      const desde = new Date(ultimoMesAnterior.getFullYear(), ultimoMesAnterior.getMonth(), 1);
      return { desde: aYmd(desde), hasta: aYmd(ultimoMesAnterior) };
    }
    default:
      return null;
  }
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "2026-09-04" → "4 sep" (para el aviso del rango efectivo). */
function rangoLegible(desde: string, hasta: string): string {
  const [a1, m1, d1] = desde.split("-");
  const [a2, m2, d2] = hasta.split("-");
  const dia1 = Number(d1);
  const dia2 = Number(d2);
  if (a1 === a2 && m1 === m2) return `${dia1} al ${dia2} de ${MESES_CORTOS[Number(m1) - 1]} ${a1}`;
  if (a1 === a2) return `${dia1} ${MESES_CORTOS[Number(m1) - 1]} al ${dia2} ${MESES_CORTOS[Number(m2) - 1]} ${a1}`;
  return `${dia1} ${MESES_CORTOS[Number(m1) - 1]} ${a1} al ${dia2} ${MESES_CORTOS[Number(m2) - 1]} ${a2}`;
}

export function ExportarReporteModal({ usuario, usuarios, departamentos, onClose }: Props) {
  // Defensa extra: aunque el botón no exista para otros roles, si algo llegara a abrir este
  // modal con otro usuario no se renderiza nada (guard abajo, tras todos los hooks). El
  // backend es la autoridad final.
  const esSuperAdmin = usuario.rol === "SUPER_ADMIN";

  const nombrePorId = new Map(departamentos.map((d) => [d.id, d.nombre]));
  const depsDe = (u: Usuario): string[] => u.departamentoIds ?? (u.departamentoId ? [u.departamentoId] : []);

  const [departamento, setDepartamento] = useState(""); // "" = Todos
  const [responsable, setResponsable] = useState("");
  const [grupo, setGrupo] = useState(""); // "" = Todos los estados
  const [periodo, setPeriodo] = useState<TipoPeriodo>("mes_actual");
  const [desde, setDesde] = useState(""); // solo para "Rango personalizado"
  const [hasta, setHasta] = useState("");
  const [formato, setFormato] = useState<"pdf" | "excel" | "word">("pdf");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Rango efectivo que se enviará al backend (los presets siempre mandan ambas fechas).
  const rangoPreset = periodo === "personalizado" ? null : rangoDePeriodo(periodo);
  const desdeEfectivo = rangoPreset?.desde ?? desde;
  const hastaEfectivo = rangoPreset?.hasta ?? hasta;

  // Responsables dentro del alcance del reporte (reporte global del SUPER_ADMIN).
  const responsablesPosibles = usuarios.filter((u) => {
    if (u.activo === false) return false;
    const nombresDepto = depsDe(u)
      .map((id) => nombrePorId.get(id))
      .filter((n): n is string => !!n);
    return !departamento || nombresDepto.includes(departamento);
  });

  function alCambiarDepartamento(nombre: string) {
    setDepartamento(nombre);
    setResponsable(""); // evita un responsable que quede fuera del departamento elegido
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!esSuperAdmin) return; // doble seguridad: el modal solo existe para SUPER_ADMIN
    setEnviando(true);
    setError("");
    try {
      // El backend decide el alcance; el departamento que se manda SOLO afina.
      await api.descargarReporte({
        formato,
        departamento: departamento || undefined,
        responsableId: responsable || undefined,
        grupo: grupo || undefined,
        desde: desdeEfectivo || undefined,
        hasta: hastaEfectivo || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el reporte.");
    } finally {
      setEnviando(false);
    }
  }

  if (!esSuperAdmin) return null; // solo SUPER_ADMIN exporta reportes

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        className="bg-neutral-50 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-neutral-900 mb-1">Exportar reporte</h3>
        <p className="text-xs text-neutral-500 mb-4">
          Reporte de tareas operativas con alcance por rol. Se descarga en el formato que elijas.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Departamento</label>
            <select
              value={departamento}
              onChange={(e) => alCambiarDepartamento(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos los departamentos</option>
              {departamentos
                .filter((d) => d.activo !== false)
                .map((d) => (
                  <option key={d.id} value={d.nombre}>
                    {d.nombre}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Responsable</label>
            <select
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {responsablesPosibles.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Estado</label>
            <select
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos los estados</option>
              {GRUPOS.map((g) => (
                <option key={g.valor} value={g.valor}>
                  {g.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Período</label>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as TipoPeriodo)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            >
              {PERIODOS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.etiqueta}
                </option>
              ))}
            </select>
            {periodo === "personalizado" ? (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Desde (creación)</label>
                  <input
                    type="date"
                    value={desde}
                    max={hasta || undefined}
                    onChange={(e) => setDesde(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1">Hasta (creación)</label>
                  <input
                    type="date"
                    value={hasta}
                    min={desde || undefined}
                    onChange={(e) => setHasta(e.target.value)}
                    className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ) : desdeEfectivo && hastaEfectivo ? (
              <p className="text-[11px] text-neutral-500 mt-1">
                Reporte del {rangoLegible(desdeEfectivo, hastaEfectivo)}.
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Formato</label>
            <div className="flex gap-4">
              {FORMATOS.map((f) => (
                <label key={f.valor} className="flex items-center gap-1.5 text-sm text-neutral-700 cursor-pointer">
                  <input
                    type="radio"
                    name="formato"
                    value={f.valor}
                    checked={formato === f.valor}
                    onChange={() => setFormato(f.valor)}
                  />
                  {f.etiqueta}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-danger-600 bg-danger-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm border border-neutral-200 text-neutral-600 px-4 py-2 rounded-lg hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="text-sm bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 disabled:opacity-60"
            >
              {enviando ? "Generando..." : "Generar y descargar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
