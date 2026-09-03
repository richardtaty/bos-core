"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Corrige el campo `estado` de los contactos que quedaron con datos inservibles.
 *
 * POR DEFECTO NO ESCRIBE NADA: imprime lo que haría para que se pueda revisar.
 * Para aplicar de verdad hay que pasar --aplicar.
 *
 *   npm run corregir:estados              # simulación (segura)
 *   npm run corregir:estados -- --aplicar # escribe
 *
 * Escribe a través de `actualizarDatosPersona`, no con SQL directo, para que cada
 * corrección quede en la bitácora con su antes y después.
 *
 * ANTES DE APLICAR EN PRODUCCIÓN, sacar respaldo:
 *   fly ssh sftp get /data/prod.db ./respaldo-prod.db -a tatys-bos-core
 */
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const estados_usa_1 = require("../lib/estados-usa");
const personas_service_1 = require("../services/personas.service");
// ---------------------------------------------------------------------------
// Tablas de interpretación
// ---------------------------------------------------------------------------
const SIGLAS = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
    KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
    MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
    NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
    NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
    VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
    DC: "Washington D.C.",
};
// Siglas que se pueden buscar como palabra suelta sin peligro. Quedan fuera IN, OR, ME,
// LA, HI, DE, ID, OK, AL, MS y PR porque chocan con palabras normales en español e inglés
// ("in", "or", "me", "la", "de", "ok"...) y producirían estados inventados.
const SIGLAS_SEGURAS = [
    "FL", "NJ", "SC", "TN", "TX", "NY", "NC", "CA", "PA", "GA", "VA", "WV", "UT", "CO",
    "AZ", "NV", "MA", "OH", "IL", "MI", "MN", "WI", "MO", "KY", "SD", "ND", "NM", "NE",
    "RI", "VT", "NH", "CT", "WA", "DC", "MD", "AR", "IA", "KS", "MT", "WY",
];
// Nombres en español y errores de escritura vistos en los datos reales.
const ALIAS = {
    "carolina del norte": "North Carolina", "carolina norte": "North Carolina",
    "carolina del sur": "South Carolina", "carolina sur": "South Carolina",
    pensilvania: "Pennsylvania", "nueva york": "New York", "nueva jersey": "New Jersey",
    newjersey: "New Jersey", tejas: "Texas", floria: "Florida", tenesse: "Tennessee",
    tennessi: "Tennessee", tenessee: "Tennessee", menphis: "Tennessee",
    "virginia occidental": "West Virginia", "nuevo mexico": "New Mexico",
    luisiana: "Louisiana", misisipi: "Mississippi",
};
// Ciudades que aparecen en los datos, con su estado.
const CIUDADES = {
    miami: "Florida", hialeah: "Florida", orlando: "Florida", tampa: "Florida",
    doral: "Florida", kissimmee: "Florida", jacksonville: "Florida",
    "fort lauderdale": "Florida", naples: "Florida", "west palm beach": "Florida",
    weston: "Florida", deltona: "Florida", davenport: "Florida",
    "virginia gardens": "Florida", "new port richey": "Florida", "cape coral": "Florida",
    homestead: "Florida",
    atlanta: "Georgia", marietta: "Georgia", lawrenceville: "Georgia", duluth: "Georgia",
    auburn: "Georgia",
    houston: "Texas", dallas: "Texas", austin: "Texas", "san antonio": "Texas",
    "el paso": "Texas", "port arthur": "Texas", mcallen: "Texas", laredo: "Texas",
    "new york": "New York", brooklyn: "New York", bronx: "New York", queens: "New York",
    manhattan: "New York",
    newark: "New Jersey", "jersey city": "New Jersey", paterson: "New Jersey",
    garfield: "New Jersey", garfiled: "New Jersey", "old bridge": "New Jersey",
    bloomfield: "New Jersey",
    "los angeles": "California", "san diego": "California", oakland: "California",
    irvine: "California", "san francisco": "California",
    chicago: "Illinois",
    charlotte: "North Carolina", greensboro: "North Carolina", zebulon: "North Carolina",
    raleigh: "North Carolina",
    nashville: "Tennessee", memphis: "Tennessee", bartlett: "Tennessee",
    cordova: "Tennessee", knoxville: "Tennessee",
    "las vegas": "Nevada", phoenix: "Arizona", tucson: "Arizona",
    philadelphia: "Pennsylvania", pittsburgh: "Pennsylvania", reading: "Pennsylvania",
    boston: "Massachusetts",
    charleston: "South Carolina", "north charleston": "South Carolina",
    greenville: "South Carolina",
    "salt lake city": "Utah", riverton: "Utah",
    denver: "Colorado", "colorado springs": "Colorado",
    milwaukee: "Wisconsin", columbus: "Ohio", cleveland: "Ohio",
    "oklahoma city": "Oklahoma", tulsa: "Oklahoma", louisville: "Kentucky",
    indianapolis: "Indiana", baltimore: "Maryland", richmond: "Virginia",
    norfolk: "Virginia", "little rock": "Arkansas", warrensburg: "Missouri",
    "horn lake": "Mississippi", albuquerque: "New Mexico", seattle: "Washington",
    "des moines": "Iowa",
};
// Países y regiones fuera de EE.UU. Manda sobre todo lo demás: si dice "México",
// da igual que la ciudad se llame como una de EE.UU.
const FUERA = [
    "mexico", "canada", "argentina", "colombia", "cololmbia", "venezuela", "chile",
    "panama", "peru", "dubai", "republica dominicana", "ontario", "quebec", "alberta",
    "quintana roo", "q roo", "jalisco", "guadalajara", "puebla", "oaxaca", "chihuahua",
    "juarez", "tijuana", "cancun", "playa del carmen", "montreal", "vancouver",
    "edmonton", "guelph", "brossard", "greenfield park", "buenos aires", "santiago",
    "bogota", "cogota", "cdm", "ciudad de mexico", "estado de mexico", "sonora",
    "baja california", "guanajuato", "isla fuerte", "san luis rio colorado",
    "fuera de usa",
    // Puerto Rico NO va aquí: es territorio de EE.UU. y ahora tiene su propio valor en
    // ESTADOS_USA. Ponerlo aquí contaría a un cliente estadounidense como extranjero.
];
/**
 * Los dos casos donde el texto daba dos lecturas distintas y hubo que decidir a mano.
 * Se dejan escritos aquí para que la decisión quede a la vista y no enterrada en la lógica.
 */
const DECISIONES_MANUALES = {
    // Ciudad "Newark", estado "NJ por New York". Newark es de New Jersey; el "New York"
    // del texto es una aclaración del cliente, no su estado.
    "Doris Charco": "New Jersey",
    // Ciudad "Virginia Gardens Fl". Virginia Gardens es una ciudad de Florida —
    // la palabra "Virginia" es parte del nombre, no el estado.
    "Romina Aguilar": "Florida",
};
// ---------------------------------------------------------------------------
const sinAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => sinAcento(String(s ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/**
 * SIEMPRE se busca el patrón más largo primero. No es un detalle: los nombres de estado se
 * contienen unos a otros, y buscar en orden alfabético da resultados falsos.
 *   "west virginia"    → "Virginia"        (en vez de West Virginia)
 *   "washington d.c."  → "Washington"      (el estado, en vez del distrito)
 *   "new mexico"       → "mexico" (FUERA)  (un cliente de EE.UU. marcado como extranjero)
 * Con el más largo primero, gana la lectura más específica, que es la correcta.
 */
function buscarMasLargo(txt, tabla) {
    const ordenada = [...tabla].sort((a, b) => b[0].length - a[0].length);
    for (const [patron, valor] of ordenada) {
        if (txt.includes(norm(patron)))
            return { valor, patron };
    }
    return null;
}
const TABLA_ESTADOS = [
    ...Object.entries(ALIAS),
    ...estados_usa_1.ESTADOS_USA.filter((e) => e !== "Fuera de USA").map((e) => [e, e]),
];
const TABLA_CIUDADES = Object.entries(CIUDADES);
const TABLA_FUERA = FUERA.map((f) => [f, "Fuera de USA"]);
const porNombreDeEstado = (txt) => buscarMasLargo(txt, TABLA_ESTADOS);
const porCiudad = (txt) => buscarMasLargo(txt, TABLA_CIUDADES);
const porFuera = (txt) => buscarMasLargo(txt, TABLA_FUERA);
function porSigla(txt) {
    const palabras = txt.split(" ");
    for (const s of SIGLAS_SEGURAS) {
        if (palabras.includes(s.toLowerCase()))
            return { valor: SIGLAS[s], patron: s };
    }
    return null;
}
// ---------------------------------------------------------------------------
async function main() {
    const aplicar = process.argv.includes("--aplicar");
    const filas = (await client_1.db
        .select({
        id: schema_1.personas.id,
        nombre: schema_1.personas.nombre,
        ciudad: schema_1.personas.ciudad,
        estado: schema_1.personas.estado,
    })
        .from(schema_1.personas));
    const yaCorrectos = [];
    const propuestas = [];
    const sinDeterminar = [];
    for (const fila of filas) {
        const actual = String(fila.estado ?? "").trim();
        if ((0, estados_usa_1.esEstadoValido)(actual)) {
            yaCorrectos.push(fila);
            continue;
        }
        // Mismo estado pero mal escrito en mayúsculas ("OKLAHOMA" -> "Oklahoma").
        const canonico = estados_usa_1.ESTADOS_USA.find((e) => e.toLowerCase() === actual.toLowerCase());
        if (canonico) {
            propuestas.push({ fila, valor: canonico, via: "mayúsculas" });
            continue;
        }
        // Decisión humana registrada arriba: manda sobre cualquier deducción automática.
        const decidido = DECISIONES_MANUALES[fila.nombre];
        if (decidido) {
            propuestas.push({ fila, valor: decidido, via: "decisión manual" });
            continue;
        }
        const txt = norm(`${fila.estado} ${fila.ciudad}`);
        const nombre = porNombreDeEstado(txt);
        const fuera = porFuera(txt);
        // "Fuera de EE.UU." solo gana si su palabra es más específica que el nombre de estado
        // encontrado. Así "New Mexico" no se convierte en extranjero por contener "Mexico",
        // pero "San Luis Río Colorado, Sonora" sí, porque la frase larga vence a "Colorado".
        if (fuera && (!nombre || fuera.patron.length >= nombre.patron.length)) {
            propuestas.push({ fila, valor: "Fuera de USA", via: "fuera de EE.UU." });
            continue;
        }
        const lecturas = [nombre, porCiudad(txt), porSigla(txt)].filter((v) => v !== null);
        const unicos = [...new Set(lecturas.map((l) => l.valor))];
        if (unicos.length === 1) {
            propuestas.push({ fila, valor: unicos[0], via: "deducido del texto" });
        }
        else {
            // Cero lecturas, o dos que se contradicen. En ambos casos hay que preguntarle a la
            // persona: poner un estado equivocado es peor que dejarlo sin poner.
            sinDeterminar.push(fila);
        }
    }
    // -------------------------------------------------------------------------
    // Informe
    // -------------------------------------------------------------------------
    // Comprobación de cuadre: si esto falla, hay un error de clasificación.
    const suma = yaCorrectos.length + propuestas.length + sinDeterminar.length;
    if (suma !== filas.length) {
        console.error(`\n✗ NO CUADRA: ${suma} ≠ ${filas.length}. Abortando.`);
        process.exit(1);
    }
    // Ninguna propuesta puede ser un valor que el propio backend rechazaría.
    const invalidas = propuestas.filter((p) => !(0, estados_usa_1.esEstadoValido)(p.valor));
    if (invalidas.length > 0) {
        console.error(`\n✗ ${invalidas.length} propuestas tienen un estado inválido. Abortando.`);
        for (const p of invalidas)
            console.error(`   ${p.fila.nombre}: "${p.valor}"`);
        process.exit(1);
    }
    // Salida para máquinas (armar informes sin volver a escribir la clasificación a mano).
    if (process.argv.includes("--json")) {
        console.log(JSON.stringify({
            total: filas.length,
            yaCorrectos: yaCorrectos.map((f) => ({ nombre: f.nombre, estado: f.estado })),
            propuestas: propuestas.map((p) => ({
                nombre: p.fila.nombre,
                ciudad: p.fila.ciudad,
                estadoActual: p.fila.estado,
                estadoNuevo: p.valor,
                via: p.via,
            })),
            sinDeterminar: sinDeterminar.map((f) => ({
                nombre: f.nombre,
                ciudad: f.ciudad,
                estado: f.estado,
            })),
        }, null, 2));
        return;
    }
    const linea = "=".repeat(72);
    console.log(`\n${linea}`);
    console.log(aplicar ? "APLICANDO CORRECCIONES" : "SIMULACIÓN — no se escribe nada");
    console.log(linea);
    console.log(`  Total de contactos:        ${filas.length}`);
    console.log(`  Ya estaban correctos:      ${yaCorrectos.length}`);
    console.log(`  Se corrigen:               ${propuestas.length}`);
    console.log(`  Hay que preguntar:         ${sinDeterminar.length}`);
    const porVia = new Map();
    for (const p of propuestas)
        porVia.set(p.via, (porVia.get(p.via) ?? 0) + 1);
    console.log(`\n  Desglose de las ${propuestas.length} correcciones:`);
    for (const [via, n] of [...porVia.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(n).padStart(4)}  ${via}`);
    }
    console.log(`\n${linea}\nCAMBIOS PROPUESTOS (${propuestas.length})\n${linea}`);
    for (const p of [...propuestas].sort((a, b) => a.fila.nombre.localeCompare(b.fila.nombre))) {
        const nombre = p.fila.nombre.slice(0, 30).padEnd(31);
        const antes = `${p.fila.ciudad} / ${p.fila.estado}`.slice(0, 34).padEnd(35);
        console.log(`  ${nombre} ${antes} → ${p.valor.padEnd(16)} (${p.via})`);
    }
    console.log(`\n${linea}\nHAY QUE PREGUNTARLE AL CLIENTE (${sinDeterminar.length})\n${linea}`);
    for (const f of [...sinDeterminar].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
        console.log(`  ${f.nombre.slice(0, 34).padEnd(35)} ciudad:"${f.ciudad}" estado:"${f.estado}"`);
    }
    if (!aplicar) {
        console.log(`\n${linea}`);
        console.log("  No se escribió nada. Para aplicar de verdad:");
        console.log("    npm run corregir:estados -- --aplicar");
        console.log("  Antes, saca respaldo de producción:");
        console.log("    fly ssh sftp get /data/prod.db ./respaldo-prod.db -a tatys-bos-core");
        console.log(linea + "\n");
        return;
    }
    // -------------------------------------------------------------------------
    // Aplicar
    // -------------------------------------------------------------------------
    const [autor] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.rol, "SUPER_ADMIN"));
    if (!autor) {
        console.error("✗ No hay ningún SUPER_ADMIN para atribuir los cambios. Abortando.");
        process.exit(1);
    }
    console.log(`\n  Los cambios quedarán en la bitácora a nombre de: ${autor.nombre}\n`);
    let ok = 0;
    const fallos = [];
    for (const p of propuestas) {
        try {
            await (0, personas_service_1.actualizarDatosPersona)(p.fila.id, { estado: p.valor }, { id: autor.id, rol: autor.rol });
            ok++;
        }
        catch (e) {
            fallos.push(`${p.fila.nombre}: ${e.message}`);
        }
    }
    console.log(`${linea}`);
    console.log(`  Corregidos: ${ok} de ${propuestas.length}`);
    if (fallos.length > 0) {
        console.log(`  Fallaron:   ${fallos.length}`);
        for (const f of fallos)
            console.log(`    ✗ ${f}`);
    }
    console.log(`${linea}\n`);
}
main().catch((e) => {
    console.error("Error:", e);
    process.exit(1);
});
