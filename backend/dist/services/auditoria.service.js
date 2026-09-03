"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrarAuditoria = registrarAuditoria;
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
// Único punto de escritura hacia bitacora_auditoria en todo el backend.
// Nunca se expone un endpoint de UPDATE/DELETE sobre esta tabla — es append-only por diseño.
async function registrarAuditoria(input) {
    await client_1.db.insert(schema_1.bitacoraAuditoria).values({
        id: crypto.randomUUID(),
        entidad: input.entidad,
        entidadId: input.entidadId,
        accion: input.accion,
        autorId: input.autorId,
        detalle: input.detalle,
        personaId: input.personaId,
        fecha: new Date(),
    });
}
