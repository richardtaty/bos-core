import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = "/Users/richardtaty/Projects/BOS-Core/frontend/src";

// Tonos claros de acento usados como texto (300/400) -> 600 para buen contraste sobre blanco.
const RE = /text-(primary|secondary|success|warning|danger|info)-(300|400)\b/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if ([".tsx", ".ts"].includes(extname(name))) out.push(p);
  }
  return out;
}

let changedFiles = 0;
let total = 0;
for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  const m = src.match(RE);
  if (!m) continue;
  const next = src.replace(RE, "text-$1-600");
  writeFileSync(file, next, "utf8");
  changedFiles++;
  total += m.length;
  console.log(`${file}: ${m.length} reemplazos`);
}
console.log(`\nListo. ${changedFiles} archivos, ${total} reemplazos totales.`);
