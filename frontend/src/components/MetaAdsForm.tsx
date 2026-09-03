import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { MetaAdsReporte, MetaAdsReporteInput } from "../types";

const SECCIONES = ["Campañas RT", "Métricas de mentoría"];

// ─── Draft (estado del formulario, números como texto para aceptar coma/punto) ──

interface SegDraft {
  nombre: string;
  ubicacionPublico: string;
  presupuesto: string;
  leads: string;
  costoPorLead: string;
  observacion: string;
}

interface CamDraft {
  nombre: string;
  ubicacionPublico: string;
  presupuesto: string;
  detallePresupuesto: string;
  leads: string;
  costoPorLead: string;
  moneda: string;
  estado: "Activa" | "Inactiva";
  observaciones: string;
  recomendaciones: string;
  segmentaciones: SegDraft[];
}

interface GrupoDraft {
  seccionPrincipal: string;
  nombre: string;
  subtitulo: string;
  presupuestoTotalActual: string;
  observacion: string;
  sinCampanasActivas: boolean;
  campanas: CamDraft[];
}

interface Draft {
  fechaInicio: string;
  fechaFin: string;
  titulo: string;
  observacionGeneral: string;
  presupuestoTotalActual: string;
  grupos: GrupoDraft[];
}

const emptySeg = (): SegDraft => ({ nombre: "", ubicacionPublico: "", presupuesto: "", leads: "", costoPorLead: "", observacion: "" });
const emptyCam = (): CamDraft => ({ nombre: "", ubicacionPublico: "", presupuesto: "", detallePresupuesto: "", leads: "", costoPorLead: "", moneda: "USD", estado: "Activa", observaciones: "", recomendaciones: "", segmentaciones: [] });
const emptyGrupo = (seccion = SECCIONES[0]): GrupoDraft => ({ seccionPrincipal: seccion, nombre: "", subtitulo: "", presupuestoTotalActual: "", observacion: "", sinCampanasActivas: false, campanas: [] });

function emptyDraft(): Draft {
  return { fechaInicio: "", fechaFin: "", titulo: "", observacionGeneral: "", presupuestoTotalActual: "", grupos: [emptyGrupo()] };
}

function toDraft(r: MetaAdsReporte): Draft {
  return {
    fechaInicio: r.fechaInicio,
    fechaFin: r.fechaFin,
    titulo: r.titulo ?? "",
    observacionGeneral: r.observacionGeneral ?? "",
    presupuestoTotalActual: r.presupuestoTotalActual != null ? String(r.presupuestoTotalActual).replace(".", ",") : "",
    grupos: r.grupos.map((g) => ({
      seccionPrincipal: g.seccionPrincipal,
      nombre: g.nombre,
      subtitulo: g.subtitulo ?? "",
      presupuestoTotalActual: g.presupuestoTotalActual != null ? String(g.presupuestoTotalActual).replace(".", ",") : "",
      observacion: g.observacion ?? "",
      sinCampanasActivas: g.sinCampanasActivas,
      campanas: g.campanas.map((c) => ({
        nombre: c.nombre,
        ubicacionPublico: c.ubicacionPublico ?? "",
        presupuesto: c.presupuesto != null ? String(c.presupuesto).replace(".", ",") : "",
        detallePresupuesto: c.detallePresupuesto ?? "",
        leads: c.leads != null ? String(c.leads) : "",
        costoPorLead: c.costoPorLead != null ? String(c.costoPorLead).replace(".", ",") : "",
        moneda: c.moneda ?? "USD",
        estado: c.estado,
        observaciones: c.observaciones ?? "",
        recomendaciones: c.recomendaciones ?? "",
        segmentaciones: c.segmentaciones.map((s) => ({
          nombre: s.nombre,
          ubicacionPublico: s.ubicacionPublico ?? "",
          presupuesto: s.presupuesto != null ? String(s.presupuesto).replace(".", ",") : "",
          leads: s.leads != null ? String(s.leads) : "",
          costoPorLead: s.costoPorLead != null ? String(s.costoPorLead).replace(".", ",") : "",
          observacion: s.observacion ?? "",
        })),
      })),
    })),
  };
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (Number.isNaN(n)) throw new Error(`Valor numérico inválido: "${s}"`);
  return n;
}

function parseLeads(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) throw new Error("Los leads deben ser un número entero no negativo.");
  return n;
}

function buildPayload(d: Draft): MetaAdsReporteInput {
  // Validación espejo del backend, con mensajes claros en español.
  if (!d.fechaInicio || !d.fechaFin) throw new Error("Indica la fecha de inicio y de fin del período.");
  if (d.fechaFin < d.fechaInicio) throw new Error("La fecha de fin no puede ser anterior a la de inicio.");

  const grupos = d.grupos
    .map((g) => ({ ...g, nombre: g.nombre.trim() }))
    .filter((g) => g.nombre !== "");

  if (grupos.length === 0) throw new Error("Agrega al menos un grupo con nombre.");

  for (const g of grupos) {
    const campanas = g.campanas
      .map((c) => ({ ...c, nombre: c.nombre.trim() }))
      .filter((c) => c.nombre !== "");
    for (const c of campanas) {
      if (c.presupuesto.trim() !== "") {
        const v = parseNum(c.presupuesto)!;
        if (v < 0) throw new Error("El presupuesto no puede ser negativo.");
      }
      if (c.costoPorLead.trim() !== "") {
        const v = parseNum(c.costoPorLead)!;
        if (v < 0) throw new Error("El costo por lead no puede ser negativo.");
      }
      if (c.leads.trim() !== "") parseLeads(c.leads);
      const segs = c.segmentaciones.filter((s) => s.nombre.trim() !== "");
      for (const s of segs) {
        if (s.presupuesto.trim() !== "" && parseNum(s.presupuesto)! < 0) throw new Error("El presupuesto de una segmentación no puede ser negativo.");
        if (s.costoPorLead.trim() !== "" && parseNum(s.costoPorLead)! < 0) throw new Error("El costo por lead de una segmentación no puede ser negativo.");
        if (s.leads.trim() !== "") parseLeads(s.leads);
      }
    }
  }

  return {
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin,
    titulo: d.titulo.trim() || undefined,
    observacionGeneral: d.observacionGeneral.trim() || undefined,
    presupuestoTotalActual: d.presupuestoTotalActual.trim() !== "" ? parseNum(d.presupuestoTotalActual) : null,
    grupos: grupos.map((g) => ({
      seccionPrincipal: g.seccionPrincipal,
      nombre: g.nombre,
      subtitulo: g.subtitulo.trim() || undefined,
      presupuestoTotalActual: g.presupuestoTotalActual.trim() !== "" ? parseNum(g.presupuestoTotalActual) : null,
      observacion: g.observacion.trim() || undefined,
      sinCampanasActivas: g.sinCampanasActivas,
      campanas: g.campanas
        .map((c) => ({ ...c, nombre: c.nombre.trim() }))
        .filter((c) => c.nombre !== "")
        .map((c) => ({
          nombre: c.nombre,
          ubicacionPublico: c.ubicacionPublico.trim() || undefined,
          presupuesto: c.presupuesto.trim() !== "" ? parseNum(c.presupuesto) : null,
          detallePresupuesto: c.detallePresupuesto.trim() || undefined,
          leads: parseLeads(c.leads),
          costoPorLead: c.costoPorLead.trim() !== "" ? parseNum(c.costoPorLead) : null,
          moneda: c.moneda.trim() || "USD",
          estado: c.estado,
          observaciones: c.observaciones.trim() || undefined,
          recomendaciones: c.recomendaciones.trim() || undefined,
          segmentaciones: c.segmentaciones
            .filter((s) => s.nombre.trim() !== "")
            .map((s) => ({
              nombre: s.nombre.trim(),
              ubicacionPublico: s.ubicacionPublico.trim() || undefined,
              presupuesto: s.presupuesto.trim() !== "" ? parseNum(s.presupuesto) : null,
              leads: parseLeads(s.leads),
              costoPorLead: s.costoPorLead.trim() !== "" ? parseNum(s.costoPorLead) : null,
              observacion: s.observacion.trim() || undefined,
            })),
        })),
    })),
  };
}

export function MetaAdsForm({ reporte, aviso, onGuardado, onCancel, onDuplicado }: { reporte?: MetaAdsReporte | null; aviso?: string; onGuardado: () => void; onCancel: () => void; onDuplicado?: (id: string) => void }) {
  const [draft, setDraft] = useState<Draft>(reporte ? toDraft(reporte) : emptyDraft());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const esEdicion = !!reporte;

  const setCampo = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setGrupo = (i: number, patch: Partial<GrupoDraft>) => setDraft((d) => ({ ...d, grupos: d.grupos.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) }));
  const setCampana = (gi: number, ci: number, patch: Partial<CamDraft>) => setDraft((d) => ({ ...d, grupos: d.grupos.map((g, i) => (i === gi ? { ...g, campanas: g.campanas.map((c, j) => (j === ci ? { ...c, ...patch } : c)) } : g)) }));
  const setSeg = (gi: number, ci: number, si: number, patch: Partial<SegDraft>) => setDraft((d) => ({ ...d, grupos: d.grupos.map((g, i) => (i === gi ? { ...g, campanas: g.campanas.map((c, j) => (j === ci ? { ...c, segmentaciones: c.segmentaciones.map((s, k) => (k === si ? { ...s, ...patch } : s)) } : c)) } : g)) }));

  const addGrupo = (seccion: string) => setDraft((d) => ({ ...d, grupos: [...d.grupos, emptyGrupo(seccion)] }));
  const removeGrupo = (i: number) => setDraft((d) => ({ ...d, grupos: d.grupos.filter((_, idx) => idx !== i) }));
  const addCampana = (gi: number) => setDraft((d) => ({ ...d, grupos: d.grupos.map((g, i) => (i === gi ? { ...g, campanas: [...g.campanas, emptyCam()] } : g)) }));
  const removeCampana = (gi: number, ci: number) => setDraft((d) => ({ ...d, grupos: d.grupos.map((g, i) => (i === gi ? { ...g, campanas: g.campanas.filter((_, j) => j !== ci) } : g)) }));
  const addSeg = (gi: number, ci: number) => setDraft((d) => ({ ...d, grupos: d.grupos.map((g, i) => (i === gi ? { ...g, campanas: g.campanas.map((c, j) => (j === ci ? { ...c, segmentaciones: [...c.segmentaciones, emptySeg()] } : c)) } : g)) }));
  const removeSeg = (gi: number, ci: number, si: number) => setDraft((d) => ({ ...d, grupos: d.grupos.map((g, i) => (i === gi ? { ...g, campanas: g.campanas.map((c, j) => (j === ci ? { ...c, segmentaciones: c.segmentaciones.filter((_, k) => k !== si) } : c)) } : g)) }));

  async function guardar() {
    setError(null);
    setExito(null);
    let payload: MetaAdsReporteInput;
    try {
      payload = buildPayload(draft);
    } catch (e: any) {
      setError(e.message);
      return;
    }
    setGuardando(true);
    try {
      if (esEdicion) {
        await api.actualizarMetaAds(reporte!.id, payload);
        setExito("Reporte actualizado correctamente.");
      } else {
        await api.crearMetaAds(payload);
        setExito("Reporte registrado correctamente.");
      }
      onGuardado();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        const id = (e.payload as { reporteExistenteId?: string } | undefined)?.reporteExistenteId;
        if (id && onDuplicado) {
          onDuplicado(id);
        } else {
          setError("Ya existe un reporte para ese período. Edítalo en lugar de crear uno nuevo.");
        }
      } else {
        setError(e.message ?? "No se pudo guardar el reporte.");
      }
    } finally {
      setGuardando(false);
    }
  }

  const inputCls = "w-full border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 rounded-lg px-3 py-2 text-sm";
  const labelCls = "text-xs font-medium text-neutral-600 block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4 sm:p-8" onClick={onCancel}>
      <div className="bg-neutral-50 rounded-xl shadow-xl w-full max-w-3xl my-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-neutral-200">
          <h3 className="text-lg font-semibold text-neutral-900">{esEdicion ? "Editar reporte de Meta Ads" : "Registrar métricas de Meta Ads"}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Registro manual de campañas y métricas semanales. No se conecta con Meta.</p>
          {aviso && <p className="mt-2 text-xs bg-warning-50 border border-warning-200 text-warning-700 rounded-lg px-3 py-2">{aviso}</p>}
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Encabezado del reporte */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fecha de inicio *</label>
              <input type="date" value={draft.fechaInicio} onChange={(e) => setCampo({ fechaInicio: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha de fin *</label>
              <input type="date" value={draft.fechaFin} onChange={(e) => setCampo({ fechaFin: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Título (opcional)</label>
              <input type="text" value={draft.titulo} onChange={(e) => setCampo({ titulo: e.target.value })} className={inputCls} placeholder="Ej: Lanzamiento de marzo" />
            </div>
            <div>
              <label className={labelCls}>Presupuesto total actual (opcional)</label>
              <input type="text" inputMode="decimal" value={draft.presupuestoTotalActual} onChange={(e) => setCampo({ presupuestoTotalActual: e.target.value })} className={inputCls} placeholder="Ej: 500,00" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Observación general (opcional)</label>
            <textarea value={draft.observacionGeneral} onChange={(e) => setCampo({ observacionGeneral: e.target.value })} className={inputCls} rows={2} />
          </div>

          {/* Grupos */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-neutral-800">Grupos</h4>
              <div className="flex gap-1.5">
                {SECCIONES.map((s) => (
                  <button key={s} type="button" onClick={() => addGrupo(s)} className="text-xs border border-neutral-200 hover:bg-neutral-100 text-neutral-600 rounded-lg px-2.5 py-1.5">
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            {draft.grupos.map((g, gi) => (
              <div key={gi} className="border border-neutral-200 rounded-lg p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase text-neutral-400 tracking-wider">Grupo {gi + 1}</span>
                  <button type="button" onClick={() => removeGrupo(gi)} className="text-xs text-danger-600 hover:underline">✕ Quitar grupo</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Sección principal</label>
                    <select value={g.seccionPrincipal} onChange={(e) => setGrupo(gi, { seccionPrincipal: e.target.value })} className={inputCls}>
                      {SECCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Nombre del grupo *</label>
                    <input type="text" value={g.nombre} onChange={(e) => setGrupo(gi, { nombre: e.target.value })} className={inputCls} placeholder="Ej: Nuevos lanzamientos" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Subtítulo (opcional)</label>
                    <input type="text" value={g.subtitulo} onChange={(e) => setGrupo(gi, { subtitulo: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Presupuesto (opcional)</label>
                    <input type="text" inputMode="decimal" value={g.presupuestoTotalActual} onChange={(e) => setGrupo(gi, { presupuestoTotalActual: e.target.value })} className={inputCls} placeholder="Ej: 200,00" />
                  </div>
                </div>

                <div className="mb-3">
                  <label className={labelCls}>Observación (opcional)</label>
                  <input type="text" value={g.observacion} onChange={(e) => setGrupo(gi, { observacion: e.target.value })} className={inputCls} />
                </div>

                <label className="flex items-center gap-2 text-xs text-neutral-600 mb-3">
                  <input type="checkbox" checked={g.sinCampanasActivas} onChange={(e) => setGrupo(gi, { sinCampanasActivas: e.target.checked })} />
                  Sin campañas activas actualmente
                </label>

                {/* Campañas */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-neutral-500">Campañas</span>
                    <button type="button" onClick={() => addCampana(gi)} className="text-xs text-primary-600 hover:underline">+ Agregar campaña</button>
                  </div>

                  {g.campanas.map((c, ci) => (
                    <div key={ci} className="border border-neutral-100 rounded-lg p-3 bg-neutral-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-neutral-400">Campaña {ci + 1}</span>
                        <button type="button" onClick={() => removeCampana(gi, ci)} className="text-[11px] text-danger-600 hover:underline">✕ Quitar</button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className={labelCls}>Nombre de la campaña *</label>
                          <input type="text" value={c.nombre} onChange={(e) => setCampana(gi, ci, { nombre: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Ubicación / público</label>
                          <input type="text" value={c.ubicacionPublico} onChange={(e) => setCampana(gi, ci, { ubicacionPublico: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Estado</label>
                          <select value={c.estado} onChange={(e) => setCampana(gi, ci, { estado: e.target.value as "Activa" | "Inactiva" })} className={inputCls}>
                            <option value="Activa">Activa</option>
                            <option value="Inactiva">Inactiva</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Presupuesto</label>
                          <input type="text" inputMode="decimal" value={c.presupuesto} onChange={(e) => setCampana(gi, ci, { presupuesto: e.target.value })} className={inputCls} placeholder="Ej: 4,50" />
                        </div>
                        <div>
                          <label className={labelCls}>Detalle presupuesto</label>
                          <select value={c.detallePresupuesto} onChange={(e) => setCampana(gi, ci, { detallePresupuesto: e.target.value })} className={inputCls}>
                            <option value="">—</option>
                            <option value="Diario">Diario</option>
                            <option value="Total">Total</option>
                            <option value="Durante 7 días">Durante 7 días</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Leads</label>
                          <input type="number" min={0} step={1} value={c.leads} onChange={(e) => setCampana(gi, ci, { leads: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Costo por lead</label>
                          <input type="text" inputMode="decimal" value={c.costoPorLead} onChange={(e) => setCampana(gi, ci, { costoPorLead: e.target.value })} className={inputCls} placeholder="Ej: 0,72" />
                        </div>
                        <div>
                          <label className={labelCls}>Moneda</label>
                          <input type="text" value={c.moneda} onChange={(e) => setCampana(gi, ci, { moneda: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Observaciones</label>
                          <input type="text" value={c.observaciones} onChange={(e) => setCampana(gi, ci, { observaciones: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Recomendaciones</label>
                          <input type="text" value={c.recomendaciones} onChange={(e) => setCampana(gi, ci, { recomendaciones: e.target.value })} className={inputCls} />
                        </div>
                      </div>

                      {/* Segmentaciones */}
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-neutral-500">Segmentaciones</span>
                          <button type="button" onClick={() => addSeg(gi, ci)} className="text-[11px] text-primary-600 hover:underline">+ Agregar segmentación</button>
                        </div>
                        {c.segmentaciones.map((s, si) => (
                          <div key={si} className="border border-neutral-100 rounded-md p-2.5 bg-white">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] text-neutral-400">Segmentación {si + 1}</span>
                              <button type="button" onClick={() => removeSeg(gi, ci, si)} className="text-[10px] text-danger-600 hover:underline">✕ Quitar</button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              <div className="col-span-2">
                                <label className={labelCls}>País / ubicación *</label>
                                <input type="text" value={s.nombre} onChange={(e) => setSeg(gi, ci, si, { nombre: e.target.value })} className={inputCls} />
                              </div>
                              <div>
                                <label className={labelCls}>Presupuesto</label>
                                <input type="text" inputMode="decimal" value={s.presupuesto} onChange={(e) => setSeg(gi, ci, si, { presupuesto: e.target.value })} className={inputCls} />
                              </div>
                              <div>
                                <label className={labelCls}>Leads</label>
                                <input type="number" min={0} step={1} value={s.leads} onChange={(e) => setSeg(gi, ci, si, { leads: e.target.value })} className={inputCls} />
                              </div>
                              <div>
                                <label className={labelCls}>Costo por lead</label>
                                <input type="text" inputMode="decimal" value={s.costoPorLead} onChange={(e) => setSeg(gi, ci, si, { costoPorLead: e.target.value })} className={inputCls} />
                              </div>
                              <div>
                                <label className={labelCls}>Observación</label>
                                <input type="text" value={s.observacion} onChange={(e) => setSeg(gi, ci, si, { observacion: e.target.value })} className={inputCls} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <div className="px-6 pb-2"><p className="text-sm text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">{error}</p></div>}
        {exito && <div className="px-6 pb-2"><p className="text-sm text-success-700 bg-success-50 border border-success-200 rounded-lg px-3 py-2">{exito}</p></div>}

        <div className="px-6 py-4 border-t border-neutral-200 flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50">
            {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Registrar reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}
