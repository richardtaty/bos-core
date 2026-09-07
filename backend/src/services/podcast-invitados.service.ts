import { db } from "../db/client";
import { personas } from "../db/schema";
import { crearPersona } from "./personas.service";
import type { CrearPersonaInput } from "../lib/validation";

// ─── Búsqueda de invitados para el calendario de podcasts ─────────────
//
// El campo "Invitado" del calendario es un autocomplete: mientras el usuario
// escribe se busca entre TODAS las personas del CRM, ignorando mayúsculas,
// espacios extra y acentos, para no terminar con "Margarita Garzon",
// "margarita garzón" y "MARGARITA  GARZON" como tres contactos distintos.
//
// La normalización vive aquí (backend) y NO en SQL porque SQLite no sabe
// plegar acentos: se traen id+nombre y se comparan en JS, que es igual de
// rápido para el volumen del CRM y mucho más exacto.

export function normalizarNombre(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // quita acentos → garzón == garzon
    .toLowerCase()
    .replace(/\s+/g, " ") // espacios múltiples → uno solo
    .trim();
}

// Convierte "andrea  lopez" en "Andrea Lopez": colapsa espacios y pone en
// mayúscula la primera letra de cada palabra sin alterar el resto
// (respeta "Garzón", "McDonald", etc.).
export function formatearNombre(s: string): string {
  return (s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((palabra) => (palabra.length ? palabra[0].toUpperCase() + palabra.slice(1) : palabra))
    .join(" ");
}

// Distancia de edición (Levenshtein) para detectar parecidos escritos con
// ligeras diferencias ("Garzon" vs "Garson") sin bloquear nombres válidos.
function distanciaLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const filaAnterior = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const filaActual = [i];
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      filaActual[j] = Math.min(filaAnterior[j] + 1, filaActual[j - 1] + 1, filaAnterior[j - 1] + costo);
    }
    for (let j = 0; j <= n; j++) filaAnterior[j] = filaActual[j];
  }
  return filaAnterior[n];
}

// Qué tan parecidos son dos nombres para considerarlos un posible duplicado:
// tolerancia pequeña y proporcional al largo ("Garzon"≈"Garson" sí, "Ana"
// ≠ "Margarita" no).
function esParecido(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  return distanciaLevenshtein(a, b) <= 2;
}

export interface InvitadoMatch {
  id: string;
  nombre: string;
}

export interface ResultadoBusqueda {
  coincidencias: InvitadoMatch[];
  parecidos: InvitadoMatch[];
  // true si existe una persona cuyo nombre coincide exactamente (ya
  // normalizado) con lo escrito → no hace falta ofrecer "crear nueva".
  hayExacto: boolean;
}

/**
 * Núcleo de la búsqueda, independiente de la base de datos (recibe la lista de
 * personas para poder probarse aislado). Busca nombres cuyo texto coincida con
 * lo que el usuario escribe y devuelve:
 *  - coincidencias: nombres que contienen el texto (las sugerencias normales).
 *  - parecidos:     nombres casi idénticos pero no idénticos (posibles
 *                   duplicados por error de tipeo) para mostrarlos como
 *                   "¿Buscabas a?".
 *  - hayExacto:     existe una persona cuyo nombre coincide exactamente (ya
 *                   normalizado) con lo escrito.
 */
export function buscarEnLista(personasLista: { id: string; nombre: string }[], q: string): ResultadoBusqueda {
  const consulta = normalizarNombre(q);
  if (!consulta) return { coincidencias: [], parecidos: [], hayExacto: false };

  const coincidencias: { p: InvitadoMatch; clave: string; inicio: boolean; exacto: boolean; largo: number }[] = [];
  const parecidos: { p: InvitadoMatch; dist: number }[] = [];

  for (const fila of personasLista) {
    const nombre = normalizarNombre(fila.nombre);
    if (!nombre) continue;
    const match = { id: fila.id, nombre: fila.nombre };

    if (nombre === consulta) {
      coincidencias.push({ p: match, clave: nombre, inicio: true, exacto: true, largo: nombre.length });
    } else if (nombre.includes(consulta)) {
      coincidencias.push({
        p: match,
        clave: nombre,
        inicio: nombre.startsWith(consulta),
        exacto: false,
        largo: nombre.length,
      });
    } else if (esParecido(nombre, consulta)) {
      parecidos.push({ p: match, dist: distanciaLevenshtein(nombre, consulta) });
    }
  }

  coincidencias.sort((a, b) => {
    // 1) coincidencia exacta, 2) empieza con el texto, 3) las más cortas, 4) alfabético.
    if (a.exacto !== b.exacto) return a.exacto ? -1 : 1;
    if (a.inicio !== b.inicio) return a.inicio ? -1 : 1;
    if (a.largo !== b.largo) return a.largo - b.largo;
    return a.clave.localeCompare(b.clave, "es");
  });
  parecidos.sort((a, b) => a.dist - b.dist || a.p.nombre.localeCompare(b.p.nombre, "es"));

  return {
    coincidencias: coincidencias.slice(0, 8).map((c) => c.p),
    parecidos: parecidos.slice(0, 4).map((c) => c.p),
    hayExacto: coincidencias.some((c) => c.exacto),
  };
}

/**
 * Busca entre TODAS las personas del CRM (para el autocomplete del calendario).
 */
export async function buscarInvitados(q: string): Promise<ResultadoBusqueda> {
  const todas = await db.select({ id: personas.id, nombre: personas.nombre }).from(personas);
  return buscarEnLista(todas, q);
}

export interface InvitadoCreado {
  persona: { id: string; nombre: string };
  // true = se creó la ficha; false = ya existía alguien con ese mismo nombre
  // (normalizado) y se devuelve esa persona para NO duplicar.
  creado: boolean;
}

/**
 * Crea la ficha mínima de un invitado nuevo del podcast (o reutiliza la que ya
 * existe con el mismo nombre). La cita del calendario apunta obligatoriamente a
 * una persona (podcast_citas.persona_id), así que un invitado que todavía no
 * está en el CRM se da de alta aquí con los datos que sí conocemos; el resto
 * se completa después en su ficha.
 */
export async function obtenerOCrearInvitado(nombre: string, autorId: string): Promise<InvitadoCreado> {
  const nombreLimpio = formatearNombre(nombre);
  if (nombreLimpio.length < 2) {
    throw new Error("Escribe el nombre del invitado");
  }

  // Guardia anti-duplicado en el servidor: si ya existe alguien con ese mismo
  // nombre (sin acentos/espacios/mayúsculas), se usa esa ficha y no se crea
  // otra. Protege contra doble clic o carreras entre usuarios.
  const existente = await buscarInvitados(nombreLimpio);
  if (existente.hayExacto && existente.coincidencias.length > 0) {
    const p = existente.coincidencias[0];
    return { persona: { id: p.id, nombre: p.nombre }, creado: false };
  }

  const persona = await crearPersona(
    {
      nombre: nombreLimpio,
      ciudad: "Sin especificar",
      estado: "Fuera de USA",
      fuente: "Podcast",
      responsableId: autorId,
      tags: ["Podcast"],
      negocios: [],
    },
    autorId
  );

  if (!persona) throw new Error("No se pudo crear la ficha del invitado");

  return { persona: { id: persona.id, nombre: persona.nombre }, creado: true };
}

// ─── Alta COMPLETA de un invitado (formulario "Nuevo contacto") ─────────
//
// Desde el calendario de podcasts, cuando el invitado no existe y el usuario
// decide abrir el formulario completo, el alta llega aquí (misma validación y
// misma creación central que Clientes, vía crearPersona). La diferencia es la
// guardia anti-duplicado: si ya existe alguien con el mismo correo o teléfono
// se DEVUELVE esa persona y NO se crea otra. Solo se confía en el nombre cuando
// no se aporta ningún otro dato (correo ni teléfono) — entonces un nombre
// normalizado idéntico reutiliza la ficha existente (el caso "Garzon/Garzón").

function normalizarEmail(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function soloDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

// Dos teléfonos coinciden si son idénticos en dígitos o comparten los 10 últimos
// (tolera prefijos tipo "+1", paréntesis, guiones…).
function telefonosCoinciden(a: string, b: string): boolean {
  const da = soloDigitos(a);
  const db = soloDigitos(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 10 && db.length >= 10) return da.slice(-10) === db.slice(-10);
  return false;
}

export interface InvitadoDuplicado {
  id: string;
  nombre: string;
  // Por qué se consideró la misma persona: mismo correo, mismo teléfono o solo
  // el mismo nombre (cuando no se mandó correo ni teléfono).
  por: "email" | "telefono" | "nombre";
}

export type ResultadoCrearInvitadoCompleto =
  | { duplicado: InvitadoDuplicado }
  | { persona: { id: string; nombre: string } };

export async function crearInvitadoCompleto(
  input: CrearPersonaInput,
  autorId: string
): Promise<ResultadoCrearInvitadoCompleto> {
  const todas = await db
    .select({ id: personas.id, nombre: personas.nombre, email: personas.email, telefono: personas.telefono })
    .from(personas);

  const emailBuscado = normalizarEmail(input.email);
  const telefonoBuscado = input.telefono ? soloDigitos(input.telefono) : "";

  let claro: InvitadoDuplicado | null = null;
  for (const fila of todas) {
    if (!claro && emailBuscado) {
      const emailFila = normalizarEmail(fila.email);
      if (emailFila && emailFila === emailBuscado) {
        claro = { id: fila.id, nombre: fila.nombre, por: "email" };
      }
    }
    if (!claro && telefonoBuscado && fila.telefono) {
      if (telefonosCoinciden(fila.telefono, telefonoBuscado)) {
        claro = { id: fila.id, nombre: fila.nombre, por: "telefono" };
      }
    }
  }

  // Sin correo ni teléfono no hay identificador fuerte: si el nombre (sin
  // acentos/mayúsculas/espacios) ya existe, es la misma persona casi con
  // seguridad → se reutiliza en vez de crear "Garzon" y "Garzón" aparte.
  if (!claro && !emailBuscado && !telefonoBuscado) {
    const nombreBuscado = normalizarNombre(input.nombre);
    const existente = todas.find((f) => normalizarNombre(f.nombre) === nombreBuscado);
    if (existente) claro = { id: existente.id, nombre: existente.nombre, por: "nombre" };
  }

  if (claro) return { duplicado: claro };

  const persona = await crearPersona(input, autorId);
  if (!persona) throw new Error("No se pudo crear el contacto");
  return { persona: { id: persona.id, nombre: persona.nombre } };
}
