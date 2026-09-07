import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { ESTADOS_USA, CIUDADES_SUGERIDAS } from "../lib/estados-usa";
import type { Usuario } from "../types";

const FUENTES = ["Podcast", "Mentoría", "Evento", "Referido", "Redes sociales", "Otro"];
const TAGS_SUGERIDAS = ["Llamada en frío", "Referido", "Campañas", "Podcast", "Evento en vivo", "Base de datos reactivada", "DM redes sociales"];
const NEGOCIOS_DISPONIBLES = [
  "Préstamo para negocios", "Código Financiero", "Tu Negocio en USA",
  "Mentoría Estratégica", "Kappitalia CRM", "Libros", "Crea tu libro",
  "Eventos presenciales", "Eventos virtuales",
  "Marketing", "Podcast", "Fábrica de Talentos", "Otro",
];

// Contacto mínimo que devuelve el guardado (id + nombre bastan para elegirlo
// como invitado de la cita; el resto ya vive en su ficha del CRM).
export interface ContactoResumen {
  id: string;
  nombre: string;
}

// Mismo objeto que hoy manda el formulario (coincide con crearPersonaSchema).
export interface DatosNuevoContacto {
  nombre: string;
  telefono?: string;
  email?: string;
  ciudad: string;
  estado: string;
  fuente: string;
  referidoPor?: string;
  responsableId: string;
  fechaNacimiento?: string;
  tags: string[];
  negocios: string[];
}

interface Props {
  onClose: () => void;
  onCreated: (persona: ContactoResumen) => void;
  // Precargas opcionales: si el formulario se abre desde el calendario de
  // podcasts con el nombre ya escrito, aquí llega. Clientes no manda nada.
  inicialNombre?: string;
  inicialFuente?: string;
  inicialTags?: string[];
  // Quién crea el contacto. Por defecto el endpoint normal de Personas
  // (api.crearPersona). El calendario de podcasts inyecta el suyo, que además
  // bloquea duplicados por correo/teléfono antes de crear.
  guardarContacto?: (datos: DatosNuevoContacto) => Promise<ContactoResumen>;
}

export function NuevaPersonaModal({
  onClose,
  onCreated,
  inicialNombre,
  inicialFuente,
  inicialTags,
  guardarContacto,
}: Props) {
  const { usuario } = useAuth();
  const [nombre, setNombre] = useState(inicialNombre ?? "");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [estado, setEstado] = useState("");
  const [fuente, setFuente] = useState(inicialFuente ?? "");
  const [referidoPor, setReferidoPor] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [tagsSeleccionadas, setTagsSeleccionadas] = useState<string[]>(inicialTags ?? []);
  const [negociosSeleccionados, setNegociosSeleccionados] = useState<string[]>([]);
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [responsableId, setResponsableId] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [duplicado, setDuplicado] = useState<{ mensaje: string; claro: ContactoResumen } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void api.listarUsuarios().then((data) => {
      setEquipo(data);
      setResponsableId(usuario?.id ?? data[0]?.id ?? "");
    });
  }, [usuario]);

  const toggleTag = (tag: string) =>
    setTagsSeleccionadas((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const toggleNegocio = (negocio: string) =>
    setNegociosSeleccionados((prev) => (prev.includes(negocio) ? prev.filter((n) => n !== negocio) : [...prev, negocio]));

  const armarDatos = (): DatosNuevoContacto => ({
    nombre,
    telefono: telefono || undefined,
    email: email || undefined,
    ciudad,
    estado,
    fuente,
    referidoPor: fuente === "Referido" ? referidoPor : undefined,
    responsableId,
    fechaNacimiento: fechaNacimiento || undefined,
    tags: tagsSeleccionadas,
    negocios: negociosSeleccionados,
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    setDuplicado(null);
    try {
      const persona = guardarContacto
        ? await guardarContacto(armarDatos())
        : await api.crearPersona(armarDatos());
      onCreated({ id: persona.id, nombre: persona.nombre });
    } catch (err) {
      if (err instanceof ApiError && typeof err.payload === "object" && err.payload) {
        const payload = err.payload as {
          fieldErrors?: Record<string, string[]>;
          mensaje?: string;
          claro?: ContactoResumen;
        };
        if (payload.claro) {
          // Ya existe un contacto con esos datos: no crear, ofrecer usarlo.
          setDuplicado({ mensaje: payload.mensaje ?? "Ya existe un contacto con estos datos.", claro: payload.claro });
        } else if (payload.fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(payload.fieldErrors)) mapped[k] = v[0];
          setErrores(mapped);
        }
      }
    } finally {
      setEnviando(false);
    }
  };

  // Al tocar nombre, correo o teléfono se limpia el aviso de duplicado: si era
  // otra persona, basta corregir el dato y volver a intentar.
  const alEditarDatoIdentificador = (aplicar: (v: string) => void) => (v: string) => {
    setDuplicado(null);
    aplicar(v);
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-16 z-50 overflow-y-auto">
      <form onSubmit={onSubmit} className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-lg p-6 border border-neutral-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-800">Nuevo contacto</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-600">✕</button>
        </div>

        {duplicado && (
          <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 p-3">
            <p className="text-sm font-medium text-warning-800">{duplicado.mensaje}</p>
            <button
              type="button"
              onClick={() => onCreated({ id: duplicado.claro.id, nombre: duplicado.claro.nombre })}
              className="mt-2 text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600"
            >
              Usar este contacto existente
            </button>
            <p className="text-[11px] text-neutral-600 mt-1">
              Si es otra persona, corrige el correo o el teléfono y guarda de nuevo.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="col-span-2">
            <label className="text-xs text-neutral-600">Nombre completo</label>
            <input value={nombre} onChange={(e) => alEditarDatoIdentificador(setNombre)(e.target.value)} required className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Teléfono</label>
            <input value={telefono} onChange={(e) => alEditarDatoIdentificador(setTelefono)(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Email</label>
            <input value={email} onChange={(e) => alEditarDatoIdentificador(setEmail)(e.target.value)} type="email" className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Fecha de nacimiento</label>
            <input value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} type="date" className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Ciudad *</label>
            <input
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              required
              list="ciudades-sugeridas"
              placeholder="Escribe o elige..."
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm"
            />
            <datalist id="ciudades-sugeridas">
              {CIUDADES_SUGERIDAS.map((c) => <option key={c} value={c} />)}
            </datalist>
            {errores.ciudad && <p className="text-[11px] text-danger-600 mt-0.5">{errores.ciudad}</p>}
          </div>
          <div>
            <label className="text-xs text-neutral-600">Estado *</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value)} required className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm">
              <option value="">Selecciona...</option>
              {ESTADOS_USA.map((e) => <option key={e}>{e}</option>)}
            </select>
            {errores.estado && <p className="text-[11px] text-danger-600 mt-0.5">{errores.estado}</p>}
          </div>
          <div>
            <label className="text-xs text-neutral-600">Fuente *</label>
            <select value={fuente} onChange={(e) => setFuente(e.target.value)} required className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm">
              <option value="">Selecciona...</option>
              {FUENTES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-600">Responsable</label>
            <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm">
              {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          {fuente === "Referido" && (
            <div>
              <label className="text-xs text-neutral-600">Referido por *</label>
              <input value={referidoPor} onChange={(e) => setReferidoPor(e.target.value)} className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-1.5 text-sm" />
              {errores.referidoPor && <p className="text-[11px] text-danger-600 mt-0.5">{errores.referidoPor}</p>}
            </div>
          )}
        </div>

        <label className="text-xs text-neutral-600">Etiquetas — ¿cómo fue el primer contacto? *</label>
        <div className="flex flex-wrap gap-1.5 mt-1 mb-3">
          {TAGS_SUGERIDAS.map((tag) => (
            <button
              type="button"
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                tagsSeleccionadas.includes(tag)
                  ? "bg-primary-500/15 border-primary-500 text-primary-600"
                  : "bg-neutral-100 border-neutral-200 text-neutral-600"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        {errores.tags && <p className="text-[11px] text-danger-600 mb-3">{errores.tags}</p>}

        <label className="text-xs text-neutral-600">Negocios de interés (puedes marcar varios)</label>
        <div className="flex flex-wrap gap-1.5 mt-1 mb-1">
          {NEGOCIOS_DISPONIBLES.map((negocio) => (
            <button
              type="button"
              key={negocio}
              onClick={() => toggleNegocio(negocio)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                negociosSeleccionados.includes(negocio)
                  ? "bg-success-500/15 border-success-500 text-success-700"
                  : "bg-neutral-100 border-neutral-200 text-neutral-600"
              }`}
            >
              {negocio}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-neutral-200 text-neutral-600">
            Cancelar
          </button>
          <button disabled={enviando} className="text-sm px-4 py-2 rounded-lg bg-primary-500 text-white font-medium disabled:bg-primary-100 disabled:text-primary-800">
            {enviando ? "Guardando..." : "Guardar contacto"}
          </button>
        </div>
      </form>
    </div>
  );
}
