"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.personasRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../lib/validation");
const personas_service_1 = require("../services/personas.service");
exports.personasRouter = (0, express_1.Router)();
exports.personasRouter.use(auth_1.requireAuth);
exports.personasRouter.get("/", async (req, res) => {
    const { search, estado, responsableId, pagina, limite } = req.query;
    const personas = await (0, personas_service_1.listarPersonas)({
        search: search,
        estado: estado,
        responsableId: responsableId,
        pagina: pagina ? parseInt(pagina, 10) : undefined,
        limite: limite ? parseInt(limite, 10) : undefined,
    });
    res.json(personas);
});
// IMPORTANTE: estas rutas específicas van ANTES de "/:id" — si no, Express interpretaría
// "tareas" o "ubicaciones" como si fuera un id de persona y nunca llegaría aquí.
exports.personasRouter.get("/ubicaciones", async (_req, res) => {
    try {
        res.json(await (0, personas_service_1.ubicacionesClientes)());
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.personasRouter.get("/tareas/pendientes", async (req, res) => {
    const soloPropias = req.query.propias === "true";
    const tareas = await (0, personas_service_1.listarTareasPendientes)(soloPropias ? req.user.id : undefined);
    res.json(tareas);
});
exports.personasRouter.get("/cumpleanos", async (_req, res) => {
    try {
        const hoy = await (0, personas_service_1.cumpleanosHoy)();
        const proximos = await (0, personas_service_1.proximosCumpleanos)(14);
        res.json({ hoy, proximos });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.personasRouter.get("/:id", async (req, res) => {
    const ficha = await (0, personas_service_1.obtenerFichaPersona)(req.params.id);
    if (!ficha) {
        res.status(404).json({ error: "Persona no encontrada" });
        return;
    }
    res.json(ficha);
});
exports.personasRouter.post("/", async (req, res) => {
    const parsed = validation_1.crearPersonaSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const persona = await (0, personas_service_1.crearPersona)(parsed.data, req.user.id);
    res.status(201).json(persona);
});
exports.personasRouter.post("/:id/interacciones", async (req, res) => {
    const parsed = validation_1.crearInteraccionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const resultado = await (0, personas_service_1.registrarInteraccion)(req.params.id, parsed.data, req.user.id);
    res.status(201).json(resultado);
});
exports.personasRouter.patch("/:id/comentarios", (0, auth_1.requireRole)("SUPER_ADMIN"), async (req, res) => {
    const parsed = validation_1.actualizarComentariosSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const resultado = await (0, personas_service_1.actualizarComentarios)(req.params.id, parsed.data.comentarios, req.user.id);
        res.json(resultado);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
exports.personasRouter.patch("/:id/negocios", async (req, res) => {
    const parsed = validation_1.actualizarNegociosSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const resultado = await (0, personas_service_1.actualizarNegocios)(req.params.id, parsed.data.negocios, req.user.id);
        res.json(resultado);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
exports.personasRouter.patch("/tareas/:tareaId/completar", (0, auth_1.requireRole)("USUARIO"), async (req, res) => {
    try {
        const tarea = await (0, personas_service_1.completarTarea)(req.params.tareaId, req.user.id);
        res.json(tarea);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
// Corregir los datos de contacto de una ficha (teléfono, correo, ciudad, estado, cumpleaños).
// Va al final del archivo a propósito: "/:id" es un solo segmento y podría tragarse rutas
// nuevas de un solo segmento que se agreguen después. Quien permite o niega es el servicio,
// que necesita la ficha cargada para saber si quien edita es su responsable.
exports.personasRouter.patch("/:id", async (req, res) => {
    const parsed = validation_1.actualizarPersonaSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const resultado = await (0, personas_service_1.actualizarDatosPersona)(req.params.id, parsed.data, {
            id: req.user.id,
            rol: req.user.rol,
        });
        res.json(resultado);
    }
    catch (err) {
        if (err instanceof personas_service_1.SinPermisoError) {
            res.status(403).json({ error: err.message });
            return;
        }
        res.status(404).json({ error: err.message });
    }
});
