import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Pipeline } from "../types";
import { KanbanBoard } from "../components/KanbanBoard";

export function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  // "Ver en origen" desde Resumen de Ventas llega aquí con el pipeline y el registro exactos
  // (?pipelineId=…&registroId=…), para abrir ESA operación concreta y no el listado general.
  const [searchParams] = useSearchParams();
  const pipelineIdPedido = searchParams.get("pipelineId");
  const registroIdPedido = searchParams.get("registroId");

  useEffect(() => {
    void api.listarPipelines().then((data) => {
      setPipelines(data);
      if (data.length === 0) return;
      // Se respeta el pipeline pedido solo si existe y es visible para este usuario (el mismo
      // aislamiento por departamento que aplica el backend); si no, se abre el primero.
      const existePedido = !!pipelineIdPedido && data.some((p) => p.id === pipelineIdPedido);
      setSeleccionado(existePedido ? pipelineIdPedido : data[0].id);
    });
  }, [pipelineIdPedido]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-neutral-900">Pipelines</h1>
        <select
          value={seleccionado ?? ""}
          onChange={(e) => setSeleccionado(e.target.value)}
          className="border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm"
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {/* Sala de OFERTAS: aquí sí se puede configurar cómo se cobra cada oportunidad (pago único,
          varios abonos o recurrente). Otras pantallas que reutilizan el mismo tablero (Podcast)
          no lo activan. */}
      {seleccionado && (
        <KanbanBoard pipelineId={seleccionado} registroIdDestacado={registroIdPedido} permiteModalidadPago />
      )}
    </div>
  );
}
