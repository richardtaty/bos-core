import { useState } from "react";
import { api } from "../api/client";
import type { TareaOperativa, Usuario } from "../types";
import { TareaDetalleModal } from "./TareaDetalleModal";
import { GRUPO_COLOR, GRUPO_LABEL, grupoDeEstado, ESTADOS_ACTIVOS } from "../lib/estados";

const TIPO_LABEL: Record<string, string> = {
  diseno_grafico: "🎨 Diseño", video: "🎬 Video", pagina_web: "🌐 Web",
  email_marketing: "📧 Email", automatizacion: "⚡ Auto", redes_sociales: "📱 Social",
  publicidad: "📢 Ads", reporte_analisis: "📊 Análisis", revision: "🔍 Revisión", administracion: "⚙️ Admin",
};

const ESTADO_LABEL: Record<string, string> = {
  solicitud: "Solicitud", backlog: "Backlog", pendiente: "Pendiente", por_hacer: "Por hacer",
  en_proceso: "En proceso", bloqueada: "Bloqueada", en_revision: "En revisión",
  requiere_ajustes: "Requiere ajustes", completada: "Completada", aprobado: "Aprobado",
  publicado: "Publicado", cancelado: "Cancelado",
};

const ESTADO_COLOR: Record<string, string> = {
  solicitud: "bg-neutral-100 text-neutral-600",
  backlog: "bg-neutral-100 text-neutral-600",
  pendiente: "bg-neutral-100 text-neutral-600",
  por_hacer: "bg-blue-100 text-blue-700",
  en_proceso: "bg-primary-100 text-primary-700",
  bloqueada: "bg-danger-100 text-danger-700",
  en_revision: "bg-warning-100 text-warning-700",
  requiere_ajustes: "bg-orange-100 text-orange-700",
  completada: "bg-success-200 text-success-800",
  aprobado: "bg-success-100 text-success-700",
  publicado: "bg-success-200 text-success-800",
  cancelado: "bg-danger-100 text-danger-700",
};

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente: "bg-danger-100 text-danger-700",
  alta: "bg-warning-100 text-warning-700",
  media: "bg-neutral-100 text-neutral-700",
  baja: "bg-success-100 text-success-700",
};

const FLUJO_ESTADOS: Record<string, string[]> = {
  solicitud: ["backlog", "pendiente", "cancelado"],
  backlog: ["pendiente", "por_hacer", "cancelado"],
  pendiente: ["por_hacer", "cancelado"],
  por_hacer: ["en_proceso", "cancelado"],
  en_proceso: ["en_revision", "bloqueada", "completada"],
  bloqueada: ["en_proceso", "cancelado"],
  en_revision: ["requiere_ajustes", "completada", "aprobado"],
  requiere_ajustes: ["en_proceso", "completada"],
  completada: ["aprobado", "publicado", "en_revision"],
  aprobado: ["publicado"],
  publicado: [],
  cancelado: ["pendiente", "por_hacer"],
};

export function TareaCard({ tarea, onUpdate, usuarios, agruparEstados = false }: { tarea: TareaOperativa; onUpdate: () => void; usuarios: Usuario[]; agruparEstados?: boolean }) {
  const [modalAbierto, setModalAbierto] = useState(false);

  const checklist = tarea.checklist ?? [];
  const completados = checklist.filter((c) => c.completado).length;
  const grupo = grupoDeEstado(tarea.estado);
  const esActiva = ESTADOS_ACTIVOS.includes(grupo);

  async function cambiarEstado(estado: string) {
    await api.actualizarTarea(tarea.id, { estado });
    onUpdate();
  }

  async function completar() {
    await api.actualizarTarea(tarea.id, { estado: "completada", porcentajeAvance: 100 });
    onUpdate();
  }

  const estadosSiguientes = FLUJO_ESTADOS[tarea.estado] ?? [];

  return (
    <>
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 shadow-sm ">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="font-medium text-neutral-900">{tarea.titulo}</h4>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIORIDAD_COLOR[tarea.prioridad] ?? PRIORIDAD_COLOR.media}`}>
                {tarea.prioridad}
              </span>
              {tarea.tipoTarea && (
                <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                  {TIPO_LABEL[tarea.tipoTarea] ?? tarea.tipoTarea}
                </span>
              )}
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${agruparEstados ? GRUPO_COLOR[grupo] : (ESTADO_COLOR[tarea.estado] ?? "")}`}>
                {agruparEstados ? GRUPO_LABEL[grupo] : (ESTADO_LABEL[tarea.estado] ?? tarea.estado)}
              </span>
            </div>
            {tarea.descripcion && <p className="text-xs text-neutral-500 mb-2 line-clamp-2">{tarea.descripcion}</p>}
            {tarea.estado === "bloqueada" && tarea.bloqueoMotivo && (
              <p className="text-xs text-danger-600 mb-1">🚫 {tarea.bloqueoMotivo}</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
              <span>👤 {tarea.responsableNombre}</span>
              <span>📁 {tarea.departamento}</span>
              {tarea.fechaLimite && (
                <span>📅 {new Date(tarea.fechaLimite).toLocaleDateString("es-ES", { timeZone: "America/New_York" })}</span>
              )}
              {checklist.length > 0 && (
                <span>✅ {completados}/{checklist.length}</span>
              )}
              {(tarea.tiempoInvertido > 0 || tarea.tiempoEstimado > 0) && (
                <span>⏱ {Math.round((tarea.tiempoInvertido ?? 0) / 60)}h / {Math.round((tarea.tiempoEstimado ?? 0) / 60)}h est.</span>
              )}
              <span>📊 {tarea.porcentajeAvance}%</span>
            </div>
          </div>
          <button
            onClick={() => setModalAbierto(true)}
            className="text-xs text-primary-600 hover:underline ml-2 shrink-0"
          >
            Detalle
          </button>
        </div>

        {/* Acciones rápidas: en el módulo de Tareas se muestran solo los 5 estados */}
        {agruparEstados ? (
          esActiva && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {grupo === "pendiente" && (
                <button
                  onClick={() => cambiarEstado("en_proceso")}
                  className="text-[10px] px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-100 text-neutral-600"
                >
                  → En proceso
                </button>
              )}
              {grupo === "en_proceso" && (
                <button
                  onClick={() => cambiarEstado("en_revision")}
                  className="text-[10px] px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-100 text-neutral-600"
                >
                  → En revisión
                </button>
              )}
              <button
                onClick={completar}
                className="text-[10px] px-2 py-1 rounded border border-success-300 bg-success-50 text-success-700 hover:bg-success-100 font-medium"
              >
                ✓ Realizado
              </button>
              <button
                onClick={() => cambiarEstado("cancelado")}
                className="text-[10px] px-2 py-1 rounded border border-danger-300 bg-danger-50 text-danger-700 hover:bg-danger-100 font-medium"
              >
                ✕ Cancelar
              </button>
            </div>
          )
        ) : (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {!["completada", "aprobado", "publicado", "cancelado"].includes(tarea.estado) && (
              <button
                onClick={completar}
                className="text-[10px] px-2 py-1 rounded border border-success-300 bg-success-50 text-success-700 hover:bg-success-100 font-medium"
              >
                ✓ Completar
              </button>
            )}
            {estadosSiguientes.map((estado) => (
              <button
                key={estado}
                onClick={() => cambiarEstado(estado)}
                className="text-[10px] px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-100 text-neutral-500"
              >
                → {ESTADO_LABEL[estado] ?? estado.replace("_", " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {modalAbierto && (
        <TareaDetalleModal
          tarea={tarea}
          onClose={() => setModalAbierto(false)}
          onUpdate={() => { onUpdate(); }}
          usuarios={usuarios}
        />
      )}
    </>
  );
}
