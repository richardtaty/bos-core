import { CANALES_CONTACTO, type CanalConsolidadoDTO, type DiscrepanciaPodcastDTO, type EstadoReporteDTO, type FunnelPodcastDTO } from "../api/client";

// PIEZAS COMPARTIDAS DE PODCAST.
//
// "Mi desempeño" y "Reporte de equipo" muestran el MISMO embudo y el mismo estado del Cierre
// diario. Para que no puedan divergir, los dos usan estas piezas y no cada uno su propia versión.
//
// La regla que se ve en todas: `null` es "no registró" y se escribe "—". Nunca un 0 que nadie
// escribió.

// ─── Fechas (hora de Florida, igual que el resto del módulo) ──────

const ZONA = "America/New_York";

/** Hoy en Florida, como YYYY-MM-DD. */
export function hoyET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function sumarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}

/** "2026-09-11" → "11 de septiembre de 2026". Se arma con las partes para no correr el día. */
export function fechaLarga(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/** Un período en palabras: un día dice la fecha; un rango dice "del X al Y". */
export function periodoTexto(desde: string, hasta: string): string {
  if (desde === hasta) return fechaLarga(desde);
  return `del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`;
}

// ─── Piezas de UI (las mismas del Cierre diario y del Historial) ──

export function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">{titulo}</h3>
      {children}
    </div>
  );
}

/** Celda de métrica. `null` = no registrado → "—", nunca un 0 que nadie escribió. */
export function Dato({ label, valor, nota }: { label: string; valor: number | null; nota?: string | null }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-xl font-semibold ${valor === null ? "text-neutral-300" : "text-neutral-800"}`}>{valor ?? "—"}</p>
      {nota && <p className="text-[11px] text-neutral-400 mt-0.5">{nota}</p>}
    </div>
  );
}

/** Estado real del reporte de una persona ese día. Son tres cosas distintas, no dos. */
export function ChipEstado({ estado }: { estado: EstadoReporteDTO }) {
  const mapa = {
    enviado: { texto: "Enviado ✓", clase: "bg-success-500/10 text-success-600" },
    borrador: { texto: "Borrador sin enviar", clase: "bg-warning-500/10 text-warning-600" },
    sin_reporte: { texto: "Sin reporte", clase: "bg-neutral-200 text-neutral-600" },
  } as const;
  const { texto, clase } = mapa[estado];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${clase}`}>{texto}</span>;
}

/** Una línea del desglose por canal. "—" cuando el reporte viejo no traía ese dato. */
export function FilaCanal({ canal }: { canal: CanalConsolidadoDTO }) {
  const sinDetalle = canal.canal === "Sin detalle de canal";
  return (
    <div className={`border rounded-lg p-3 flex flex-wrap items-center gap-x-6 gap-y-1 ${sinDetalle ? "bg-neutral-100 border-neutral-200" : "bg-white border-neutral-200"}`}>
      <p className="text-sm font-medium text-neutral-800 w-40 shrink-0">{canal.canal}</p>
      <p className="text-xs text-neutral-500">Contactados <span className="text-sm font-semibold text-neutral-800">{canal.contactados ?? "—"}</span></p>
      <p className="text-xs text-neutral-500">Respuestas <span className="text-sm font-semibold text-neutral-800">{canal.respuestas ?? "—"}</span></p>
      <p className="text-xs text-neutral-500">Interesados <span className="text-sm font-semibold text-neutral-800">{canal.interesados ?? "—"}</span></p>
    </div>
  );
}

/**
 * AVISO DE CALIDAD DE DATOS — no es una métrica.
 *
 * El equipo registra el mismo podcast en dos lugares: mueve la tarjeta en el Pipeline Y anota la
 * cita en el Calendario. Son dos actos distintos que pueden no coincidir. La cifra oficial es la
 * del Calendario; esto solo avisa cuando el Pipeline dice MÁS, que es el caso que importa —hay una
 * tarjeta que no se está contando—. El caso contrario es lo normal y no se avisa.
 *
 * Se ve igual en las tres pantallas que muestran cifras del CRM porque las tres usan esta pieza.
 */
export function AvisoDiscrepancia({ discrepancias }: { discrepancias: DiscrepanciaPodcastDTO[] }) {
  if (discrepancias.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-warning-500/30 bg-warning-500/5 p-3">
      <p className="text-xs font-semibold text-warning-600 mb-1">El Pipeline y el Calendario no coinciden</p>
      <ul className="space-y-0.5">
        {discrepancias.map((d) => (
          <li key={`${d.usuarioId}-${d.fecha}-${d.concepto}`} className="text-xs text-neutral-600">
            <span className="font-medium text-neutral-800">{d.nombre || "Sin nombre"}</span>{" "}
            {d.concepto === "agendados" ? "agendó" : "completó"} {d.pipeline} en el Pipeline, pero el
            Calendario {d.citas === 1 ? "tiene 1" : `tiene ${d.citas}`}. La cifra oficial es la del Calendario.
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-neutral-400 mt-1">
        No es un error de cálculo: son dos registros distintos. Conviene crear la cita que falta para que
        las cifras coincidan.
      </p>
    </div>
  );
}

// ─── Embudo ──────────────────────────────────────────────────────

/**
 * El embudo de trabajo, en el MISMO orden en las dos pantallas. Cada escalón baja del anterior.
 *
 * Los tres primeros son lo que la gente registra a mano en su Cierre diario (pueden faltar: "—");
 * los cuatro últimos son hechos del CRM (Pipeline), así que siempre son un número real, incluido
 * el 0. Mezclar los dos tipos es justamente lo que haría ilegible el embudo.
 */
export function Embudo({ funnel, compacto = false }: { funnel: FunnelPodcastDTO; compacto?: boolean }) {
  const escalones: { label: string; valor: number | null; manual: boolean; tasa?: number | null; tasaLabel?: string }[] = [
    { label: "Prospectos contactados", valor: funnel.contactados, manual: true },
    { label: "Respuestas", valor: funnel.respuestas, manual: true, tasa: funnel.tasaRespuesta, tasaLabel: "tasa de respuesta" },
    { label: "Interesados", valor: funnel.interesados, manual: true, tasa: funnel.tasaInteres, tasaLabel: "tasa de interés" },
    { label: "Podcasts agendados", valor: funnel.agendados, manual: false },
    { label: "Podcasts completados", valor: funnel.completados, manual: false },
    { label: "1% completados", valor: funnel.reuniones1, manual: false },
    { label: "Convertidos / transaccionaron", valor: funnel.transaccionaron, manual: false },
  ];

  // La barra se mide contra el escalón más alto, para que la caída del embudo se vea de un vistazo.
  const tope = Math.max(1, ...escalones.map((e) => e.valor ?? 0));

  return (
    <div className="space-y-2">
      {escalones.map((e, i) => (
        <div key={e.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-neutral-700">{e.label}</span>
            <span className="flex items-baseline gap-2 shrink-0">
              {e.tasaLabel && (
                <span className="text-[11px] text-neutral-400">
                  {e.tasaLabel} {e.tasa === null || e.tasa === undefined ? "—" : `${e.tasa}%`}
                </span>
              )}
              <span className={`text-sm font-semibold ${e.valor === null ? "text-neutral-300" : "text-neutral-800"}`}>
                {e.valor ?? "—"}
              </span>
            </span>
          </div>
          {!compacto && (
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-1">
              {e.valor !== null && (
                <div
                  className={`h-full rounded-full ${e.manual ? "bg-primary-400" : "bg-primary-600"}`}
                  style={{ width: `${Math.min(100, (e.valor / tope) * 100)}%` }}
                />
              )}
            </div>
          )}
          {i < escalones.length - 1 && <p className="text-center text-neutral-300 text-[10px] leading-none mt-1">▼</p>}
        </div>
      ))}

      {/* Fuera de la cadena a propósito: es una foto del momento (cuántas tarjetas están abiertas
          hoy), no un escalón que se pueda reconstruir hacia atrás. */}
      <div className="pt-2 mt-1 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-neutral-700">En seguimiento <span className="text-[11px] text-neutral-400">(foto del momento)</span></span>
        <span className={`text-sm font-semibold ${funnel.enSeguimiento === null ? "text-neutral-300" : "text-neutral-800"}`}>
          {funnel.enSeguimiento ?? "—"}
        </span>
      </div>
      {funnel.enSeguimiento === null && (
        <p className="text-[11px] text-neutral-400">
          "En seguimiento" es una foto del momento: solo se puede mostrar cuando el período consultado incluye hoy.
        </p>
      )}
    </div>
  );
}

// ─── Prospección por canal ───────────────────────────────────────

/** Sólo se muestran los canales con alguna cifra mayor que cero: uno vacío no informa nada. */
export function BloqueCanales({ canales, titulo = "Prospección por canal" }: { canales: CanalConsolidadoDTO[]; titulo?: string }) {
  if (canales.length === 0) return null;
  return (
    <Tarjeta titulo={titulo}>
      <div className="space-y-2">
        {canales.map((c) => (
          <FilaCanal key={c.canal} canal={c} />
        ))}
      </div>
      <p className="text-xs text-neutral-400 mt-3">
        Solo se listan los canales con alguna cifra registrada. Los reportes anteriores al desglose por
        canal aparecen agrupados aparte, en "Sin detalle de canal", para que la suma de los canales
        coincida exactamente con el total. {CANALES_CONTACTO.length} canales disponibles en el Cierre diario.
      </p>
    </Tarjeta>
  );
}
