import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = "/Users/richardtaty/Projects/BOS-Core/frontend/src";

// Orden importa: los tokens con alpha más largo van antes para evitar
// coincidencias de prefijo (ej. bg-neutral-100/50 antes que /5).
const REPLACEMENTS = [
  // bordes
  ["border-neutral-200/15", "border-neutral-200"],
  ["border-neutral-200/20", "border-neutral-200"],
  ["border-neutral-200/10", "border-neutral-200"],
  ["border-neutral-200/5", "border-neutral-200"],
  ["divide-neutral-200/10", "divide-neutral-200"],
  ["divide-neutral-200/5", "divide-neutral-200"],
  // fondos (alpha largo primero)
  ["bg-neutral-100/50", "bg-neutral-100"],
  ["bg-neutral-100/20", "bg-neutral-100"],
  ["bg-neutral-100/10", "bg-neutral-100"],
  ["bg-neutral-100/8", "bg-neutral-100"],
  ["bg-neutral-100/5", "bg-neutral-100"],
  ["bg-neutral-200/50", "bg-neutral-200"],
  ["bg-neutral-200/30", "bg-neutral-100"],
  ["bg-neutral-200/20", "bg-neutral-100"],
  ["bg-neutral-200/10", "bg-neutral-100"],
  ["bg-neutral-50/50", "bg-neutral-50"],
  ["bg-neutral-50/5", "bg-neutral-50"],
  // texto
  ["text-neutral-200/30", "text-neutral-300"],
];

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
let totalReplacements = 0;
for (const file of walk(root)) {
  let src = readFileSync(file, "utf8");
  let next = src;
  let n = 0;
  for (const [from, to] of REPLACEMENTS) {
    if (next.includes(from)) {
      const count = next.split(from).length - 1;
      n += count;
      next = next.split(from).join(to);
    }
  }
  if (n > 0) {
    writeFileSync(file, next, "utf8");
    changedFiles++;
    totalReplacements += n;
    console.log(`${file}: ${n} reemplazos`);
  }
}
console.log(`\nListo. ${changedFiles} archivos, ${totalReplacements} reemplazos totales.`);
