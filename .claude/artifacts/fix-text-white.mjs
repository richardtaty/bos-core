import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = "/Users/richardtaty/Projects/BOS-Core/frontend/src";

// 1) color no definido -> azul primario (botones quedan azul con texto blanco)
const TOKEN = [["bg-brand-blue", "bg-primary-600"]];

// 2) texto dual "claro + oscuro": quitar el text-white (era override del tema oscuro)
const REGEXES = [
  [/text-neutral-(\d+) text-white/g, "text-neutral-$1"],
  // 3) campos de formulario: bg claro + texto oscuro
  [/bg-neutral-200 text-white/g, "bg-neutral-50 text-neutral-800"],
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
let total = 0;
for (const file of walk(root)) {
  let src = readFileSync(file, "utf8");
  let next = src;
  let n = 0;
  for (const [from, to] of TOKEN) {
    if (next.includes(from)) {
      n += next.split(from).length - 1;
      next = next.split(from).join(to);
    }
  }
  for (const [re, to] of REGEXES) {
    const m = next.match(re);
    if (m) {
      n += m.length;
      next = next.replace(re, to);
    }
  }
  if (n > 0) {
    writeFileSync(file, next, "utf8");
    changedFiles++;
    total += n;
    console.log(`${file}: ${n} reemplazos`);
  }
}
console.log(`\nListo. ${changedFiles} archivos, ${total} reemplazos totales.`);
