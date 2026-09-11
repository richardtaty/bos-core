import { useEffect, useState } from "react";
import {
  api,
  CANALES_CONTACTO,
  type CanalProspeccionDTO,
  type ReporteDiarioPodcastDTO,
} from "../api/client";
import { PodcastHistorialReportes } from "../components/PodcastHistorialReportes";
import { PodcastResumenEquipo } from "../components/PodcastResumenEquipo";
import { AvisoDiscrepancia } from "../components/PodcastUI";
import { useAuth } from "../api/AuthContext";

// El reporte diario del equipo Podcast. BOS calcula solo toda la parte de resultados
// (agendados, completados, 1%, transacciones, seguimiento, no-shows, follow-ups) a partir del
// pipeline y del calendario; la persona solo tipea lo que el sistema no puede saber: por qué
// canal prospectó, qué produjo cada canal, y qué la bloqueó.

/** Una fila del formulario. Los números son texto mientras se escribe ("" = sin llenar). */
interface CanalFila {
  canal: string;
  contactados: string;
  respuestas: string;
  interesados: string;
}

interface Formulario {
  canales: CanalFila[];
  bloqueos: string;
}

const CANAL_VACIO: CanalFila = { canal: "", contactados: "", respuestas: "", interesados: "" };

/** Arranca con un bloque vacío: los demás canales se agregan con el botón + solo si se usaron. */
const VACIO: Formulario = { canales: [{ ...CANAL_VACIO }], bloqueos: "" };

function aNumero(s: string): number {
  return s === "" ? 0 : Number(s);
}

function NumInput({
  label,
  valor,
  onChange,
  invalido,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  invalido?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-500 mb-1 block">{label}</span>
      <input
        type="number"
        min={0}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          invalido ? "border-danger-400" : "border-neutral-300"
        }`}
      />
    </label>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">{titulo}</h3>
      {children}
    </div>
  );
}

/** `null` = no hay dato (no es lo mismo que un 0): se muestra "—", nunca un cero inventado. */
function Dato({ label, valor, nota }: { label: string; valor: number | null; nota?: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-xl font-semibold ${valor === null ? "text-neutral-300" : "text-neutral-800"}`}>{valor ?? "—"}</p>
      {nota && <p className="text-[11px] text-neutral-400 mt-0.5">{nota}</p>}
    </div>
  );
}

/**
 * PODCAST → Cierre diario. Tres formas de ver el MISMO registro real:
 *   · Mi cierre         → el formulario de hoy (captura).
 *   · Historial         → consulta de solo lectura de los reportes ya existentes.
 *   · Resumen del equipo → consolidado del día, solo lectura. Es el Historial visto de lado:
 *     no es un sistema aparte de reportes y no hay una pantalla nueva en el menú.
 */
export function PodcastReporteDiarioPage() {
  const { usuario } = useAuth();
  const [vista, setVista] = useState<"cierre" | "historial" | "resumen">("cierre");

  const tabs: { key: "cierre" | "historial" | "resumen"; label: string }[] = [
    { key: "cierre", label: "Mi cierre" },
    { key: "historial", label: "Historial" },
  ];

  // El consolidado de TODO el equipo usa exactamente la misma regla que Equipo e Inteligencia.
  // La pestaña se oculta acá, pero quien decide de verdad es el backend (requireRole ADMIN):
  // un USUARIO que llame a la ruta recibe 403 aunque se salte la pantalla.
  if (usuario?.rol === "ADMIN" || usuario?.rol === "SUPER_ADMIN") {
    tabs.push({ key: "resumen", label: "Resumen del equipo" });
  }

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setVista(t.key)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              vista === t.key
                ? "bg-primary-100 text-primary-700 border-transparent"
                : "border-neutral-200 text-neutral-600 hover:border-primary-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {vista === "historial" && <PodcastHistorialReportes />}
      {vista === "resumen" && <PodcastResumenEquipo />}
      {vista === "cierre" && <MiCierreDiario />}
    </div>
  );
}

function MiCierreDiario() {
  const [data, setData] = useState<ReporteDiarioPodcastDTO | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    const cargar = async () => {
      const d = await api.podcastReporteDiario();
      setData(d);
      setForm({
        // El borrador vuelve tal cual se dejó. Si el reporte es anterior a los canales, arranca
        // con un bloque vacío (sus totales viejos se ven abajo, en el Historial).
        canales: d.canales.length > 0 ? d.canales.map((c) => filaDesde(c)) : [{ ...CANAL_VACIO }],
        bloqueos: d.reporte?.bloqueos ?? "",
      });
      setCargando(false);
    };
    void cargar();
  }, []);

  const setCanal = (i: number, campo: keyof CanalFila, valor: string) =>
    setForm((f) => ({ ...f, canales: f.canales.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)) }));

  const agregarCanal = () => setForm((f) => ({ ...f, canales: [...f.canales, { ...CANAL_VACIO }] }));

  const quitarCanal = (i: number) => setForm((f) => ({ ...f, canales: f.canales.filter((_, idx) => idx !== i) }));

  // Los totales del día NO se guardan: se suman aquí, a partir del desglose por canal.
  const totales = {
    contactados: form.canales.reduce((a, c) => a + aNumero(c.contactados), 0),
    respuestas: form.canales.reduce((a, c) => a + aNumero(c.respuestas), 0),
    interesados: form.canales.reduce((a, c) => a + aNumero(c.interesados), 0),
  };

  // Filas con datos lógicamente imposibles (más respuestas que contactados, o más interesados que
  // respuestas). Se avisan al escribir y el backend las rechaza al enviar.
  const filasInvalidas = form.canales.map(
    (c) => aNumero(c.respuestas) > aNumero(c.contactados) || aNumero(c.interesados) > aNumero(c.respuestas)
  );

  const guardar = async (enviar: boolean) => {
    // Los bloques sin canal elegido no se mandan: son filas que quedaron vacías.
    const canales: CanalProspeccionDTO[] = form.canales
      .filter((c) => c.canal !== "")
      .map((c) => ({
        canal: c.canal,
        contactados: aNumero(c.contactados),
        respuestas: aNumero(c.respuestas),
        interesados: aNumero(c.interesados),
      }));

    if (enviar && canales.some((c) => c.respuestas > c.contactados || c.interesados > c.respuestas)) {
      setMensaje("Revisa la prospección: no puede haber más respuestas que contactados, ni más interesados que respuestas.");
      return;
    }

    setGuardando(true);
    setMensaje(null);
    try {
      const d = await api.guardarPodcastReporte({ canales, bloqueos: form.bloqueos, enviar });
      setData(d);
      setForm((f) => ({ ...f, canales: d.canales.length > 0 ? d.canales.map((c) => filaDesde(c)) : [{ ...CANAL_VACIO }] }));
      setMensaje(enviar ? "Reporte enviado." : "Borrador guardado.");
    } catch (e) {
      setMensaje((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const m = data.metricas;
  const r = data.resultados;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-neutral-800">Cierre diario · Podcast</h1>
        {data.estado && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${data.estado === "enviado" ? "bg-success-500/10 text-success-600" : "bg-neutral-200 text-neutral-600"}`}>
            {data.estado === "enviado" ? "Enviado" : "Borrador"}
          </span>
        )}
      </div>
      <p className="text-sm text-neutral-500 mb-6">{data.fecha}</p>

      {mensaje && <p className="text-sm text-primary-600 mb-4">{mensaje}</p>}

      {/* Lo que BOS ya calculó — solo lectura. Los resultados comerciales del día están más abajo,
          en "Resultados de hoy": aquí queda lo que no se repite allí. */}
      <Tarjeta titulo="Lo que BOS ya calculó hoy">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Dato label="No-shows" valor={m.noShows} />
          <Dato label="Follow-ups realizados" valor={m.followupsRealizados} />
          <Dato label="Follow-ups vencidos" valor={m.followupsVencidos} />
        </div>
      </Tarjeta>

      {/* Prospección manual, desglosada por canal */}
      <div className="mt-4">
        <Tarjeta titulo="Prospección de hoy">
          <div className="space-y-3">
            {form.canales.map((c, i) => (
              <div key={i} className="bg-white border border-neutral-200 rounded-lg p-3">
                <div className="flex items-end gap-3">
                  <label className="block w-40 shrink-0">
                    <span className="text-xs text-neutral-500 mb-1 block">Canal</span>
                    <select
                      value={c.canal}
                      onChange={(e) => setCanal(i, "canal", e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Selecciona…</option>
                      {CANALES_CONTACTO.map((canal) => (
                        <option key={canal} value={canal}>
                          {canal}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <NumInput label="Contactados" valor={c.contactados} onChange={(v) => setCanal(i, "contactados", v)} />
                    <NumInput
                      label="Respuestas"
                      valor={c.respuestas}
                      onChange={(v) => setCanal(i, "respuestas", v)}
                      invalido={aNumero(c.respuestas) > aNumero(c.contactados)}
                    />
                    <NumInput
                      label="Interesados"
                      valor={c.interesados}
                      onChange={(v) => setCanal(i, "interesados", v)}
                      invalido={aNumero(c.interesados) > aNumero(c.respuestas)}
                    />
                  </div>
                  {form.canales.length > 1 && (
                    <button
                      type="button"
                      onClick={() => quitarCanal(i)}
                      className="px-3 py-2 rounded-lg text-xs text-neutral-500 hover:text-danger-600 hover:bg-neutral-100"
                    >
                      ✕ Quitar
                    </button>
                  )}
                </div>
                {filasInvalidas[i] && (
                  <p className="text-xs text-danger-600 mt-2">
                    En un canal no puede haber más respuestas que contactados, ni más interesados que respuestas.
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={agregarCanal}
            className="mt-3 text-sm px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:border-primary-300 hover:text-primary-700"
          >
            + Agregar otro canal
          </button>

          {/* Totales del día: se calculan solos a partir de los bloques de arriba. */}
          <div className="mt-4 pt-3 border-t border-neutral-200 grid grid-cols-3 gap-3 text-sm">
            <p className="text-neutral-500">
              Total contactados <span className="font-semibold text-neutral-800">{totales.contactados}</span>
            </p>
            <p className="text-neutral-500">
              Total respuestas <span className="font-semibold text-neutral-800">{totales.respuestas}</span>
            </p>
            <p className="text-neutral-500">
              Total interesados <span className="font-semibold text-neutral-800">{totales.interesados}</span>
            </p>
          </div>
        </Tarjeta>
      </div>

      {/* Resultados del día — todo automático, nada que tipear */}
      <div className="mt-4">
        <Tarjeta titulo="Resultados de hoy">
          <p className="text-xs text-neutral-500 mb-3">
            Los calcula BOS solo, con las mismas reglas que Mi desempeño y el Reporte de equipo: una
            sola cifra por concepto, igual en todas las pantallas.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Dato label="Podcasts agendados" valor={r.agendados} nota="los que conseguiste hoy" />
            <Dato label="Podcasts completados" valor={r.completados} nota="realizados hoy" />
            <Dato label="1% completados" valor={r.reuniones1} />
            <Dato label="Convertidos" valor={r.convertidos} />
            <Dato label="No-shows" valor={r.noShows} />
            <Dato label="Follow-ups hechos" valor={r.followupsRealizados} />
            <Dato label="Follow-ups vencidos" valor={r.followupsVencidos} nota="hoy" />
            <Dato label="En seguimiento" valor={r.enSeguimiento} nota="hoy" />
          </div>
          <AvisoDiscrepancia discrepancias={r.discrepancias} />
        </Tarjeta>
      </div>

      {/* Bloqueos */}
      <div className="mt-4">
        <Tarjeta titulo="¿Qué te bloqueó hoy?">
          <textarea
            value={form.bloqueos}
            onChange={(e) => setForm((f) => ({ ...f, bloqueos: e.target.value }))}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Ej: agenda llena, invitados no respondieron, problema técnico…"
          />
        </Tarjeta>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => guardar(false)}
          disabled={guardando}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
        >
          Guardar borrador
        </button>
        <button
          onClick={() => guardar(true)}
          disabled={guardando}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-100 disabled:text-primary-800"
        >
          Enviar reporte
        </button>
      </div>
    </div>
  );
}

function filaDesde(c: CanalProspeccionDTO): CanalFila {
  return {
    canal: c.canal,
    contactados: c.contactados.toString(),
    respuestas: c.respuestas.toString(),
    interesados: c.interesados.toString(),
  };
}
