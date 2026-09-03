import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_URL ?? "./dev.db";

// SQLite nativo de Node (node:sqlite) — cero dependencias externas, cero binarios que compilar.
// Es síncrono por dentro; se envuelve en el proxy async de Drizzle porque su driver de
// SQLite no expone (todavía) una integración síncrona directa para node:sqlite.
export const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(async (sql, params, method) => {
  const stmt = sqlite.prepare(sql);
  if (method === "run") {
    const info = stmt.run(...params);
    return { rows: [] as any[], ...info };
  }
  // setReturnArrays es obligatorio aquí: sin esto, node:sqlite devuelve las filas como objetos
  // nombrados por columna, y cuando dos tablas unidas (JOIN) tienen una columna con el mismo
  // nombre (ej. "id" o "nombre" en dos tablas distintas), el objeto se pisa y se pierden datos.
  // Con setReturnArrays, las filas vienen en orden posicional — exactamente lo que Drizzle espera.
  stmt.setReturnArrays(true);
  if (method === "get") {
    const row = stmt.get(...params) as unknown[] | undefined;
    return { rows: row ? [row] : [] };
  }
  const rows = stmt.all(...params) as unknown as unknown[][];
  return { rows };
}, { schema });
