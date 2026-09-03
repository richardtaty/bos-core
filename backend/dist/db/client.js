"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.sqlite = void 0;
const node_sqlite_1 = require("node:sqlite");
const sqlite_proxy_1 = require("drizzle-orm/sqlite-proxy");
const schema = __importStar(require("./schema"));
const DB_PATH = process.env.DATABASE_URL ?? "./dev.db";
// SQLite nativo de Node (node:sqlite) — cero dependencias externas, cero binarios que compilar.
// Es síncrono por dentro; se envuelve en el proxy async de Drizzle porque su driver de
// SQLite no expone (todavía) una integración síncrona directa para node:sqlite.
exports.sqlite = new node_sqlite_1.DatabaseSync(DB_PATH);
exports.sqlite.exec("PRAGMA journal_mode = WAL;");
exports.sqlite.exec("PRAGMA foreign_keys = ON;");
exports.db = (0, sqlite_proxy_1.drizzle)(async (sql, params, method) => {
    const stmt = exports.sqlite.prepare(sql);
    if (method === "run") {
        const info = stmt.run(...params);
        return { rows: [], ...info };
    }
    // setReturnArrays es obligatorio aquí: sin esto, node:sqlite devuelve las filas como objetos
    // nombrados por columna, y cuando dos tablas unidas (JOIN) tienen una columna con el mismo
    // nombre (ej. "id" o "nombre" en dos tablas distintas), el objeto se pisa y se pierden datos.
    // Con setReturnArrays, las filas vienen en orden posicional — exactamente lo que Drizzle espera.
    stmt.setReturnArrays(true);
    if (method === "get") {
        const row = stmt.get(...params);
        return { rows: row ? [row] : [] };
    }
    const rows = stmt.all(...params);
    return { rows };
}, { schema });
