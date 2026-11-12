#!/usr/bin/env node
// Lee las promos que Coto (JSON) y Día (texto del HTML) publican y las deja en config/promos.generated.json.
//   node scripts/scrape-promos.mjs [--solo coto,dia] [--out config/promos.generated.json]
// NUNCA toca config/promos.json: lo generado lleva revisar:true y se aprueba a mano (npm run promos:revisar).
// Jumbo, Disco y Carrefour publican imágenes: no se scrapean, esas reglas se cargan a mano.
import fs from 'node:fs';
import path from 'node:path';
import { parseCoto, parseDia, COTO_URL, DIA_URL } from './promos-parsers.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const outFile = opt('--out', 'config/promos.generated.json');
const solo = opt('--solo', '') ? opt('--solo', '').split(',') : ['coto', 'dia'];
const UA = 'Mozilla/5.0 (comparador-super; uso personal)';

async function pedir(url, tipo) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: tipo === 'json' ? 'application/json' : 'text/html' }, signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return tipo === 'json' ? r.json() : r.text();
}

const previo = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { reglas: [] };
const fuentes = {
  coto: async () => { const p = parseCoto(await pedir(COTO_URL, 'json')); return { ...p, url: COTO_URL }; },
  dia: async () => { const p = parseDia(await pedir(DIA_URL, 'text')); return { ...p, url: DIA_URL }; },
};

let reglas = [];
const resumen = [];
for (const id of ['coto', 'dia']) {
  if (!solo.includes(id)) { reglas.push(...previo.reglas.filter((r) => r.tienda === id)); continue; }
  try {
    const p = await fuentes[id]();
    if (!p.reglas.length) throw new Error('no se encontró ninguna promo (¿cambió el formato?)');
    reglas.push(...p.reglas);
    resumen.push(`${id}: ${p.reglas.length} reglas (${p.omitidas} omitidas: cuotas sin interés u otros beneficios)`);
  } catch (e) {
    // Si una fuente falla, se conservan las reglas anteriores de esa tienda en vez de borrarlas.
    reglas.push(...previo.reglas.filter((r) => r.tienda === id));
    resumen.push(`${id}: ERROR (${e.message}); se conservó lo anterior (${previo.reglas.filter((r) => r.tienda === id).length} reglas)`);
  }
}

const salida = {
  revisar: true,
  _aviso: 'Generado automáticamente. No se usa en la web. Revisar con `npm run promos:revisar` y pasar a config/promos.json a mano.',
  generadoEl: new Date().toISOString(),
  fuentes: [COTO_URL, DIA_URL],
  reglas,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(salida, null, 2) + '\n');
console.log(resumen.join('\n'));
console.log(`→ ${outFile} (${reglas.length} reglas, todas con revisar:true). Siguiente: npm run promos:revisar`);
