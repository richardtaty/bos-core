import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { FichaPersona, Pipeline } from "../types";
import { RegistrarInteraccionForm } from "../components/RegistrarInteraccionForm";
import { ActivosDigitalesTab } from "../components/ActivosDigitalesTab";
import { ESTADOS_USA, CIUDADES_SUGERIDAS } from "../lib/estados-usa";

const TABS = ["Timeline", "Comercial", "Comentarios", "Historial", "Tareas", "Activos digitales"] as const;
type Tab = (typeof TABS)[number];

const NEGOCIOS_DISPONIBLES = [
  "Préstamo para negocios", "Código Financiero", "Tu Negocio en USA",
  "Mentoría Estratégica", "Kappitalia CRM", "Libros", "Crea tu libro",
  "Eventos presenciales", "Eventos virtuales",
  "Marketing", "Podcast", "Fábrica de Talentos", "Otro",
];

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "America/New_York",
  }) + " ET";
}

export function PersonaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";
  const [ficha, setFicha] = useState<FichaPersona | null>(null);
  const [tab, setTab] = useState<Tab>("Timeline");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineElegido, setPipelineElegido] = useState("");
  const [valorRegistro, setValorRegistro] = useState("");
  const [creandoRegistro, setCreandoRegistro] = useState(false);
  const [comentarios, setComentarios] = useState("");
  const [guardandoComentarios, setGuardandoComentarios] = useState(false);
  const [comentariosGuardados, setComentariosGuardados] = useState(false);
  const [negociosSeleccionados, setNegociosSeleccionados] = useState<string[]>([]);
  const [guardandoNegocios, setGuardandoNegocios] = useState(false);
  const [negociosGuardados, setNegociosGuardados] = useState(false);
  const [editando, setEditando] = useState(false);
  const [editTelefono, setEditTelefono] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCiudad, setEditCiudad] = useState("");
  const [editEstado, setEditEstado] = useState("");
  const [editFechaNacimiento, setEditFechaNacimiento] = useState("");
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [editError, setEditError] = useState("");
  const [datosGuardados, setDatosGuardados] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    const data = await api.obtenerFicha(id);
    setFicha(data);
    setComentarios(data.comentarios ?? "");
    setNegociosSeleccionados(data.negocios ?? []);
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void api.listarPipelines().then((data) => {
      setPipelines(data);
      if (data.length > 0) setPipelineElegido(data[0].id);
    });
  }, []);

  const crearRegistroPipeline = async () => {
    if (!ficha || !pipelineElegido) return;
    setCreandoRegistro(true);
    try {
      await api.crearRegistro(pipelineElegido, {
        personaId: ficha.id,
        valor: valorRegistro ? Number(valorRegistro) : undefined,
      });
      setValorRegistro("");
      void cargar();
    } finally {
      setCreandoRegistro(false);
    }
  };

  const completarTarea = async (tareaId: string) => {
    await api.completarTarea(tareaId);
    void cargar();
  };

  const guardarComentarios = async () => {
    if (!ficha) return;
    setGuardandoComentarios(true);
    setComentariosGuardados(false);
    try {
      await api.actualizarComentarios(ficha.id, comentarios);
      setComentariosGuardados(true);
      setTimeout(() => setComentariosGuardados(false), 2500);
    } finally {
      setGuardandoComentarios(false);
    }
  };

  const toggleNegocio = (negocio: string) =>
    setNegociosSeleccionados((prev) => (prev.includes(negocio) ? prev.filter((n) => n !== negocio) : [...prev, negocio]));

  const guardarNegocios = async () => {
    if (!ficha) return;
    setGuardandoNegocios(true);
    setNegociosGuardados(false);
    try {
      await api.actualizarNegocios(ficha.id, negociosSeleccionados);
      setNegociosGuardados(true);
      setTimeout(() => setNegociosGuardados(false), 2500);
      void cargar();
    } finally {
      setGuardandoNegocios(false);
    }
  };

  const abrirEdicion = () => {
    if (!ficha) return;
    setEditTelefono(ficha.telefono ?? "");
    setEditEmail(ficha.email ?? "");
    setEditCiudad(ficha.ciudad ?? "");
    setEditEstado(ficha.estado ?? "");
    setEditFechaNacimiento(ficha.fechaNacimiento ?? "");
    setEditError("");
    setEditando(true);
  };

  const guardarDatos = async () => {
    if (!ficha) return;

    // Solo se manda lo que de verdad cambió. Es importante y no cosmético: hay ~174 fichas
    // cuyo estado guardado ya no es válido ("USA - ESTE", "Q.Roo"...). Si mandáramos los
    // cinco campos siempre, alguien que solo quiere corregir el teléfono recibiría un error
    // porque el estado malo viajaría con el resto.
    const cambios: Record<string, string> = {};
    if (editTelefono !== (ficha.telefono ?? "")) cambios.telefono = editTelefono;
    if (editEmail !== (ficha.email ?? "")) cambios.email = editEmail;
    if (editCiudad !== (ficha.ciudad ?? "")) cambios.ciudad = editCiudad;
    if (editEstado !== (ficha.estado ?? "")) cambios.estado = editEstado;
    if (editFechaNacimiento !== (ficha.fechaNacimiento ?? "")) cambios.fechaNacimiento = editFechaNacimiento;

    if (Object.keys(cambios).length === 0) {
      setEditando(false);
      return;
    }

    // Los botones no están dentro de un <form>, así que el `required` del menú no dispara.
    // Se avisa aquí en vez de esperar el error 400 del servidor.
    if (cambios.estado !== undefined && !ESTADOS_USA.includes(cambios.estado)) {
      setEditError("Elige un estado de la lista.");
      return;
    }
    if (cambios.ciudad !== undefined && !cambios.ciudad.trim()) {
      setEditError("La ciudad no puede quedar vacía.");
      return;
    }

    setGuardandoDatos(true);
    setEditError("");
    setDatosGuardados(false);
    try {
      await api.actualizarPersona(ficha.id, cambios);
      setEditando(false);
      setDatosGuardados(true);
      setTimeout(() => setDatosGuardados(false), 2500);
      void cargar();
    } catch (err) {
      if (err instanceof ApiError && typeof err.payload === "object" && err.payload) {
        const fe = (err.payload as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
        setEditError(Object.values(fe).flat().join(" ") || "No se pudo guardar.");
      } else {
        setEditError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    } finally {
      setGuardandoDatos(false);
    }
  };

  if (!ficha) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const puedeEditar = !!usuario && (usuario.rol === "ADMIN" || usuario.rol === "SUPER_ADMIN" || ficha.responsableId === usuario.id);

  return (
    <div>
      <Link to="/personas" className="text-xs text-neutral-500 hover:text-primary-600">← Personas</Link>

      <div className="flex items-start justify-between mt-2 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{ficha.nombre}</h1>
          <p className="text-sm text-neutral-500">
            {ficha.telefono ?? "sin teléfono"} · {ficha.email ?? "sin email"} · {ficha.ciudad}, {ficha.estado}
          </p>
          {ficha.fechaNacimiento && (
            <p className="text-xs text-pink-600 mt-0.5">
              🎂 {new Date(ficha.fechaNacimiento + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "long" })}
              {" "}({(() => { const hoy = new Date(); const [y, m, d] = ficha.fechaNacimiento!.split("-").map(Number); let edad = hoy.getFullYear() - y; const ma = hoy.getMonth() + 1; if (ma < m || (ma === m && hoy.getDate() < d)) edad--; return edad; })()} años)
            </p>
          )}
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {ficha.tags.map((t) => (
              <span key={t} className="bg-warning-50 bg-warning-500/15 text-warning-700 text-[11px] px-2 py-0.5 rounded-full">{t}</span>
            ))}
            {ficha.negocios.map((n) => (
              <span key={n} className="bg-success-50 bg-success-500/15 text-success-700 text-[11px] px-2 py-0.5 rounded-full">{n}</span>
            ))}
          </div>
        </div>
        {puedeEditar && (
          <button onClick={abrirEdicion} className="text-xs border border-neutral-200 text-neutral-600 rounded-lg px-3 py-1.5 hover:bg-neutral-100 shrink-0">
            ✏️ Editar datos
          </button>
        )}
      </div>

      {editando && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4">
          <h2 className="text-sm font-semibold text-neutral-800 mb-3">Editar datos de contacto</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-600">Teléfono</label>
              <input value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-neutral-600">Email</label>
              <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-neutral-600">Ciudad *</label>
              <input value={editCiudad} onChange={(e) => setEditCiudad(e.target.value)} required list="ciudades-editar" className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
              <datalist id="ciudades-editar">
                {CIUDADES_SUGERIDAS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-neutral-600">Estado *</label>
              {/*
                La opción vacía es obligatoria. Sin ella, una ficha cuyo estado guardado no
                está en la lista (hay ~174 así) haría que el navegador muestre "Alabama" —
                la primera opción — sin que nadie la eligiera, y al guardar el contacto se
                volvería Alabama en silencio. Con la opción vacía el menú aparece en blanco
                y el aviso de abajo dice qué había antes.
              */}
              <select value={editEstado} onChange={(e) => setEditEstado(e.target.value)} required className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Selecciona...</option>
                {ESTADOS_USA.map((e) => <option key={e}>{e}</option>)}
              </select>
              {!ESTADOS_USA.includes(editEstado) && (
                <p className="text-[11px] text-warning-600 mt-0.5">
                  {ficha.estado ? `Guardado como «${ficha.estado}», que no es un estado válido.` : "Sin estado."} Elige el correcto.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-neutral-600">Fecha de nacimiento</label>
              <input value={editFechaNacimiento} onChange={(e) => setEditFechaNacimiento(e.target.value)} type="date" className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
            </div>
          </div>
          {editError && <p className="text-[11px] text-danger-600 mt-2">{editError}</p>}
          <div className="flex items-center gap-3 mt-3">
            <button onClick={guardarDatos} disabled={guardandoDatos} className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800">
              {guardandoDatos ? "Guardando..." : "Guardar"}
            </button>
            <button onClick={() => setEditando(false)} className="text-xs border border-neutral-200 text-neutral-600 rounded-lg px-3 py-1.5">
              Cancelar
            </button>
            {datosGuardados && <span className="text-xs text-success-600">Guardado ✓</span>}
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-neutral-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === t ? "border-primary-500 text-primary-600 font-medium" : "border-transparent text-neutral-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Timeline" && (
        <div>
          <RegistrarInteraccionForm personaId={ficha.id} onDone={cargar} />
          <div className="mt-5 flex flex-col gap-3">
            {ficha.timeline.map((ev, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-neutral-800">{ev.detalle}</p>
                  <p className="text-[11px] text-neutral-500">{fmtFecha(ev.fecha)}</p>
                </div>
              </div>
            ))}
            {ficha.timeline.length === 0 && <p className="text-sm text-neutral-500">Sin actividad todavía.</p>}
          </div>
        </div>
      )}

      {tab === "Comercial" && (
        <div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-neutral-600 mb-2">Negocios de interés</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {NEGOCIOS_DISPONIBLES.map((negocio) => (
                <button
                  type="button"
                  key={negocio}
                  onClick={() => toggleNegocio(negocio)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    negociosSeleccionados.includes(negocio)
                      ? "bg-success-50 bg-success-500/15 border-success-500 border-success-500/20 text-success-700"
                      : "bg-neutral-100 border-neutral-200 text-neutral-600"
                  }`}
                >
                  {negocio}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={guardarNegocios}
                disabled={guardandoNegocios}
                className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800"
              >
                {guardandoNegocios ? "Guardando..." : "Guardar negocios"}
              </button>
              {negociosGuardados && <span className="text-xs text-success-600">Guardado ✓</span>}
            </div>
          </div>

          <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-3 mb-4 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-neutral-600 block mb-1">Agregar a pipeline</label>
              <select
                value={pipelineElegido}
                onChange={(e) => setPipelineElegido(e.target.value)}
                className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-2 py-1.5 text-sm"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="text-xs text-neutral-600 block mb-1">Valor (opcional)</label>
              <input
                value={valorRegistro}
                onChange={(e) => setValorRegistro(e.target.value)}
                type="number"
                placeholder="USD"
                className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={crearRegistroPipeline}
              disabled={creandoRegistro || !pipelineElegido}
              className="text-xs bg-primary-500 text-white px-3 py-2 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800"
            >
              {creandoRegistro ? "Agregando..." : "+ Agregar"}
            </button>
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-xl divide-y divide-neutral-200">
            {ficha.registros.length === 0 && <p className="p-4 text-sm text-neutral-500">Sin registros en ningún pipeline todavía.</p>}
            {ficha.registros.map((r) => (
              <div key={r.id} className="p-4 flex justify-between text-sm">
                <div>
                  <p className="font-medium text-neutral-900">{r.pipelineNombre}</p>
                  <p className="text-neutral-500 text-xs">{r.etapaNombre}</p>
                </div>
                {r.valor != null && <p className="font-medium text-neutral-900">${r.valor.toLocaleString()}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Comentarios" && (
        <div>
          <p className="text-xs text-neutral-500 mb-2">
            Notas generales visibles para todo el equipo — preferencias, contexto, lo que sea útil.
            {!esSuperAdmin && <span className="block mt-0.5 text-neutral-500">Solo un Super Admin puede editarlas.</span>}
          </p>
          {esSuperAdmin ? (
            <>
              <textarea
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
                rows={6}
                className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-2 text-sm"
                placeholder="Escribe aquí..."
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={guardarComentarios}
                  disabled={guardandoComentarios}
                  className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800"
                >
                  {guardandoComentarios ? "Guardando..." : "Guardar"}
                </button>
                {comentariosGuardados && <span className="text-xs text-success-600">Guardado ✓</span>}
              </div>
            </>
          ) : (
            <div className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-neutral-100 text-neutral-700 min-h-[120px] whitespace-pre-wrap">
              {comentarios || <span className="text-neutral-500">Sin comentarios todavía.</span>}
            </div>
          )}
        </div>
      )}

      {tab === "Historial" && (
        <div className="flex flex-col gap-2">
          {ficha.historial.length === 0 && <p className="text-sm text-neutral-500">Sin historial todavía.</p>}
          {ficha.historial.map((h) => (
            <div key={h.id} className="p-3 rounded-lg border border-neutral-200 bg-neutral-50 text-sm">
              <p className="text-neutral-800">{h.accion}</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">{h.autorNombre} · {fmtFecha(h.fecha)}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "Tareas" && (
        <div className="flex flex-col gap-2">
          {ficha.tareas.length === 0 && <p className="text-sm text-neutral-500">Sin tareas de seguimiento.</p>}
          {ficha.tareas.map((t) => (
            <div key={t.id} className={`flex items-center justify-between p-3 rounded-lg border ${t.completado ? "bg-neutral-100 border-neutral-200 opacity-60" : "bg-neutral-50 border-neutral-200"}`}>
              <div>
                <p className="text-sm text-neutral-800">{t.nota}</p>
                <p className="text-xs text-neutral-500">{fmtFecha(t.fecha)}</p>
              </div>
              {!t.completado && (
                <button onClick={() => completarTarea(t.id)} className="text-xs text-primary-600 font-medium hover:underline">
                  Marcar hecho
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "Activos digitales" && (
        <ActivosDigitalesTab personaId={ficha.id} puedeEditar={puedeEditar} />
      )}
    </div>
  );
}
