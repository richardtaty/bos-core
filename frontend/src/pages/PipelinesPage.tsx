import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Pipeline } from "../types";
import { KanbanBoard } from "../components/KanbanBoard";

export function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  useEffect(() => {
    void api.listarPipelines().then((data) => {
      setPipelines(data);
      if (data.length > 0) setSeleccionado(data[0].id);
    });
  }, []);

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

      {seleccionado && <KanbanBoard pipelineId={seleccionado} />}
    </div>
  );
}
