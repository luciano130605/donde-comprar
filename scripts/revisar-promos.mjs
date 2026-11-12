#!/usr/bin/env node
// Muestra qué cambió entre config/promos.generated.json (lo que leyeron los scrapers) y config/promos.json (lo aprobado).
// No escribe nada: vos decidís qué copiar a promos.json.
import fs from 'node:fs';

const leer = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const aprobado = leer('config/promos.json');
const generado = leer('config/promos.generated.json');
if (!generado) { console.error('No existe config/promos.generated.json. Corré antes: npm run promos:scrape'); process.exit(1); }
const manuales = (aprobado && aprobado.reglas) || [];

const CAMPOS = ['tipo', 'valor', 'tope', 'topePeriodo', 'minimo', 'dias', 'canal', 'vigenteDesde', 'vigenteHasta'];
const fmt = (v) => (v === null || v === undefined ? 'vacío' : JSON.stringify(v));
const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Una regla aprobada se vincula a una generada por `origen` (id generado) o por tener el mismo id.
const porOrigen = new Map();
for (const m of manuales) porOrigen.set(m.origen || m.id, m);

const nuevas = [], cambiadas = [], iguales = [];
for (const g of generado.reglas) {
  const m = porOrigen.get(g.id);
  if (!m) { nuevas.push(g); continue; }
  const difs = CAMPOS.filter((c) => !igual(m[c], g[c]) && !(g[c] == null && m[c] != null)).map((c) => `    ${c}: ${fmt(m[c])} → ${fmt(g[c])}`);
  if (difs.length) cambiadas.push({ g, m, difs }); else iguales.push(g);
}
const vistas = new Set(generado.reglas.map((g) => g.id));
const tiendasScrapeadas = new Set(generado.reglas.map((g) => g.tienda));
const desaparecidas = manuales.filter((m) => m.origen && tiendasScrapeadas.has(m.tienda) && !vistas.has(m.origen));
const sinVinculo = manuales.filter((m) => !m.origen && tiendasScrapeadas.has(m.tienda));

const linea = (r) => `${r.id}  [${r.tienda}] ${r.valor != null ? r.valor + (r.tipo === 'porcentaje' ? '%' : '') : 'valor sin leer'} · ${r.medioTexto || '—'} · ${r.canal || 'canal ?'} · días ${r.dias ? r.dias.join(',') : '?'}${r.tope != null ? ` · tope ${r.tope}` : ''}${r.vigenteHasta ? ` · hasta ${r.vigenteHasta}` : ''}`;

console.log(`Generado el ${generado.generadoEl}\n`);
console.log(`NUEVAS (${nuevas.length}) — no están en promos.json:`);
for (const r of nuevas) console.log(`  + ${linea(r)}${r.aVerificar.length ? `\n      a verificar: ${r.aVerificar.join(', ')}` : ''}${r.notas ? `\n      nota: ${r.notas}` : ''}`);
console.log(`\nCAMBIADAS (${cambiadas.length}) — la fuente dice algo distinto a lo aprobado:`);
for (const { g, m, difs } of cambiadas) console.log(`  ~ ${m.id} (origen ${g.id})\n${difs.join('\n')}`);
console.log(`\nDESAPARECIDAS (${desaparecidas.length}) — aprobadas con origen que la fuente ya no publica (¿vencieron?):`);
for (const m of desaparecidas) console.log(`  - ${m.id} (origen ${m.origen})`);
console.log(`\nSIN VÍNCULO (${sinVinculo.length}) — reglas aprobadas de tiendas scrapeadas sin campo "origen" (no se pueden comparar):`);
for (const m of sinVinculo) console.log(`  ? ${m.id}`);
console.log(`\nSin cambios: ${iguales.length}.`);
console.log('\nPara aprobar una nueva: copiá la regla a config/promos.json, sacale "revisar", completá medioPago (un id de "medios"),');
console.log('confirmá los campos de "aVerificar", poné verificadaEl con la fecha de hoy y dejá "origen" con el id generado.');
