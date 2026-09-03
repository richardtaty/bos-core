"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESTADOS_USA = void 0;
exports.esEstadoValido = esEstadoValido;
/**
 * Lista única de valores válidos para el campo `estado` de un contacto.
 *
 * ESTA ES LA FUENTE DE VERDAD. El frontend tiene su propia copia en
 * `frontend/src/components/NuevaPersonaModal.tsx` (son paquetes npm separados y no
 * comparten carpeta) — si agregas o cambias un valor aquí, cámbialo también allá.
 *
 * Por qué existe este archivo: hasta ahora el backend aceptaba cualquier texto no vacío
 * como estado, así que entraron a producción valores como "Sin estado", "USA - ESTE",
 * "Q.Roo" y "Floria". El menú desplegable del formulario era la única barrera, y cualquier
 * llamada directa a la API se la saltaba.
 */
exports.ESTADOS_USA = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
    "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
    "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
    "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
    "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
    "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Washington D.C.",
    // Puerto Rico es territorio de EE.UU., no país extranjero: un cliente de allá no debe
    // contarse como internacional en los reportes.
    "Puerto Rico",
    "Fuera de USA",
];
/** Para chequeos rápidos en scripts, sin pasar por zod. */
function esEstadoValido(valor) {
    return typeof valor === "string" && exports.ESTADOS_USA.includes(valor);
}
