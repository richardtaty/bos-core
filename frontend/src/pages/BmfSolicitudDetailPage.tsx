import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { BmfSolicitudDetalle } from "../types";

const fmtFecha = (v: string | null) => (v ? new Date(v).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtMonto = (v: number | null) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);

const ESTADO_DOCS: Record<string, string> = {
  pendiente: "Sin documentos",
  parcial: "Parcial",
  completo: "Completo",
};

function Campo({ etiqueta, valor }: { etiqueta: string; valor?: string | number | null }) {
  const texto = valor === undefined || valor === null || valor === "" ? "—" : String(valor);
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{texto}</dd>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-500">{titulo}</h2>
      {children}
    </section>
  );
}

export function BmfSolicitudDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<BmfSolicitudDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const data = await api.obtenerBmfSolicitud(id);
        setS(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setCargando(false);
      }
    })();
  }, [id]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;
  if (error || !s) return <p className="text-sm text-neutral-500">{error || "Solicitud no encontrada"}</p>;

  const nombreDueño = [s.propietarioNombre, s.propietarioApellido].filter(Boolean).join(" ") || "—";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-neutral-800">{s.applicationId}</h1>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
              s.estadoDocumentos === "completo" ? "bg-success-100 text-success-700" :
              s.estadoDocumentos === "parcial" ? "bg-warning-100 text-warning-700" :
              "bg-neutral-100 text-neutral-600"
            }`}>{ESTADO_DOCS[s.estadoDocumentos] ?? s.estadoDocumentos}</span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Recibida {fmtFecha(s.createdAt)} · Etapa: <span className="font-medium text-neutral-700">{s.etapaNombre ?? "—"}</span>
          </p>
        </div>
        <Link to="/bmf/solicitudes" className="text-sm font-semibold text-neutral-600 hover:text-primary-600">← Volver</Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo="Negocio">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Campo etiqueta="Empresa (legal)" valor={s.empresaLegal} />
            <Campo etiqueta="DBA" valor={s.dba} />
            <Campo etiqueta="Industria" valor={s.industria} />
            <Campo etiqueta="Estructura" valor={s.estructuraNegocio} />
            <Campo etiqueta="Ciudad" valor={s.empresaCiudad} />
            <Campo etiqueta="Estado" valor={s.empresaEstado} />
            <Campo etiqueta="ZIP" valor={s.empresaZip} />
            <Campo etiqueta="Sitio web" valor={s.sitioWeb} />
            <Campo etiqueta="Dirección" valor={s.empresaDireccion} />
            <Campo etiqueta="Inicio de negocio" valor={s.fechaInicioNegocio} />
            <Campo etiqueta="EIN" valor={s.ein} />
          </dl>
        </Seccion>

        <Seccion titulo="Dueño">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Campo etiqueta="Nombre" valor={nombreDueño} />
            <Campo etiqueta="% propiedad" valor={s.porcentajePropiedad} />
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-400">Email</dt>
              <dd className="mt-0.5 text-sm text-neutral-800">
                {s.propietarioEmail ? <a href={`mailto:${s.propietarioEmail}`} className="text-primary-600 hover:underline">{s.propietarioEmail}</a> : "—"}
              </dd>
            </div>
            <Campo etiqueta="Teléfono" valor={s.propietarioTelefono} />
          </dl>
        </Seccion>

        <Seccion titulo="Financiamiento solicitado">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-400">Monto solicitado</dt>
              <dd className="mt-0.5 text-lg font-bold text-neutral-900">{fmtMonto(s.montoSolicitado)}</dd>
            </div>
            <Campo etiqueta="Propósito" valor={s.propositoFondos} />
            <Campo etiqueta="Ingreso mensual est." valor={fmtMonto(s.ingresoMensualEstimado)} />
            <Campo etiqueta="Depósitos mensuales" valor={fmtMonto(s.depositosMensualesPromedio)} />
            <Campo etiqueta="Financiamiento actual" valor={s.tieneFinanciamientoActual ? "Sí" : "No"} />
            <Campo etiqueta="Saldo actual" valor={fmtMonto(s.saldoFinanciamientoActual)} />
            <Campo etiqueta="Banco" valor={s.bancoNombre} />
            <Campo etiqueta="Depósitos aprox." valor={s.depositosMensualesAprox} />
          </dl>
        </Seccion>

        <Seccion titulo="Origen">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Campo etiqueta="Fuente" valor={s.fuente} />
            <Campo etiqueta="Consentimiento" valor={s.consentimiento ? `Sí (${fmtFecha(s.consentimientoFecha)})` : "No"} />
          </dl>
        </Seccion>
      </div>

      {/* Documentos */}
      <div className="mt-5">
        <Seccion titulo={`Documentos (${s.documentos.length})`}>
          {s.documentos.length === 0 ? (
            <p className="text-sm text-neutral-400">Sin documentos todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left py-2">Tipo</th>
                    <th className="text-left py-2">Nombre</th>
                    <th className="text-left py-2">Estado</th>
                    <th className="text-left py-2">Tamaño</th>
                    <th className="text-left py-2">Subido</th>
                  </tr>
                </thead>
                <tbody>
                  {s.documentos.map((d) => (
                    <tr key={d.id} className="border-t border-neutral-100">
                      <td className="py-2 text-neutral-600">{d.tipo}</td>
                      <td className="py-2 text-neutral-800">{d.nombre}</td>
                      <td className="py-2 text-neutral-600 capitalize">{d.estado}</td>
                      <td className="py-2 text-neutral-600">{d.tamanoBytes ? `${(d.tamanoBytes / 1024).toFixed(0)} KB` : "—"}</td>
                      <td className="py-2 text-neutral-600">{fmtFecha(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      </div>

      {/* Ofertas */}
      <div className="mt-5">
        <Seccion titulo={`Ofertas (${s.ofertas.length})`}>
          {s.ofertas.length === 0 ? (
            <p className="text-sm text-neutral-400">Sin ofertas todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left py-2">Monto</th>
                    <th className="text-left py-2">Plazo</th>
                    <th className="text-left py-2">Frecuencia</th>
                    <th className="text-left py-2">Total a pagar</th>
                    <th className="text-left py-2">Factor</th>
                    <th className="text-left py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {s.ofertas.map((o) => (
                    <tr key={o.id} className="border-t border-neutral-100">
                      <td className="py-2 font-medium text-neutral-800">{fmtMonto(o.monto)}</td>
                      <td className="py-2 text-neutral-600">{o.plazo ?? "—"}</td>
                      <td className="py-2 text-neutral-600">{o.frecuenciaPago ?? "—"}</td>
                      <td className="py-2 text-neutral-600">{fmtMonto(o.totalPagar)}</td>
                      <td className="py-2 text-neutral-600">{o.factorRate ?? "—"}</td>
                      <td className="py-2 text-neutral-600 capitalize">{o.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      </div>

      {/* Mensajes */}
      <div className="mt-5 mb-8">
        <Seccion titulo={`Mensajes (${s.mensajes.length})`}>
          {s.mensajes.length === 0 ? (
            <p className="text-sm text-neutral-400">Sin mensajes todavía.</p>
          ) : (
            <ul className="space-y-3">
              {s.mensajes.map((m) => (
                <li key={m.id} className="rounded-lg border border-neutral-100 p-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className={`font-bold uppercase ${m.direccion === "entrante" ? "text-primary-600" : "text-neutral-600"}`}>
                      {m.direccion === "entrante" ? "Entrante" : "Saliente"}
                    </span>
                    {m.generadoPorIA && <span className="rounded bg-neutral-100 px-1.5 py-0.5">IA</span>}
                    <span>· {fmtFecha(m.createdAt)}</span>
                  </div>
                  {m.asunto && <p className="mt-1 text-sm font-semibold text-neutral-800">{m.asunto}</p>}
                  {m.cuerpo && <p className="mt-1 text-sm whitespace-pre-wrap text-neutral-700">{m.cuerpo}</p>}
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>
    </div>
  );
}
