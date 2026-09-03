"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
/**
 * Crea (si no existe) la cuenta de máquina de Hermes Agent y emite su credencial.
 *
 * Es idempotente: si la cuenta ya existe solo emite un token nuevo, sin tocar nada más.
 * Correr de nuevo es la forma de renovar la credencial cuando vence.
 *
 *   npm run token:agente
 *
 * La contraseña es aleatoria y se descarta a propósito: esta cuenta nunca inicia sesión por la
 * interfaz, solo se usa con el token. El rol AGENTE es de solo lectura — ver auth.ts.
 */
const EMAIL = "hermes@agente.local";
const NOMBRE = "Hermes Agent";
const VIGENCIA = "90d";
async function main() {
    let [cuenta] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, EMAIL));
    if (!cuenta) {
        // Contraseña aleatoria que nadie conoce ni necesita: el acceso es solo por token.
        const passwordHash = await bcryptjs_1.default.hash(crypto.randomUUID() + crypto.randomUUID(), 10);
        await client_1.db.insert(schema_1.usuarios).values({
            id: crypto.randomUUID(),
            nombre: NOMBRE,
            email: EMAIL,
            passwordHash,
            rol: "AGENTE",
            activo: true,
            createdAt: new Date(),
        });
        [cuenta] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, EMAIL));
        console.log(`Cuenta de agente creada: ${NOMBRE} <${EMAIL}>`);
    }
    else {
        console.log(`Cuenta de agente ya existente: ${NOMBRE} <${EMAIL}>`);
        if (cuenta.rol !== "AGENTE") {
            console.log(`  Aviso: su rol es "${cuenta.rol}", no "AGENTE". Corrígelo antes de usar el token.`);
        }
    }
    const token = (0, auth_1.firmarToken)({ id: cuenta.id, rol: "AGENTE", nombre: cuenta.nombre, departamentoId: null, departamentoIds: [] }, VIGENCIA);
    const vence = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    console.log(`\nToken (vence el ${vence}):\n`);
    console.log(token);
    console.log(`\nGuárdalo en la configuración de Hermes como BOS_TOKEN.`);
    console.log(`No lo subas a git ni lo compartas: da lectura a todo el CRM.`);
    console.log(`Para renovarlo, vuelve a correr este mismo comando.\n`);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
