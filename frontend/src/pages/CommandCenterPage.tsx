import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { KpiCard } from "../components/KpiCard";
import type { CommandCenter, AccionDinero } from "../types";

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

const TIPO_LABEL: Record<AccionDinero["tipo"], string> = {
  vencido: "🔴 Vencido",
  programado: "📅 Programado",
  caliente: "🔥 Caliente",
};

function fmtFecha(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", timeZone: "America/New_York" });
}

export function CommandCenterPage() {
  const [data, setData] = useState<CommandCenter | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [preguntando, setPreguntando] = useState(false);

  useEffect(() => {
    api.commandCenter().then((d) => {
      setData(d);
      setCargando(false);
    });
  }, []);

  const preguntar = async (texto: string) => {
    const q = texto.trim();
    if (!q || preguntando) return;
    setPreguntando(true);
    try {
      const r = await api.askBos(q);
      setRespuesta(r.respuesta);
    } catch {
      setRespuesta("No pude responder en este momento. Intenta de nuevo.");
    } finally {
      setPreguntando(false);
    }
  };

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const { resumen, moneyToday, topAcciones, oportunidades } = data;
  const dineroHoy = resumen.vencido + resumen.proximos7dias + resumen.pipelineCaliente;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">💵 Revenue Command Center</h1>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">¿Dónde está el dinero y qué hago hoy para moverlo?</p>

      {/* Ask BOS */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-2">💬 Pregúntale a BOS</h2>
        <div className="flex gap-2 mb-2">
          <input
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void preguntar(pregunta); }}
            placeholder="Ej: ¿dónde está el dinero más fácil de cobrar hoy?"
            className="flex-1 border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => void preguntar(pregunta)}
            disabled={preguntando || !pregunta.trim()}
            className="text-sm font-medium bg-primary-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {preguntando ? "..." : "Preguntar"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            "¿Dónde está el dinero más fácil de cobrar hoy?",
            "¿Quiénes son mis prospectos más calientes?",
            "Tengo 2 horas, ¿qué hago?",
            "¿Qué línea produce más este mes?",
          ].map((s) => (
            <button
              key={s}
              onClick={() => { setPregunta(s); void preguntar(s); }}
              className="text-[11px] px-2.5 py-1 rounded-full border border-neutral-200 border-neutral-200 text-neutral-500 text-neutral-400 hover:bg-neutral-100 hover:bg-neutral-100"
            >
              {s}
            </button>
          ))}
        </div>
        {respuesta && (
          <div className="mt-3 bg-neutral-100 bg-neutral-100 border border-neutral-200 rounded-lg p-3">
            <p className="text-sm text-neutral-800 text-neutral-200 whitespace-pre-line">{respuesta}</p>
          </div>
        )}
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard titulo="Vendido" valor={fmt(resumen.vendido)} icono="📈" color="neutral" />
        <KpiCard titulo="Cobrado" valor={fmt(resumen.cobrado)} icono="✅" color="success" />
        <KpiCard titulo="💰 Cash Gap" valor={fmt(resumen.cashGap)} icono="💸" color="warning" subtitulo="Vendido − Cobrado" />
        <KpiCard titulo="Vencido" valor={fmt(resumen.vencido)} icono="🔴" color={resumen.vencido > 0 ? "danger" : "neutral"} />
      </div>

      {/* Cash Gap destacado */}
      <div className="bg-warning-50 bg-warning-500/10 border border-warning-200 border-warning-500/20 rounded-xl p-5 mb-4">
        <p className="text-xs font-medium text-warning-700 text-warning-600 mb-2">💰 CASH GAP</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-xs text-warning-700/70 text-warning-600/70">Vendido</p>
            <p className="text-2xl font-semibold text-warning-800 text-warning-600">{fmt(resumen.vendido)}</p>
          </div>
          <span className="text-warning-700 text-warning-600 text-xl">−</span>
          <div>
            <p className="text-xs text-warning-700/70 text-warning-600/70">Cobrado</p>
            <p className="text-2xl font-semibold text-warning-800 text-warning-600">{fmt(resumen.cobrado)}</p>
          </div>
          <span className="text-warning-700 text-warning-600 text-xl">=</span>
          <div>
            <p className="text-xs text-warning-700/70 text-warning-600/70">Cash Gap</p>
            <p className="text-3xl font-bold text-warning-800 text-warning-600">{fmt(resumen.cashGap)}</p>
          </div>
        </div>
        <p className="text-xs text-warning-700/70 text-warning-600/70 mt-2">
          {resumen.cashGap > 0
            ? `Estás vendiendo pero aún no entra en caja — hay ${fmt(resumen.cashGap)} por cobrar.`
            : "Sin brecha: todo lo vendido ya está cobrado."}
        </p>
      </div>

      {/* Alertas inteligentes */}
      {data.alertas.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-2">🚨 Alertas</h2>
          <div className="flex flex-col gap-2">
            {data.alertas.map((a, i) => {
              const color =
                a.severidad === "critica"
                  ? "bg-danger-50 bg-danger-500/10 border-danger-200 border-danger-500/20"
                  : a.severidad === "advertencia"
                    ? "bg-warning-50 bg-warning-500/10 border-warning-200 border-warning-500/20"
                    : "bg-neutral-50 border-neutral-200 border-neutral-200";
              return (
                <div key={i} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${color}`}>
                  <div>
                    <p className="text-sm font-medium text-neutral-900 text-neutral-800">{a.titulo}</p>
                    <p className="text-xs text-neutral-500 text-neutral-400">{a.detalle}</p>
                  </div>
                  <Link to={a.enlace} className="text-xs font-medium bg-primary-500 text-white px-3 py-1.5 rounded-lg hover:opacity-80 shrink-0">
                    RESOLVER AHORA
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fila secundaria */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard titulo="Cobrado este mes" valor={fmt(resumen.cobradoMes)} icono="📅" color="success" />
        <KpiCard titulo="Próximos 7 días" valor={fmt(resumen.proximos7dias)} icono="🗓" color="primary" />
        <KpiCard titulo="Forecast 30 días" valor={fmt(resumen.proximos30dias)} icono="📆" color="neutral" />
        <KpiCard titulo="Pipeline caliente" valor={fmt(resumen.pipelineCaliente)} icono="🔥" color="warning" />
      </div>

      {/* Money Today */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-neutral-900 text-neutral-800">💰 Oportunidades de dinero hoy</h2>
          <p className="text-2xl font-bold text-success-600 text-success-600">{fmt(dineroHoy)}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5 text-sm">
          <div className="bg-danger-50 bg-danger-500/10 border border-danger-200 border-danger-500/20 rounded-lg p-3">
            <p className="text-xs text-danger-700 text-danger-600">Cobros vencidos ({moneyToday.cobrosVencidos.length})</p>
            <p className="text-lg font-semibold text-danger-700 text-danger-600">{fmt(resumen.vencido)}</p>
          </div>
          <div className="bg-primary-50 bg-primary-500/10 border border-primary-200 border-primary-500/20 rounded-lg p-3">
            <p className="text-xs text-primary-700 text-primary-600">Pagos programados ({moneyToday.pagosProgramados.length})</p>
            <p className="text-lg font-semibold text-primary-700 text-primary-600">{fmt(resumen.proximos7dias)}</p>
          </div>
          <div className="bg-warning-50 bg-warning-500/10 border border-warning-200 border-warning-500/20 rounded-lg p-3">
            <p className="text-xs text-warning-700 text-warning-600">Ofertas calientes ({moneyToday.ofertasCalientes.length})</p>
            <p className="text-lg font-semibold text-warning-700 text-warning-600">{fmt(resumen.pipelineCaliente)}</p>
          </div>
        </div>

        {/* Top 5 acciones */}
        {topAcciones.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-2">Top 5 acciones recomendadas</h3>
            <div className="flex flex-col gap-2">
              {topAcciones.map((a, i) => (
                <Link
                  key={i}
                  to="/pipelines"
                  className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 bg-neutral-100 bg-neutral-100 hover:opacity-80"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-neutral-400 text-neutral-500">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-neutral-900 text-neutral-800">{a.personaNombre ?? "Sin nombre"}</p>
                      <p className="text-[11px] text-neutral-500 text-neutral-400">{TIPO_LABEL[a.tipo]}{a.pipelineNombre ? ` · ${a.pipelineNombre}` : ""}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-neutral-900 text-neutral-800">{fmt(a.monto)}</p>
                    <p className="text-[11px] text-success-600">🔥 {a.probabilidad}%</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ranking de oportunidades */}
      {oportunidades.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-2">🔥 Ranking de oportunidades</h2>
          <div className="flex flex-col gap-2">
            {oportunidades.slice(0, 10).map((o, i) => {
              const scoreColor =
                o.score >= 70 ? "text-success-600 text-success-600" : o.score >= 40 ? "text-warning-600 text-warning-600" : "text-neutral-400 text-neutral-500";
              return (
                <Link
                  key={i}
                  to="/pipelines"
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200 bg-neutral-50 hover:opacity-80"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-neutral-400 text-neutral-500 w-5">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 text-neutral-800 truncate">{o.personaNombre ?? "Sin nombre"}</p>
                      <p className="text-[11px] text-neutral-500 text-neutral-400 truncate">
                        {o.pipelineNombre}{o.etapaNombre ? ` · ${o.etapaNombre}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${scoreColor}`}>🔥 {o.score}/100</p>
                    <p className="text-[11px] text-neutral-500 text-neutral-400">{o.valor != null ? fmt(o.valor) : "—"} · {o.accion}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Listas detalladas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-2">🔴 Cobros vencidos</h3>
          {moneyToday.cobrosVencidos.length === 0 ? (
            <p className="text-xs text-neutral-400 text-neutral-500">Nada vencido. 👌</p>
          ) : (
            <div className="flex flex-col gap-2">
              {moneyToday.cobrosVencidos.map((c) => (
                <div key={c.registroId} className="flex justify-between p-3 rounded-lg border border-danger-100 border-danger-500/20 bg-danger-50 bg-danger-500/10 text-sm">
                  <div>
                    <p className="font-medium text-neutral-900 text-neutral-800">{c.personaNombre}</p>
                    <p className="text-[11px] text-neutral-500 text-neutral-400">{c.pipelineNombre} · vence {fmtFecha(c.fecha)}</p>
                  </div>
                  <p className="font-semibold text-danger-600 text-danger-600">{fmt(c.monto)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-2">📅 Próximos pagos (7 días)</h3>
          {moneyToday.pagosProgramados.length === 0 ? (
            <p className="text-xs text-neutral-400 text-neutral-500">Sin pagos programados próximamente.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {moneyToday.pagosProgramados.map((p) => (
                <div key={p.registroId} className="flex justify-between p-3 rounded-lg border border-neutral-200 bg-neutral-100 bg-neutral-100 text-sm">
                  <div>
                    <p className="font-medium text-neutral-900 text-neutral-800">{p.personaNombre}</p>
                    <p className="text-[11px] text-neutral-500 text-neutral-400">{p.pipelineNombre} · {fmtFecha(p.fecha)}</p>
                  </div>
                  <p className="font-semibold text-primary-600 text-primary-600">{fmt(p.monto)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
