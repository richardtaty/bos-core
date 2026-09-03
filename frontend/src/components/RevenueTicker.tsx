import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { TickerItem } from "../types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const FRASES = [
  "El éxito no es definitivo, el fracaso no es fatal: lo que cuenta es el coraje de continuar — Winston Churchill",
  "No vendas features, vende resultados. No hables de lo que haces, habla de lo que tu cliente logra",
  "Cada 'no' que recibes te acerca al 'sí' que va a cambiar tu mes — sigue sembrando",
  "La disciplina es el puente entre tus metas y tus logros — Jim Rohn",
  "El mejor momento para hacer un seguimiento era ayer. El segundo mejor momento es ahora",
  "No se trata de tener las respuestas correctas, se trata de hacer las preguntas correctas",
  "Tu negocio crece al ritmo que creces tú — invierte en tu mentalidad",
  "Las personas no compran productos, compran mejores versiones de sí mismas",
  "Haz lo que tengas que hacer hoy para que mañana puedas hacer lo que quieras",
  "Un cliente satisfecho es la mejor estrategia de marketing — enfócate en servir, no en vender",
  "No esperes la oportunidad perfecta, crea la oportunidad — cada llamada, cada meeting, cada follow-up cuenta",
  "El rechazo no es personal, es información. Ajusta, itera y vuelve con más fuerza",
  "La suerte es lo que sucede cuando la preparación se encuentra con la oportunidad — mantente listo",
  "Gana la mañana, gana el día. Tus primeras 2 horas definen tus siguientes 10",
  "Los ganadores no hacen cosas diferentes, hacen las cosas de manera diferente",
  "Si no estás avergonzado de la primera versión de tu producto, lo lanzaste demasiado tarde",
  "No pares cuando estés cansado, para cuando hayas terminado — la persistencia vence al talento",
  "Tu red es tu patrimonio neto — cada relación que construyes hoy es un activo para mañana",
  "El miedo a perder es más fuerte que el deseo de ganar. No dejes que el miedo decida por ti",
  "La excelencia no es un acto, es un hábito — Aristóteles",
  "El que quiere hacer algo encuentra un medio, el que no quiere hacer nada encuentra una excusa",
  "En los negocios como en la vida: primero se da, luego se recibe. Agrega valor antes de pedir la venta",
  "Los datos mandan, pero la intuición guía. Usa ambos — mide lo que haces y confía en tu instinto",
  "No te compares con otros, compárate con quien eras ayer. Un 1% mejor cada día = 37x mejor en un año",
  "Un negocio no se construye con grandes ideas, se construye con pequeñas acciones consistentes",
];

function FraseAleatoria() {
  return FRASES[Math.floor(Math.random() * FRASES.length)];
}

export function RevenueTicker() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";
  const [hoy, setHoy] = useState<{ facturado: number; meta: number; pct: number } | null>(null);
  const [dias, setDias] = useState<{ fecha: string; total: number }[]>([]);
  const [items, setItems] = useState<TickerItem[]>([]);
  const [frase, setFrase] = useState(FraseAleatoria);

  useEffect(() => {
    api.tickerIngresos().then((data) => {
      setHoy(data.hoy);
      setDias(data.ultimos7dias ?? []);
      setItems(data.ofertas);
    }).catch(() => {});
    const id = setInterval(() => {
      api.tickerIngresos().then((data) => {
        setHoy(data.hoy);
        setDias(data.ultimos7dias ?? []);
        setItems(data.ofertas);
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Cambiar frase cada 20 segundos
  useEffect(() => {
    if (esSuperAdmin) return;
    const id = setInterval(() => setFrase(FraseAleatoria()), 20000);
    return () => clearInterval(id);
  }, [esSuperAdmin]);

  // ─── Modo equipo: solo frases de motivación ───
  if (!esSuperAdmin) {
    return (
      <div className="overflow-hidden border-b border-neutral-200 bg-gradient-to-r from-primary-500/5 via-warning-500/5 to-success-500/5 py-1.5">
        <div className="animate-marquee flex gap-24 whitespace-nowrap">
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="text-primary-600">💡</span>
            <span className="text-neutral-700 italic">"{frase}"</span>
            <span className="text-neutral-400 mx-2">│</span>
            <span className="text-warning-600">🔥</span>
            <span className="text-neutral-700 italic">"{FRASES[Math.floor(Math.random() * FRASES.length)]}"</span>
          </span>
        </div>
      </div>
    );
  }

  // ─── Modo Super Admin: datos reales ───
  if (items.length === 0 && !hoy) return null;

  const duplicatedDias = dias.length > 0 ? [...dias, ...dias] : [];
  const duplicatedItems = [...items, ...items];

  return (
    <div className="overflow-hidden border-b border-neutral-200 bg-neutral-50 py-1.5">
      <div className="animate-marquee flex gap-12 whitespace-nowrap">
        {/* ── Meta diaria HOY ── */}
        {hoy && (
          <>
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="font-semibold text-primary-600 tracking-wide">🎯 HOY</span>
              <span className="font-mono tabular-nums text-neutral-800">{fmt(hoy.facturado)}</span>
              <span className="text-neutral-500">/ {fmt(hoy.meta)}</span>
              <span className={`font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${hoy.pct >= 100 ? "bg-success-500/15 text-success-600" : "bg-primary-500/15 text-primary-600"}`}>
                {hoy.pct}%
              </span>
              <span className="text-neutral-400 mx-2">│</span>
            </span>
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="font-semibold text-primary-600 tracking-wide">🎯 HOY</span>
              <span className="font-mono tabular-nums text-neutral-800">{fmt(hoy.facturado)}</span>
              <span className="text-neutral-500">/ {fmt(hoy.meta)}</span>
              <span className={`font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${hoy.pct >= 100 ? "bg-success-500/15 text-success-600" : "bg-primary-500/15 text-primary-600"}`}>
                {hoy.pct}%
              </span>
              <span className="text-neutral-400 mx-2">│</span>
            </span>
          </>
        )}

        {/* ── Últimos 7 días ── */}
        {duplicatedDias.map((d, i) => (
          <span key={`dia-${i}`} className="inline-flex items-center gap-2 text-xs">
            <span className="font-medium text-neutral-500">{d.fecha}</span>
            <span className={`font-mono tabular-nums ${d.total >= 10000 ? "text-success-600" : d.total > 0 ? "text-neutral-800" : "text-neutral-500"}`}>
              {fmt(d.total)}
            </span>
            <span className="text-neutral-400 mx-2">│</span>
          </span>
        ))}

        {/* ── Líneas de negocio ── */}
        {duplicatedItems.map((item, i) => (
          <span key={`${item.nombre}-${i}`} className="inline-flex items-center gap-2 text-xs">
            <span className="font-medium text-neutral-600">{item.nombre}</span>
            <span className="font-mono tabular-nums text-neutral-800">{fmt(item.actual)}</span>
            <span className="text-neutral-500">/ {fmt(item.target)}</span>
            <span className={`font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded-full ${item.pct >= 100 ? "bg-success-500/15 text-success-600" : item.pct >= 50 ? "bg-warning-500/15 text-warning-600" : "bg-neutral-200 text-neutral-600"}`}>
              {item.pct}%
            </span>
            <span className="text-neutral-400 mx-2">│</span>
          </span>
        ))}
      </div>
    </div>
  );
}
