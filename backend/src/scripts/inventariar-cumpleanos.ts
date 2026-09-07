/**
 * Inventario NO destructivo de los datos de cumpleaños que hoy existen.
 *
 * ANTES de migrar/importar cualquier cosa al nuevo módulo 🎂, este script reporta qué
 * hay realmente en la base: personas con fecha de nacimiento, tareas-seguimiento tipo
 * "🎂 Cumpleaños de …" (el modelo viejo) y tareas operativas que mencionan cumpleaños.
 *
 * NO escribe ni convierte NADA. Solo lee e imprime un JSON para que Richard apruebe
 * el alcance antes de cualquier importe.
 *
 * Uso:
 *   npm run inventario:cumpleanos                     # contra backend/dev.db
 *   DATABASE_URL=ruta/a/snapshot.db npm run inventario:cumpleanos   # contra un respaldo
 */
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.DATABASE_URL ?? "./dev.db";
const sqlite = new DatabaseSync(DB_PATH, { readOnly: true });

interface PersonaConFecha {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  responsable_id: string | null;
}

interface TareaSeguimientoCumple {
  id: string;
  persona_id: string | null;
  persona_nombre: string | null;
  fecha: string | null;
  nota: string | null;
  completado: boolean;
  autor_id: string | null;
}

interface TareaOperativaCumple {
  id: string;
  titulo: string;
  descripcion: string | null;
  departamento: string | null;
  estado: string | null;
  responsable_id: string | null;
}

const hoy = new Date().toISOString().slice(0, 10);

// ── 1. Personas que ya tienen fecha de nacimiento en la ficha ──────────────
// Son las candidatas inequívocas: el módulo puede crear su fila vinculada (persona_id)
// leyendo día/mes/año de la ficha, sin adivinar nada.
const personas: PersonaConFecha[] = sqlite
  .prepare(
    `SELECT id, nombre, telefono, email, fecha_nacimiento, responsable_id
       FROM personas
      WHERE fecha_nacimiento IS NOT NULL AND trim(fecha_nacimiento) <> ''
      ORDER BY fecha_nacimiento`,
  )
  .all() as unknown as PersonaConFecha[];

// ── 2. Tareas-seguimiento del modelo viejo ("🎂 Cumpleaños de …") ──────────
// El CRM anterior representaba los cumpleaños como una tarea por año con la fecha en el
// texto de la nota. Estas filas NO se borran; este listado sirve para decidir si y cómo
// se migran a la tabla `cumpleanos`.
const tareasSeguimiento: TareaSeguimientoCumple[] = sqlite
  .prepare(
    `SELECT ts.id, ts.persona_id, p.nombre AS persona_nombre, ts.fecha, ts.nota,
            ts.completado, ts.autor_id
       FROM tareas_seguimiento ts
       LEFT JOIN personas p ON p.id = ts.persona_id
      WHERE (instr(ts.nota, '🎂') > 0 OR lower(ts.nota) LIKE '%cumplea%')
      ORDER BY ts.fecha`,
  )
  .all() as unknown as TareaSeguimientoCumple[];

// ── 3. Tareas operativas (módulo Tareas) que mencionan cumpleaños ──────────
// Casi nunca son personas (puede ser "diseñar tarjeta de cumpleaños"): se listan para
// que Richard las distinga, no para migrarlas.
const tareasOperativas: TareaOperativaCumple[] = sqlite
  .prepare(
    `SELECT id, titulo, descripcion, departamento, estado, responsable_id
       FROM tareas_operativas
      WHERE (instr(titulo, 'cumplea') > 0 OR instr(lower(titulo), 'cumplea') > 0)
         OR (descripcion IS NOT NULL AND instr(lower(descripcion), 'cumplea') > 0)
      ORDER BY created_at`,
  )
  .all() as unknown as TareaOperativaCumple[];

// ── Contexto: estado actual del módulo nuevo (debe estar vacío todavía) ─────
const cumpleanosCount = (sqlite.prepare("SELECT COUNT(*) AS n FROM cumpleanos").get() as { n: number }).n;
const recordatoriosCount = (sqlite.prepare("SELECT COUNT(*) AS n FROM cumpleanos_recordatorios").get() as { n: number }).n;
const personasTotal = (sqlite.prepare("SELECT COUNT(*) AS n FROM personas").get() as { n: number }).n;

const resumen = {
  fechaDelReporte: hoy,
  baseDeDatos: DB_PATH,
  personasEnTotal: personasTotal,
  personasConFechaNacimiento: personas.length,
  tareasSeguimientoDeCumpleanos: tareasSeguimiento.length,
  tareasOperativasQueMencionanCumpleaños: tareasOperativas.length,
  filasEnTablaCumpleanos: cumpleanosCount,
  filasEnTablaRecordatorios: recordatoriosCount,
};

const reporte = {
  resumen,
  personas: personas,
  tareas_seguimiento_cumpleanos: tareasSeguimiento,
  tareas_operativas_cumpleanos: tareasOperativas,
  // El módulo nuevo no convierte nada automáticamente. Solo se importaría (aditivo,
  // INSERT OR IGNORE) tras aprobar este reporte; las tareas viejas se dejan intactas.
  nota: "Reporte de SOLO LECTURA. No se convirtió ni se borró ningún dato.",
};

console.log(JSON.stringify(reporte, null, 2));
