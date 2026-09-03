import { useEffect, useState } from "react";
import { api, type ReporteDiarioPodcastDTO } from "../api/client";

// El reporte diario del equipo Podcast. BOS calcula solo la parte automática
// (agendados, realizados, reuniones, ventas, no-shows, follow-ups) a partir de
// historial_etapas y tareas_seguimiento; el empleado solo tipea lo que el sistema
// no puede saber: prospección pre-funnel, compromiso de mañana y bloqueos.

interface Formulario {
  encontrados: string;
  contactados: string;
  respuestas: string;
  interesados: string;
  compromisoContactos: string;
  compromisoFollowups: string;
  compromisoPodcasts: string;
  compromisoNota: string;
  bloqueos: string;
}

const VACIO: Formulario = {
  encontrados: "",
  contactados: "",
  respuestas: "",
  interesados: "",
  compromisoContactos: "",
  compromisoFollowups: "",
  compromisoPodcasts: "",
  compromisoNota: "",
  bloqueos: "",
};

function NumInput({ label, valor, meta, onChange }: { label: string; valor: string; meta?: number; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs mb-1">
        <span className="text-neutral-500">{label}</span>
        {meta !== undefined && <span className="text-neutral-500">meta {meta}</span>}
      </span>
      <input
        type="number"
        min={0}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
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

export function PodcastReporteDiarioPage() {
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
        encontrados: d.reporte?.prospectosEncontrados?.toString() ?? "",
        contactados: d.reporte?.prospectosContactados?.toString() ?? "",
        respuestas: d.reporte?.respuestas?.toString() ?? "",
        interesados: d.reporte?.interesados?.toString() ?? "",
        compromisoContactos: d.compromisoHoy?.contactos?.toString() ?? "",
        compromisoFollowups: d.compromisoHoy?.followups?.toString() ?? "",
        compromisoPodcasts: d.compromisoHoy?.podcasts?.toString() ?? "",
        compromisoNota: d.compromisoHoy?.nota ?? "",
        bloqueos: d.reporte?.bloqueos ?? "",
      });
      setCargando(false);
    };
    void cargar();
  }, []);

  const set = (k: keyof Formulario) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async (enviar: boolean) => {
    setGuardando(true);
    setMensaje(null);
    const aNumero = (s: string) => (s === "" ? undefined : Number(s));
    try {
      const d = await api.guardarPodcastReporte({
        prospectosEncontrados: aNumero(form.encontrados),
        prospectosContactados: aNumero(form.contactados),
        respuestas: aNumero(form.respuestas),
        interesados: aNumero(form.interesados),
        compromisoContactos: aNumero(form.compromisoContactos),
        compromisoFollowups: aNumero(form.compromisoFollowups),
        compromisoPodcasts: aNumero(form.compromisoPodcasts),
        compromisoNota: form.compromisoNota,
        bloqueos: form.bloqueos,
        enviar,
      });
      setData(d);
      setMensaje(enviar ? "Reporte enviado." : "Borrador guardado.");
    } catch (e) {
      setMensaje((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const m = data.metricas;
  const auto = [
    { label: "Podcasts agendados", valor: m.agendados },
    { label: "Podcasts realizados", valor: m.realizados },
    { label: "Reuniones del 1%", valor: m.reuniones },
    { label: "Ventas cerradas", valor: m.ventas },
    { label: "No-shows", valor: m.noShows },
    { label: "Follow-ups realizados", valor: m.followupsRealizados },
    { label: "Follow-ups vencidos", valor: m.followupsVencidos },
  ];

  return (
    <div className="max-w-4xl">
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

      {/* Lo que BOS ya calculó — solo lectura */}
      <Tarjeta titulo="Lo que BOS ya calculó hoy">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {auto.map((a) => (
            <div key={a.label} className="bg-white border border-neutral-200 rounded-lg p-3">
              <p className="text-xs text-neutral-500">{a.label}</p>
              <p className="text-xl font-semibold text-neutral-800">{a.valor}</p>
            </div>
          ))}
        </div>
      </Tarjeta>

      {/* Compromiso de ayer (continuidad) */}
      <div className="mt-4">
        <Tarjeta titulo="Compromiso de ayer">
          {data.compromisoAyer && (data.compromisoAyer.contactos || data.compromisoAyer.followups || data.compromisoAyer.podcasts) ? (
            <div className="text-sm text-neutral-600">
              <p>
                Se comprometió a{" "}
                <b>{data.compromisoAyer.contactos ?? 0} contactos</b>,{" "}
                <b>{data.compromisoAyer.followups ?? 0} follow-ups</b> y{" "}
                <b>{data.compromisoAyer.podcasts ?? 0} podcasts</b>.
              </p>
              {data.compromisoAyer.nota && <p className="mt-1 text-neutral-500">"{data.compromisoAyer.nota}"</p>}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No dejó compromiso ayer.</p>
          )}
        </Tarjeta>
      </div>

      {/* Prospección manual */}
      <div className="mt-4">
        <Tarjeta titulo="Prospección de hoy (manual)">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumInput label="Prospectos encontrados" valor={form.encontrados} meta={data.metas.prospectosEncontrados} onChange={set("encontrados")} />
            <NumInput label="Prospectos contactados" valor={form.contactados} meta={data.metas.prospectosContactados} onChange={set("contactados")} />
            <NumInput label="Respuestas recibidas" valor={form.respuestas} onChange={set("respuestas")} />
            <NumInput label="Interesados" valor={form.interesados} onChange={set("interesados")} />
          </div>
        </Tarjeta>
      </div>

      {/* Compromiso de mañana */}
      <div className="mt-4">
        <Tarjeta titulo="Compromiso para mañana">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <NumInput label="Contactos" valor={form.compromisoContactos} onChange={set("compromisoContactos")} />
            <NumInput label="Follow-ups" valor={form.compromisoFollowups} onChange={set("compromisoFollowups")} />
            <NumInput label="Podcasts agendados" valor={form.compromisoPodcasts} onChange={set("compromisoPodcasts")} />
          </div>
          <label className="block">
            <span className="text-xs text-neutral-500">Nota (opcional)</span>
            <textarea
              value={form.compromisoNota}
              onChange={(e) => set("compromisoNota")(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ej: mañana grabo 3 invitados en la mañana"
            />
          </label>
        </Tarjeta>
      </div>

      {/* Bloqueos */}
      <div className="mt-4">
        <Tarjeta titulo="¿Qué te bloqueó hoy?">
          <textarea
            value={form.bloqueos}
            onChange={(e) => set("bloqueos")(e.target.value)}
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
